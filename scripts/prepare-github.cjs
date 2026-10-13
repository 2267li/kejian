'use strict';
require('./local-env.cjs');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const parent = path.join(root, '.cache', 'github');
const snapshot = path.join(parent, 'source');
const manifestPath = path.join(parent, 'source-manifest.json');
const allowedRoots = new Set(['src', 'miniprogram', 'desktop', 'scripts', 'tests', 'docs', 'assets']);
const allowedFiles = new Set(['.gitignore', '.npmrc', 'README.md', 'CHANGELOG.md', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'project.config.json', 'netlify.toml']);
const localOnly = new Set(['docs/qa/storage-cleanup-2026-10-12.md']);
const candidates = cp.execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
const files = [...new Set(candidates)].filter(name => {
  if (localOnly.has(name)) return false;
  if (!(allowedFiles.has(name) || allowedRoots.has(name.split('/')[0]))) return false;
  if (name.split('/').some(part => ['.git', '.cache', 'node_modules', '课间数据', '备份'].includes(part))) return false;
  return fs.existsSync(path.join(root, name));
}).sort();
function contained(base, name) {
  const target = path.resolve(base, name), relative = path.relative(base, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path outside snapshot: ' + name);
  return target;
}
function publicBytes(name) {
  const source = contained(root, name);
  if (fs.lstatSync(source).isSymbolicLink() || !fs.statSync(source).isFile()) throw new Error('Only regular files can be published: ' + name);
  let bytes = fs.readFileSync(source);
  if (name.endsWith('.md')) {
    // Machine-maintenance details are kept in the original project only.
    bytes = Buffer.from(bytes.toString('utf8').split(/\r?\n/).filter(line => !line.includes('storage-cleanup-2026-10-12.md') && !line.includes('├── .openai/hosting.json')).join('\n'));
  }
  if (!/\.(png|jpe?g|ico)$/i.test(name)) {
    const text = bytes.toString('utf8');
    const secretPatterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, /\bgithub_pat_[A-Za-z0-9_]{30,}\b/, /\bsk-[A-Za-z0-9]{30,}\b/];
    if (secretPatterns.some(pattern => pattern.test(text))) throw new Error('Possible credential found in ' + name);
  }
  return bytes;
}
// Validate all source content before writing the publication checkout.
const contents = files.map(name => ({ name, bytes: publicBytes(name) }));
fs.mkdirSync(snapshot, { recursive: true });
const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).files : [];
for (const old of previous) {
  if (!files.includes(old.name)) {
    const target = contained(snapshot, old.name);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
}
const manifest = contents.map(({ name, bytes }) => {
  const target = contained(snapshot, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return { name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
});
fs.writeFileSync(manifestPath, JSON.stringify({ snapshot, files: manifest }, null, 2) + '\n');
console.log(JSON.stringify({ snapshot, files: files.length, bytes: manifest.reduce((sum, file) => sum + file.bytes, 0), excluded: ['private caches and backups', 'account-specific hosting metadata', 'machine maintenance report', 'original Git history'] }, null, 2));
