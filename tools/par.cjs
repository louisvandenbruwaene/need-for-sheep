// Sets star times, time limits and leaderboard floors from the herding bot, and writes them into
// index.html and leaderboard.sql. Usage: node tools/par.cjs [levelId ...]   (default: every level)
//   gold   1.5x the bot (1.3x on sorting levels); on flocks of 40 or more 1.0x, because the bot herds
//          a big flock in pieces and is slow there
//   silver 1.4x gold, limit 1.4x silver (at least 90 s), floor 0.7x the bot (0.4x on big flocks)
// The bot plays without the time limit and with three times its usual patience, so a slow level still gets numbers.
// A level the bot cannot finish keeps its old numbers and is listed at the end.
const fs=require('fs'),path=require('path'),os=require('os'),{fork}=require('child_process');
const {LEVELS,ORDER,better,stylesFor}=require('./bot.cjs');
const ROOT=path.join(__dirname,'..');

// one job per level and playing style, as many at once as there are cores; a level is done when all its styles are
const ids=process.argv.slice(2).map(Number),levels=ids.length?ids:ORDER,results={},left={};
const queue=levels.flatMap(id=>{left[id]=stylesFor(LEVELS[id]).length;return stylesFor(LEVELS[id]).map((_,k)=>[id,k]);});
const work=id=>{const L=LEVELS[id],[w,h]=L.field||[800,500];return L.sheep.length*w*h;};
queue.sort((a,b)=>work(b[0])-work(a[0])); // the slowest first, so the run does not end on one long job
let running=0;
(function next(){
  while(running<os.cpus().length&&queue.length){
    const [id,k]=queue.shift();running++;
    fork(path.join(__dirname,'bot.cjs'),['--style',id,k],{env:{BOT_PATIENCE:'3',...process.env,BOT_UNLIMITED:'1'}}).on('message',r=>{
      results[id]=better(results[id],r);running--;
      if(!--left[id]){const b=results[id];console.log(`id${String(id).padStart(2)} ${LEVELS[id].name.padEnd(20)} ${b.time?b.time.toFixed(1)+' s':'FAIL '+b.penned+'/'+b.total}`);}
      if(!queue.length&&!running)write();else next();
    });
  }
})();

function numbers(L,bot){
  const big=L.sheep.length>=40,sorting=(L.pens||[]).some(P=>P.kind!==undefined);
  const gold=Math.round(bot*(big?1:sorting?1.3:1.5)),time=Math.round(gold*1.4);
  return {gold,time,limit:Math.max(90,Math.ceil(time*1.4/10)*10),floor:Math.round(bot*(big?.4:.7)*2)/2};
}
function write(){
  let html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const failed=[];
  for(const [id,r] of Object.entries(results)){
    const L=LEVELS[id];
    if(!r.time){failed.push(`id${id} ${L.name}: ${r.penned}/${r.total}`);continue;}
    const n=numbers(L,r.time);
    // the level's line starts with its name; replace its par and limit (adding a limit if it has none)
    const start=html.indexOf(`{name:'${L.name}'`),end=html.indexOf('par:{',start);
    const close=html.indexOf('}',html.indexOf('}',end)+1); // end of par:{…} then end of the level object
    const tail=html.slice(end,close+1);
    if(start<0||!/^par:\{time:\d+,gold:\d+\}(,limit:\d+)?\}$/.test(tail)){failed.push(`id${id} ${L.name}: cannot find its par in index.html`);continue;}
    html=html.slice(0,end)+`par:{time:${n.time},gold:${n.gold}},limit:${n.limit}}`+html.slice(close+1);
    results[id].floor=n.floor;
  }
  fs.writeFileSync(path.join(ROOT,'index.html'),html);
  // floors: one per level, in LEVELS order; levels not re-run keep their old floor
  const sqlPath=path.join(ROOT,'leaderboard.sql');
  let sql=fs.readFileSync(sqlPath,'utf8');
  const old=sql.match(/\(array\[([^\]]*)\]\)/)[1].split(',').map(Number);
  const floors=LEVELS.map((L,i)=>results[i]?.floor??old[i]??0);
  sql=sql.replace(/\(array\[[^\]]*\]\)/,`(array[${floors.join(',')}])`)
    .replace(/check \(level between 0 and \d+\)/g,`check (level between 0 and ${LEVELS.length-1})`);
  fs.writeFileSync(sqlPath,sql);
  if(failed.length)console.log('\nkept old numbers (look at these):\n  '+failed.join('\n  '));
}
