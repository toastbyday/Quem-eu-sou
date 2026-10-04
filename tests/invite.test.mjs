import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../app.js',import.meta.url),'utf8');
const fn = source.slice(source.indexOf('function roomInviteUrl('),source.indexOf('const escape ='));
test('Convites do site e Android abrem no site sem transportar a sessão', () => {
 for (const hostname of ['quem-eu-sou.vercel.app','appassets.androidplatform.net']) {
  const context = vm.createContext({ URL, location:{hostname,origin:'https://'+hostname},localPreview:false });
  vm.runInContext(fn,context);
  assert.equal(context.roomInviteUrl('ABC123'),'https://quem-eu-sou.vercel.app/?sala=ABC123');
 }
});
test('Fim de rodada mostra a própria identidade e a partida mantém o segredo', () => {
 const fn = source.slice(source.indexOf('function playerCard('),source.indexOf('function lobby()'));
 const room = {phase:'playing',me:'a',host:'a',turn:'a'};
 const context = vm.createContext({room,escape:v=>String(v??''),avatar:()=>''});
 vm.runInContext(fn,context);
 const player = {id:'a',nick:'Ana',identity:'Bob Esponja',status:'gaveup',online:true};
 assert(!context.playerCard(player,0,true).includes('Bob Esponja'));
 room.phase='finished'; assert(context.playerCard(player,0,true).includes('Bob Esponja'));
});
