import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import calculator from '../vendor/run-bun/index.js';
import util from '../vendor/run-bun/mechanics/util.js';
import {analyzeBattle} from '../analysis/threat.mjs';
import {actionOpportunity} from '../run-bun/actions.mjs';
import {hitChance} from '../run-bun/accuracy.mjs';
import {displayEstimate} from '../run-bun/display-estimate.mjs';

const root=new URL('../',import.meta.url);
const side={species:'Wooper',current_hp:58,actual_stats:{hp:58,atk:29,def:29,spe:17,spa:21,spd:21},
  build:{level:20,moves:['Earthquake'],boosts:{},item:'',ability:'Water Absorb',nature:'Serious'},effects:{},pp:{Earthquake:10}};
const snapshot={generation:8,field:{},player:structuredClone(side),opponent:structuredClone(side)};
const session={};let result;
for(let pass=0;pass<20;pass++){
  result=analyzeBattle(snapshot,calculator,util.getFinalSpeed,actionOpportunity,hitChance,
    {progressive:true,session,maxDepth:8,timeMs:200,criticalRates:[1/16,1/8,1/2,1]});
  if(result.outlook.complete)break;
}
const estimate=displayEstimate(result);
Object.assign(result,{display_score:estimate.score,display_score_kind:estimate.kind,refining:!result.outlook.complete});
const state=()=>({pack:{species:[{id:'wooper',name:'Wooper'}]},player:'wooper',opponent:'wooper',
  live:{player:{current_hp:58},opponent:{current_hp:58}},tracking:{status:'battle',message:'Demo battle · sample data',received_at:Date.now()},result});
const files={'/':'run-bun/live.html','/index.html':'run-bun/live.html','/app.mjs':'run-bun/live-app.mjs','/style.css':'style.css'};
http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/api/events'){
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
    const send=()=>res.write(`data: ${JSON.stringify(state())}\n\n`);send();
    const timer=setInterval(send,2000);req.on('close',()=>clearInterval(timer));return;
  }
  if(path==='/api/state'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(state()));return;}
  if(!files[path]){res.writeHead(404);res.end();return;}
  let body=await readFile(fileURLToPath(new URL(files[path],root)));
  if(path==='/'||path==='/index.html')body=body.toString().replace('</body>',
    '<p style="position:fixed;top:90px;left:24px;color:#b2c3b5;font:13px system-ui">DEMO · calculated Wooper mirror matchup · sample data</p></body>');
  res.writeHead(200,{'Content-Type':path.endsWith('.mjs')?'text/javascript':path.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-store'});res.end(body);
}).listen(3006,'127.0.0.1',()=>console.log('PokéPulse demo: http://127.0.0.1:3006/?overlay=1'));
