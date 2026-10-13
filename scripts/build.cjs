const fs=require('node:fs');const path=require('node:path');
const projectRoot=path.resolve(__dirname,'..');
const {version}=require(path.join(projectRoot,'package.json'));
if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))throw new Error('Invalid package version');
const dir=path.join(projectRoot,'src');
require('./icons.cjs');
const dist=path.join(projectRoot,'dist');fs.mkdirSync(dist,{recursive:true});
fs.cpSync(dir,dist,{recursive:true});
const hash=require('node:crypto').createHash('sha256');
function hashFiles(folder){for(const name of fs.readdirSync(folder).sort()){const file=path.join(folder,name);if(fs.statSync(file).isDirectory())hashFiles(file);else hash.update(name).update(fs.readFileSync(file));}}
hashFiles(dir);
fs.writeFileSync(path.join(dist,'sw.js'),fs.readFileSync(path.join(dir,'sw.js'),'utf8').replace('__BUILD_ID__',hash.digest('hex').slice(0,16)));
const outputs=path.join(projectRoot,'release',`v${version}`);fs.mkdirSync(outputs,{recursive:true});
let html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+fs.readFileSync(path.join(dir,'style.css'),'utf8')+'</style>');
for(const name of ['core','app','pwa'])html=html.replace(`<script src="${name}.js"></script>`,()=>'<script>'+fs.readFileSync(path.join(dir,`${name}.js`),'utf8')+'</script>');
html=html.replace(/<link rel="(?:manifest|apple-touch-icon|icon)"[^>]*>/g,'');
const target=path.join(outputs,'课间-免费离线版.html');fs.writeFileSync(target,html);console.log(target);
