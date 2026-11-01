import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {WORLD,TerrainMask,makeRoom,makePlayer,start,command,tick,trace,crater,ground,snapshot,newTerrain,flatTerrain,setTerrain,baseMask,profileHeightAt,terrainSync,MAP_NAMES} from '../game.mjs';
import {COLS,ROWS} from '../terrain.mjs';
import {createBattleServer} from '../server.mjs';

const C=WORLD.cell;
function duel(a=0,b=8){const r=makeRoom('MASK');r.players=[makePlayer('a','A',a,1000),makePlayer('b','B',b,1000)];r.host='a';r.players[1].team=1;for(const p of r.players){p.ready=true;p.inventory.fill(1);}start(r,1000,()=>.999,()=>0);r.wind=0;return r;}
function place(r,p,x){p.x=x;p.y=ground(r,x);}
function fill(mask,x0,y0,x1,y1){for(let cy=Math.floor(y0/C);cy<Math.ceil(y1/C);cy++)for(let cx=Math.floor(x0/C);cx<Math.ceil(x1/C);cx++)mask.bits[cy*COLS+cx]=1;}
function client(r){const m=new TerrainMask();const apply=sync=>{if(!sync)return;if(sync.terrainMask)m.apply(sync.terrainMask);for(const p of sync.terrainPatches||[])m.apply(p);};let v=-1;return {mask:m,pull(){apply(terrainSync(r,v));v=r.terrainVersion;}};}

test('world is doubled from 3200x1800 to 6400x3600 and every map scales with it',()=>{
 assert.equal(WORLD.width,6400);assert.equal(WORLD.height,3600);assert.equal(COLS*C,WORLD.width);assert.equal(ROWS*C,WORLD.height);
 const r=makeRoom('W'),s=snapshot(r);assert.equal(s.worldWidth,6400);assert.equal(s.worldHeight,3600);assert.deepEqual(s.world,{width:6400,height:3600,cell:C,columns:COLS,rows:ROWS});
 for(let id=0;id<MAP_NAMES.length;id++){
  // Same silhouette as before at twice the size: the former 3200x1800 ruins put the left ledge at x=220,h=(887-231)/887*1800.
  if(id===6){assert.ok(Math.abs(profileHeightAt(6,440)-2*(887-231)/887*1800)<1);}
  const h=newTerrain(id);assert.equal(h.length,WORLD.legacyColumns+1);assert.ok(Math.max(...h)<WORLD.height);
 }
 // Collision exists beyond the former right edge.
 const q=duel();flatTerrain(q,100);const p=q.players[0];p.x=5900;p.y=100;q.players=[p];const shot=trace(q,p,20,20);assert.ok(shot.hit);assert.ok(shot.x>3200&&shot.x<=6400);
});

test('ground hit carves a circle, not a column',()=>{
 const r=duel();flatTerrain(r,400);crater(r,2000,400,50);
 assert.ok(!r.mask.solid(2000,360));assert.ok(!r.mask.solid(2040,390));assert.ok(r.mask.solid(2000,340));assert.ok(r.mask.solid(2060,390));assert.ok(r.mask.solid(2000,100));
 assert.equal(ground(r,2000),352);assert.equal(ground(r,2100),400);
});

test('cliff side impact leaves an undercut overhang and the missile stops on the face',()=>{
 const r=duel();flatTerrain(r,x=>x<2000?1000:200);r.players=[r.players[0]];const p=r.players[0];place(r,p,2600);
 const shot=trace(r,{x:2300,y:500,team:0},180,100);assert.ok(shot.hit);assert.ok(shot.x>=2000-C&&shot.x<=2000,`x=${shot.x}`);assert.ok(shot.y>200&&shot.y<1000);
 crater(r,shot.x,shot.y,50);assert.ok(!r.mask.solid(1990,shot.y));assert.ok(r.mask.solid(1990,shot.y+80));assert.equal(ground(r,1990),1000);assert.equal(ground(r,1900),1000);
});

