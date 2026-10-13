'use strict';
// Rasterize our own checkmark. No image service, fonts or dependencies.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data){const body=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;for(const n of body)crc=table[(crc^n)&255]^(crc>>>8);const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,body,tail]);}
function distance(x,y,ax,ay,bx,by){const t=Math.max(0,Math.min(1,((x-ax)*(bx-ax)+(y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)));return Math.hypot(x-ax-t*(bx-ax),y-ay-t*(by-ay));}
const dir=path.resolve(__dirname,'../src/icons');fs.mkdirSync(dir,{recursive:true});
for(const size of [192,512]){
 const raw=Buffer.alloc((size*3+1)*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let coverage=0;
  for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){
   const px=(x+(sx+.5)/2)/size,py=(y+(sy+.5)/2)/size;
   if(Math.min(distance(px,py,.30,.50,.44,.64),distance(px,py,.44,.64,.71,.35))<.039)coverage++;
  }
  const offset=y*(size*3+1)+1+x*3;
  [54,91,229].forEach((c,i)=>raw[offset+i]=Math.round(c+(255-c)*coverage/4));
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=2;
 fs.writeFileSync(path.join(dir,`icon-${size}.png`),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
