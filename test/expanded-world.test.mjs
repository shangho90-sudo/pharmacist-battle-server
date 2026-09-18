import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD,makeRoom,makePlayer,trace,crater,ground,snapshot,newTerrain} from '../game.mjs';
test('expanded world shares dimensions and has collision beyond the former right edge',()=>{
 const r=makeRoom('BIG');r.terrain.fill(100);const p=makePlayer('p','팽약사',0);p.x=2900;p.y=100;r.players=[p];r.wind=0;
 const shot=trace(r,p,20,20);assert.ok(shot.hit);assert.ok(shot.x>1600&&shot.x<=3200);
 const s=snapshot(r);assert.equal(s.worldWidth,3200);assert.equal(s.worldHeight,1800);assert.equal(r.terrain.length,801);
});
test('high-speed missile hits narrow ridge at its side instead of tunnelling or jumping to its top',()=>{
 const r=makeRoom('RIDGE');r.terrain.fill(0);r.terrain[30]=1000;r.wind=0;
 const p=makePlayer('p','팽약사',0);p.x=100;p.y=300;r.players=[p];
 const shot=trace(r,p,0,100);assert.ok(shot.hit);assert.ok(shot.x>=116&&shot.x<=120);assert.ok(shot.y<360&&shot.y>340);
 crater(r,shot.x,shot.y,50);assert.ok(ground(r,120)<shot.y);assert.equal(ground(r,200),0);
});
test('repeated overlapping craters never restore columns and affect the full expanded map',()=>{
 const r=makeRoom('HOLES');r.terrain=newTerrain(7);
 for(const x of [120,900,1800,2900]){const before=[...r.terrain],y=ground(r,x);crater(r,x,y,60);assert.ok(ground(r,x)<=Math.max(0,y-59));assert.ok(r.terrain.every((h,i)=>h<=before[i]&&h>=0));}
});
