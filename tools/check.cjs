// Level checker: catches layouts where sheep get stuck for reasons that are not the player's fault.
//  - behind a pen: the space between a pen's back or sides and whatever is beside it (field edge, fence, water,
//    rock, another pen) is either shut (at most 2 px, nothing fits) or wide open (at least OPEN px, room for a flock to flow round)
//  - in front of a gate: OPEN px of clear ground
//  - every sheep and dog starts on open ground inside the field
// Usage: node tools/check.cjs        (prints problems, exits 1 if there are any)
const fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const G={module:{exports:{}}};vm.createContext(G);
vm.runInContext(html.match(/<script id="sim">([\s\S]*?)<\/script>/)[1],G);
const {LEVELS,ORDER,makeWorld}=G.module.exports;

const SHUT=2,OPEN=160;
const segDist=(px,py,[x1,y1,x2,y2])=>{const ex=x2-x1,ey=y2-y1,u=Math.max(0,Math.min(1,((px-x1)*ex+(py-y1)*ey)/(ex*ex+ey*ey)));return Math.hypot(px-x1-ex*u,py-y1-ey*u);};
const inRect=(rects,x,y)=>rects.some(([rx,ry,w,h])=>x>rx&&x<rx+w&&y>ry&&y<ry+h);

// how far a point can walk from (x,y) along (nx,ny) before it meets something solid, up to OPEN
function clearance(world,P,x,y,nx,ny){
  const others=world.walls.filter(w=>!isOwnWall(P,w));
  for(let d=0;d<=OPEN;d++){
    const px=x+nx*d,py=y+ny*d;
    if(px<=0||py<=0||px>=world.W||py>=world.H)return d;
    if(inRect(world.water,px,py))return d;
    if(world.rocks.some(([cx,cy,r])=>Math.hypot(px-cx,py-cy)<r))return d;
    if(d>0&&others.some(w=>segDist(px,py,w)<1))return d;
  }
  return OPEN;
}
const isOwnWall=(P,[x1,y1,x2,y2])=>[[x1,y1],[x2,y2]].every(([x,y])=>x>=P.x-.5&&x<=P.x+P.w+.5&&y>=P.y-.5&&y<=P.y+P.h+.5)
  &&(x1===x2&&(x1===P.x||x1===P.x+P.w)||y1===y2&&(y1===P.y||y1===P.y+P.h));

function checkLevel(L){
  const problems=[],world=makeWorld(L);
  for(const P of world.pens){
    const sides={top:[0,-1],bottom:[0,1],left:[-1,0],right:[1,0]};
    for(const [side,[nx,ny]] of Object.entries(sides)){
      // sample along the side, a little in from each corner
      const gaps=[];
      for(let k=1;k<=7;k++){
        const f=k/8,x=nx?(nx<0?P.x:P.x+P.w):P.x+P.w*f,y=ny?(ny<0?P.y:P.y+P.h):P.y+P.h*f;
        gaps.push(clearance(world,P,x,y,nx,ny));
      }
      if(side===P.gate){
        const mid=gaps.slice(2,5);
        if(Math.min(...mid)<OPEN)problems.push(`pen ${P.x},${P.y}: only ${Math.min(...mid)} px in front of the gate`);
        continue;
      }
      const bad=gaps.filter(g=>g>SHUT&&g<OPEN);
      if(bad.length)problems.push(`pen ${P.x},${P.y} ${side}: a ${Math.min(...bad)}-${Math.max(...bad)} px gap sheep can squeeze into (shut it or open it to ${OPEN})`);
    }
  }
  const blocked=(x,y,r)=>x<r||y<r||x>world.W-r||y>world.H-r||inRect(world.water,x,y)
    ||world.rocks.some(([cx,cy,rr])=>Math.hypot(x-cx,y-cy)<rr+r)||world.walls.some(w=>segDist(x,y,w)<r)
    ||world.pens.some(P=>x>P.x-r&&x<P.x+P.w+r&&y>P.y-r&&y<P.y+P.h+r);
  world.sheep.forEach((s,i)=>{if(blocked(s.x,s.y,8))problems.push(`sheep ${i} starts blocked at ${s.x|0},${s.y|0}`);});
  world.dogs.forEach((d,i)=>{if(blocked(d.x,d.y,6))problems.push(`dog ${i+1} starts blocked at ${d.x|0},${d.y|0}`);});
  return problems;
}
module.exports={checkLevel};
if(require.main!==module)return;
let failed=0;
ORDER.forEach((id,n)=>{
  const problems=checkLevel(LEVELS[id]);
  if(!problems.length)return;
  failed++;
  console.log(`${n+1} id${id} ${LEVELS[id].name}`);
  for(const p of problems)console.log('   '+p);
});
console.log(failed?`${failed} level(s) with problems`:'all levels ok');
process.exit(failed?1:0);
