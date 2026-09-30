import test from 'node:test';import assert from 'node:assert/strict';import {Match} from './match.mjs';
const p=[{id:'a',driver:0,kart:0},{id:'b',driver:1,kart:1}];
test('server advances without host frames and brakes on drift',()=>{let m=new Match(p,0);m.elapsed=0;let a=m.players[0];a.speed=29;for(let i=0;i<10;i++){m.input('a',{steer:.3,drift:true});m.tick(.05);}assert(a.speed<15);assert(a.s>-8);});
test('silent client brakes; other client keeps progressing',()=>{let m=new Match(p,0);m.elapsed=0;for(let i=0;i<100;i++){m.input('b',{steer:0});m.tick(.05);}assert(m.players[1].s>m.players[0].s+30);});
test('item shield blocks once; no client supplied position',()=>{let m=new Match(p,0);m.elapsed=0;let a=m.players[0];a.shield=4;m.hit(a,0);assert.equal(a.lock,0);assert.equal(a.shield,0);m.hit(a,0);assert.equal(a.lock,1.5);m.input('a',{x:9999,progress:9999});assert.notEqual(a.s,9999);});
