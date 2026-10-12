// Herding bot: plays every level with the game's own simulation, to check levels are solvable and to set star times.
// It steers one dog at a time (switching like Tab does), walks near sheep and sprints only when far from them.
// Usage: node tools/bot.cjs [levelId ...]     (default: every level, in play order)
const fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const G={module:{exports:{}}};vm.createContext(G);
vm.runInContext(html.match(/<script id="sim">([\s\S]*?)<\/script>/)[1],G);
const {LEVELS,ORDER,makeWorld,step,DT,LIMIT,DOG_WALK,DOG_MAX}=G.module.exports;

let CELL=10,GW=80,GH=50; // path grid, sized to each level's field in play(): coarser on the big fields
const segDist=(px,py,[x1,y1,x2,y2])=>{const ex=x2-x1,ey=y2-y1,u=Math.max(0,Math.min(1,((px-x1)*ex+(py-y1)*ey)/(ex*ex+ey*ey)));return Math.hypot(px-x1-ex*u,py-y1-ey*u);};
const inR=(rects,x,y)=>rects.some(([rx,ry,w,h])=>x>rx&&x<rx+w&&y>ry&&y<ry+h);

// cost of entering each cell, Infinity where blocked (sheep do not swim, dogs do, slowly)
function costGrid(world,forDog){
  const c=new Float64Array(GW*GH);
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){
    const x=i*CELL+CELL/2,y=j*CELL+CELL/2;let k=1;
    if(!forDog&&(x<14||x>world.W-14||y<14||y>world.H-14))k=Infinity;
    if(world.rocks.some(([rx,ry,r])=>Math.hypot(x-rx,y-ry)<r+(forDog?10:7)))k=Infinity;
    if(world.walls.some(w=>segDist(x,y,w)<Math.max(8,CELL*.75)))k=Infinity; // a wall blocks every cell it passes through
    if(inR(world.water,x,y))k=forDog?k*2.3:Infinity;
    if(inR(world.mud,x,y))k*=1.9;
    c[j*GW+i]=k;
  }
  return c;
}
// Dijkstra from (tx,ty) over 8 neighbours, no corner cutting; extra(i) multiplies cell costs
function field(cost,tx,ty,extra){
  const d=new Float64Array(GW*GH).fill(Infinity),start=Math.min(GH-1,Math.max(0,ty/CELL|0))*GW+Math.min(GW-1,Math.max(0,tx/CELL|0));
  d[start]=0;const heap=[[0,start]];
  const push=e=>{heap.push(e);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m;}}return top;};
  while(heap.length){
    const [dist,c]=pop();if(dist>d[c])continue;
    const ci=c%GW,cj=c/GW|0;
    for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){
      if(!di&&!dj)continue;const i=ci+di,j=cj+dj;if(i<0||j<0||i>=GW||j>=GH)continue;
      if(di&&dj&&(cost[cj*GW+i]===Infinity||cost[j*GW+ci]===Infinity))continue;
      const n=j*GW+i,k=cost[n]*(extra?extra(n):1);if(k===Infinity)continue;
      const nd=dist+k*(di&&dj?1.414:1);if(nd<d[n]){d[n]=nd;push([nd,n]);}
    }
  }
  return d;
}
const cellOf=(x,y)=>Math.min(GH-1,Math.max(0,y/CELL|0))*GW+Math.min(GW-1,Math.max(0,x/CELL|0));
// direction of steepest descent, looking two cells around
function downhill(d,x,y){
  const c=cellOf(x,y),ci=c%GW,cj=c/GW|0;let best=d[c],bx=0,by=0;
  for(let dj=-2;dj<=2;dj++)for(let di=-2;di<=2;di++){
    const i=ci+di,j=cj+dj;if(i<0||j<0||i>=GW||j>=GH)continue;
    const v=d[j*GW+i]+Math.hypot(di,dj)*.01;if(v<best){best=v;bx=di;by=dj;}
  }
  const l=Math.hypot(bx,by);return l?[bx/l,by/l]:[0,0];
}

