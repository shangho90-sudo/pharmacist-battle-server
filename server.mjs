import http from 'node:http';
import {randomBytes,randomInt} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
import {Arena,STEP,SNAPSHOT_HZ,PROTOCOL} from './arena.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const validName=value=>typeof value==='string'&&/^[\p{L}\p{N} _-]{1,12}$/u.test(value.normalize('NFC').trim());
export function createApp({root=path.join(here,'public')}={}) {
 const rooms=new Map(), peers=new Set();let lastTick=performance.now(),tickDebt=0,totalTicks=0,maxDebtMs=0;
 const send=(ws,m)=>{if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<512000)ws.send(JSON.stringify(m));};
 const error=(ws,text)=>send(ws,{type:'error',text});
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.size,protocol:PROTOCOL,authority:'server',tickHz:60,snapshotHz:SNAPSHOT_HZ,totalTicks,maxDebtMs}));return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  try {
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   const rel=pathname==='/'?'index.html':pathname.slice(1), file=path.resolve(root,rel);
   if(!file.startsWith(path.resolve(root)+path.sep))throw Error('path');
   const st=await stat(file);if(!st.isFile())throw Error('file');
   const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.wasm':'application/wasm','.data':'application/octet-stream','.json':'application/json','.png':'image/png','.css':'text/css'}[path.extname(file)]||'application/octet-stream';
   res.writeHead(200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff','Cache-Control':file.endsWith('.html')?'no-store':'no-cache'});
   res.end(req.method==='HEAD'?undefined:await readFile(file));
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Unity WebGL 빌드 파일이 없습니다. Pharmacy Arcade > Build > Public Web Package로 빌드하세요.');}
 });
 const wss=new WebSocketServer({server,path:'/room',maxPayload:262144,perMessageDeflate:false});
 const roster=r=>({type:'room',code:r.code,host:r.host,playing:r.playing,players:r.members.map(p=>({id:p.id,nickname:p.nickname,character:p.character,team:p.team,ready:p.ready}))});
 const broadcast=(r,m,exclude=null)=>r.members.forEach(p=>{if(p!==exclude)send(p.ws,m);});
 const directory=()=>({type:'rooms',rooms:[...rooms.values()].map(r=>({code:r.code,hostName:r.members.find(p=>p.id===r.host)?.nickname||'방장',count:r.members.length,capacity:8,red:r.members.filter(p=>p.team===0).length,blue:r.members.filter(p=>p.team===1).length,playing:r.playing})).sort((a,b)=>Number(a.playing)-Number(b.playing))});
 const publishRooms=()=>{const message=directory();for(const p of peers)if(p.browsing&&!p.room)send(p.ws,message);};
 const refresh=r=>{broadcast(r,roster(r));publishRooms();};
 const snapshot=r=>{if(!r.arena)return;broadcast(r,{type:'state',authority:'server',protocol:PROTOCOL,epoch:r.epoch,seq:++r.stateSeq,serverTime:Date.now(),payload:JSON.stringify(r.arena.snapshot()),positions:r.arena.positions()});};
 function leave(p){
  const r=p.room;if(!r)return;p.room=null;r.members=r.members.filter(m=>m!==p);
  if(!r.members.length){rooms.delete(r.code);publishRooms();return;}
  if(r.host===p.id)r.host=r.members[0].id;
  if(r.playing){r.arena?.depart(p.id);snapshot(r);broadcast(r,{type:'owner',host:r.host});publishRooms();}else refresh(r);
 }
 wss.on('connection',(ws,req)=>{
  // A web page connects to its own origin; no account or login required.
  if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin);}catch{ws.close(1008);return;}
   if(origin.host!==req.headers.host && origin.origin!=="https://pharmacy-bomb-arcade.shangho10.chatgpt.site"){ws.close(1008,'origin');return;}}
  const p={ws,id:randomBytes(12).toString('hex'),room:null,nickname:'',character:0,team:1,ready:false,alive:true,budget:0,window:Date.now()};peers.add(p);
  send(ws,{type:'welcome',self:p.id,protocol:PROTOCOL,authority:'server'});
  ws.on('pong',()=>p.alive=true);
  ws.on('message',raw=>{
   if(Date.now()-p.window>1000){p.window=Date.now();p.budget=0;}if(++p.budget>100){ws.close(1008,'rate');return;}
   let m;try{m=JSON.parse(raw);}catch{return error(ws,'잘못된 요청입니다.');}
   if(!m||typeof m.type!=='string')return;
   if(m.type==='list'){p.browsing=true;send(ws,directory());return;}
   if(m.type==='leave'){leave(p);p.browsing=true;send(ws,{type:'left'});send(ws,directory());return;}
   if(m.type==='create'||m.type==='join'){
    if(m.protocol!==PROTOCOL)return error(ws,'새 버전으로 새로고침한 뒤 입장해주세요.');
    if(p.room)return error(ws,'이미 방에 입장했습니다.');
    if(!validName(m.nickname))return error(ws,'닉네임은 한글·영문·숫자 1~12자로 입력해주세요.');
    let r;
    if(m.type==='create'){
     if(rooms.size>=500)return error(ws,'현재 방이 가득 찼습니다.');
     let code;do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
     r={code,host:p.id,members:[],playing:false,banned:new Set(),lastState:0};rooms.set(code,r);
    }else r=rooms.get(String(m.code||'').trim().toUpperCase());
    if(!r||r.banned.has(p.id))return error(ws,'입장할 수 없는 방입니다.');
    if(r.playing||r.members.length>=8)return error(ws,'진행 중이거나 가득 찬 방입니다.');
    const nick=m.nickname.normalize('NFC').trim();if(r.members.some(q=>q.nickname===nick))return error(ws,'방 안에 같은 닉네임이 있습니다.');
    p.nickname=nick;p.character=Array.from({length:10},(_,i)=>i).find(i=>!r.members.some(q=>q.character===i));
    p.team=r.members.filter(q=>q.team===1).length<=r.members.filter(q=>q.team===0).length?1:0;
    p.protocol=m.protocol;p.ready=false;p.room=r;p.browsing=false;r.members.push(p);refresh(r);return;
   }
   const r=p.room;if(!r)return error(ws,'먼저 방에 입장해주세요.');
   if(m.type==='select'){
    if(r.playing)return error(ws,'경기 중에는 변경할 수 없습니다.');
    if(p.ready)return error(ws,'캐릭터 확정을 취소한 뒤 변경해주세요.');
    if(!Number.isInteger(m.character)||m.character<0||m.character>9||![0,1].includes(m.team))return;
    if(r.members.some(q=>q!==p&&q.character===m.character))return error(ws,'이미 선택된 캐릭터입니다.');
    if(r.members.filter(q=>q!==p&&q.team===m.team).length>=4)return error(ws,'한 팀은 최대 4명입니다.');
    p.character=m.character;p.team=m.team;p.ready=false;refresh(r);return;
   }
   if(m.type==='ready'){if(!r.playing){p.ready=m.ready===true;refresh(r);}return;}
   if(m.type==='kick'){
    if(p.id!==r.host)return error(ws,'방장만 강퇴할 수 있습니다.');
    const target=r.members.find(q=>q.id===m.target&&q!==p);if(!target)return;
    r.banned.add(target.id);send(target.ws,{type:'kicked',text:'방장에 의해 퇴장되었습니다.'});leave(target);return;
   }
   if(m.type==='start'){
    if(p.id!==r.host)return error(ws,'방장만 시작할 수 있습니다.');
    if(r.playing)return;
    if(r.members.length<2||!r.members.some(q=>q.team===0)||!r.members.some(q=>q.team===1))return error(ws,'BLUE·RED 팀에 각각 한 명 이상 필요합니다.');
    if(r.members.length>8||[0,1].some(t=>r.members.filter(q=>q.team===t).length>4))return error(ws,'팀전은 최대 4:4입니다.');
    if(r.members.filter(q=>q.team===0).length!==r.members.filter(q=>q.team===1).length)return error(ws,'양 팀 인원이 같아야 시작할 수 있습니다. (1:1, 2:2, 3:3, 4:4)');
    if(r.members.some(q=>!q.ready))return error(ws,'모든 참가자가 캐릭터를 확정해야 합니다.');
    r.playing=true;r.epoch=randomBytes(8).toString('hex');r.seed=randomInt(2147483647);r.map=randomInt(2);r.stateSeq=0;r.finishedAt=0;r.snapshotClock=0;r.readyAt=performance.now()+3000;r.arena=new Arena(r.members,r.seed,r.map);
    broadcast(r,{...roster(r),type:'start',authority:'server',protocol:PROTOCOL,seed:r.seed,map:r.map,epoch:r.epoch});snapshot(r);publishRooms();return;
   }
   if(m.type==='input'){
    if(!r.playing||m.epoch!==r.epoch)return;
    if(!['move','stop','place','needle'].includes(m.action))return;
    if(m.action==='move'&&(!Number.isInteger(m.direction)||m.direction<0||m.direction>3))return;
    if(performance.now()<r.readyAt)return;r.arena?.input(p.id,m.action,m.direction,m.seq);return;
   }
   if(m.type==='state'){
    // Client-supplied positions, damage and victory are never trusted.
    return;
   }
   if(m.type==='return'){
    if(p.id!==r.host)return error(ws,'방장만 대기실로 돌아갈 수 있습니다.');
    if(r.arena&&!r.arena.finished)return error(ws,'경기가 끝난 뒤 대기실로 돌아갈 수 있습니다.');
    r.playing=false;r.arena=null;r.members.forEach(q=>q.ready=false);broadcast(r,{type:'ended',text:'다음 경기를 준비해주세요.'});refresh(r);
   }
  });
  ws.on('error',()=>{});ws.on('close',()=>{peers.delete(p);leave(p);});
 });
 const timer=setInterval(()=>{
  for(const p of peers){if(!p.alive){p.ws.terminate();continue;}p.alive=false;p.ws.ping();}
 },10000);timer.unref();
 const simulation=setInterval(()=>{const now=performance.now();tickDebt+=(now-lastTick)/1000;lastTick=now;maxDebtMs=Math.max(maxDebtMs,Math.round(tickDebt*1000));const steps=Math.min(120,Math.floor(tickDebt/STEP));if(!steps)return;tickDebt-=steps*STEP;totalTicks+=steps;
  for(const r of rooms.values()){if(!r.playing||!r.arena)continue;for(let n=0;n<steps;n++)if(now-(steps-1-n)*STEP*1000>=r.readyAt)r.arena.tick(STEP);r.snapshotClock+=steps*STEP;if(r.snapshotClock>=1/SNAPSHOT_HZ){r.snapshotClock%=1/SNAPSHOT_HZ;snapshot(r);}if(r.arena.finished){if(!r.finishedAt)r.finishedAt=now;if(now-r.finishedAt>=6000){r.playing=false;r.arena=null;r.finishedAt=0;r.members.forEach(p=>p.ready=false);broadcast(r,{type:'ended',text:'경기가 끝났습니다. 다음 경기를 준비해주세요.'});refresh(r);}}}
 },8);simulation.unref();
 return {server,rooms,close:()=>new Promise(resolve=>{clearInterval(timer);clearInterval(simulation);for(const p of peers)p.ws.terminate();wss.close(()=>server.close(resolve));})};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const app=createApp();app.server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Pharmacy Arcade public server listening'));}
