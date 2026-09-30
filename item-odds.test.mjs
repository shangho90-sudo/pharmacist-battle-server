import test from 'node:test';
import assert from 'node:assert/strict';
import {rollItem,ITEM_WEIGHTS} from './item-odds.mjs';
test('box tickets match every configured weight',()=>{
 const counts=Array(10).fill(0);
 for(let i=0;i<100;i++)counts[rollItem(()=>(i+.5)/100)]++;
 assert.deepEqual(counts,ITEM_WEIGHTS);
});
test('random item excludes itself and preserves relative weights',()=>{
 const counts=Array(10).fill(0);
 for(let i=0;i<90;i++)counts[rollItem(()=>(i+.5)/90,false)]++;
 assert.deepEqual(counts,[...ITEM_WEIGHTS.slice(0,9),0]);
});
