const {mkdirSync,copyFileSync,writeFileSync,readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const root=resolve(__dirname,'../..'),target=resolve(root,'tmp/cost-cpu-benchmark');
mkdirSync(resolve(target,'lib'),{recursive:true});
for(const file of ['health','reconciliation-state']) copyFileSync(resolve(root,`functions/lib/ticketing/${file}.js`),resolve(target,`lib/${file}.js`));
copyFileSync(resolve(__dirname,'index.cjs'),resolve(target,'index.cjs'));
const dependencies=JSON.parse(readFileSync(resolve(root,'functions/package.json'))).dependencies;
writeFileSync(resolve(target,'package.json'),JSON.stringify({name:'pluto-cost-cpu-benchmark',private:true,main:'index.cjs',engines:{node:'22'},
  dependencies:{'firebase-admin':dependencies['firebase-admin'],'firebase-functions':dependencies['firebase-functions']}}));
writeFileSync(resolve(root,'tmp/cost-benchmark.firebase.json'),JSON.stringify({functions:[{source:'cost-cpu-benchmark',codebase:'cost-benchmark',ignore:['node_modules','*.log']}]}));
console.log('Prepared isolated staging-only health benchmark.');
