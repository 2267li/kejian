const {test}=require('node:test'),assert=require('node:assert/strict');
const {extract}=require('../src/core.js'),{check}=require('./evaluate.cjs');
for(const item of require('./fixtures/notice-cases.cjs'))test(item.id+' '+item.name,()=>assert.deepEqual(check(item,extract(item.text,item.base)),[]));
