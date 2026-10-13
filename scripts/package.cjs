'use strict';
// Build a standard ZIP using only Node built-ins. No install or cloud service needed.
const fs=require('node:fs');const path=require('node:path');const zlib=require('node:zlib');
require('./build.cjs');
require('./build-miniprogram.cjs');
const root=path.resolve(__dirname,'..');const {version}=require('../package.json');
const release=path.join(root,'release',`v${version}`);
const webFiles=['index.html','style.css','core.js','app.js','pwa.js','sw.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
const files=[
  ['课间-免费离线版.html',path.join(release,'课间-免费离线版.html')],
  ['课间-试用说明.txt',path.join(root,'docs','user-guide.txt')],
  ['课间-发布文案.txt',path.join(root,'docs','launch-copy.txt')],
  ...webFiles.map(name=>['网站/'+name,path.join(root,'dist',name)])
];
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=data=>{let n=0xffffffff;for(const b of data)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;};
function writeZip(files,target){
const date=new Date();const dosTime=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1);
const dosDate=((Math.max(1980,date.getFullYear())-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
let offset=0;const bodies=[],directories=[];
for(const [name,source] of files){
  const bytes=fs.readFileSync(source),compressed=zlib.deflateRawSync(bytes),filename=Buffer.from(name,'utf8'),crc=crc32(bytes);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(dosTime,10);header.writeUInt16LE(dosDate,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(filename.length,26);
  const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50,0);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);directory.writeUInt16LE(dosTime,12);directory.writeUInt16LE(dosDate,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(compressed.length,20);directory.writeUInt32LE(bytes.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);
  bodies.push(header,filename,compressed);directories.push(directory,filename);offset+=header.length+filename.length+compressed.length;
}
const central=Buffer.concat(directories),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
fs.writeFileSync(target,Buffer.concat([...bodies,central,end]));
console.log(target);
}
writeZip(files,path.join(release,'课间-免费试用包.zip'));
// Hosting upload needs index.html at the archive root, without trial docs or source files.
writeZip(webFiles.map(name=>[name,path.join(root,'dist',name)]),path.join(release,'课间-网站部署包.zip'));
const miniRelease=path.join(root,'release','wechat','v0.1.0');fs.mkdirSync(miniRelease,{recursive:true});
function collectMini(dir,prefix){return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>entry.isDirectory()?collectMini(path.join(dir,entry.name),prefix+entry.name+'/'):[[prefix+entry.name,path.join(dir,entry.name)]]);}
writeZip([
  ['project.config.json',path.join(root,'project.config.json')],
  ['小程序导入说明.txt',path.join(root,'docs','wechat-import.txt')],
  ...collectMini(path.join(root,'miniprogram'),'miniprogram/')
],path.join(miniRelease,'课间-微信小程序开发包.zip'));
