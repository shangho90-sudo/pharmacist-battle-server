(function(root){
'use strict';
const spawns=[[3,1],[10,1],[12,3],[2,4],[9,5],[2,8],[3,9],[9,9],[11,7],[11,10]];
let networkTheme=null,target=null,applied=-1;
const safe=(x,y)=>spawns.some(([a,b])=>Math.abs(x-a)+Math.abs(y-b)<=1);
function layout(theme){
 const cells=Array(154).fill(0);
 for(let y=0;y<11;y++)for(let x=0;x<14;x++){
  if(safe(x,y))continue;
  let solid=theme===4?(x%3===1&&y%2===0):theme===5?([1,5,8,12].includes(x)&&[2,3,6,7,9].includes(y)):
   theme===6?(([4,8].includes(x)&&![1,5,9].includes(y))||(y%4===0&&x%3===0)):
   theme===7?((x+y*2)%5===0):((y===2||y===8)&&x>=3&&x<=10||[3,10].includes(x)&&y>2&&y<8);
  cells[y*14+x]=solid?1:((x*17+y*11+theme*7)%10<7?2:0);
 }
 // Connect every region through the fewest needed solid cells; crates remain
 // destructible routes, and all ten spawn neighborhoods are always open.
 function reach(){const seen=new Set(),q=[17];while(q.length){const i=q.pop();if(seen.has(i)||cells[i]===1)continue;seen.add(i);for(const j of neighbors(i))q.push(j);}return seen;}
 function neighbors(i){const x=i%14,y=Math.floor(i/14);return [x>0?i-1:-1,x<13?i+1:-1,y>0?i-14:-1,y<10?i+14:-1].filter(j=>j>=0);}
 for(let attempt=0;attempt<154;attempt++){
  const seen=reach(),missing=cells.findIndex((v,i)=>v!==1&&!seen.has(i));if(missing<0)break;
  const q=[missing],parent=new Map([[missing,-1]]);let end=-1;
  for(let k=0;k<q.length&&end<0;k++)for(const n of neighbors(q[k])){if(parent.has(n))continue;parent.set(n,q[k]);if(seen.has(n)){end=n;break;}q.push(n);}
  while(end>=0){if(cells[end]===1)cells[end]=2;end=parent.get(end);}
 }
 return cells;
}
root.PharmacyMapSession={layout,spawns,
 receive(m){if(m.type==='start'&&Number.isInteger(m.seed))networkTheme=(m.seed>>>0)%9;if(['left','kicked','disconnected','ended'].includes(m.type))networkTheme=null;},
 choose(count){return networkTheme===null?root.crypto.getRandomValues(new Uint32Array(1))[0]%count:networkTheme%count;},
 start(model,theme,generation){target={model,theme,generation};},
 frame(heap,game){
  if(!target||applied===target.generation||target.theme<4)return;
  const v=new DataView(heap.buffer,heap.byteOffset,heap.byteLength),valid=(p,n)=>p>0&&p+n<=v.byteLength;
  if(!valid(game,389)||heap[game+385])return;
  const m=v.getUint32(game+284,true);if(m!==target.model||!valid(m,52))return;
  const elapsed=v.getFloat32(m+32,true),grid=v.getUint32(m+8,true);
  if(elapsed>.35||!valid(grid,632)||v.getInt32(grid+12,true)!==154){applied=target.generation;return;}
  const cells=layout(target.theme);for(let y=0;y<11;y++)for(let x=0;x<14;x++)v.setInt32(grid+16+(x*11+y)*4,cells[y*14+x],true);
  applied=target.generation;
 }
};
})(typeof window==='undefined'?globalThis:window);
