const express=require('express'),http=require('http'),{WebSocketServer}=require('ws'),fs=require('fs'),path=require('path'),zlib=require('zlib'),cp=require('child_process'),os=require('os');
const {ProceduralWorld}=require('./terrain');
const ROOT=path.join(__dirname,'..'),CFG=JSON.parse(fs.readFileSync(path.join(ROOT,'config.json')));
if(process.env.SUPABASE_URL&&process.env.SUPABASE_ANON_KEY){CFG.supabase={url:process.env.SUPABASE_URL,anonKey:process.env.SUPABASE_ANON_KEY};}
const PORT=process.env.PORT||CFG.port||3000;
const app=express(),srv=http.createServer(app);
app.use(express.static(path.join(ROOT,'public')));

// ---------- LAN IP detection ----------
function getLanIP(){
  const ifaces=os.networkInterfaces();
  const all=[];
  for(const name of Object.keys(ifaces)){
    for(const iface of ifaces[name]){
      if(iface.family==='IPv4'&&!iface.internal){
        all.push({name, address:iface.address});
      }
    }
  }
  // Prefer physical Wi-Fi or Ethernet over virtual/VPN adapters (like Radmin, Hamachi, VMware, etc.)
  const physical=all.find(i=>!/radmin|vpn|hamachi|virtual|vmware|vbox|wsl/i.test(i.name)&&/wi-fi|wireless|ethernet|lan/i.test(i.name))
              || all.find(i=>!/radmin|vpn|hamachi|virtual|vmware|vbox|wsl/i.test(i.name))
              || all[0];
  return physical?physical.address:'127.0.0.1';
}
app.get('/api/lan-info',(q,r)=>{
  const ifaces=os.networkInterfaces();
  const list=[];
  for(const name of Object.keys(ifaces)){
    for(const iface of ifaces[name]){
      if(iface.family==='IPv4'&&!iface.internal){
        list.push({name, address:iface.address});
      }
    }
  }
  r.json({ip:getLanIP(),port:PORT,interfaces:list});
});

// ---------- Supabase room relay (optional) ----------
// Uses fetch to Supabase REST API if configured in config.json
// Set: "supabase":{"url":"https://xxx.supabase.co","anonKey":"eyJ..."}
async function supabasePublishRoom(code,worldName,hostName){
  if(!CFG.supabase||!CFG.supabase.url||!CFG.supabase.anonKey)return;
  try{
    await fetch(`${CFG.supabase.url}/rest/v1/webcraft_rooms`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':CFG.supabase.anonKey,'Authorization':'Bearer '+CFG.supabase.anonKey,'Prefer':'return=minimal'},
      body:JSON.stringify({code,world_name:worldName,host_name:hostName,created_at:new Date().toISOString()})
    });
  }catch(e){console.warn('Supabase publish failed:',e.message);}
}
async function supabaseDeleteRoom(code){
  if(!CFG.supabase||!CFG.supabase.url||!CFG.supabase.anonKey)return;
  try{
    await fetch(`${CFG.supabase.url}/rest/v1/webcraft_rooms?code=eq.${code}`,{
      method:'DELETE',
      headers:{'apikey':CFG.supabase.anonKey,'Authorization':'Bearer '+CFG.supabase.anonKey}
    });
  }catch(e){}
}
async function supabaseFetchRooms(){
  if(!CFG.supabase||!CFG.supabase.url||!CFG.supabase.anonKey)return[];
  try{
    const r=await fetch(`${CFG.supabase.url}/rest/v1/webcraft_rooms?order=created_at.desc&limit=20`,{
      headers:{'apikey':CFG.supabase.anonKey,'Authorization':'Bearer '+CFG.supabase.anonKey}
    });
    return await r.json();
  }catch(e){return[];}
}
// Expose Supabase config (safe, anonKey is public) and room list to frontend
app.get('/api/supabase-config',(q,r)=>{
  if(!CFG.supabase||!CFG.supabase.url)return r.json({enabled:false});
  r.json({enabled:true,url:CFG.supabase.url,anonKey:CFG.supabase.anonKey});
});
app.get('/api/public-rooms',async(q,r)=>{
  const dbRooms=await supabaseFetchRooms();
  // Only return rooms that are still active on this server
  const active=dbRooms.filter(dr=>rooms.has(dr.code));
  r.json(active);
});