test('fast missiles do not tunnel through a one-cell thin anchored platform',()=>{
 const r=duel();const m=TerrainMask.fromHeights(()=>100);fill(m,3000,1000,3400,1000+C);fill(m,3000,100,3000+C,1000);setTerrain(r,m);r.players=[];
 const shot=trace(r,{x:3200,y:1500,team:0},-90,100);assert.ok(shot.hit);assert.ok(shot.y>=1000&&shot.y<=1000+C,`y=${shot.y}`);
 const side=trace(r,{x:2600,y:950,team:0},0,100);assert.ok(side.hit);assert.ok(side.x>=3000&&side.x<=3000+C,`x=${side.x}`);
});

test('both map edges carve safely and missiles leaving the map miss',()=>{
 const r=duel();flatTerrain(r,300);for(const x of [0,3,WORLD.width-3,WORLD.width])assert.doesNotThrow(()=>crater(r,x,300,50));
 assert.ok(ground(r,1)<300&&ground(r,WORLD.width-1)<300);
 r.players=[r.players[0]];const p=r.players[0];place(r,p,40);assert.equal(trace(r,p,170,60).hit,false);place(r,p,WORLD.width-40);assert.equal(trace(r,p,10,60).hit,false);
});

test('repeated overlapping explosions and hits on old crater rims never restore terrain',()=>{
 const r=duel();flatTerrain(r,800);const discs=[];let prev=r.mask.bits.slice();
 for(let i=0;i<25;i++){const x=1500+(i%5)*35,y=ground(r,x);discs.push([x,y,40+(i%3)*8]);crater(r,...discs.at(-1));
  for(let k=0;k<prev.length;k++)if(!prev[k])assert.equal(r.mask.bits[k],0);prev=r.mask.bits.slice();}
 for(const [x,y,rad] of discs)for(let a=0;a<64;a++){const d=rad-C;assert.ok(!r.mask.solid(x+Math.cos(a)*d,y+Math.sin(a)*d));}
 assert.equal(ground(r,1000),800);
});

test('small floating fragments are removed by connectivity and size; large ones and cliffs stay',()=>{
 const r=duel();const m=TerrainMask.fromHeights(()=>200);fill(m,1000,600,1040,640);fill(m,3000,600,3600,700);setTerrain(r,m);
 crater(r,1060,620,30);assert.ok(!r.mask.solid(1020,620),'small chunk removed');
 crater(r,3620,650,30);assert.ok(r.mask.solid(3300,650),'large floating chunk kept');
 // Undercutting a broad cliff never deletes it.
 flatTerrain(r,x=>x<2000?1500:200);for(let y=250;y<1400;y+=60)crater(r,2000,y,40);assert.equal(ground(r,1900),1500);
});

test('characters fall onto remaining ground with fall damage after the floor is destroyed',()=>{
 const r=duel();const m=TerrainMask.fromHeights(()=>200);fill(m,2500,900,3100,900+3*C);fill(m,3060,200,3100,900);setTerrain(r,m);
 const [a,b]=r.players;place(r,a,600);b.x=2700;b.y=ground(r,2700);assert.equal(b.y,900+3*C);const hp=b.hp;
 command(r,r.turn,{type:'skip'},1500);const shooter=r.players.find(p=>p.id===r.turn);
 command(r,shooter.id,{type:'fire',kind:'normal',angle:45,power:40},1600);const s=r.pending.shots[0];s.x=2700;s.y=906;s.hit=true;s.impactAt=1700;tick(r,1700);
 assert.equal(b.y,200);assert.equal(b.y,ground(r,b.x));assert.ok(b.hp<hp);
});

test('multi-projectile weapons carve once per impact and each impact is the true path end',()=>{
 for(const c of [5,8]){const r=duel(c,0);flatTerrain(r,200);place(r,r.players[0],600);place(r,r.players[1],4000);const v=r.terrainVersion;
  const shooter=r.players.find(p=>p.id===r.turn);command(r,shooter.id,{type:'fire',kind:'normal',angle:60,power:45},1500);
  const shot=r.lastShot;assert.equal(shot.paths.length,3);for(const p of shot.paths){const end=p.points.at(-1);assert.deepEqual(p.impact,{x:end.x,y:end.y});}
  tick(r,r.resumeAt);assert.equal(r.terrainVersion-v,shot.paths.filter(p=>p.hit).length);for(const p of shot.paths)assert.ok(!r.mask.solid(p.impact.x,p.impact.y));}
});

