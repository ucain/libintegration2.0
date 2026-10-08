const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const roots=['src','tests','public'];
const files=[];
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,entry.name);
    if(entry.isDirectory()) walk(p);
    else if(entry.isFile() && p.endsWith('.js') && !p.endsWith('checkJs.js')) files.push(p);
  }
}
roots.forEach(r=>walk(path.resolve(process.cwd(),r)));
let failed=false;
for(const file of files){
  const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if(result.status!==0) failed=true;
}
if(failed) process.exit(1);
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
