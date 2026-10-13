'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),appRoot=path.join(root,'miniprogram');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk(appRoot)){
  if(file.endsWith('.json'))JSON.parse(fs.readFileSync(file,'utf8'));
  if(file.endsWith('.js')){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);}
}
const app=JSON.parse(fs.readFileSync(path.join(appRoot,'app.json'),'utf8'));
for(const page of app.pages)for(const ext of ['js','json','wxml','wxss'])if(!fs.existsSync(path.join(appRoot,page+'.'+ext)))throw new Error('Missing page: '+page+'.'+ext);
const locations=[process.env.KEJIAN_WECHAT_TOOLS,'E:/微信web开发者工具','C:/Program Files (x86)/Tencent/微信web开发者工具','C:/Program Files/Tencent/微信web开发者工具'].filter(Boolean);
const tool=locations.find(p=>fs.existsSync(path.join(p,'code/package.nw/node_modules/wcc-exec/wcc.exe')));
if(!tool)throw new Error('请设置 KEJIAN_WECHAT_TOOLS 为微信开发者工具安装目录，再检查 WXML/WXSS 编译。JS/JSON 已检查。');
const output=path.join(root,'.cache/miniprogram');fs.mkdirSync(output,{recursive:true});
for(const [binary,files] of [['wcc',app.pages.map(p=>p+'.wxml')],['wcsc',['app.wxss',...app.pages.map(p=>p+'.wxss')]]]){
  const result=spawnSync(path.join(tool,'code/package.nw/node_modules/wcc-exec',binary+'.exe'),['-o',path.join(output,'compiled-'+binary+'.js'),...files],{cwd:appRoot,encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr||result.stdout||binary+' compilation failed');
}
console.log(JSON.stringify({javascript:'passed',json:'passed',wxml:'passed',wxss:'passed',runtime:'not tested by this command'}));
