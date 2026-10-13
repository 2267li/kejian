'use strict';
// Set this before loading browser automation so profiles/downloads stay in the project.
const fs=require('node:fs'),path=require('node:path');
const cache=path.resolve(__dirname,'../.cache');
const temporary=path.join(cache,'temp');
fs.mkdirSync(temporary,{recursive:true});
for(const key of ['TEMP','TMP','TMPDIR'])process.env[key]=temporary;
process.env.npm_config_cache=path.join(cache,'npm');
module.exports={cache,temporary};
