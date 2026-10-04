import { mkdir, copyFile, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const file of ['index.html', 'style.css', 'app.js', 'theme.js', 'favicon.svg','download.html','app-version.json']) await copyFile(file, `dist/${file}`);
console.log('Site pronto em dist/');

await mkdir('dist/downloads',{recursive:true});
await copyFile('downloads/Quem-eu-sou.apk','dist/downloads/Quem-eu-sou.apk');
