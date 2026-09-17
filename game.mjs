import { randomBytes } from 'node:crypto';
export const NAMES=['팽약사','구약사','방약사','철약사','동약사','석약사','두약사','조약사','사공약사','용약사'];
export const COSTS=[2000,3500,2500,3000,2500,4000,3000,3000,4500];
export const WORLD= {width:1600,height:900,step:4};
export const STATS=[ [300,1.15,1],[330,1,0.9],[280,.95,1.2],[270,1.22,.85],[290,1.04,1],[340,.96,.8],[290,1.04,1.1],[300,1.08,.95],[300,1,1.1],[310,1.12,.9] ];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const numeric=x=>typeof x==='number' && Number.isFinite(x);
export function newTerrain(){return Array.from({length:401},(_,i)=>{let x=i*4;return Math.round(205+65*Math.sin(x/135)+32*Math.cos(x/67)+(x<240||x>1350?100:0));});}
export function ground(room,x){return room.terrain[clamp(Math.round(x/4),0,400)];}
export function makeRoom(code){return {code,phase:'lobby',host:'',players:[],terrain:newTerrain(),turn:'',turnNumber:0,wind:0,deadline:0,winner:'',lastShot:null,shotNumber:0,events:[],created:Date.now(),lastActive:Date.now(),resumeAt:0};}
export function makePlayer(id,name,character){let c=clamp(Math.trunc(character||0),0,9);return {id,name:String(name||'약사').trim().slice(0,12),character:c,team:0,ready:false,connected:true,hp:STATS[c][0],maxHp:STATS[c][0],x:0,y:0,energy:120,delay:0,coins:6000,inventory:Array(9).fill(0),special:3,shield:0,poison:0,hidden:0,itemUsed:false,disconnectedAt:0};}
export function snapshot(room,now=Date.now(),viewerId=null){const viewer=room.players.find(p=>p.id===viewerId);return {type:'state',code:room.code,phase:room.phase,host:room.host,players:room.players.map(({disconnectedAt,...p})=>viewer&&p.hidden>0&&p.team!==viewer.team?{...p,x:0,y:0,energy:0}:p),terrain:room.terrain,turn:room.turn,turnNumber:room.turnNumber,wind:room.wind,seconds:Math.max(0,(room.deadline-now)/1000),winner:room.winner,lastShot:room.lastShot?{...room.lastShot,elapsed:(now-room.lastShot.startedAt)/1000}:null};}
export function newCode(){return randomBytes(4).toString('hex').slice(0,6).toUpperCase();}
function assert(ok,message){if(!ok)throw new Error(message);}
function alive(room){return room.players.filter(p=>p.hp>0);}
function settle(room){for(const p of room.players){if(p.hp<=0)continue;let y=ground(room,p.x);let fall=p.y-y;p.y=y;if(fall>95)p.hp=Math.max(0,p.hp-Math.floor((fall-95)*.35));if(y<8)p.hp=0;}}
function victory(room){let teams=new Set(alive(room).map(p=>p.team));if(teams.size<=1){room.phase='finished';room.winner=teams.size===0?'무승부':([...teams][0]===0?'BLUE TEAM':'RED TEAM');room.turn='';return true;}return false;}
export function nextTurn(room,now=Date.now()){
 if(victory(room))return;
 let list=alive(room).sort((a,b)=>a.delay-b.delay||room.players.indexOf(a)-room.players.indexOf(b));
 const p=list[0];room.turn=p.id;room.turnNumber++;p.energy=Math.round(120*STATS[p.character][2]);p.itemUsed=false;
 if(p.poison>0){p.hp=Math.max(0,p.hp-22);p.poison--;}
 if(p.hidden>0)p.hidden--;
 if(p.hp<=0){nextTurn(room,now);return;}
 room.wind=Math.round((Math.random()*2-1)*50)/10;room.phase='battle';room.deadline=now+30000;
}
export function start(room,now=Date.now()){
 assert(room.phase==='lobby','대기실에서 시작할 수 있습니다.');
 assert(room.players.length>=2,'최소 2명이 필요합니다.');
 assert(room.players.every(p=>p.ready&&p.connected),'모두 준비를 눌러 주세요.');
 assert(new Set(room.players.map(p=>p.team)).size===2,'양 팀에 최소 1명씩 필요합니다.');
 assert(room.players.filter(p=>p.team===0).length===room.players.filter(p=>p.team===1).length,'양 팀 인원을 같게 맞춰 주세요.');
 room.terrain=newTerrain();room.lastShot=null;room.shotNumber=0;room.turnNumber=0;room.winner='';
 for(let team=0;team<2;team++)room.players.filter(p=>p.team===team).forEach((p,i)=>{p.x=team===0?120+i*175:1480-i*175;p.y=ground(room,p.x);p.hp=p.maxHp;p.delay=i*10+team*5;p.special=3;p.shield=p.poison=p.hidden=0;});
 nextTurn(room,now);
}
function damage(room,x,y,radius,amount,poison=false){for(const p of alive(room)){const d=Math.hypot(p.x-x,p.y+32-y);if(d>radius+28)continue;let hit=Math.max(0,Math.round(amount*(1-d/(radius+38))));let absorbed=Math.min(p.shield,hit);p.shield-=absorbed;p.hp=Math.max(0,p.hp-hit+absorbed);if(poison&&hit>0)p.poison=3;}}
function crater(room,x,y,r){for(let i=0;i<room.terrain.length;i++){const dx=i*4-x;if(Math.abs(dx)<r){let bottom=y-Math.sqrt(r*r-dx*dx);if(y+Math.sqrt(r*r-dx*dx)>=room.terrain[i])room.terrain[i]=Math.max(0,Math.min(room.terrain[i],bottom));}}}
export function trace(room,p,angle,power,kind='normal'){
 let x=p.x,y=p.y+55;const speed=160+power*7.2,rad=angle*Math.PI/180;let vx=Math.cos(rad)*speed,vy=Math.sin(rad)*speed;const dt=1/60,points=[{x,y}];let hit=false;
 for(let i=0;i<1200;i++){
  if(kind==='homing'&&i>30){const target=alive(room).filter(q=>q.team!==p.team).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];if(target&&Math.hypot(target.x-x,target.y-y)<300){vx+=(target.x-x)*dt*2.2;vy+=(target.y+30-y)*dt*2.2;}}
  vx+=room.wind*16*dt;vy-=310*dt;x+=vx*dt;y+=vy*dt;
  if(i%3===0)points.push({x,y});
  if(x<0||x>1600||y<0)break;
  const target=i>10&&alive(room).find(q=>Math.hypot(q.x-x,q.y+30-y)<26);
  if(y<=ground(room,x)||target){hit=true;break;}
 }
 points.push({x,y});return {points,x,y,hit};
}
function finishAction(room,p,delay,now){p.delay+=delay;if(!victory(room))nextTurn(room,now);}
export function command(room,id,msg,now=Date.now()){
 const p=room.players.find(p=>p.id===id);assert(p,'플레이어를 찾을 수 없습니다.');room.lastActive=now;
 if(msg.type==='leave'){p.hp=0;p.connected=false;if(room.host===id)room.host=room.players.find(q=>q.id!==id&&q.connected)?.id||'';if(room.phase==='lobby'){room.players=room.players.filter(q=>q.id!==id);if(room.host===id)room.host=room.players[0]?.id||'';}else if(room.phase!=='finished'){if(!victory(room)&&room.turn===id)nextTurn(room,now);}return;}
 if(msg.type==='rematch'){assert(id===room.host&&room.phase==='finished','방장만 재대결을 시작할 수 있습니다.');room.players=room.players.filter(q=>q.connected);room.phase='lobby';for(const q of room.players){q.ready=false;q.coins=6000;q.inventory.fill(0);}return;}
 if(room.phase==='lobby'){
  if(msg.type==='select'){assert(Number.isInteger(msg.character)&&msg.character>=0&&msg.character<10,'잘못된 캐릭터입니다.');p.character=msg.character;p.maxHp=p.hp=STATS[p.character][0];p.ready=false;}
  else if(msg.type==='team'){assert(msg.team===0||msg.team===1,'잘못된 팀입니다.');assert(room.players.filter(q=>q.id!==id&&q.team===msg.team).length<4,'한 팀은 최대 4명입니다.');p.team=msg.team;p.ready=false;}
  else if(msg.type==='ready')p.ready=!p.ready;
  else if(msg.type==='buy'){const i=msg.item;assert(Number.isInteger(i)&&i>=0&&i<9,'잘못된 아이템입니다.');assert(p.coins>=COSTS[i]&&p.inventory.reduce((a,b)=>a+b,0)<4,'코인이 부족하거나 4칸이 찼습니다.');p.coins-=COSTS[i];p.inventory[i]++;p.ready=false;}
  else if(msg.type==='refund'){const i=msg.item;assert(Number.isInteger(i)&&p.inventory[i]>0,'보유하지 않은 아이템입니다.');p.inventory[i]--;p.coins+=COSTS[i];p.ready=false;}
  else if(msg.type==='start'){assert(id===room.host,'방장만 시작할 수 있습니다.');start(room,now);}
  else throw new Error('대기실에서 사용할 수 없는 명령입니다.');return;
 }
 assert(room.phase==='battle'&&room.turn===id&&p.hp>0,'현재 자신의 턴이 아닙니다.');
 if(now>=room.deadline){finishAction(room,p,100,now);throw new Error('턴 시간이 끝났습니다.');}
 if(msg.type==='move'){
  assert(numeric(msg.dx)&&Math.abs(msg.dx)<=12&&msg.dx!==0,'잘못된 이동입니다.');let cost=Math.abs(msg.dx);assert(cost<=p.energy,'이동력이 부족합니다.');let x=clamp(p.x+msg.dx,20,1580);assert(ground(room,x)-p.y<35,'너무 높은 지형입니다.');assert(!alive(room).some(q=>q.id!==id&&Math.abs(q.x-x)<38),'다른 캐릭터가 있습니다.');p.energy-=cost;p.x=x;settle(room);if(!victory(room)&&p.hp<=0)nextTurn(room,now);return;
 }
 if(msg.type==='skip'){finishAction(room,p,80,now);return;}
 if(msg.type==='item'){
  const i=msg.item;assert([2,3,4,5,7,8].includes(i)&&p.inventory[i]>0&&!p.itemUsed,'사용 가능한 아이템이 아닙니다.');p.inventory[i]--;p.itemUsed=true;
  if(i===2)p.hp=Math.min(p.maxHp,p.hp+100);if(i===3)p.shield+=85;if(i===4)room.deadline+=15000;if(i===5)p.energy+=110;if(i===7)p.poison=0;if(i===8)p.hidden=1;return;
 }
 assert(msg.type==='fire','알 수 없는 명령입니다.');
 assert(numeric(msg.angle)&&msg.angle>=0&&msg.angle<=180&&numeric(msg.power)&&msg.power>=5&&msg.power<=100,'발사 각도/파워가 잘못되었습니다.');
 const kind=msg.kind||'normal';assert(['normal','special','homing','teleport','poison'].includes(kind),'잘못된 탄입니다.');
 if(kind==='special'){assert(p.special>0,'특수탄이 없습니다.');p.special--;}
 const item={homing:0,teleport:1,poison:6}[kind];if(item!==undefined){assert(p.inventory[item]>0,'보유하지 않은 아이템입니다.');p.inventory[item]--;}
 const multi=kind==='special'&&[2,7].includes(p.character);const shots=(multi?[-5,0,5]:[0]).map(d=>trace(room,p,clamp(msg.angle+d,0,180),msg.power,kind));
 const multiplier=STATS[p.character][1];
 room.lastShot={id:++room.shotNumber,startedAt:now,owner:id,kind,paths:shots.map(s=>({points:s.points,hit:s.hit})),radius:kind==='special'?85:62};
 // Defer authoritative impact until all clients have animated the same paths.
 room.pending={id,kind,shots,multi,multiplier};room.phase='resolving';room.resumeAt=now+Math.min(12000,Math.max(...shots.map(s=>s.points.length))*50+350);
}
export function tick(room,now=Date.now()){
 let changed=false;
 for(const p of room.players)if(!p.connected&&p.disconnectedAt&&now-p.disconnectedAt>45000){p.disconnectedAt=0;if(room.host===p.id)room.host=room.players.find(q=>q.connected)?.id||'';if(room.phase==='lobby'){room.players=room.players.filter(q=>q.id!==p.id);if(room.host===p.id)room.host=room.players[0]?.id||'';}else {p.hp=0;if(room.phase==='battle'&&!victory(room)&&room.turn===p.id)nextTurn(room,now);}changed=true;}
 if(room.phase==='resolving'&&now>=room.resumeAt){
  const {id,kind,shots,multi,multiplier}=room.pending;const p=room.players.find(q=>q.id===id);
  for(const s of shots){if(!s.hit)continue;if(kind==='teleport'){if(p.hp>0&&s.x>20&&s.x<1580&&!alive(room).some(q=>q.id!==p.id&&Math.abs(q.x-s.x)<38)){p.x=s.x;p.y=ground(room,s.x);}}else{let radius=kind==='special'?85:62;damage(room,s.x,s.y,radius,(kind==='special'?145:105)*multiplier*(multi?.6:1),kind==='poison');crater(room,s.x,s.y,radius*.8);}}
  settle(room);room.pending=null;finishAction(room,p,kind==='normal'?100:kind==='special'?150:125,now);changed=true;
 }
 if(room.phase==='battle'&&now>=room.deadline){const p=room.players.find(q=>q.id===room.turn);finishAction(room,p,100,now);changed=true;}
 return changed;
}
