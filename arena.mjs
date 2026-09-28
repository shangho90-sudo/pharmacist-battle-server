// Server-owned rules for the existing 14x11 arena. No browser/Unity dependency.
import './map-layout-source.cjs';
import './obstacle-layout-source.cjs';
export const STEP=1/60, SNAPSHOT_HZ=20, PROTOCOL=78;
const W=14,H=11,DX=[0,1,0,-1],DY=[-1,0,1,0],key=(x,y)=>y*W+x;
const {spawns,rows,additions}=globalThis.PharmacyObstacles68;
const inside=(x,y)=>x>=0&&x<W&&y>=0&&y<H;
export const movementInterval=s=>(.260-Math.max(1,Math.min(10,s))*.014)/(.85*1.30);
export class Arena {
 constructor(members,seed,map=0,random=Math.random){
  this.random=random;this.seed=seed;this.map=map;this.theme=(seed>>>0)%9;this.elapsed=0;this.finished=false;this.winner=-1;this.winningTeam=-1;this.teamMode=true;this.bombs=[];this.waves=[];this.items=[];this.fires=[];this.motion=new Map();this.inputs=new Map();this.events=[];this.eventId=0;
  this.grid=this.theme>=4?globalThis.PharmacyMapSession.layout(this.theme):rows.flatMap(r=>[...r].map(c=>c==='C'?2:c==='.'?0:1));
  this.decoration=rows.flatMap(r=>[...r].map(c=>c==='B'?1:0));
  if(this.theme<4)for(const[x,y]of additions)this.grid[key(x,y)]=1;
  this.players=members.map((m,Id)=>{const[X,Y]=spawns[m.character];this.grid[key(X,Y)]=0;return {Nickname:m.nickname,Id,Character:m.character,X,Y,Capacity:1,Range:1,Speed:3,Needles:0,Kills:0,Placed:0,Bot:false,Alive:true,Cooldown:0,Trap:0,Invincible:0,Think:0,TrapOwner:-1,Team:m.team,Facing:2,MoveCount:0,MaxSpeed:8,MaxCapacity:8,MaxRange:8,StatFeedback:0,LastItem:0,LastItemIncreased:false,HasKick:false,HasMagnet:false,Molotovs:0,DebuffKind:0,DebuffTime:0,MagnetClock:0};});
  this.ids=new Map(members.map((m,i)=>[m.id,i]));
 }
 effect(kind,x,y){this.events.push({id:++this.eventId,kind,x,y});if(this.events.length>128)this.events.shift();}
 blocked(x,y){return !inside(x,y)||this.grid[key(x,y)]!==0||this.bombs.some(b=>b.X===x&&b.Y===y);}
 input(id,action,direction,seq){const i=this.ids.get(id),p=this.players[i];if(!p||!p.Alive||this.finished)return false;let input=this.inputs.get(i);if(!input)this.inputs.set(i,input={seq:-1,direction:-1,until:0,place:false,needle:false});if(!Number.isSafeInteger(seq)||seq<=input.seq)return false;input.seq=seq;
  if(action==='move'){if(!Number.isInteger(direction)||direction<0||direction>3)return false;input.direction=direction;input.until=this.elapsed+.18;}
  else if(action==='stop'){input.direction=-1;input.until=0;}
  else if(action==='place')input.place=true;else if(action==='needle')input.needle=true;else return false;return true;
 }
 position(p){const m=this.motion.get(p.Id);if(!m)return {x:p.X,y:p.Y};const t=Math.min(1,Math.max(0,(this.elapsed-m.at)/m.duration));return {x:m.x+(p.X-m.x)*t,y:m.y+(p.Y-m.y)*t};}
 move(p,d){if(this.finished||!p.Alive||p.Trap>0||p.Cooldown>1e-7||d<0||d>3)return false;const x=p.X+DX[d],y=p.Y+DY[d];if(this.blocked(x,y))return false;const position=this.position(p),duration=movementInterval(p.Speed);this.motion.set(p.Id,{...position,at:this.elapsed,duration});p.Facing=d;p.MoveCount++;p.X=x;p.Y=y;p.Cooldown=duration;return true;}
 place(p){if(this.finished||!p.Alive||p.Trap>0||this.bombs.filter(b=>b.Owner===p.Id).length>=p.Capacity||this.bombs.some(b=>b.X===p.X&&b.Y===p.Y))return false;this.bombs.push({X:p.X,Y:p.Y,Owner:p.Id,Range:p.Range,Time:3,SlideDirection:-1,SlideClock:0});p.Placed++;this.effect('place',p.X,p.Y);return true;}
 escape(p){if(!p.Alive||p.Trap<=0||p.Needles<=0)return false;p.Needles--;p.Trap=0;p.Invincible=1.5;this.effect('escape',p.X,p.Y);return true;}
 eliminate(p,owner=-1){if(!p.Alive)return;p.Alive=false;p.Trap=0;this.inputs.delete(p.Id);if(owner>=0&&owner!==p.Id&&this.players[owner])this.players[owner].Kills++;this.effect('out',p.X,p.Y);}
 depart(id){const i=this.ids.get(id);if(i!==undefined)this.eliminate(this.players[i]);}
 blast(b){const cells=[key(b.X,b.Y)];for(let d=0;d<4;d++)for(let n=1;n<=b.Range;n++){const x=b.X+DX[d]*n,y=b.Y+DY[d]*n;if(!inside(x,y)||this.grid[key(x,y)]===1)break;cells.push(key(x,y));if(this.grid[key(x,y)]===2)break;}return cells;}
 explode(b){if(!this.bombs.includes(b))return;const cells=this.blast(b);this.bombs.splice(this.bombs.indexOf(b),1);for(const k of cells){const X=k%W,Y=Math.floor(k/W);this.waves.push({X,Y,Owner:b.Owner,Time:.3});if(this.grid[k]===2){this.grid[k]=0;this.effect('crate',X,Y);if(this.random()<.72){const n=this.random(),Type=n<.405?0:n<.81?1:n<.93?2:n<.97?4:5;this.items.push({X,Y,Type,Delay:0});}}const chain=this.bombs.find(o=>o.X===X&&o.Y===Y);if(chain)this.explode(chain);}this.effect('burst',b.X,b.Y);}
 apply(p,type){let increased=false;switch(type){case 0:increased=p.Capacity<p.MaxCapacity;p.Capacity=Math.min(p.MaxCapacity,p.Capacity+1);break;case 1:increased=p.Range<p.MaxRange;p.Range=Math.min(p.MaxRange,p.Range+1);break;case 2:increased=p.Speed<p.MaxSpeed;p.Speed=Math.min(p.MaxSpeed,p.Speed+2);p.Cooldown=Math.min(p.Cooldown,movementInterval(p.Speed));break;case 4:increased=p.Needles<3;p.Needles=Math.min(3,p.Needles+1);break;case 5:increased=true;p.HasMagnet=true;p.MagnetClock=8;break;default:return false;}p.LastItem=type;p.LastItemIncreased=increased;p.StatFeedback=1.4;return increased;}
 collect(p,item){this.apply(p,item.Type);this.items.splice(this.items.indexOf(item),1);this.effect('item_'+['capacity','range','speed','kick','needle','magnet'][item.Type],item.X,item.Y);}
 magnet(p,dt){if(!p.HasMagnet)return;p.MagnetClock=Math.max(0,p.MagnetClock-dt);if(p.MagnetClock<=1e-7){p.MagnetClock=0;p.HasMagnet=false;return;}if(p.Trap>0)return;const seen=new Set([key(p.X,p.Y)]),q=[[p.X,p.Y,0]];for(let i=0;i<q.length;i++){const[x,y,depth]=q[i];if(depth>=2)continue;for(let d=0;d<4;d++){const a=x+DX[d],b=y+DY[d],k=key(a,b);if(this.blocked(a,b)||seen.has(k))continue;seen.add(k);q.push([a,b,depth+1]);}}for(const item of [...this.items])if(item.Delay<=0&&seen.has(key(item.X,item.Y)))this.collect(p,item);}
 hit(p,w){if(w.Time<.135||w.Time>.3001)return false;const {x,y}=this.position(p),age=Math.max(0,Math.min(1,1-w.Time/.3)),t=Math.min(1,age*2.2),spread=.34+.66*t*t*(3-2*t),r=spread*.36+.12;return Math.abs(x-w.X)<=r&&Math.abs(y-w.Y)<=r;}
 tick(dt=STEP){if(this.finished||!(dt>0))return;this.elapsed+=dt;
  for(const w of this.waves)w.Time-=dt;this.waves=this.waves.filter(w=>w.Time>0);for(const item of this.items)item.Delay-=dt;
  for(const b of [...this.bombs]){b.Time-=dt;if(b.Time<=1e-7)this.explode(b);}
  for(const p of this.players){if(!p.Alive)continue;this.magnet(p,dt);p.StatFeedback=Math.max(0,p.StatFeedback-dt);p.Cooldown=Math.max(0,p.Cooldown-dt);p.Invincible=Math.max(0,p.Invincible-dt);
   if(p.Trap>0){p.Trap-=dt;if(p.Trap<=1e-7){this.eliminate(p,p.TrapOwner);continue;}}
   const input=this.inputs.get(p.Id);if(input){if(input.place){this.place(p);input.place=false;}if(input.needle){this.escape(p);input.needle=false;}if(input.direction>=0&&input.until>=this.elapsed)this.move(p,input.direction);}
   if(p.Trap<=0&&p.Invincible<=0){const w=this.waves.find(w=>this.hit(p,w));if(w){p.Trap=5;p.TrapOwner=w.Owner;this.effect('trap',p.X,p.Y);}}
   this.escape(p); // v74: an owned needle escapes automatically, once.
   if(p.Trap>0){const other=this.players.find(o=>o.Id!==p.Id&&o.Alive&&o.Trap<=0&&o.X===p.X&&o.Y===p.Y);if(other){if(other.Team===p.Team){p.Trap=0;p.Invincible=1.5;this.effect('escape',p.X,p.Y);}else this.eliminate(p,other.Id);}}
   else for(const item of [...this.items])if(item.Delay<=0&&item.X===p.X&&item.Y===p.Y)this.collect(p,item);
  }
  const living=this.players.filter(p=>p.Alive),oneTeam=living.length>0&&living.every(p=>p.Team===living[0].Team);if(living.length<=1||oneTeam||this.elapsed>=180){this.finished=true;this.winningTeam=oneTeam?living[0].Team:-1;this.winner=living.length===1||oneTeam?living[0].Id:-1;}
 }
 snapshot(){return {players:this.players,bombs:this.bombs,waves:this.waves,items:this.items,fires:[],grid:this.grid,decoration:this.decoration,map:this.map,winner:this.winner,winningTeam:this.winningTeam,elapsed:this.elapsed,finished:this.finished,teamMode:true};}
 positions(){return this.players.map(p=>({id:p.Id,...this.position(p)}));}
}
