'use strict';

require('./local-env.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');
const { version } = require('../package.json');
const dependency = require('../desktop/dependency-lock.json').webview2;
const source = path.join(root, 'desktop');
const cache = path.join(root, '.cache', 'desktop');
const dependencies = path.join(cache, 'dependencies');
const sdk = path.join(dependencies, `webview2-${dependency.version}`);
const stage = path.join(cache, 'site');
const output = path.join(root, 'release', 'windows', `v${version}`);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const psQuote = value => `'${value.replace(/'/g, "''")}'`;

function run(command, args) {
  const result = cp.spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function powershell(script) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; ${script}`]);
}

function filesIn(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .flatMap(entry => {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Build inputs must not be symbolic links: ${relative}`);
      return entry.isDirectory() ? filesIn(path.join(directory, entry.name), relative + '/') : [relative];
    });
}

async function prepareSdk() {
  fs.mkdirSync(dependencies, { recursive: true });
  const archive = path.join(dependencies, `webview2-${dependency.version}.nupkg`);
  if (!fs.existsSync(archive)) {
    console.log(`Downloading pinned WebView2 SDK to ${dependencies}`);
    const response = await fetch(dependency.url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`SDK download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== dependency.sha256) throw new Error('SDK checksum mismatch');
    fs.writeFileSync(archive, bytes);
  }
  if (sha256(fs.readFileSync(archive)) !== dependency.sha256) throw new Error('Cached SDK checksum mismatch');
  const required = [
    'lib/net462/Microsoft.Web.WebView2.Core.dll',
    'lib/net462/Microsoft.Web.WebView2.WinForms.dll',
    'runtimes/win-x64/native/WebView2Loader.dll',
    'LICENSE.txt', 'NOTICE.txt'
  ];
  // An interrupted extraction is repaired on the next build.
  powershell(`Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
    `$archive=[IO.Compression.ZipFile]::OpenRead(${psQuote(archive)}); try { ` +
    required.map(relative => {
      const target = path.join(sdk, relative);
      return `$entry=$archive.GetEntry(${psQuote(relative)}); if ($null -eq $entry) { throw 'SDK file missing' }; ` +
        `[IO.Directory]::CreateDirectory(${psQuote(path.dirname(target))}) | Out-Null; ` +
        `[IO.Compression.ZipFileExtensions]::ExtractToFile($entry,${psQuote(target)},$true);`;
    }).join(' ') + ` } finally { $archive.Dispose() }`);
}

function prepareSite() {
  // This generated directory is separate from the portable application's user data.
  const expectedStage = path.resolve(root, '.cache', 'desktop', 'site');
  if (path.resolve(stage) !== expectedStage || !stage.startsWith(cache + path.sep)) throw new Error('Unexpected staging path');
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  const ui = path.join(source, 'ui');
  for (const relative of filesIn(ui)) {
    const destination = path.join(stage, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const content = fs.readFileSync(path.join(ui, relative));
    fs.writeFileSync(destination, /\.(?:html|js|css)$/.test(relative)
      ? content.toString('utf8').replaceAll('__APP_VERSION__', version)
      : content);
  }
  fs.copyFileSync(path.join(root, 'src', 'core.js'), path.join(stage, 'core.js'));
  require('./icons.cjs');
  fs.mkdirSync(path.join(stage, 'icons'), { recursive: true });
  fs.copyFileSync(path.join(root, 'src', 'icons', 'icon-192.png'), path.join(stage, 'icons', 'icon-192.png'));
  for (const required of ['index.html', 'desktop.css', 'bridge.js', 'core.js', 'app.js']) {
    if (!fs.existsSync(path.join(stage, required))) throw new Error(`Desktop UI file missing: ${required}`);
  }
  const index = path.join(stage, 'index.html');
  let html = fs.readFileSync(index, 'utf8');
  if (!/<meta\b[^>]*http-equiv=["']Content-Security-Policy["']/i.test(html)) {
    if (!/<head\s*>/i.test(html)) throw new Error('Desktop HTML requires a <head> element');
    const policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
    html = html.replace(/<head\s*>/i, `<head>\n  <meta http-equiv="Content-Security-Policy" content="${policy}">`);
    fs.writeFileSync(index, html);
  }
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/gi)) {
    const reference = match[1].split(/[?#]/)[0];
    const target = path.resolve(stage, reference);
    if (!target.startsWith(stage + path.sep) || !fs.existsSync(target)) throw new Error(`Unpackaged desktop asset: ${reference}`);
  }
  const files = filesIn(stage);
  for (const relative of files.filter(name => name.endsWith('.js'))) run(process.execPath, ['--check', path.join(stage, relative)]);
  // Paths and all assets, including icons, participate in the content cache key.
  const digest = crypto.createHash('sha256');
  for (const relative of files) digest.update(relative + '\0' + sha256(fs.readFileSync(path.join(stage, relative))) + '\n');
  const siteHash = digest.digest('hex');
  const archive = path.join(cache, `site-v2-${siteHash.slice(0, 20)}.zip`);
  if (!fs.existsSync(archive)) {
    powershell(`Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
      `[IO.Compression.ZipFile]::CreateFromDirectory(${psQuote(stage)},${psQuote(archive)}); ` +
      `$archive=[IO.Compression.ZipFile]::Open(${psQuote(archive)},[IO.Compression.ZipArchiveMode]::Update); ` +
      `try { foreach ($entry in $archive.Entries) { $entry.LastWriteTime=[DateTimeOffset]::new(2000,1,1,0,0,0,[TimeSpan]::Zero) } } finally { $archive.Dispose() }`);
  }
  return { archive, siteHash, files };
}

function prepareIcon() {
  const png = fs.readFileSync(path.join(root, 'src', 'icons', 'icon-192.png'));
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header[6] = 192; header[7] = 192;
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  const icon = path.join(cache, 'kejian.ico');
  fs.writeFileSync(icon, Buffer.concat([header, png]));
  return icon;
}

function compile(siteArchive, icon) {
  const compiler = path.join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  if (!fs.existsSync(compiler)) throw new Error('The Windows .NET Framework C# compiler was not found.');
  const assemblyVersion = version.split('-')[0] + '.0';
  const manifest = path.join(cache, 'app.manifest');
  fs.writeFileSync(manifest, fs.readFileSync(path.join(source, 'app.manifest'), 'utf8').replaceAll('__ASSEMBLY_VERSION__', assemblyVersion));
  const metadata = path.join(cache, 'AssemblyInfo.cs');
  fs.writeFileSync(metadata, `using System.Reflection;\n` +
    `[assembly: AssemblyTitle("课间")]\n[assembly: AssemblyProduct("课间 Windows 桌面版")]\n` +
    `[assembly: AssemblyDescription("在本机整理通知和待办")]\n` +
    `[assembly: AssemblyVersion("${assemblyVersion}")]\n[assembly: AssemblyFileVersion("${assemblyVersion}")]\n` +
    `[assembly: AssemblyInformationalVersion("${version}")]\n`);
  // A failed compile must not overwrite a working release.
  const binary = path.join(cache, `kejian-${version}.exe`);
  const references = ['System.dll', 'System.Core.dll', 'System.Drawing.dll', 'System.Windows.Forms.dll', 'System.IO.Compression.dll', 'System.IO.Compression.FileSystem.dll', 'System.Web.Extensions.dll'];
  const resources = [
    ['site.zip', siteArchive], ['app.ico', icon],
    ...['Core', 'WinForms'].map(name => [`runtime.Microsoft.Web.WebView2.${name}.dll`, path.join(sdk, `lib/net462/Microsoft.Web.WebView2.${name}.dll`)]),
    ['runtime.WebView2Loader.dll', path.join(sdk, 'runtimes/win-x64/native/WebView2Loader.dll')]
  ];
  const args = [
    '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/utf8output', '/codepage:65001',
    `/out:"${binary}"`, `/win32icon:"${icon}"`, `/win32manifest:"${manifest}"`,
    ...references.map(name => `/reference:${name}`),
    ...['Core', 'WinForms'].map(name => `/reference:"${path.join(sdk, `lib/net462/Microsoft.Web.WebView2.${name}.dll`)}"`),
    ...resources.map(([name, file]) => `/resource:"${file}",${name}`),
    ...[path.join(source, 'Program.cs'), path.join(source, 'DesktopWindow.cs'), metadata].map(file => `"${file}"`)
  ];
  const responseFile = path.join(cache, 'compile.rsp');
  fs.writeFileSync(responseFile, '\ufeff' + args.join('\r\n'));
  run(compiler, ['@' + responseFile]);
  const bytes = fs.readFileSync(binary);
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a || bytes.length < 100000) throw new Error('Compiler output is not a valid desktop executable');
  return { binary, bytes };
}

function packageRelease(compiled, site) {
  fs.mkdirSync(output, { recursive: true });
  const exe = path.join(output, '课间.exe');
  fs.copyFileSync(compiled.binary, exe);
  const license = fs.readFileSync(path.join(sdk, 'LICENSE.txt'), 'utf8');
  const notice = fs.readFileSync(path.join(sdk, 'NOTICE.txt'), 'utf8');
  const notices = path.join(output, '第三方组件说明.txt');
  fs.writeFileSync(notices, `Microsoft.Web.WebView2 ${dependency.version}\nhttps://www.nuget.org/packages/Microsoft.Web.WebView2/${dependency.version}\n\n${license}\n\n${notice}`);
  const guide = path.join(output, '使用说明.txt');
  fs.writeFileSync(guide, fs.readFileSync(path.join(root, 'docs', 'desktop-user-guide.txt'), 'utf8').replaceAll('__APP_VERSION__', version));
  const zip = path.join(output, '课间-Windows免安装版.zip');
  const releaseFiles = [exe, guide, notices];
  // An explicit allowlist excludes the neighbouring private “课间数据” directory.
  powershell(`Compress-Archive -LiteralPath ${releaseFiles.map(psQuote).join(',')} -DestinationPath ${psQuote(zip)} -Force; ` +
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; $archive=[IO.Compression.ZipFile]::OpenRead(${psQuote(zip)}); ` +
    `try { if ($archive.Entries.Count -ne 3) { throw 'Unexpected release ZIP contents' }; ` +
    releaseFiles.map(file => {
      return `$entry=$archive.GetEntry(${psQuote(path.basename(file))}); if ($null -eq $entry) { throw 'Release ZIP file missing' }; ` +
        `$stream=$entry.Open(); $sha=[Security.Cryptography.SHA256]::Create(); try { ` +
        `$actual=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant(); ` +
        `if ($actual -ne '${sha256(fs.readFileSync(file))}') { throw 'Release ZIP checksum mismatch' } ` +
        `} finally { $sha.Dispose(); $stream.Dispose() };`;
    }).join(' ') + ` } finally { $archive.Dispose() }`);
  const info = {
    version, architecture: 'win-x64', webview2Sdk: dependency.version,
    exeBytes: compiled.bytes.length, sha256: sha256(compiled.bytes),
    zipSha256: sha256(fs.readFileSync(zip)), siteSha256: site.siteHash, packagedAssets: site.files,
    dataLocation: '课间.exe 同目录的课间数据文件夹', signed: false
  };
  fs.writeFileSync(path.join(output, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
  console.log(JSON.stringify({ exe, zip, ...info }, null, 2));
}

async function main() {
  if (process.platform !== 'win32') throw new Error('Build the Windows desktop application on Windows.');
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error('Invalid desktop version');
  await prepareSdk();
  const site = prepareSite();
  const compiled = compile(site.archive, prepareIcon());
  packageRelease(compiled, site);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
