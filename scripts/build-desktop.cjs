'use strict';
require('./local-env.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version,lock=require('../desktop/dependency-lock.json').webview2;
const cache=path.join(root,'.cache/desktop'),deps=path.join(cache,'dependencies'),sdk=path.join(deps,'webview2-'+lock.version),stage=path.join(cache,'site');
const output=path.join(root,'release/windows','v'+version),source=path.join(root,'desktop');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function ps(script){const r=cp.spawnSync('powershell.exe',['-NoProfile','-Command',script],{cwd:root,encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error(r.stdout+r.stderr);}
const quote=value=>"'"+value.replace(/'/g,"''")+"'";
function replace(text,from,to){if(!text.includes(from))throw new Error('Desktop adapter source changed: '+from.slice(0,100));return text.replace(from,to);}
(async()=>{
  if(process.platform!=='win32')throw new Error('Windows compiler is required.');
  fs.mkdirSync(deps,{recursive:true});fs.mkdirSync(stage,{recursive:true});fs.mkdirSync(output,{recursive:true});
  const archive=path.join(deps,'webview2-'+lock.version+'.nupkg');
  if(!fs.existsSync(archive)){
    console.log('Downloading pinned Microsoft WebView2 SDK to E: project cache…');
    const response=await fetch(lock.url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error('SDK download failed: '+response.status);
    const bytes=Buffer.from(await response.arrayBuffer());if(hash(bytes)!==lock.sha256)throw new Error('SDK checksum mismatch');fs.writeFileSync(archive,bytes);
  }
  if(hash(fs.readFileSync(archive))!==lock.sha256)throw new Error('Cached SDK checksum mismatch');
  if(!fs.existsSync(path.join(sdk,'lib/net462/Microsoft.Web.WebView2.Core.dll')))
    ps('Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory('+quote(archive)+','+quote(sdk)+')');
  require('./icons.cjs');
  for(const name of ['core.js','style.css'])fs.copyFileSync(path.join(root,'src',name),path.join(stage,name));
  fs.mkdirSync(path.join(stage,'icons'),{recursive:true});fs.copyFileSync(path.join(root,'src/icons/icon-192.png'),path.join(stage,'icons/icon-192.png'));
  for(const name of ['bridge.js','desktop.js','desktop.css'])fs.copyFileSync(path.join(source,'ui',name),path.join(stage,name));
  let html=fs.readFileSync(path.join(root,'src/index.html'),'utf8');
  html=html.replace(/<link rel="(?:manifest|apple-touch-icon)"[^>]*>/g,'');
  html=replace(html,'<script src="pwa.js"></script>','<script src="desktop.js"></script>');
  html=replace(html,'<script src="core.js"></script>','<script src="bridge.js"></script><script src="core.js"></script>');
  html=replace(html,'<link rel="stylesheet" href="style.css">','<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="desktop.css">');
  html=replace(html,'<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; connect-src \'none\'; object-src \'none\'; frame-src \'none\'; base-uri \'none\'; form-action \'none\'">');
  html=html.replaceAll('免费试用版','Windows 桌面版').replaceAll('保存在当前浏览器','保存在这台电脑').replaceAll('待办保存在当前浏览器；清理浏览器数据会丢失记录','待办保存在程序旁的“课间数据”文件夹；删除此文件夹会丢失记录');
  html=replace(html,'保存一份 JSON 备份文件。','点击“保存备份”，把备份文件存好。');
  html=replace(html,'用浏览器打开同一个网址，选择备份文件。可合并记录，也可替换全部。','在桌面版、网页版或微信小程序中恢复这份备份。可保留现有待办，也可全部替换。');
  html=replace(html,'清理浏览器数据会删除记录，建议定期导出。主屏幕应用和浏览器有时使用不同存储，也请用备份搬家。','移动程序时，请一起带走旁边的“课间数据”文件夹。设备之间不会自动同步，建议定期保存备份。');
  html=html.replaceAll('无需 API 密钥、','').replaceAll('>导出数据<','>保存备份<').replaceAll('>导入数据<','>恢复待办<');
  html=replace(html,'没有打开网页时不会弹出提醒；需要提醒，可导入手机或电脑日历后设置。','需要提醒，可生成日历文件，再在手机或电脑日历中设置。');
  fs.writeFileSync(path.join(stage,'index.html'),html);
  let app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
  app=replace(app,'function download(text,filename,type) {','function download(text,filename,type) {\n    return window.KejianDesktop.saveFile(text,filename);');
  app=replace(app,'function downloadCalendar(items) {','async function downloadCalendar(items) {');
  app=replace(app,"download(makeCalendar(dated),'课间待办.ics','text/calendar;charset=utf-8');","if(!(await download(makeCalendar(dated),'课间待办.ics','text/calendar;charset=utf-8')))return;");
  app=replace(app,"$('backupBtn').onclick=()=>{download(","$('backupBtn').onclick=async()=>{if(!(await download(");
  app=replace(app,"'application/json');toast('已导出。把文件传到另一台设备，再点“导入数据”');","'application/json')))return;toast('备份已保存，可传到另一台设备恢复待办');");
  app=replace(app,"download(text,'课间试用反馈.txt','text/plain;charset=utf-8');toast('浏览器未允许复制，已导出反馈文件');","if(await download(text,'课间试用反馈.txt','text/plain;charset=utf-8'))toast('反馈已保存为文件');");
  app=app.replaceAll('浏览器','桌面版').replaceAll('已收好，待办保存在这个桌面版里','已收好，待办保存在这台电脑里');
  fs.writeFileSync(path.join(stage,'app.js'),app);
  for(const name of ['app.js','bridge.js','desktop.js']){const r=cp.spawnSync(process.execPath,['--check',path.join(stage,name)],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error(r.stderr);}
  const siteZip=path.join(cache,'site-'+hash(Buffer.concat(fs.readdirSync(stage).filter(n=>n.endsWith('.js')||n.endsWith('.css')||n.endsWith('.html')).sort().map(n=>fs.readFileSync(path.join(stage,n))))).slice(0,16)+'.zip');
  if(!fs.existsSync(siteZip))ps('Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory('+quote(stage)+','+quote(siteZip)+')');
  const png=fs.readFileSync(path.join(root,'src/icons/icon-192.png')),ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=192;ico[7]=192;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
  const icon=path.join(cache,'kejian.ico');fs.writeFileSync(icon,Buffer.concat([ico,png]));
  const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),exe=path.join(output,'课间.exe');
  const refs=['System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.IO.Compression.dll','System.IO.Compression.FileSystem.dll','System.Web.Extensions.dll'];
  const resources=[['site.zip',siteZip],['app.ico',icon],...['Core','WinForms'].map(n=>['runtime.Microsoft.Web.WebView2.'+n+'.dll',path.join(sdk,'lib/net462/Microsoft.Web.WebView2.'+n+'.dll')]),['runtime.WebView2Loader.dll',path.join(sdk,'runtimes/win-x64/native/WebView2Loader.dll')]];
  const args=['/nologo','/target:winexe','/platform:x64','/optimize+','/utf8output','/codepage:65001','/out:"'+exe+'"','/win32icon:"'+icon+'"','/win32manifest:"'+path.join(source,'app.manifest')+'"',...refs.map(r=>'/reference:'+r),...['Core','WinForms'].map(n=>'/reference:"'+path.join(sdk,'lib/net462/Microsoft.Web.WebView2.'+n+'.dll')+'"'),...resources.map(([name,file])=>'/resource:"'+file+'",'+name),'"'+path.join(source,'Program.cs')+'"','"'+path.join(source,'DesktopWindow.cs')+'"'];
  const responseFile=path.join(cache,'compile.rsp');fs.writeFileSync(responseFile,'\ufeff'+args.join('\r\n'));
  const result=cp.spawnSync(compiler,['@'+responseFile],{cwd:root,encoding:'utf8',windowsHide:true});if(result.status!==0)throw new Error(result.stdout+result.stderr);
  const license=fs.readFileSync(path.join(sdk,'LICENSE.txt'),'utf8'),notice=fs.readFileSync(path.join(sdk,'NOTICE.txt'),'utf8');
  fs.writeFileSync(path.join(output,'第三方组件说明.txt'),'Microsoft.Web.WebView2 '+lock.version+'\nhttps://www.nuget.org/packages/Microsoft.Web.WebView2/'+lock.version+'\n\n'+license+'\n\n'+notice);
  fs.copyFileSync(path.join(root,'docs/desktop-user-guide.txt'),path.join(output,'使用说明.txt'));
  const zip=path.join(output,'课间-Windows免安装版.zip');
  ps('Compress-Archive -LiteralPath '+[exe,path.join(output,'使用说明.txt'),path.join(output,'第三方组件说明.txt')].map(quote).join(',')+' -DestinationPath '+quote(zip)+' -Force');
  const info={version,architecture:'win-x64',webview2Sdk:lock.version,exeBytes:fs.statSync(exe).size,sha256:hash(fs.readFileSync(exe)),dataLocation:'课间.exe 同目录的课间数据文件夹',signed:false};
  fs.writeFileSync(path.join(output,'build-info.json'),JSON.stringify(info,null,2)+'\n');console.log(JSON.stringify({exe,zip,...info},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
