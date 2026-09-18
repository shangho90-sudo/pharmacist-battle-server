import { randomBytes, randomInt } from 'node:crypto';
export const NAMES=['팽약사','구약사','방약사','철약사','동약사','석약사','두약사','조약사','사공약사','용약사'];
export const COSTS=[2000,3000,3000,2000,1000,2500,3000,2000,4000];
export const WORLD= {width:1600,height:900,step:4};
export const STATS=[ [300,1,1],[330,1,0.9],[280,1,1.2],[270,1,.85],[290,1,1],[340,1,.8],[290,1,1.1],[300,1,.95],[300,1,1.1],[310,1,.9] ];
export const WEAPONS=[
 {visual:'red-pill',count:1,radius:62,effectDelay:0},
 {visual:'lightning',count:1,radius:62,effectDelay:0},
 {visual:'arrow',count:1,radius:62,effectDelay:0},
 {visual:'small-purple',count:1,radius:62,effectDelay:0},
 {visual:'blue-laser',count:1,radius:62,effectDelay:.45},
 {visual:'lime-burst',count:3,radius:62,effectDelay:0,interval:.22},
 {visual:'pink-pill',count:1,radius:62,effectDelay:0},
 {visual:'robot-orb',count:1,radius:62,effectDelay:.5},
 {visual:'blue-volley',count:3,radius:62,effectDelay:0,spread:2},
 {visual:'purple-blast',count:1,radius:105,effectDelay:0}
];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const numeric=x=>typeof x==='number' && Number.isFinite(x);
export const MAP_NAMES=['유적의 전장','중세의 성','해적의 바다','사막의 협곡','설원의 고지','우주의 전장','유적의 전장 · 원본','설원의 고지 · 원본'];
// Server-owned height profiles. Each map has safe, separated 4:4 spawn platforms.
const MAP_PROFILES=[
 [[0,520],[180,520],[260,315],[365,300],[450,410],[550,410],[635,265],[730,240],[840,175],[925,275],[1040,250],[1180,340],[1260,340],[1370,510],[1600,510]],
 [[0,420],[110,520],[205,520],[285,295],[385,295],[465,420],[570,420],[645,310],[960,310],[1020,460],[1150,460],[1230,300],[1360,350],[1420,535],[1600,535]],
 [[0,450],[205,450],[260,260],[365,260],[420,350],[560,350],[645,215],[735,180],[760,0],[920,0],[950,175],[1040,245],[1170,245],[1250,350],[1380,450],[1600,450]],
 [[0,510],[220,510],[310,350],[445,350],[510,260],[645,260],[735,200],[880,200],[950,170],[1000,260],[1120,260],[1190,350],[1310,350],[1400,510],[1600,510]],
 [[0,480],[180,480],[260,320],[360,320],[420,455],[560,455],[645,265],[750,150],[840,165],[930,320],[1040,320],[1140,435],[1280,435],[1360,525],[1600,525]],
 [[0,520],[190,520],[270,430],[375,430],[445,320],[565,320],[645,240],[725,125],[870,125],[935,245],[1050,245],[1130,380],[1250,380],[1360,490],[1600,490]]
];
// Unmodified reference artwork: foreground top edges converted to world coordinates.
const RUINS_SOURCE_PROFILE=[[0,228],[130,231],[198,236],[216,244],[220,400],[252,409],[288,421],[330,430],[338,539],[368,550],[432,558],[438,494],[507,490],[583,489],[648,498],[656,579],[727,586],[774,580],[780,568],[847,565],[918,571],[930,770],[1045,773],[1051,662],[1110,656],[1207,660],[1218,696],[1314,696],[1322,658],[1414,657],[1418,615],[1424,496],[1490,489],[1530,491],[1536,322],[1590,317],[1677,317],[1774,318]];
MAP_PROFILES.push(RUINS_SOURCE_PROFILE.map(([x,y])=>[x/1774*1600,(887-y)/887*900]));

const SNOW_SOURCE_PROFILE=[[0, 323], [110, 322], [200, 320], [325, 325], [335, 515], [395, 516], [418, 540], [525, 541], [540, 444], [595, 438], [678, 443], [690, 778], [711, 788], [740, 900], [925, 900], [940, 610], [989, 606], [996, 448], [1088, 441], [1125, 401], [1228, 402], [1235, 535], [1315, 530], [1326, 321], [1435, 314], [1520, 321], [1600, 337], [1672, 340]];
MAP_PROFILES.push(SNOW_SOURCE_PROFILE.map(([x,y])=>[x/1672*1600,(941-y)/941*900]));
export function chooseOriginalMap(random=Math.random){return random()<.5?6:7;}

