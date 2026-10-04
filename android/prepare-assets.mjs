import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
const target = new URL('./app/src/main/assets/',import.meta.url);
await mkdir(target,{recursive:true});
for (const file of ['index.html','style.css','app.js','theme.js','favicon.svg']) {
 const source=new URL('../'+file,import.meta.url);
 if(file==='app.js') {
  const content=(await readFile(source,'utf8')).replace("['localhost','127.0.0.1','terminal.local']", "['localhost','127.0.0.1','terminal.local','appassets.androidplatform.net']");
  await writeFile(new URL(file,target),content);
 } else await copyFile(source,new URL(file,target));
}
