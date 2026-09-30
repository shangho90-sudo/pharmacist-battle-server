import {randomUUID} from 'node:crypto';
export class Lobby {
 constructor(send){this.send=send;this.people=new Map();this.rooms=new Map();}
 connect(id=randomUUID()){let p={id,name:'게스트',room:null,driver:0,kart:0,ready:false};this.people.set(id,p);this.send(id,{type:'hello',id});this.list();return p;}
 roomView(r){return {id:r.id,name:r.name,host:r.host,track:r.track,state:r.state,players:[...r.players].map(id=>this.people.get(id)).filter(Boolean).map(({id,name,driver,kart,ready})=>({id,name,driver,kart,ready}))};}
 list(){let rooms=[...this.rooms.values()].map(r=>({id:r.id,name:r.name,count:r.players.size,state:r.state,track:r.track}));for(let p of this.people.values())this.send(p.id,{type:'rooms',rooms});}
 broadcast(r){let packet={type:'room',room:this.roomView(r)};for(let id of r.players)this.send(id,packet);this.list();}
 leave(p){let r=this.rooms.get(p.room);p.room=null;p.ready=false;if(!r)return;r.players.delete(p.id);if(!r.players.size)this.rooms.delete(r.id);else{if(r.host===p.id)r.host=r.players.values().next().value;this.broadcast(r);}this.list();}
 disconnect(id){let p=this.people.get(id);if(p)this.leave(p);this.people.delete(id);}
 handle(id,msg){const p=this.people.get(id);if(!p)throw Error('연결이 끊겼습니다.');const r=this.rooms.get(p.room);
 const index=v=>Number.isInteger(v)&&v>=0&&v<10;
 switch(msg.type){
 case 'name':p.name=String(msg.name||'게스트').trim().slice(0,16)||'게스트';if(r)this.broadcast(r);return;
 case 'create':if(p.room)throw Error('먼저 현재 방을 나가세요.');if(this.rooms.size>=40)throw Error('대기실이 가득 찼습니다.');{let room={id:randomUUID(),name:String(msg.name||'함께 달려요!').slice(0,30),host:id,track:0,state:'waiting',players:new Set([id]),banned:new Set()};p.room=room.id;p.ready=false;this.rooms.set(room.id,room);this.broadcast(room);return;}
 case 'join':{let target=this.rooms.get(msg.room);if(p.room)throw Error('먼저 현재 방을 나가세요.');if(!target||target.state!=='waiting')throw Error('입장할 수 없는 방입니다.');if(target.banned.has(id))throw Error('강퇴된 방입니다.');if(target.players.size>=10)throw Error('방이 가득 찼습니다.');p.room=target.id;p.ready=false;target.players.add(id);this.broadcast(target);return;}
 case 'leave':this.leave(p);this.send(id,{type:'left'});return;
 case 'select':if(!r||r.state!=='waiting'||p.ready)throw Error('준비를 취소한 후 선택하세요.');if(!index(msg.driver)||!index(msg.kart))throw Error('잘못된 선택입니다.');if([...r.players].some(other=>{let q=this.people.get(other);return q.id!==id&&q.ready&&((msg.driver!==p.driver&&q.driver===msg.driver)||(msg.kart!==p.kart&&q.kart===msg.kart))}))throw Error('다른 플레이어가 준비 완료한 선택입니다.');p.driver=msg.driver;p.kart=msg.kart;this.broadcast(r);return;
 case 'ready':if(!r||r.state!=='waiting')throw Error('대기실에서 준비하세요.');if(msg.ready===true&&[...r.players].some(other=>{let q=this.people.get(other);return q.id!==id&&q.ready&&(q.driver===p.driver||q.kart===p.kart)}))throw Error('먼저 준비한 플레이어가 선택했습니다. 다른 캐릭터와 카트를 골라 주세요.');p.ready=msg.ready===true;this.broadcast(r);return;
 case 'track':if(!r||r.host!==id||r.state!=='waiting')throw Error('방장만 코스를 변경할 수 있습니다.');if(!Number.isInteger(msg.track)||msg.track<0||msg.track>5)throw Error('잘못된 코스입니다.');r.track=msg.track;for(let pid of r.players)this.people.get(pid).ready=false;this.broadcast(r);return;
 case 'kick':if(!r||r.host!==id||msg.target===id||!r.players.has(msg.target)||r.state!=='waiting')throw Error('방장만 대기 중인 참가자를 강퇴할 수 있습니다.');r.banned.add(msg.target);this.leave(this.people.get(msg.target));this.send(msg.target,{type:'kicked'});return;
 case 'start':if(!r||r.host!==id||r.state!=='waiting')throw Error('방장만 시작할 수 있습니다.');if(r.players.size<2||![...r.players].every(pid=>this.people.get(pid).ready))throw Error('2명 이상 모두 준비 완료해야 합니다.');r.state='loading';this.broadcast(r);return r;
 default:throw Error('지원하지 않는 요청입니다.');
 }
 }
}
