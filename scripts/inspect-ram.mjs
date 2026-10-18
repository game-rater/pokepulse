import {readFileSync,writeFileSync} from 'node:fs';
const lua=readFileSync('run-bun/reference/runandbun.lua','utf8');
const tables={};
for(const key of ['move','mons','item','ability','nature']) {
 const body=lua.match(new RegExp('^'+key+' = \\{([\\s\\S]*?)\\n\\}', 'm'))[1];
 tables[key]=[...body.matchAll(/"([^"\r\n]*)"|'([^'\r\n]*)'/g)].map(x=>x[1]??x[2]);
}
if(process.argv.includes('--maps')) {
 const previous=JSON.parse(readFileSync('run-bun/reference/mappings.json','utf8'));
 writeFileSync('run-bun/reference/mappings.json',JSON.stringify({...tables,abilityIds:previous.abilityIds}));
}
const ram=readFileSync(process.argv[2]);
console.log('party count',ram[0x23a95]);
for(let p=0;p<0x40000-100;p+=2){
 const species=ram.readUInt16LE(p), stats=[2,4,6,8,10].map(o=>ram.readUInt16LE(p+o)),moves=[12,14,16,18].map(o=>ram.readUInt16LE(p+o));
 const stages=[...ram.subarray(p+24,p+32)];
 if(species>0&&species<=tables.mons.length&&stats.every(x=>x>0&&x<800)&&moves[0]>0&&moves.every(x=>x<tables.move.length)&&stages.every(x=>x>=0&&x<=12)&&stages.filter(x=>x===6).length>=5){
 console.log('candidate','0x'+(p+0x2000000).toString(16),tables.mons[species-1], stats,moves.map(x=>tables.move[x]),ram.subarray(p+32,p+100).toString('hex'));
 }
}
