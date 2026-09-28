(function(root){
'use strict';
// Apply to the native simulation grid before its next update. Host snapshots
// already serialize this grid, so remote clients receive the same collision map.
const rows=['CCC.SCCCBBCCCC','CC....CC.....C','CCCCCCCCC.CC..','CCC.S.CC.CC...','SS...CCCCCC.SS','CC.CCBCC....CC','CCCCCCCCCC.CCC','SSBCC..CC...SS','C.....CCCS..CC','C...SCCC....CC','CCCCBCCCC...CC'];
const spawns=[[3,1],[10,1],[12,3],[2,4],[9,5],[2,8],[3,9],[9,9],[11,7],[11,10]];
const additions=[[0,0],[12,0],[1,2],[5,2],[7,2],[6,0],[6,4],[8,4],[1,6],[4,6],[6,6],[8,6],[12,6],[6,8],[0,9],[7,10]];
let lastGrid=0,lastElapsed=-1,applied=false;
function frame(heap,game){
 if(!(heap instanceof Uint8Array))return;
 const v=new DataView(heap.buffer,heap.byteOffset,heap.byteLength),valid=(p,n)=>p>0&&p+n<=v.byteLength;
 if(!valid(game,288))return;
 const model=v.getUint32(game+284,true);if(!valid(model,52))return;
 const grid=v.getUint32(model+8,true),elapsed=v.getFloat32(model+32,true);
 if(!valid(grid,632)||v.getInt32(grid+12,true)!==154||!Number.isFinite(elapsed))return;
 if(grid!==lastGrid||elapsed<lastElapsed-.001){applied=false;lastGrid=grid;}lastElapsed=elapsed;
 if(applied||elapsed>.35)return;
 const at=(x,y)=>grid+16+(x*11+y)*4;
 // Fail closed on a different native layout or a partly played network snapshot.
 for(let y=0;y<11;y++)for(let x=0;x<14;x++){
  const ch=rows[y][x],expected=ch==='C'?2:ch==='.'?0:1,actual=v.getInt32(at(x,y),true);
  if(actual!==expected&&!(actual===0&&spawns.some(p=>p[0]===x&&p[1]===y)))return;
 }
 for(const [x,y] of additions)v.setInt32(at(x,y),1,true);
 applied=true;
}
root.PharmacyObstacles68={frame,rows,spawns,additions};
})(typeof window==='undefined'?globalThis:window);