test('teleport lands on the surface at the impact, including inside an earlier crater',()=>{
 const r=duel();flatTerrain(r,500);place(r,r.players[0],600);place(r,r.players[1],4000);crater(r,1400,500,60);
 const shooter=r.players.find(p=>p.id===r.turn);command(r,shooter.id,{type:'fire',kind:'teleport',angle:60,power:40},1500);const s=r.pending.shots[0];s.x=1400;s.y=ground(r,1400);s.hit=true;s.impactAt=1600;tick(r,1600);
 assert.equal(shooter.x,1400);assert.equal(shooter.y,ground(r,1400));assert.ok(shooter.y<500);
});

test('players can only walk where the mask allows; walls and low ceilings block',()=>{
 const r=duel();const m=TerrainMask.fromHeights(x=>x<1000?200:x<1100?220:600);setTerrain(r,m);const p=r.players.find(q=>q.id===r.turn);place(r,r.players.find(q=>q!==p),5000);place(r,p,990);
 command(r,p.id,{type:'move',dx:12},1500);assert.equal(p.y,220);p.x=1090;p.y=220;assert.throws(()=>command(r,p.id,{type:'move',dx:12},1501),/높은/);
});

test('two clients reconstruct identical masks from full sync plus patches, also when joining late',()=>{
 const r=duel();setTerrain(r,baseMask(6).clone());const early=client(r);early.pull();
 for(let i=0;i<10;i++){const x=800+i*450;crater(r,x,ground(r,x),62*.8);early.pull();}
 const late=client(r);late.pull();assert.deepEqual(early.mask.bits,r.mask.bits);assert.deepEqual(late.mask.bits,r.mask.bits);
 for(let i=0;i<WORLD.patchHistory+5;i++)crater(r,3000+(i%9)*30,ground(r,3000+(i%9)*30),40);early.pull();assert.deepEqual(early.mask.bits,r.mask.bits);
});

test('real sockets: both clients receive the same authoritative terrain after an impact',{timeout:15000},async()=>{
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 async function sock(url){const ws=new WebSocket(url);const msgs=[];const mask=new TerrainMask();ws.on('message',raw=>{const m=JSON.parse(raw);msgs.push(m);if(m.terrainMask)mask.apply(m.terrainMask);for(const p of m.terrainPatches||[])mask.apply(p);});await new Promise(r=>ws.once('open',r));return {ws,msgs,mask,send:m=>ws.send(JSON.stringify(m)),wait:async f=>{for(let i=0;i<800;i++){const m=msgs.find(f);if(m)return m;await delay(10);}throw new Error('timeout');}};}
 const app=createBattleServer({port:0,host:'127.0.0.1'});const {port}=await app.listen();const url=`ws://127.0.0.1:${port}`;
 try{
  const a=await sock(url),b=await sock(url);a.send({type:'create',name:'A'});const wa=await a.wait(m=>m.type==='welcome');b.send({type:'join',code:wa.code,name:'B'});const wb=await b.wait(m=>m.type==='welcome');
  a.send({type:'ready'});b.send({type:'ready'});await a.wait(m=>m.type==='state'&&m.players.length===2&&m.players.every(p=>p.ready));a.send({type:'start'});await b.wait(m=>m.phase==='battle');
  const r=app.rooms.get(wa.code);const v0=r.terrainVersion;const shooter=r.turn===wa.id?a:b;shooter.send({type:'fire',angle:70,power:35});
  await delay(100);r.pending.shots.forEach(s=>s.impactAt=Date.now());await a.wait(m=>m.type==='state'&&m.terrainVersion>v0);await b.wait(m=>m.type==='state'&&m.terrainVersion>v0);await delay(250);
  assert.deepEqual(a.mask.bits,r.mask.bits);assert.deepEqual(b.mask.bits,r.mask.bits);
  const patchMsgs=a.msgs.filter(m=>m.terrainPatches);assert.ok(patchMsgs.length>=1);const battleAt=a.msgs.findIndex(m=>m.phase==='battle');assert.equal(a.msgs.slice(battleAt+1).filter(m=>m.terrainMask).length,0,'only patches after the battle mask');
  for(const p of r.players)assert.equal(p.y,Math.max(0,r.mask.surfaceBelow(p.x,p.y)));
  a.ws.close();b.ws.close();
 }finally{await app.close();}
});