// ---------- worlds ----------
const worlds={};
function loadWorld(id,dir,name){
  const meta=JSON.parse(fs.readFileSync(path.join(dir,'meta.json'))),bin=fs.readFileSync(path.join(dir,'world.bin')),cols=new Map();
  for(const [cx,sy,cz,off,len] of meta.chunks){const k=cx+','+cz;if(!cols.has(k))cols.set(k,[]);cols.get(k).push([sy,off,len]);}
  const sp=CFG.spawnOverride||meta.spawn||[0,0,0];
  worlds[id]={id,name,kind:'bedrock',names:meta.blocks,spawn:[sp[0],sp[2]],cols,bin,cache:new Map()};
}
if(fs.existsSync(path.join(ROOT,'world','meta.json')))loadWorld('default',path.join(ROOT,'world'),'Your world (default)');
if(fs.existsSync(path.join(ROOT,'worlds')))for(const d of fs.readdirSync(path.join(ROOT,'worlds')))try{loadWorld(d,path.join(ROOT,'worlds',d),'Uploaded: '+d)}catch(e){}
worlds.flat={id:'flat',name:'🏗️ New flat world',kind:'flat',names:['minecraft:air','minecraft:bedrock','minecraft:stone','minecraft:dirt','minecraft:grass_block'],spawn:[8,8],flatCache:new Map()};
const procWorld=new ProceduralWorld('random','🌲 Random Seed World (Biomes + Trees + Mountains)');
worlds.random={id:'random',name:procWorld.name,kind:'random',names:procWorld.names,spawn:procWorld.spawn,proc:procWorld};
const flatAt=y=>y==-64?1:y<=60?2:y<=62?3:y==63?4:0;
function flatSub(sy){const a=new Uint16Array(4096);for(let x=0;x<16;x++)for(let z=0;z<16;z++)for(let y=0;y<16;y++)a[x*256+z*16+y]=flatAt(sy*16+y);return zlib.deflateSync(Buffer.from(a.buffer));}
function colBuffer(w,cx,cz){
  if(w.kind==='random')return w.proc.getColumnBuffer(cx,cz);
  const parts=[];
  if(w.kind==='flat'){for(let sy=-4;sy<4;sy++){if(!w.flatCache.has(sy))w.flatCache.set(sy,flatSub(sy));parts.push([sy,w.flatCache.get(sy)]);}}
  else for(const [sy,off,len] of w.cols.get(cx+','+cz)||[])parts.push([sy,w.bin.subarray(off,off+len)]);
  const out=[Buffer.from([parts.length])];
  for(const [sy,b] of parts){const h=Buffer.alloc(5);h.writeInt8(sy,0);h.writeUInt32LE(b.length,1);out.push(h,b);}
  return Buffer.concat(out);
}
app.get('/api/worlds',(q,r)=>r.json(Object.values(worlds).map(w=>({id:w.id,name:w.name}))));
app.get('/api/texture-packs',(q,r)=>{
  const mf=path.join(ROOT,'public','packs','manifest.json');
  if(fs.existsSync(mf))return r.json(JSON.parse(fs.readFileSync(mf)));
  r.json([{id:'alta',name:'🌿 Alta Pack C1 (Default)'}]);
});
app.get('/api/skies',(q,r)=>{
  const mf=path.join(ROOT,'public','skies','manifest.json');
  if(fs.existsSync(mf))return r.json(JSON.parse(fs.readFileSync(mf)));
  r.json([{id:'anime',name:'☁️ Anime Clouds (Default)'}]);
});
app.get('/col/:w/:x/:z',(q,r)=>{
  const w=worlds[q.params.w];if(!w)return r.sendStatus(404);
  const cx=+q.params.x,cz=+q.params.z;
  r.set('Content-Type','application/octet-stream');
  r.set('Cache-Control','public, max-age=600');
  if(!w.colBufCache)w.colBufCache=new Map();
  const k=cx+','+cz;
  if(w.colBufCache.has(k))return r.send(w.colBufCache.get(k));
  const buf=colBuffer(w,cx,cz);
  if(w.colBufCache.size>1500)w.colBufCache.delete(w.colBufCache.keys().next().value);
  w.colBufCache.set(k,buf);
  r.send(buf);
});
app.post('/api/upload',express.raw({type:'*/*',limit:'600mb'}),(q,r)=>{
  const id='w'+Date.now().toString(36),tmp=path.join(ROOT,'tmp_'+id+'.mcworld'),out=path.join(ROOT,'worlds',id);
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(tmp,q.body);
  const py=process.platform==='win32'?'python':'python3';
  cp.execFile(py,[path.join(ROOT,'convert.py'),tmp,out],{timeout:600000},(e,so,se)=>{
    fs.rmSync(tmp,{force:true});
    if(e){fs.rmSync(out,{recursive:true,force:true});return r.status(500).json({error:'Conversion failed. Needs python3 and pip install amulet-leveldb on the server. '+String(se||e.message).slice(-300)});}
    loadWorld(id,out,(q.query.name||id));r.json({id,name:(q.query.name||id)});});
});
// ---------- world access ----------
function subOf(w,cx,sy,cz){
  const k=cx+','+sy+','+cz;if(w.cache.has(k))return w.cache.get(k);
  const ent=(w.cols.get(cx+','+cz)||[]).find(e=>e[0]===sy);let a=null;
  if(ent){const raw=zlib.inflateSync(w.bin.subarray(ent[1],ent[1]+ent[2]));a=new Uint16Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+8192));}
  if(w.cache.size>600)w.cache.delete(w.cache.keys().next().value);w.cache.set(k,a);return a;
}
function baseAt(w,x,y,z){
  if(y<-64||y>319)return 0;
  if(w.kind==='flat')return flatAt(y);
  if(w.kind==='random'){const e=w.proc;return e.blockAt(x,y,z);}
  const a=subOf(w,x>>4,y>>4,z>>4);return a?a[(x&15)*256+(z&15)*16+(y&15)]:0;
}
const blockAt=(R,x,y,z)=>{const e=R.edits.get(x+','+y+','+z);return e!==undefined?e:baseAt(R.w,x,y,z);};
function idOf(R,name){let i=R.names.indexOf(name);if(i<0){i=R.names.length;R.names.push(name);broadcast(R,{t:'names',names:R.names});}return i;}
function ground(R,x,z){for(let y=319;y>=-64;y--){const n=R.names[blockAt(R,x,y,z)];if(n!=='minecraft:air')return {y:y+1,n};}return {y:64,n:'minecraft:air'};}
function spawnPoint(R){
  const [sx,sz]=R.w.spawn,rad=CFG.respawnRadius;
  for(let i=0;i<40;i++){
    const x=Math.floor(sx+(i?(Math.random()*2-1)*rad:0)),z=Math.floor(sz+(i?(Math.random()*2-1)*rad:0)),g=ground(R,x,z);
    if(!/water|lava|leaves/.test(g.n)||i==39)return [x+.5,g.y+.1,z+.5];
  }
}
// ---------- items / crafting ----------
const info=n=>{
  n=n.replace('minecraft:','');
  if(n==='bedrock'||n==='barrier')return{h:-1};
  if(/leaves/.test(n))return{h:.2,drop:Math.random()<.1?'minecraft:apple':null};
  if(/ice$/.test(n))return{h:.3,drop:null};
  if(/glass/.test(n))return{h:.3};
  if(/dirt|grass_block|podzol|mycelium|farmland/.test(n))return{h:.6,tool:'shovel',drop:'minecraft:dirt'};
  if(/sand$|gravel|clay|snow|mud|soul_/.test(n))return{h:.6,tool:'shovel',drop:n==='clay'?'minecraft:clay_ball':undefined};
  if(/log|planks|wood|_stem|chest|crafting_table|fence|door|bookshelf|barrel|sign|ladder|trapdoor|oak_stairs|spruce_stairs|dark_oak_stairs|birch_stairs|jungle_stairs|acacia_stairs|wooden_|(oak|spruce|dark_oak|birch|jungle|acacia)_slab/.test(n))return{h:2,tool:'axe'};
  if(/obsidian/.test(n))return{h:30,tool:'pickaxe',need:1,drop:'minecraft:obsidian'};
  if(/diamond_ore|deepslate_diamond_ore/.test(n))return{h:3,tool:'pickaxe',need:1,drop:'minecraft:diamond'};
  if(/coal_ore|deepslate_coal_ore/.test(n))return{h:2,tool:'pickaxe',drop:'minecraft:coal'};
  if(/iron_ore|deepslate_iron_ore/.test(n))return{h:2.5,tool:'pickaxe',drop:'minecraft:iron_ore'};
  if(/gold_ore|deepslate_gold_ore/.test(n))return{h:3,tool:'pickaxe',need:1,drop:'minecraft:gold_ore'};
  if(/copper_ore|deepslate_copper_ore/.test(n))return{h:2,tool:'pickaxe',drop:'minecraft:copper_ore'};
  if(/emerald_ore|deepslate_emerald_ore/.test(n))return{h:3,tool:'pickaxe',need:1,drop:'minecraft:emerald'};
  if(/lapis_ore|deepslate_lapis_ore/.test(n))return{h:2.5,tool:'pickaxe',drop:'minecraft:lapis_lazuli'};
  if(/redstone_ore|deepslate_redstone_ore/.test(n))return{h:2.5,tool:'pickaxe',drop:'minecraft:redstone'};
  if(/^stone$/.test(n))return{h:1.5,tool:'pickaxe',drop:'minecraft:cobblestone'};
  if(/^deepslate$/.test(n))return{h:2,tool:'pickaxe',drop:'minecraft:cobbled_deepslate'};
  if(/^stone_brick|bricks|brick_block|cobble|terracotta|andesite|granite|diorite|furnace|basalt|blackstone|prismarine|sandstone|quartz|netherrack|end_stone|_stairs|stair|_slab|slab/.test(n))
    return{h:1.8,tool:'pickaxe'};
  if(/wool/.test(n))return{h:.8};
  return{h:1};
};
const toolOf=id=>{const m=/(wooden|stone|iron|golden|diamond|netherite)_(pickaxe|axe|shovel|sword)$/.exec(id||'');return m?{type:m[2],mat:m[1]}:null;};
const RECIPES=[
  ['L',4,i=>i.replace(/_(log|stem)$/,'_planks')],
  [['P','P'],4,'minecraft:stick'],
  [['PP','PP'],1,'minecraft:crafting_table'],
  [['PPP','P.P','PPP'],1,'minecraft:chest'],
  [['CCC','C.C','CCC'],1,'minecraft:furnace'],
  [['PP','PP','PP'],3,'minecraft:oak_door'],
  [['P..','PP.','PPP'],4,'minecraft:oak_stairs'],
  [['PPP'],6,'minecraft:oak_slab'],
  ...['wooden:P','stone:C','iron:I','golden:G','diamond:D','netherite:N'].flatMap(s=>{
    const[m,c]=s.split(':');
    return[
      [[c+c+c,'.S.','.S.'],1,`minecraft:${m}_pickaxe`],
      [[c+c,c+'S','.S'],1,`minecraft:${m}_axe`],
      [[c,'S','S'],1,`minecraft:${m}_shovel`],
      [[c,c,'S'],1,`minecraft:${m}_sword`]
    ];
  })
];
const tok=(c,id)=>!id?c==='.':c==='P'?/_planks$/.test(id):c==='L'?/_(log|stem)$/.test(id):c==='C'?/cobblestone$|cobbled_deepslate$/.test(id):c==='S'?id==='minecraft:stick':c==='I'?id==='minecraft:iron_ingot':c==='G'?id==='minecraft:gold_ingot':c==='D'?id==='minecraft:diamond':c==='N'?id==='minecraft:netherite_ingot':false;
function craftOut(cg){
  const cells=cg.map(s=>s&&s.id);let r0=9,r1=-1,c0=9,c1=-1;
  cells.forEach((v,i)=>{if(v){const r=i/3|0,c=i%3;r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c);}});
  if(r1<0)return null;
  for(const [pat,n,out] of RECIPES){
    const rows=typeof pat==='string'?[pat]:pat;if(rows.length!==r1-r0+1||rows[0].length!==c1-c0+1)continue;
    let ok=true;for(let r=0;r<rows.length&&ok;r++)for(let c=0;c<rows[0].length;c++)if(!tok(rows[r][c],cells[(r0+r)*3+c0+c])){ok=false;break;}
    if(ok){const id=typeof out==='function'?out(cells.find(Boolean)):out;return{id,n};}
  }return null;
}
// ---------- rooms & drops ----------
const rooms=new Map();let pid=1,dropCounter=1;
const send=(ws,m)=>ws.readyState===1&&ws.send(JSON.stringify(m));
const broadcast=(R,m,except)=>R.players.forEach(p=>p!==except&&send(p.ws,m));
const plist=R=>[...R.players.values()].map(p=>({id:p.id,name:p.name,host:p.id===R.host,creative:p.creative,p:p.pos,r:p.rot}));
const syncInv=p=>{p.out=craftOut(p.craft);send(p.ws,{t:'inv',inv:p.inv,cursor:p.cursor,craft:p.craft,out:p.out});};
function give(p,id,n){
  for(const s of p.inv)if(s&&s.id===id&&s.n<64){const a=Math.min(n,64-s.n);s.n+=a;n-=a;}
  for(let i=0;i<36&&n>0;i++)if(!p.inv[i]){const a=Math.min(n,64);p.inv[i]={id,n:a};n-=a;}
}
function spawnDrop(R,itemId,x,y,z,count=1){
  if(!itemId||itemId==='minecraft:air')return null;
  const did=dropCounter++;
  const drop={id:did,item:itemId,n:count,p:[+x.toFixed(3),+y.toFixed(3),+z.toFixed(3)],t:Date.now()};
  R.drops.set(did,drop);
  broadcast(R,{t:'drop',drop});
  setTimeout(()=>{if(R.drops.has(did)){R.drops.delete(did);broadcast(R,{t:'rmDrop',id:did});}},300000);
  return drop;
}
function slotArr(R,p,area){return area==='inv'?p.inv:area==='craft'?p.craft:area==='chest'&&p.chest?R.chests.get(p.chest):null;}
function click(R,p,area,i){
  if(area==='out'){const o=p.out;if(!o)return;if(p.cursor&&(p.cursor.id!==o.id||p.cursor.n+o.n>64))return;
    p.cursor=p.cursor?{id:o.id,n:p.cursor.n+o.n}:{...o};p.craft=p.craft.map(s=>s&&s.n>1?{id:s.id,n:s.n-1}:null);return;}
  const a=slotArr(R,p,area);if(!a||i<0||i>=a.length)return;const s=a[i],c=p.cursor;
  if(c&&s&&s.id===c.id){const m=Math.min(c.n,64-s.n);s.n+=m;p.cursor=c.n-m>0?{id:c.id,n:c.n-m}:null;}
  else{a[i]=c;p.cursor=s;}
}
function setBlock(R,x,y,z,id){R.edits.set(x+','+y+','+z,id);broadcast(R,{t:'block',x,y,z,id});}
function handle(ws,m){
  if(m.t==='create'||m.t==='join'){
    let R;const name=String(m.name||'Player').slice(0,16);
    if(m.t==='create'){const w=worlds[m.world];if(!w)return send(ws,{t:'err',msg:'Unknown world'});
      let code;do code=Array.from({length:6},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random()*32|0]).join('');while(rooms.has(code));
      R={code,w,names:[...w.names],edits:new Map(),chests:new Map(),drops:new Map(),players:new Map(),doors:new Set(),host:null,allCreative:false,worldName:w.name||w.id};rooms.set(code,R);
      // If creator opts to publish publicly, push to Supabase
      if(m.publish)supabasePublishRoom(code,R.worldName,name);
    }else{R=rooms.get(String(m.code||'').toUpperCase().trim());if(!R)return send(ws,{t:'err',msg:'No room with that code'});}
    const p={id:pid++,ws,name,inv:Array(36).fill(null),craft:Array(9).fill(null),cursor:null,pos:[0,0,0],rot:[0,0],creative:R.allCreative,room:R,chest:null};
    if(!R.host)R.host=p.id;p.pos=spawnPoint(R);R.players.set(p.id,p);ws.p=p;
    send(ws,{t:'init',code:R.code,you:p.id,host:R.host===p.id,kind:R.w.kind,world:R.w.id,names:R.names,spawn:p.pos,edits:[...R.edits],drops:[...R.drops.values()],players:plist(R),doors:[...R.doors],creative:p.creative,allCreative:R.allCreative});
    syncInv(p);broadcast(R,{t:'players',players:plist(R)});return;
  }
  const p=ws.p;if(!p)return;const R=p.room,isHost=R.host===p.id;
  switch(m.t){
    case'pos':p.pos=m.p;p.rot=m.r;broadcast(R,{t:'pos',id:p.id,p:m.p,r:m.r},p);break;
    case'break':{const{x,y,z}=m;if(![x,y,z].every(Number.isInteger)||Math.hypot(x-p.pos[0],y-p.pos[1],z-p.pos[2])>9)break;
      const id=blockAt(R,x,y,z),n=R.names[id];if(n==='minecraft:air')break;const inf=info(n);
      if(!p.creative){
        if(inf.h<0)break;
        const held=p.inv[m.slot],t=toolOf(held&&held.id);
        const good=t&&inf.tool&&t.type===inf.tool;
        if(!(inf.need&&!(good&&t.type==='pickaxe'))){
          const d=inf.drop===undefined?n:inf.drop;
          if(d&&!/water|lava|air/.test(d))spawnDrop(R,d,x+0.5,y+0.3,z+0.5,1);
        }
        const ck=x+','+y+','+z;
        if(R.chests.has(ck)){for(const s of R.chests.get(ck))if(s)spawnDrop(R,s.id,x+0.5,y+0.3,z+0.5,s.n);R.chests.delete(ck);}
        syncInv(p);
      }
      setBlock(R,x,y,z,0);
      if(/_door$/.test(n)){
        if(/_door$/.test(R.names[blockAt(R,x,y+1,z)]))setBlock(R,x,y+1,z,0);
        if(/_door$/.test(R.names[blockAt(R,x,y-1,z)]))setBlock(R,x,y-1,z,0);
      }
      break;}
    case'pickup':{
      const drop=R.drops.get(m.id);if(!drop)break;
      if(Math.hypot(p.pos[0]-drop.p[0],p.pos[1]-drop.p[1],p.pos[2]-drop.p[2])<4.5){
        give(p,drop.item,drop.n);
        syncInv(p);
        R.drops.delete(drop.id);
        broadcast(R,{t:'pickup',id:drop.id,player:p.id,item:drop.item});
      }
      break;}
    case'dropHeld':{
      const s=p.inv[m.slot];if(!s||s.n<=0)break;
      const dropItem=s.id;s.n--;if(s.n<=0)p.inv[m.slot]=null;
      syncInv(p);
      const yaw=p.rot?p.rot[0]:0,dx=-Math.sin(yaw)*0.9,dz=-Math.cos(yaw)*0.9;
      spawnDrop(R,dropItem,p.pos[0]+dx,p.pos[1]+0.5,p.pos[2]+dz,1);
      break;}
    case'place':{const{x,y,z}=m;if(![x,y,z].every(Number.isInteger)||y<-64||y>319||Math.hypot(x-p.pos[0],y-p.pos[1],z-p.pos[2])>9)break;
      const s=p.inv[m.slot];if(!s||/(pickaxe|axe|shovel|sword|stick|arrow|bow)$/.test(s.id))break;
      const cur=R.names[blockAt(R,x,y,z)];if(cur!=='minecraft:air'&&!/water|lava/.test(cur))break;
      if(Math.abs(x+.5-p.pos[0])<.8&&Math.abs(z+.5-p.pos[2])<.8&&y>=Math.floor(p.pos[1])&&y<p.pos[1]+1.8)break;
      const isD=/_door$/.test(s.id);
      if(isD){
        const above=R.names[blockAt(R,x,y+1,z)];
        if(above!=='minecraft:air'&&!/water|lava/.test(above))break;
      }
      setBlock(R,x,y,z,idOf(R,s.id));
      if(isD)setBlock(R,x,y+1,z,idOf(R,s.id));
      if(s.id==='minecraft:chest')R.chests.set(x+','+y+','+z,Array(27).fill(null));
      if(!p.creative){s.n--;if(s.n<=0)p.inv[m.slot]=null;syncInv(p);}break;}
    case'click':click(R,p,m.area,m.i);syncInv(p);if(p.chest)send(p.ws,{t:'chest',items:R.chests.get(p.chest)});break;
    case'give':if(p.creative&&(R.names.includes(m.id)||/^minecraft:((wooden|stone|iron|golden|diamond|netherite)_(pickaxe|axe|shovel|sword)|stick|bow|arrow|apple)$/.test(m.id))){p.cursor={id:m.id,n:64};syncInv(p);}break;
    case'trash':if(p.creative){p.cursor=null;syncInv(p);}break;
    case'openChest':{const k=m.x+','+m.y+','+m.z;if(R.names[blockAt(R,m.x,m.y,m.z)]!=='minecraft:chest')break;
      if(!R.chests.has(k))R.chests.set(k,Array(27).fill(null));p.chest=k;send(ws,{t:'chest',items:R.chests.get(k)});break;}
    case'closeChest':p.chest=null;send(ws,{t:'chest',items:null});break;
    case'closeInv':p.craft.forEach(s=>s&&give(p,s.id,s.n));p.craft=Array(9).fill(null);if(p.cursor){give(p,p.cursor.id,p.cursor.n);p.cursor=null;}syncInv(p);break;
    case'respawn':p.pos=spawnPoint(R);send(ws,{t:'respawn',p:p.pos});break;
    case'setCreative':if(isHost){const q=R.players.get(m.id);if(q){q.creative=!!m.on;send(q.ws,{t:'creative',on:q.creative});broadcast(R,{t:'players',players:plist(R)});}}break;
    case'allCreative':if(isHost){R.allCreative=!!m.on;R.players.forEach(q=>{q.creative=R.allCreative;send(q.ws,{t:'creative',on:q.creative});});broadcast(R,{t:'players',players:plist(R)});}break;
    case'kick':if(isHost&&m.id!==p.id){const q=R.players.get(m.id);if(q){send(q.ws,{t:'err',msg:'You were removed by the host'});q.ws.close();}}break;
    case'door':{const{x,y,z}=m;if(![x,y,z].every(Number.isInteger))break;
      if(!R.doors)R.doors=new Set();
      const k=x+','+y+','+z;
      if(m.open)R.doors.add(k);else R.doors.delete(k);
      broadcast(R,{t:'door',x,y,z,open:!!m.open},p);
      break;}
    case'chat':broadcast(R,{t:'chat',name:p.name,text:String(m.text||'').slice(0,200)});send(ws,{t:'chat',name:p.name,text:String(m.text||'').slice(0,200)});break;
  }
}
const wss=new WebSocketServer({server:srv,path:'/ws'});
wss.on('connection',ws=>{
  ws.on('message',d=>{try{handle(ws,JSON.parse(d));}catch(e){console.error(e);}});
  ws.on('close',()=>{const p=ws.p;if(!p)return;const R=p.room;R.players.delete(p.id);
    if(!R.players.size){rooms.delete(R.code);supabaseDeleteRoom(R.code);return;}
    if(R.host===p.id){R.host=R.players.keys().next().value;send(R.players.get(R.host).ws,{t:'host'});}
    broadcast(R,{t:'players',players:plist(R)});});
});
srv.listen(PORT,()=>console.log('WebCraft running on port '+PORT));
