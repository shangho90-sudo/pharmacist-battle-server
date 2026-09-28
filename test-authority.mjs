import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Arena,STEP} from './arena.mjs';
import {createApp} from './server.mjs';
import {WebSocket} from 'ws';
const roster=Array.from({length:8},(_,i)=>({id:'p'+i,nickname:'검사'+i,character:i,team:i%2}));
const advance=(a,seconds)=>{for(let i=0;i<Math.round(seconds/STEP);i++)a.tick(STEP);};
test('authoritative rules: walls, cooldown, bomb capacity, chain, pickups, automatic escape and victory',()=>{
 const a=new Arena(roster,0,0,()=>.1);a.grid.fill(0);const p=a.players[0];p.X=4;p.Y=4;
 a.grid[4*14+5]=1;assert.equal(a.move(p,1),false);a.grid[4*14+5]=0;assert(a.move(p,1));assert.equal(a.move(p,1),false);advance(a,.25);assert(a.move(p,1));advance(a,.25);
 assert(a.place(p));assert.equal(a.place(p),false);p.Invincible=10;a.grid[4*14+7]=1;a.grid[4*14+5]=2;advance(a,2.98);assert.equal(a.bombs.length,1);advance(a,.02);assert.equal(a.bombs.length,0);assert.equal(a.grid[4*14+7],1);assert.equal(a.grid[4*14+5],0);assert(a.items.some(i=>i.X===5&&i.Y===4));
 p.Needles=1;p.Trap=4;advance(a,STEP);assert.equal(p.Trap,0);assert.equal(p.Needles,0);assert(p.Alive);
 p.Speed=3;a.apply(p,2);assert.equal(p.Speed,5);a.apply(p,5);advance(a,7.98);assert(p.HasMagnet);advance(a,.02);assert(!p.HasMagnet);a.apply(p,5);assert.equal(p.MagnetClock,8);
 for(const q of a.players)if(q.Team===1)a.eliminate(q);a.tick();assert(a.finished);assert.equal(a.winningTeam,0);
});
test('server collision includes only visible water, two-step magnet cannot cross walls, no forged sequence',()=>{
 const a=new Arena(roster,0),p=a.players[0];a.grid.fill(0);p.X=5;p.Y=5;assert(a.hit(p,{X:5,Y:5,Time:.2}));assert(!a.hit(p,{X:5,Y:5,Time:.1}));assert(!a.hit(p,{X:6,Y:5,Time:.2}));
 a.items=[{X:7,Y:5,Type:0,Delay:0},{X:8,Y:5,Type:0,Delay:0}];a.apply(p,5);a.grid[5*14+6]=1;a.magnet(p,.01);assert.equal(p.Capacity,1);a.grid[5*14+6]=0;a.magnet(p,.01);assert.equal(p.Capacity,2);assert.equal(a.items.length,1);
 assert(a.input('p0','move',1,1));assert(!a.input('p0','move',1,1));assert(!a.input('unknown','move',1,2));assert(a.input('p0','stop',0,2));a.tick();assert.equal(p.X,5);
});
test('real eight-client WebSocket match continues without any host snapshots, ignores forged state and survives host exit',{timeout:30000},async()=>{
 const app=createApp();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const url='ws://127.0.0.1:'+app.server.address().port+'/room',clients=[];
 const connect=async()=>{const ws=new WebSocket(url),messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));const wait=async(fn,timeout=5000)=>{const end=Date.now()+timeout;while(Date.now()<end){const found=messages.find(fn);if(found)return found;await new Promise(r=>setTimeout(r,10));}throw Error('message timeout');};await wait(m=>m.type==='welcome');const c={ws,messages,wait,send:m=>ws.send(JSON.stringify(m))};clients.push(c);return c;};
 try{const host=await connect();host.send({type:'create',nickname:'검사0',protocol:78});const room=await host.wait(m=>m.type==='room');for(let i=1;i<8;i++){const c=await connect();c.send({type:'join',code:room.code,nickname:'검사'+i,protocol:78});await c.wait(m=>m.type==='room');c.send({type:'ready',ready:true});}host.send({type:'ready',ready:true});await host.wait(m=>m.type==='room'&&m.players.length===8&&m.players.every(p=>p.ready));host.send({type:'start'});const start=await host.wait(m=>m.type==='start');assert.equal(start.authority,'server');
 await clients[7].wait(m=>m.type==='state'&&JSON.parse(m.payload).elapsed>1,8000);
 const serverRoom=app.rooms.get(room.code);serverRoom.arena.grid.fill(0);const p=serverRoom.arena.players[7],oldX=p.X;
 clients[7].send({type:'input',epoch:start.epoch,action:'move',direction:1,seq:1});await new Promise(r=>setTimeout(r,100));assert(p.X>oldX);
 const forged=JSON.parse(clients[7].messages.filter(m=>m.type==='state').at(-1).payload);forged.finished=true;forged.winner=0;host.send({type:'state',epoch:start.epoch,payload:JSON.stringify(forged)});await new Promise(r=>setTimeout(r,100));assert(!serverRoom.arena.finished);
 const seq=clients[7].messages.filter(m=>m.type==='state').at(-1).seq;for(const c of clients)await c.wait(m=>m.type==='state'&&m.seq===seq);assert.equal(new Set(clients.map(c=>c.messages.find(m=>m.type==='state'&&m.seq===seq).payload)).size,1);
 const before=serverRoom.arena.elapsed;await new Promise(r=>setTimeout(r,16000));assert(serverRoom.playing);assert(Math.abs(serverRoom.arena.elapsed-before-16)<.2);assert(!clients[7].messages.some(m=>m.type==='ended'));host.ws.close();await new Promise(r=>setTimeout(r,200));assert(serverRoom.playing);assert(!serverRoom.arena.players[0].Alive);assert(clients[7].messages.some(m=>m.type==='owner'));
 console.log(JSON.stringify({eightClients:true,elapsed:serverRoom.arena.elapsed,hostSnapshotsSent:1,forgedSnapshotIgnored:true,hostExitContinues:true}));
 }finally{for(const c of clients)c.ws.close();await app.close();}
});
