import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRoom,makePlayer,command,tick,snapshot,STATS} from '../game.mjs';
function fixture(){const r=makeRoom('SELECT');r.players=[makePlayer('a','A',0,1000),makePlayer('b','B',1,6000)];r.host='a';r.players[1].team=1;return r;}
test('30-second server deadline; independent late join; timeout randomizes exactly once',()=>{
 const r=fixture();assert.equal(snapshot(r,1000).players[0].selectionSeconds,30);
 tick(r,30999);assert.equal(r.players[0].selectionLocked,false);
 assert.equal(tick(r,31000),true);const a=r.players[0];assert.equal(a.selectionLocked,true);assert.equal(a.selectionAuto,true);assert.ok(Number.isInteger(a.character)&&a.character>=0&&a.character<10);assert.equal(a.hp,STATS[a.character][0]);assert.equal(a.ready,false);assert.equal(r.players[1].selectionLocked,false);
 const c=a.character;tick(r,35000);assert.equal(a.character,c);assert.equal(snapshot(r,35000).players[1].selectionSeconds,1);tick(r,36000);assert.equal(r.players[1].selectionAuto,true);
});
test('manual confirmation preserves choice; preview alone does not confirm',()=>{
 const r=fixture();command(r,'a',{type:'select',character:8},2000);command(r,'a',{type:'confirm'},3000);command(r,'b',{type:'select',character:9},7000);tick(r,36000);
 assert.equal(r.players[0].character,8);assert.equal(r.players[0].selectionAuto,false);assert.equal(r.players[1].selectionAuto,true);
 assert.throws(()=>command(r,'a',{type:'select',character:3},37000),/확정/);
});
test('late select and late confirm cannot override deadline even before next tick',()=>{
 for(const type of ['select','confirm']){const r=fixture();assert.throws(()=>command(r,'a',{type,character:4},31000),/확정/);assert.equal(r.players[0].selectionAuto,true);}
});
test('ready confirms; cancel/team/shop do not reset selection; disconnected timer still expires',()=>{
 const r=fixture();command(r,'a',{type:'select',character:3},2000);command(r,'a',{type:'ready'},3000);command(r,'a',{type:'ready'},4000);command(r,'a',{type:'buy',item:0},5000);command(r,'a',{type:'team',team:1},6000);r.players[1].connected=false;r.players[1].disconnectedAt=9000;tick(r,36000);
 assert.equal(r.players[0].character,3);assert.equal(r.players[0].selectionLocked,true);assert.equal(r.players[0].selectionDeadline,31000);assert.equal(r.players[1].selectionAuto,true);
});
test('rematch grants all connected players a fresh 30 seconds',()=>{
 const r=fixture();tick(r,36000);r.phase='finished';command(r,'a',{type:'rematch'},50000);for(const p of r.players){assert.equal(p.selectionLocked,false);assert.equal(p.selectionAuto,false);assert.equal(p.selectionDeadline,80000);}assert.equal(snapshot(r,50000).players[0].selectionSeconds,30);
});
