import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {makeRoom,makePlayer,newCode,command,snapshot,tick} from './game.mjs';
import {pathToFileURL} from 'node:url';
export function createBattleServer({port=Number(process.env.PORT||8080),host='0.0.0.0',allowedOrigins=(process.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean)}={}){
 const rooms=new Map(),sessions=new Map();
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/health'){res.end(JSON.stringify({ok:true,rooms:rooms.size}));}else{res.writeHead(404);res.end('{"error":"Not found"}');}});
 const wss=new WebSocketServer({server,maxPayload:4096,perMessageDeflate:false,verifyClient:({origin})=>!origin||allowedOrigins.includes(origin)||(!allowedOrigins.length&&process.env.NODE_ENV!=='production')});
 const send=(ws,data)=>{if(ws?.readyState===WebSocket.OPEN){if(ws.bufferedAmount>1024*1024){ws.terminate();return;}ws.send(JSON.stringify(data));}};
 // Each session receives the full foreground mask once, then only versioned changed-area patches.
 const publish=room=>{const now=Date.now();for(const s of sessions.values())if(s.room===room.code&&s.ws?.readyState===WebSocket.OPEN){send(s.ws,snapshot(room,now,s.id,s.terrainVersion??-1));s.terrainVersion=room.terrainVersion;}};
 function leave(s){let room=rooms.get(s.room);if(room){command(room,s.id,{type:'leave'});publish(room);}sessions.delete(s.token);}
 wss.on('connection',ws=>{
  if(wss.clients.size>300){ws.close(1013,'Capacity');return;}
  let session=null;let windowStart=Date.now(),count=0;let isAlive=true;
  ws.on('pong',()=>{isAlive=true;});ws._checkAlive=()=>{if(!isAlive){ws.terminate();return;}isAlive=false;ws.ping();};
  const authTimer=setTimeout(()=>{if(!session)ws.close(1008,'Join timeout');},15000);
  ws.on('message',raw=>{
   try{
    const now=Date.now();if(now-windowStart>1000){windowStart=now;count=0;}if(++count>35){ws.close(1008,'Too many commands');return;}
    const m=JSON.parse(raw.toString());if(!m||typeof m.type!=='string')throw new Error('잘못된 요청입니다.');
    if(m.type==='hello'){
     if(session)throw new Error('이미 접속되어 있습니다.');
     const old=typeof m.token==='string'?sessions.get(m.token):null;
     if(old){const r=rooms.get(old.room),p=r?.players.find(p=>p.id===old.id);if(r&&p&&(!p.disconnectedAt||now-p.disconnectedAt<45000)){old.ws?.close(4001,'Reconnected elsewhere');session=old;old.ws=ws;old.terrainVersion=-1;p.connected=true;p.disconnectedAt=0;send(ws,{type:'welcome',id:old.id,token:old.token,code:r.code});publish(r);return;}}
     send(ws,{type:'hello'});return;
    }
    if(m.type==='listRooms'){clearTimeout(authTimer);send(ws,{type:'rooms',rooms:[...rooms.values()].filter(r=>r.players.some(p=>p.connected)).map(r=>({code:r.code,hostName:r.players.find(p=>p.id===r.host)?.name||'대기실',count:r.players.length,capacity:8,phase:r.phase,joinable:r.phase==='lobby'&&r.players.length<8})).sort((a,b)=>Number(b.joinable)-Number(a.joinable)||a.code.localeCompare(b.code))});return;}
    if(!session){
     if(!['create','join'].includes(m.type))throw new Error('먼저 방에 입장해 주세요.');
     let room;
     if(m.type==='create'){if(rooms.size>=100)throw new Error('서버가 혼잡합니다.');let code;do{code=newCode();}while(rooms.has(code));room=makeRoom(code);rooms.set(code,room);}
     else {room=rooms.get(String(m.code||'').trim().toUpperCase());if(!room)throw new Error('방 코드를 확인해 주세요.');if(room.phase!=='lobby')throw new Error('이미 전투 중인 방입니다.');if(room.players.length>=8)throw new Error('방이 가득 찼습니다.');}
     const id=randomBytes(12).toString('hex'),token=randomBytes(32).toString('hex');
     const used=new Set(room.players.map(p=>p.character));const preferred=Number.isInteger(m.character)&&m.character>=0&&m.character<10?m.character:0;const initial=used.has(preferred)?Array.from({length:10},(_,i)=>i).find(i=>!used.has(i)):preferred;const player=makePlayer(id,m.name,initial);player.team=room.players.filter(p=>p.team===0).length<=room.players.filter(p=>p.team===1).length?0:1;room.players.push(player);room.host ||= id;
     session={id,token,room:room.code,ws};sessions.set(token,session);clearTimeout(authTimer);send(ws,{type:'welcome',id,token,code:room.code});publish(room);return;
    }
    if(m.type==='ping'){send(ws,{type:'pong'});return;}
    if(m.type==='leave'){leave(session);session=null;send(ws,{type:'left'});return;}
    const room=rooms.get(session.room);if(!room)throw new Error('방이 종료되었습니다.');command(room,session.id,m,now);if(m.type==='kick'){for(const [token,kicked] of sessions){if(kicked.room===room.code&&kicked.id===m.target){send(kicked.ws,{type:'kicked',message:'방장에 의해 대기실에서 퇴장했습니다.'});sessions.delete(token);kicked.ws?.close(4003,'Kicked');}}}publish(room);
   }catch(e){send(ws,{type:'error',message:e instanceof SyntaxError?'잘못된 메시지입니다.':e.message});}
  });
  ws.on('close',()=>{clearTimeout(authTimer);if(!session||session.ws!==ws)return;session.ws=null;const r=rooms.get(session.room),p=r?.players.find(p=>p.id===session.id);if(p){if(r.phase!=='lobby'){leave(session);}else{p.connected=false;p.disconnectedAt=Date.now();publish(r);}}});
  ws.on('error',()=>{});
 });
 let lastSecond=0;
 const timer=setInterval(()=>{
  let now=Date.now();const second=Math.floor(now/1000);for(const [code,r]of rooms){const changed=tick(r,now);if(changed||second!==lastSecond)publish(r);
   if((!r.players.length&&now-r.lastActive>60000)||(!r.players.some(p=>p.connected)&&now-r.lastActive>5*60000)){rooms.delete(code);for(const [token,s]of sessions)if(s.room===code){s.ws?.close(1000,'Room expired');sessions.delete(token);}}
  }lastSecond=second;
 },100);
 const heartbeat=setInterval(()=>{for(const ws of wss.clients)ws._checkAlive?.();},20000);
 return {rooms,sessions,server,wss,listen:()=>new Promise(resolve=>server.listen(port,host,()=>resolve(server.address()))),close:()=>new Promise(resolve=>{clearInterval(timer);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();wss.close(()=>server.close(resolve));})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const app=createBattleServer();const address=await app.listen();console.log(`Pharmacist Battle server listening on ${address.port}`);process.on('SIGTERM',async()=>{await app.close();process.exit(0);});}
