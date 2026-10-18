import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import calculator from '../vendor/run-bun/index.js';
const require=createRequire(import.meta.url),root=new URL('../vendor/showdown/',import.meta.url);
const path=new URL('dist/data/mods/runbun/',root);mkdirSync(path,{recursive:true});
const metadata=JSON.parse(readFileSync(new URL('../run-bun/move-effects.json',import.meta.url))).moves;
const romMoves=JSON.parse(readFileSync(new URL('../run-bun/reference/mappings.json',import.meta.url))).move.filter(Boolean);
const base=require('../vendor/showdown/dist/data/moves.js').Moves;
function csv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){rows.push(row);row=[];}}else cell+=c;}return rows;}
const changes=csv(readFileSync(new URL('../run-bun/reference/move-changes.csv',import.meta.url),'utf8')).slice(1);
const id=s=>calculator.toID(s),overrides={};
for(const name of romMoves){const data=base[id(name)];if(!data)throw Error(`No executable definition: ${name}`);overrides[id(name)]={inherit:true,isNonstandard:null,gen:8};}
for(const m of calculator.Generations.get(8).moves){if(!base[m.id]||!overrides[m.id])continue;Object.assign(overrides[m.id],{basePower:m.basePower,type:m.type,category:m.category,priority:m.priority||0});}
for(const row of changes){const record=overrides[id(row[0])];if(!record)continue;for(const [column,key] of [[1,'basePower'],[2,'pp'],[3,'accuracy']])if(row[column]?.includes('>'))record[key]=Number(row[column].split('>').at(-1).replace('%','').trim());}
for(const [move,chance] of Object.entries({chargebeam:100,leaftornado:30,mirrorshot:20,mudbomb:20,nightdaze:30,octazooka:30,rocksmash:100,smog:100})){
  overrides[move].secondary={...base[move].secondary,chance};
}
writeFileSync(new URL('scripts.js',path),'exports.Scripts={inherit:"gen8"};\n');
writeFileSync(new URL('moves.js',path),`const base=require('../../moves.js').Moves;\nexports.Moves=${JSON.stringify(overrides,null,2)};\n`+
  `exports.Moves.thief.onAfterHit=null;exports.Moves.covet.onAfterHit=null;\n`+
  `exports.Moves.darkvoid.onTry=null;\n`+
  `exports.Moves.defendorder={...base.protect,...exports.Moves.defendorder,name:'Defend Order',num:455,type:'Bug',priority:4,boosts:null};\n`+
  `exports.Moves.destinybond.onPrepareHit=function(pokemon){pokemon.removeVolatile('destinybond');};\n`+
  `exports.Moves.thunderwave.onModifyMove=function(move,source){if(source.hasType('Electric'))move.accuracy=true;};\n`);
const species={};for(const p of calculator.Generations.get(8).species)species[p.id]={inherit:true,baseStats:p.baseStats,types:p.types,abilities:p.abilities,weightkg:p.weightkg};
writeFileSync(new URL('pokedex.js',path),'exports.Pokedex='+JSON.stringify(species)+';\n');
writeFileSync(new URL('abilities.js',path),`exports.Abilities={magmaarmor:{inherit:true,onCriticalHit(){return false;}},galewings:{inherit:true,onModifyPriority(priority,pokemon,target,move){if(move?.type==='Flying')return priority+1;}}};\n`);
writeFileSync(new URL('items.js',path),`const gen7=require('../gen7/items.js').Items;const base=require('../../items.js').Items;exports.Items={};for(const id of ['figyberry','wikiberry','magoberry','aguavberry','iapapaberry'])if(gen7[id]?.onEat)exports.Items[id]={inherit:true,onEat:gen7[id].onEat};exports.Items.micleberry={inherit:true,condition:{...base.micleberry.condition,duration:undefined}};\n`+
 `exports.Items.souldew={inherit:true,onBasePower(){},onModifySpAPriority:1,onModifySpA(spa,pokemon){if([380,381].includes(pokemon.baseSpecies.num))return this.chainModify(1.5);},onModifySpDPriority:2,onModifySpD(spd,pokemon){if([380,381].includes(pokemon.baseSpecies.num))return this.chainModify(1.5);}};\n`);
const actionPath=new URL('dist/sim/battle-actions.js',root);let actions=readFileSync(actionPath,'utf8');
// Secondary checks have two outcomes. Preserve their exact probability rather
// than exposing 100 indistinguishable integer rolls to the search adapter.
actions=actions.replace('const secondaryRoll = this.battle.random(100);\n          if (typeof moveData.self.chance === "undefined" || secondaryRoll < moveData.self.chance)',
 'const secondarySuccess = typeof moveData.self.chance === "undefined" || this.battle.randomChance(Math.min(100, Math.max(0, moveData.self.chance)), 100);\n          if (secondarySuccess)');
actions=actions.replace('const secondaryRoll = this.battle.random(100);\n        const secondaryOverflow = (secondary.boosts || secondary.self) && this.battle.gen <= 8;\n        if (typeof secondary.chance === "undefined" || secondaryRoll < (secondaryOverflow ? secondary.chance % 256 : secondary.chance))',
 'const secondaryOverflow = (secondary.boosts || secondary.self) && this.battle.gen <= 8;\n        const secondaryChance = secondaryOverflow ? secondary.chance % 256 : secondary.chance;\n        const secondarySuccess = typeof secondary.chance === "undefined" || this.battle.randomChance(Math.min(100, Math.max(0, secondaryChance)), 100);\n        if (secondarySuccess)');
actions=actions.replace('critMult = [0, 24, 8, 2, 1];','critMult = [0, this.battle.format.id === "runbun" ? 16 : 24, 8, 2, 1];');
if(!actions.includes('this.battle.format.id === "runbun" && ["explosion", "selfdestruct", "mistyexplosion"].includes(move.id)'))actions=actions.replace('this.battle.gen <= 4 && ["explosion", "selfdestruct"].includes(move.id) && defenseStat === "def"',
  '(this.battle.gen <= 4 && ["explosion", "selfdestruct"].includes(move.id) && defenseStat === "def" || this.battle.format.id === "runbun" && ["explosion", "selfdestruct", "mistyexplosion"].includes(move.id))');
writeFileSync(actionPath,actions);
writeFileSync(new URL('source.json',root),JSON.stringify({package:'pokemon-showdown',version:'0.11.11',license:'MIT',source:'https://github.com/smogon/pokemon-showdown',
  changes:['Local singles formats only','Run & Bun move changes and species data','Run & Bun critical rates, Magma Armor, Gale Wings and explosion defense rule','Soul Dew matches the Run & Bun calculator special-stat modifiers'],move_count:romMoves.length},null,2)+'\n');
console.log(`Configured executable definitions for all ${romMoves.length} ROM move names.`);
