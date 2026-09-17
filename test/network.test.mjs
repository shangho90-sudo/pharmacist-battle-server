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
  for(let i=0;i<8;i++)clients[i].send({type:'ready'});await clients[0].wait(m=>m.type==='state'&&m.players.every(p=>p.ready));clients[0].send({type:'start'});await Promise.all(clients.slice(0,8).map(c=>c.wait(m=>m.type==='state'&&m.phase==='battle')));
  const saved=clients[3].welcome;clients[3].ws.close();await delay(30);const reconnect=await client(url);clients.push(reconnect);reconnect.send({type:'hello',token:saved.token});const w=await reconnect.wait(m=>m.type==='welcome');assert.equal(w.id,saved.id);assert.equal(r.players.length,8);
  clients[1].send({type:'fire',angle:45,power:55});await clients[1].wait(m=>m.type==='error'&&m.message.includes('턴'));
  clients[0].send({type:'fire',angle:80,power:20});const shot=await clients[0].wait(m=>m.type==='state'&&m.phase==='resolving');const other=await reconnect.wait(m=>m.type==='state'&&m.phase==='resolving');assert.deepEqual(shot.lastShot.paths,other.lastShot.paths);
  const next=await reconnect.wait(m=>m.type==='state'&&m.phase==='battle'&&m.turnNumber===2);assert.notEqual(next.turn,clients[0].welcome.id);assert.deepEqual(next.terrain,r.terrain);
 }finally{for(const c of clients)c.ws.terminate();await app.close();}
});
test('unapproved browser origins rejected',{timeout:3000},async()=>{const app=createBattleServer({port:0,host:'127.0.0.1',allowedOrigins:['https://my-game.netlify.app']});const a=await app.listen();try{const ws=new WebSocket(`ws://127.0.0.1:${a.port}`,{origin:'https://other.example'});await new Promise(resolve=>ws.on('error',e=>{assert.match(e.message,/401/);resolve();}));}finally{await app.close();}});