export function newTerrain(mapId=0){const profile=MAP_PROFILES[mapId]||MAP_PROFILES[0];return Array.from({length:401},(_,i)=>{const x=i*4;let index=1;while(index<profile.length-1&&x>profile[index][0])index++;const [ax,ay]=profile[index-1],[bx,by]=profile[index];return Math.round(ay+(by-ay)*(x-ax)/(bx-ax));});}
export function ground(room,x){return room.terrain[clamp(Math.round(x/4),0,400)];}
export function makeRoom(code){return {code,phase:'lobby',mapId:-1,mapName:'',host:'',players:[],terrain:newTerrain(),turn:'',turnOrder:[],turnNumber:0,wind:0,deadline:0,winner:'',lastShot:null,shotNumber:0,events:[],clouds:[],created:Date.now(),lastActive:Date.now(),resumeAt:0};}
export function makePlayer(id,name,character,now=Date.now()){let c=clamp(Math.trunc(character||0),0,9);return {id,name:String(name||'약사').trim().slice(0,12),character:c,team:0,ready:false,selectionLocked:false,selectionAuto:false,selectionDeadline:now+30000,connected:true,hp:STATS[c][0],maxHp:STATS[c][0],x:0,y:0,energy:120,delay:0,coins:9000,inventory:Array(9).fill(0),special:3,shield:0,poison:0,hidden:0,immunity:0,nextTurnBonus:0,moveBoost:false,itemUsed:false,disconnectedAt:0};}
export function snapshot(room,now=Date.now(),viewerId=null){const viewer=room.players.find(p=>p.id===viewerId);return {type:'state',code:room.code,phase:room.phase,mapId:room.mapId,mapName:room.mapName,host:room.host,players:room.players.map(({disconnectedAt,selectionDeadline,...rest})=>{const p={...rest,selectionSeconds:Math.max(0,(selectionDeadline-now)/1000)};return viewer&&p.hidden>0&&p.team!==viewer.team?{...p,x:0,y:0,energy:0}:p}),clouds:room.clouds,terrain:room.terrain,baseTerrain:room.mapId>=6?newTerrain(room.mapId):null,turn:room.turn,turnOrder:room.turnOrder.filter(id=>room.players.some(p=>p.id===id&&p.hp>0)),turnNumber:room.turnNumber,wind:room.wind,seconds:Math.max(0,(room.deadline-now)/1000),winner:room.winner,lastShot:room.lastShot&&!(viewer&&room.players.some(p=>p.id===room.lastShot.owner&&p.team!==viewer.team&&p.hidden>0))?{...room.lastShot,elapsed:(now-room.lastShot.startedAt)/1000}:null};}
export function newCode(){return randomBytes(4).toString('hex').slice(0,6).toUpperCase();}
function setCharacter(p,c){p.character=c;p.maxHp=p.hp=STATS[c][0];}
function expireSelection(p,now){
 if(p.selectionLocked||now<p.selectionDeadline)return false;
 setCharacter(p,randomInt(NAMES.length));p.selectionLocked=true;p.selectionAuto=true;return true;
}
function assert(ok,message){if(!ok)throw new Error(message);}
function alive(room){return room.players.filter(p=>p.hp>0);}
function settle(room){for(const p of room.players){if(p.hp<=0)continue;let y=ground(room,p.x);let fall=p.y-y;p.y=y;if(fall>95)p.hp=Math.max(0,p.hp-Math.floor((fall-95)*.35));if(y<8)p.hp=0;}}
function victory(room){let teams=new Set(alive(room).map(p=>p.team));if(teams.size<=1){room.phase='finished';room.winner=teams.size===0?'무승부':([...teams][0]===0?'BLUE TEAM':'RED TEAM');room.turn='';return true;}return false;}
export function nextTurn(room,now=Date.now()){
 if(victory(room))return;
 const previous=room.turnOrder.indexOf(room.turn);
 let p;
 for(let offset=1;offset<=room.turnOrder.length;offset++){
  const id=room.turnOrder[(previous+offset)%room.turnOrder.length];
  const candidate=room.players.find(q=>q.id===id&&q.hp>0);
  if(candidate){p=candidate;break;}
 }
 if(!p)return;
room.turn=p.id;room.turnNumber++;p.energy=Math.round(120*STATS[p.character][2]);p.itemUsed=false;p.moveBoost=false;p.shield=0;
 if(p.poison>0){if(!p.immunity)p.hp=Math.max(0,p.hp-Math.round(p.maxHp*.10));p.poison--;}
 if(p.immunity>0)p.immunity--;
 room.clouds=room.clouds.filter(c=>c.untilTurn>room.turnNumber);
 if(p.hidden>0)p.hidden--;
 if(p.hp<=0){nextTurn(room,now);return;}
 room.wind=Math.round((Math.random()*2-1)*50)/10;room.phase='battle';room.deadline=now+20000+p.nextTurnBonus;p.nextTurnBonus=0;
}
export function start(room,now=Date.now(),random=Math.random,chooseMap=()=>randomInt(6)){
 assert(room.phase==='lobby','대기실에서 시작할 수 있습니다.');
 assert(room.players.length>=2,'최소 2명이 필요합니다.');
 assert(room.players.every(p=>p.ready&&p.connected),'모두 준비를 눌러 주세요.');
 assert(new Set(room.players.map(p=>p.team)).size===2,'양 팀에 최소 1명씩 필요합니다.');
 assert(room.players.filter(p=>p.team===0).length===room.players.filter(p=>p.team===1).length,'양 팀 인원을 같게 맞춰 주세요.');
 room.mapId=chooseMap();room.mapName=MAP_NAMES[room.mapId];room.terrain=newTerrain(room.mapId);room.clouds=[];room.lastShot=null;room.shotNumber=0;room.turnNumber=0;room.winner='';
 for(let team=0;team<2;team++)room.players.filter(p=>p.team===team).forEach((p,i)=>{p.x=room.mapId===7?[[90,250,440,580],[1510,1360,1120,1010]][team][i]:room.mapId===6?[[110,255,490,750],[1490,1320,1220,1020]][team][i]:(team===0?120+i*175:1480-i*175);p.y=ground(room,p.x);p.hp=p.maxHp;p.delay=i*10+team*5;p.special=3;p.shield=p.poison=p.hidden=p.immunity=p.nextTurnBonus=0;p.moveBoost=false;});
 room.turnOrder=room.players.map(p=>p.id);
 for(let i=room.turnOrder.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[room.turnOrder[i],room.turnOrder[j]]=[room.turnOrder[j],room.turnOrder[i]];}
 room.turn='';nextTurn(room,now);
}
function damage(room,x,y,radius,amount,part=0,count=1){for(const p of alive(room)){if(p.shield>0)continue;const d=Math.hypot(p.x-x,p.y+32-y);if(d>radius+28)continue;const total=Math.max(0,amount*(1-d/(radius+38)));const hit=Math.round(total*(part+1)/count)-Math.round(total*part/count);p.hp=Math.max(0,p.hp-hit);}}
function expose(room,p){if(p.shield||p.immunity)return;for(const c of room.clouds)if(c.team!==p.team&&Math.hypot(p.x-c.x,p.y+30-c.y)<=c.radius+28)p.poison=Math.max(p.poison,3);}
function poisonCloud(room,p,s){room.clouds.push({x:s.x,y:s.y,radius:100,team:p.team,untilTurn:room.turnNumber+3});for(const q of alive(room))expose(room,q);}
function crater(room,x,y,r){if(room.mapId===6&&!room.destructible)return;for(let i=0;i<room.terrain.length;i++){const dx=i*4-x;if(Math.abs(dx)<r){let bottom=y-Math.sqrt(r*r-dx*dx);if(y+Math.sqrt(r*r-dx*dx)>=room.terrain[i])room.terrain[i]=Math.max(0,Math.min(room.terrain[i],bottom));}}}
export function trace(room,p,angle,power,kind='normal'){
 let x=p.x,y=p.y+55;const speed=160+power*7.2,rad=angle*Math.PI/180;let vx=Math.cos(rad)*speed,vy=Math.sin(rad)*speed;const dt=1/60,points=[{x,y}];let hit=false;
 for(let i=0;i<1200;i++){
  if(kind==='homing'&&vy<0){const target=alive(room).filter(q=>q.team!==p.team&&q.hidden===0&&Math.hypot(q.x-x,q.y+30-y)<=180).sort((a,b)=>Math.hypot(a.x-x,a.y+30-y)-Math.hypot(b.x-x,b.y+30-y))[0];if(target){
   const sx=x,sy=y,steps=Math.max(2,Math.ceil(Math.hypot(target.x-x,target.y+30-y)/30));
   for(let j=1;j<=steps;j++)points.push({x:sx+(target.x-sx)*j/steps,y:sy+(target.y+30-sy)*j/steps});
   x=target.x;y=target.y+30;hit=true;break;
  }}
  vx+=room.wind*16*dt;vy-=310*dt;x+=vx*dt;y+=vy*dt;
  if(i%3===0)points.push({x,y});
  if(x<0||x>1600||y<0)break;
  const target=i>10&&alive(room).find(q=>Math.hypot(q.x-x,q.y+30-y)<26);
  if(y<=ground(room,x)||target){hit=true;break;}
 }
 points.push({x,y});return {points,x,y,hit};
}
function finishAction(room,p,delay,now){if(!victory(room))nextTurn(room,now);}
export function command(room,id,msg,now=Date.now()){
 const p=room.players.find(p=>p.id===id);assert(p,'플레이어를 찾을 수 없습니다.');room.lastActive=now;
 if(msg.type==='leave'){p.hp=0;p.connected=false;if(room.host===id)room.host=room.players.find(q=>q.id!==id&&q.connected)?.id||'';if(room.phase==='lobby'){room.players=room.players.filter(q=>q.id!==id);if(room.host===id)room.host=room.players[0]?.id||'';}else if(room.phase!=='finished'){if(!victory(room)&&room.turn===id)nextTurn(room,now);}return;}
 if(msg.type==='rematch'){assert(id===room.host&&room.phase==='finished','방장만 재대결을 시작할 수 있습니다.');room.players=room.players.filter(q=>q.connected);room.phase='lobby';room.turn='';room.turnOrder=[];for(const q of room.players){q.ready=false;q.selectionLocked=false;q.selectionAuto=false;q.selectionDeadline=now+30000;q.coins=9000;q.inventory.fill(0);}return;}
 if(room.phase==='lobby'){
  expireSelection(p,now);
  if(msg.type==='select'){assert(!p.selectionLocked,'캐릭터 선택이 확정되었습니다.');assert(Number.isInteger(msg.character)&&msg.character>=0&&msg.character<10,'잘못된 캐릭터입니다.');setCharacter(p,msg.character);p.ready=false;}
  else if(msg.type==='team'){assert(msg.team===0||msg.team===1,'잘못된 팀입니다.');assert(room.players.filter(q=>q.id!==id&&q.team===msg.team).length<4,'한 팀은 최대 4명입니다.');p.team=msg.team;p.ready=false;}
  else if(msg.type==='confirm'){assert(!p.selectionLocked,'캐릭터 선택이 확정되었습니다.');p.selectionLocked=true;}
  else if(msg.type==='ready'){p.selectionLocked=true;p.ready=!p.ready;}
  else if(msg.type==='buy'){const i=msg.item;assert(Number.isInteger(i)&&i>=0&&i<9,'잘못된 아이템입니다.');assert(p.coins>=COSTS[i]&&p.inventory.reduce((a,b)=>a+b,0)<4,'코인이 부족하거나 4칸이 찼습니다.');p.coins-=COSTS[i];p.inventory[i]++;p.ready=false;}
  else if(msg.type==='refund'){const i=msg.item;assert(Number.isInteger(i)&&p.inventory[i]>0,'보유하지 않은 아이템입니다.');p.inventory[i]--;p.coins+=COSTS[i];p.ready=false;}
  else if(msg.type==='start'){assert(id===room.host,'방장만 시작할 수 있습니다.');room.fastShots=msg.kind==='ruins-fast'||msg.kind==='original-random-fast';room.destructible=msg.kind==='ruins-destructible'||room.fastShots;if(msg.kind==='original-random-fast')start(room,now,Math.random,()=>chooseOriginalMap());else if(msg.kind==='ruins-original'||room.destructible)start(room,now,Math.random,()=>6);else start(room,now);}
  else throw new Error('대기실에서 사용할 수 없는 명령입니다.');return;
 }
 assert(room.phase==='battle'&&room.turn===id&&p.hp>0,'현재 자신의 턴이 아닙니다.');
 if(now>=room.deadline){finishAction(room,p,100,now);throw new Error('턴 시간이 끝났습니다.');}
 if(msg.type==='move'){
  assert(numeric(msg.dx)&&Math.abs(msg.dx)<=12&&msg.dx!==0,'잘못된 이동입니다.');let cost=Math.abs(msg.dx);assert(cost<=p.energy,'이동력이 부족합니다.');let x=clamp(p.x+msg.dx,20,1580);assert(ground(room,x)-p.y<35,'너무 높은 지형입니다.');assert(!alive(room).some(q=>q.id!==id&&Math.abs(q.x-x)<38),'다른 캐릭터가 있습니다.');p.energy-=cost;p.x=x;settle(room);expose(room,p);if(!victory(room)&&p.hp<=0)nextTurn(room,now);return;
 }
 if(msg.type==='skip'){finishAction(room,p,80,now);return;}
 if(msg.type==='item'){
  const i=msg.item;assert([2,3,4,5,7,8].includes(i)&&p.inventory[i]>0&&!p.itemUsed,'사용 가능한 아이템이 아닙니다.');p.inventory[i]--;p.itemUsed=true;
  if(i===2)p.hp=Math.min(p.maxHp,p.hp+Math.round(p.maxHp*.30));if(i===3)p.shield=1;if(i===4)p.nextTurnBonus=15000;if(i===5){p.energy+=Math.round(120*STATS[p.character][2]);p.moveBoost=true;}if(i===7){p.poison=0;p.immunity=3;}if(i===8)p.hidden=2;return;
 }
 assert(msg.type==='fire','알 수 없는 명령입니다.');
 assert(numeric(msg.angle)&&msg.angle>=0&&msg.angle<=180&&numeric(msg.power)&&msg.power>=5&&msg.power<=100,'발사 각도/파워가 잘못되었습니다.');
 const kind=msg.kind||'normal';assert(['normal','special','homing','teleport','poison'].includes(kind),'잘못된 탄입니다.');
 if(kind==='special'){assert(p.special>0,'특수탄이 없습니다.');p.special--;}
 const item={homing:0,teleport:1,poison:6}[kind];if(item!==undefined){assert(p.inventory[item]>0,'보유하지 않은 아이템입니다.');p.inventory[item]--;}
 const native=kind==='normal'||kind==='special';
 const weapon=native?WEAPONS[p.character]:{visual:kind,count:1,radius:62,effectDelay:0};
 const radius=weapon.radius*(kind==='special'?85/62:1);
 const multiplier=STATS[p.character][1];
 const shots=Array.from({length:weapon.count},(_,index)=>{
  const offset=(index-(weapon.count-1)/2)*(weapon.spread||0);
  const shot=trace(room,p,clamp(msg.angle+offset,0,180),msg.power,kind);
  const startDelay=index*(weapon.interval||0),flightDuration=(shot.points.length-1)*.05/(room.fastShots?1.4:1);
  return {...shot,index,startDelay,flightDuration,effectDelay:weapon.effectDelay,impactAt:now+(startDelay+flightDuration+weapon.effectDelay)*1000,resolved:false};
 });
 room.lastShot={id:++room.shotNumber,startedAt:now,owner:id,character:p.character,visual:weapon.visual,kind,
  paths:shots.map(s=>({points:s.points,hit:s.hit,startDelay:s.startDelay,flightDuration:s.flightDuration,effectDelay:s.effectDelay})),radius};
 room.pending={id,kind,shots,multiplier,radius,count:weapon.count};room.phase='resolving';
 room.resumeAt=Math.max(...shots.map(s=>s.impactAt))+300;
}
export function tick(room,now=Date.now()){
 let changed=false;
 if(room.phase==='lobby')for(const p of room.players)changed=expireSelection(p,now)||changed;
 for(const p of room.players)if(!p.connected&&p.disconnectedAt&&now-p.disconnectedAt>45000){p.disconnectedAt=0;if(room.host===p.id)room.host=room.players.find(q=>q.connected)?.id||'';if(room.phase==='lobby'){room.players=room.players.filter(q=>q.id!==p.id);if(room.host===p.id)room.host=room.players[0]?.id||'';}else {p.hp=0;if(room.phase==='battle'&&!victory(room)&&room.turn===p.id)nextTurn(room,now);}changed=true;}
 if(room.phase==='resolving'){
  const {id,kind,shots,multiplier}=room.pending;const p=room.players.find(q=>q.id===id);
  let impacted=false;
  for(const s of shots){
   if(s.resolved||now<(s.impactAt??room.resumeAt))continue;
   s.resolved=true;changed=true;if(!s.hit)continue;impacted=true;
   if(kind==='teleport'){if(p.hp>0&&s.x>20&&s.x<1580&&!alive(room).some(q=>q.id!==p.id&&Math.abs(q.x-s.x)<38)){p.x=s.x;p.y=ground(room,s.x);}}
   else if(kind==='poison'){poisonCloud(room,p,s);}
   else{const radius=room.pending.radius??(kind==='special'?85:62);damage(room,s.x,s.y,radius,(kind==='special'?145:105)*multiplier,s.index??0,room.pending.count??1);crater(room,s.x,s.y,radius*.8);}
  }
  if(impacted)settle(room);
  if(now>=room.resumeAt){room.pending=null;finishAction(room,p,0,now);changed=true;}
 }
 if(room.phase==='battle'&&now>=room.deadline){const p=room.players.find(q=>q.id===room.turn);finishAction(room,p,100,now);changed=true;}
 return changed;
}
