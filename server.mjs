import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {makeRules,validateRules,normalizePack,scoreMatchup} from './engine.mjs';
import {catalog,defaultBuild,defaultField,scoreBattle} from './battle-engine.mjs';
const root = resolve('.');
const chart = JSON.parse(await readFile('data/type-chart.json','utf8'));
const bundled = JSON.parse(await readFile('data/pokedex.json','utf8'));
let rules = makeRules(chart), pack = normalizePack(bundled,rules), player = 'garchomp', opponent = 'weavile';
let battle = {player_hp:100,opponent_hp:100};
let builds = {player:defaultBuild(pack.species.find(p=>p.id === player),rules.generation),opponent:defaultBuild(pack.species.find(p=>p.id === opponent),rules.generation)};
let field = defaultField();
const listeners = new Set();
function state() {
  const a = pack.species.find(p => p.id === player), b = pack.species.find(p => p.id === opponent);
  return {pack,rules,player,opponent,battle,builds,field,catalog:catalog(rules.generation),result:scoreBattle(a,b,rules,battle,builds,field)};
}
function json(res,code,obj) {res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
      listeners.add(res);res.write(`data: ${JSON.stringify(state())}\n\n`);
      const heartbeat = setInterval(() => res.write(': heartbeat\n\n'),20000);
      req.on('close',() => {listeners.delete(res);clearInterval(heartbeat);});return;
    }
    if (url.pathname === '/api/state' && req.method === 'GET') return json(res,200,state());
    if (url.pathname === '/api/state' && req.method === 'POST') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res,403,{error:'Use the local application to update the matchup.'});
      let body = '';for await (const chunk of req) {body += chunk;if (Buffer.byteLength(body) > 2500000) throw Error('Import exceeds 2.5 MB.');}
      const input = JSON.parse(body);
      const nextRules = input.rules ? validateRules(input.rules) : input.preset ? makeRules(chart,input.preset) : rules;
      const nextPack = input.reset ? normalizePack(bundled,nextRules) : input.pack ? normalizePack(input.pack,nextRules) : pack;
      const nextPlayer = input.player ?? player, nextOpponent = input.opponent ?? opponent;
      const changed = nextPlayer !== player || nextOpponent !== opponent || input.pack || input.reset;
      const nextBattle = {...(changed ? {player_hp:100,opponent_hp:100} : battle),...input.battle};
      const a = nextPack.species.find(p=>p.id === nextPlayer), b = nextPack.species.find(p=>p.id === nextOpponent);
      scoreMatchup(a,b,nextRules,nextBattle);
      const nextBuilds = {};
      for (const [side,p] of [['player',a],['opponent',b]]) {
        const reset = input.pack || input.reset || input.preset || input.rules && JSON.stringify(input.rules) !== JSON.stringify(rules) || (side === 'player' ? nextPlayer !== player : nextOpponent !== opponent);
        const prior = reset ? defaultBuild(p,nextRules.generation) : builds[side];
        const patch = input.builds?.[side] || {};
        nextBuilds[side] = {...prior,...patch,evs:{...prior.evs,...patch.evs},ivs:{...prior.ivs,...patch.ivs},boosts:{...prior.boosts,...patch.boosts}};
      }
      const oldField = input.reset || input.preset ? defaultField() : field;
      const nextField = {...oldField,...input.field,player:{...oldField.player,...input.field?.player},opponent:{...oldField.opponent,...input.field?.opponent}};
      scoreBattle(a,b,nextRules,nextBattle,nextBuilds,nextField);
      rules = nextRules;pack = nextPack;player = nextPlayer;opponent = nextOpponent;battle = nextBattle;builds = nextBuilds;field = nextField;
      const snapshot = state();for (const stream of listeners) stream.write(`data: ${JSON.stringify(snapshot)}\n\n`);
      return json(res,200,snapshot);
    }
    if (req.method !== 'GET') return json(res,405,{error:'Method not allowed.'});
    const allowed = new Set(['/','/index.html','/style.css','/app.mjs','/engine.mjs']);
    if (!allowed.has(url.pathname)) return json(res,404,{error:'Not found.'});
    const file = resolve(root,url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (!file.startsWith(root + sep)) throw Error('Invalid path.');
    const contents = await readFile(file);
    res.writeHead(200,{'Content-Type':({'.html':'text/html','.css':'text/css','.mjs':'text/javascript'})[extname(file)],'Cache-Control':'no-store'});res.end(contents);
  } catch (error) {json(res,400,{error:error.message});}
});
const port = Number(process.env.PORT || 3000);
server.listen(port,'127.0.0.1',() => console.log(`PokéThreat: http://127.0.0.1:${port}\nOBS: http://127.0.0.1:${port}/?overlay=1`));
server.on('error',error => {console.error(error.message);process.exitCode = 1;});
