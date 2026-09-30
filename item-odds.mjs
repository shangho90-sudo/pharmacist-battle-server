// Same order and weights as Unity ItemOdds.cs.
export const ITEM_WEIGHTS = Object.freeze([10,3,20,21,3,10,10,10,3,10]);
export function rollItem(random, includeRandom = true) {
 const weights = includeRandom ? ITEM_WEIGHTS : ITEM_WEIGHTS.slice(0,-1);
 let roll = random() * weights.reduce((a,b)=>a+b,0);
 for(let i=0;i<weights.length;i++){roll-=weights[i];if(roll<0)return i;}
 return weights.length-1;
}
