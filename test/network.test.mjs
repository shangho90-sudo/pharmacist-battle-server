import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createBattleServer} from '../server.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function client(url){const ws=new WebSocket(url);const messages=[];ws.on('message',m=>messages.push(JSON.parse(m)));await new Promise((res,rej)=>{ws.once('open',res);ws.once('error',rej);});return {ws,messages,send:m=>ws.send(JSON.stringify(m)),wait:async predicate=>{for(let i=0;i<1000;i++){const m=messages.find(predicate);if(m)return m;await delay(10);}throw new Error('Message timeout');}};}
test('eight real sockets join 4:4; ninth denied; token reconnect; synchronized shots',{timeout:15000},async()=>{
 const app=createBattleServer({port:0,host:'127.0.0.1'});const address=await app.listen();const url=`ws://127.0.0.1:${address.port}`;const clients=[];
 try{
  for(let i=0;i<8;i++){const c=await client(url);clients.push(c);c.send(i===0?{type:'create',name:'약사0'}:{type:'join',code:clients[0].welcome.code,name:'약사'+i});c.welcome=await c.wait(m=>m.type==='welcome');}
  const r=app.rooms.get(clients[0].welcome.code);assert.equal(r.players.length,8);assert.equal(r.players.filter(p=>p.team===0).length,4);assert.equal(r.players.filter(p=>p.team===1).length,4);
  const ninth=await client(url);clients.push(ninth);ninth.send({type:'join',code:r.code,name:'아홉번째'});assert.match((await ninth.wait(m=>m.type==='error')).message,/가득/);
  clients[1].send({type:'team',team:0});assert.match((await clients[1].wait(m=>m.type==='error')).message,/최대 4/);
  const saved=clients[3].welcome;clients[3].ws.close();await delay(30);const reconnect=await client(url);clients.push(reconnect);reconnect.send({type:'hello',token:saved.token});const w=await reconnect.wait(m=>m.type==='welcome');assert.equal(w.id,saved.id);assert.equal(r.players.length,8);
  for(let i=0;i<8;i++)(i===3?reconnect:clients[i]).send({type:'ready'});await clients[0].wait(m=>m.type==='state'&&m.players.every(p=>p.ready));clients[0].send({type:'start'});await Promise.all(clients.slice(0,8).map((c,i)=>(i===3?reconnect:c).wait(m=>m.type==='state'&&m.phase==='battle')));
  const active=clients.slice(0,8).find(c=>c.welcome.id===r.turn);const shooter=active.welcome.id===saved.id?reconnect:active;
  const wrong=clients.slice(0,8).find(c=>c.welcome.id!==r.turn&&c.welcome.id!==saved.id);
  wrong.send({type:'fire',angle:45,power:55});await wrong.wait(m=>m.type==='error'&&m.message.includes('턴'));
  const initialOrder=r.turnOrder.slice();shooter.send({type:'fire',angle:80,power:20});const shot=await shooter.wait(m=>m.type==='state'&&m.phase==='resolving');const other=await reconnect.wait(m=>m.type==='state'&&m.phase==='resolving');assert.deepEqual(shot.lastShot.paths,other.lastShot.paths);
  const next=await reconnect.wait(m=>m.type==='state'&&m.phase==='battle'&&m.turnNumber===2);assert.equal(next.turn,initialOrder[1]);assert.deepEqual(next.turnOrder,initialOrder);assert.deepEqual(next.terrain,r.terrain);
 }finally{for(const c of clients)c.ws.terminate();await app.close();}
});
test('unapproved browser origins rejected',{timeout:3000},async()=>{const app=createBattleServer({port:0,host:'127.0.0.1',allowedOrigins:['https://my-game.netlify.app']});const a=await app.listen();try{const ws=new WebSocket(`ws://127.0.0.1:${a.port}`,{origin:'https://other.example'});await new Promise(resolve=>ws.on('error',e=>{assert.match(e.message,/401/);resolve();}));}finally{await app.close();}});
test('battle socket close immediately removes player and old token',{timeout:8000},async()=>{
 const app=createBattleServer({port:0,host:'127.0.0.1'});const a=await app.listen();const url=`ws://127.0.0.1:${a.port}`;const cs=[];
 try{
  for(let i=0;i<4;i++){const c=await client(url);cs.push(c);c.send(i===0?{type:'create'}:{type:'join',code:cs[0].welcome.code});c.welcome=await c.wait(m=>m.type==='welcome');}
  const room=app.rooms.get(cs[0].welcome.code);for(const c of cs)c.send({type:'ready'});await cs[0].wait(m=>m.type==='state'&&m.players.every(p=>p.ready));cs[0].send({type:'start'});await cs[1].wait(m=>m.type==='state'&&m.phase==='battle');
  const departed=cs[0].welcome;cs[0].ws.close();const update=await cs[1].wait(m=>m.type==='state'&&m.phase==='battle'&&m.players.length===3);
  assert.ok(!update.players.some(p=>p.id===departed.id));assert.ok(!update.turnOrder.includes(departed.id));assert.notEqual(update.host,departed.id);assert.notEqual(update.turn,departed.id);
  const re=await client(url);cs.push(re);re.send({type:'hello',token:departed.token});await re.wait(m=>m.type==='hello');assert.equal(room.players.length,3);
 }finally{for(const c of cs)c.ws.terminate();await app.close();}
});
test('host kick removes socket session and invalidates reconnect token',{timeout:5000},async()=>{
 const app=createBattleServer({port:0,host:'127.0.0.1'});const a=await app.listen();const url=`ws://127.0.0.1:${a.port}`;const cs=[];
 try{const host=await client(url);cs.push(host);host.send({type:'create',name:'한글방장'});const h=await host.wait(m=>m.type==='welcome');const guest=await client(url);cs.push(guest);guest.send({type:'join',code:h.code,name:'한글손님'});const g=await guest.wait(m=>m.type==='welcome');host.send({type:'kick',target:g.id});await guest.wait(m=>m.type==='kicked');await host.wait(m=>m.type==='state'&&m.players.length===1);assert.equal(app.sessions.has(g.token),false);assert.equal(app.rooms.get(h.code).players.length,1);const re=await client(url);cs.push(re);re.send({type:'hello',token:g.token});await re.wait(m=>m.type==='hello');
 }finally{for(const c of cs)c.ws.terminate();await app.close();}
});