function play(level,{sprintFrom,behind}){
  const world=makeWorld(level);
  CELL=world.W>800?20:10;GW=Math.ceil(world.W/CELL);GH=Math.ceil(world.H/CELL);
  const stuckAfter=35*Math.max(1,(world.W+world.H)/1300),sheepCost=costGrid(world,false),dogCost=costGrid(world,true);
  const penFields=world.pens.map(P=>field(sheepCost,P.x+P.w/2,P.y+P.h/2));
  const fits=(P,s)=>P.kind===undefined||P.kind===s.kind;
  const goalField=s=>{let best=null,bd=Infinity;world.pens.forEach((P,k)=>{if(!fits(P,s)||P.shut)return;const v=penFields[k][cellOf(s.x,s.y)];if(v<bd){bd=v;best=penFields[k];}});return best||penFields[0];};
  let active=0,dogField=null,lastPlan=-1,limit=level.limit||LIMIT,target=[0,0],progressAt=0,lastPenned=0;
  while(world.t<limit){
    if(world.penned>lastPenned){lastPenned=world.penned;progressAt=world.t;}
    if(world.t-progressAt>stuckAfter)break; // stuck: this style will not finish
    if(world.penned===world.sheep.length)return {time:world.t,penned:world.penned,total:world.sheep.length};
    if(world.t-lastPlan>=.1){
      lastPlan=world.t;
      const free=world.sheep.filter(s=>!s.penned);
      // clusters of free sheep; work the one closest to its pen
      const group=[],seen=new Set();let clusters=[];
      for(const s of free){if(seen.has(s))continue;const c=[s];seen.add(s);for(let k=0;k<c.length;k++)for(const o of free)if(!seen.has(o)&&Math.hypot(o.x-c[k].x,o.y-c[k].y)<75){seen.add(o);c.push(o);}clusters.push(c);}
      const score=c=>c.reduce((a,s)=>a+goalField(s)[cellOf(s.x,s.y)],0)/c.length;
      clusters.sort((a,b)=>score(a)-score(b));group.push(...clusters[0]);
      const cx=group.reduce((a,s)=>a+s.x,0)/group.length,cy=group.reduce((a,s)=>a+s.y,0)/group.length;
      let far=null,fd=0;for(const s of group){const d=Math.hypot(s.x-cx,s.y-cy);if(d>fd){fd=d;far=s;}}
      if(fd>18*Math.sqrt(group.length)+22){ // collect the stray back to the group
        const ux=(far.x-cx)/fd,uy=(far.y-cy)/fd;target=[far.x+ux*40,far.y+uy*40];
      }else{ // drive the group along its sheep's way home
        let gx=0,gy=0;for(const s of group){const [a,b]=downhill(goalField(s),s.x,s.y);gx+=a;gy+=b;}
        const gl=Math.hypot(gx,gy)||1,R=fd+10;target=[cx-gx/gl*(R+behind),cy-gy/gl*(R+behind)];
      }
      target=[Math.max(8,Math.min(world.W-8,target[0])),Math.max(8,Math.min(world.H-8,target[1]))];
      // switch to the dog with the shortest way there (like pressing Tab)
      const crowd=new Uint8Array(GW*GH); // cells near free sheep: the dog goes round them, not through
      const reach=Math.ceil(62/CELL);
      for(const s of free){const ci=s.x/CELL|0,cj=s.y/CELL|0;for(let j=cj-reach;j<=cj+reach;j++)for(let i=ci-reach;i<=ci+reach;i++)
        if(i>=0&&j>=0&&i<GW&&j<GH&&Math.hypot(i*CELL+CELL/2-s.x,j*CELL+CELL/2-s.y)<62)crowd[j*GW+i]=1;}
      const fieldTo=field(dogCost,target[0],target[1],n=>crowd[n]?7:1);
      const dist=world.dogs.map(d=>fieldTo[cellOf(d.x,d.y)]);
      const bestDog=dist.indexOf(Math.min(...dist));if(dist[bestDog]<dist[active]-25)active=bestDog;
      dogField=fieldTo;
    }
    world.dogs.forEach((d,i)=>{d.driving=false;});
    const dog=world.dogs[active],near=Math.min(...world.sheep.filter(s=>!s.penned).map(s=>Math.hypot(s.x-dog.x,s.y-dog.y)));
    const direct=Math.hypot(target[0]-dog.x,target[1]-dog.y)<30;
    const [ux,uy]=direct?[0,0]:downhill(dogField,dog.x,dog.y);
    Object.assign(dog,{driving:true,targetX:direct?target[0]:dog.x+ux*60,targetY:direct?target[1]:dog.y+uy*60,maxSpeed:near>sprintFrom?DOG_MAX:DOG_WALK,gain:6});
    step(world,DT);
  }
  return {time:null,penned:world.penned,total:world.sheep.length};
}
// a few playing styles, from careful (walk near sheep, stay well back) to bold (sprint right behind them)
const STYLES=[];for(const sprintFrom of [0,60,110,160])for(const behind of [25,45,70])STYLES.push({sprintFrom,behind});
function best(level){
  let top=null;
  for(const style of STYLES){const r=play(level,style);if(!top||(r.time??1e9)<(top.time??1e9)||(!top.time&&!r.time&&r.penned>top.penned))top={...r,style};}
  return top;
}
module.exports={play,best,STYLES,LEVELS};
if(require.main!==module)return;
const line=(id,r)=>{
  const L=LEVELS[id],n=ORDER.indexOf(id)+1;
  return (`${String(n).padStart(2)} id${String(id).padStart(2)} ${L.name.padEnd(17)} ${r.time?r.time.toFixed(1).padStart(6)+' s':'  FAIL  '} ${r.penned}/${r.total}  par ${L.par.time}/${L.par.gold}  style ${r.style.sprintFrom}/${r.style.behind}`);
};
// one child process per level, as many at once as there are cores
const {fork}=require('child_process'),os=require('os');
if(process.argv[2]==='--one'){process.send(best(LEVELS[+process.argv[3]]));return;}
const ids=process.argv.slice(2).map(Number),queue=[...(ids.length?ids:ORDER)],results={};
let running=0;
(function next(){
  while(running<os.cpus().length&&queue.length){
    const id=queue.shift();running++;
    fork(__filename,['--one',id]).on('message',r=>{results[id]=r;running--;
      if(!queue.length&&!running)for(const k of (ids.length?ids:ORDER))console.log(line(k,results[k]));
      next();});
  }
})();
