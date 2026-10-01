const $=s=>document.querySelector(s);
const S={names:[],creative:false,host:false,inv:Array(36).fill(null),cursor:null,craft:Array(9).fill(null),out:null,chest:null,players:new Map(),world:'',code:'',me:0,allCreative:false,started:false};
let ws,ui=null;

// ---------- Texture Pack System ----------
let atlasMeta=null,REV_TEX={},currentPack=localStorage.getItem('wc_pack')||'alta';

async function loadPack(packId){
  const atlasPath=`/packs/${packId}/atlas.png`;
  const metaPath=`/packs/${packId}/atlas_meta.json`;
  try{
    const data=await(await fetch(metaPath)).json();
    atlasMeta=data;REV_TEX={};
    if(data.textures)for(const [k,v] of Object.entries(data.textures))REV_TEX[v]=k;
    currentPack=packId;localStorage.setItem('wc_pack',packId);
    if(atlasTex){
      const img=new Image();
      img.onload=()=>{
        atlasTex.image=img;
        atlasTex.needsUpdate=true;
        if(S.started)rebuildDerived();
      };
      img.src=atlasPath;
    }else{
      if(S.started)rebuildDerived();
    }
    // Update UI highlight
    document.querySelectorAll('.pack-btn').forEach(b=>b.classList.toggle('active',b.dataset.pack===packId));
    console.log('Loaded pack:',packId);
  }catch(e){
    // Fallback to default atlas
    console.warn('Pack not found, using default atlas');
    try{
      const data=await(await fetch('/atlas_meta.json')).json();
      atlasMeta=data;REV_TEX={};
      if(data.textures)for(const [k,v] of Object.entries(data.textures))REV_TEX[v]=k;
      if(S.started)rebuildDerived();
    }catch(e2){console.error(e2);}
  }
}

async function loadTexturePacks(){
  try{
    const packs=await(await fetch('/api/texture-packs')).json();
    const list=document.getElementById('pack-list');
    if(!list)return;
    list.innerHTML='';
    packs.forEach(p=>{
      const btn=document.createElement('button');
      btn.className='touch-btn pack-btn';
      btn.dataset.pack=p.id;
      btn.style.cssText='width:100%;padding:10px 14px;font-size:13px;text-align:left;border-radius:8px;justify-content:flex-start';
      btn.textContent=p.name;
      if(p.id===currentPack)btn.classList.add('active');
      btn.onclick=()=>loadPack(p.id);
      list.appendChild(btn);
    });
    // pack-btn active style
    if(!document.getElementById('pack-style')){
      const s=document.createElement('style');
      s.id='pack-style';
      s.textContent='.pack-btn.active{background:rgba(126,200,80,0.35)!important;border-color:#7ec850!important;color:#7ec850!important;}';
      document.head.appendChild(s);
    }
  }catch(e){console.warn('Could not load packs list',e);}
}

// Load initial pack and atlas
loadPack(currentPack);
loadTexturePacks();

// ---------- Ambience & Clouds System (Day/Night & Weather) ----------
let currentSky=localStorage.getItem('wc_sky')||'anime';
let currentTime=localStorage.getItem('wc_time')||'day';
let currentWeather=localStorage.getItem('wc_weather')||'clear';
let autoDayNight=localStorage.getItem('wc_auto_time')!=='false';
let availableSkies=[];
const skyLoader=new THREE.CubeTextureLoader();
const skyCache=new Map();
let rainSystem=null;
const RAIN_COUNT=900;

function getSkyUrls(packId, target){
  const b=`/skies/${packId}/${target}`;
  return [`${b}/px.jpg`,`${b}/nx.jpg`,`${b}/py.jpg`,`${b}/ny.jpg`,`${b}/pz.jpg`,`${b}/nz.jpg`];
}

function updateSkybox(){
  updateSkyUIElements();
  if(!scene)return;
  let target=currentTime;
  if(currentWeather==='thunder')target='thunder';
  else if(currentWeather==='rain')target='rain';

  const key=`${currentSky}_${target}`;
  let cube=skyCache.get(key);
  if(!cube){
    const urls=getSkyUrls(currentSky,target);
    cube=skyLoader.load(urls,undefined,undefined,()=>{
      // Fallback if specific weather is missing in pack
      const fallbackUrls=getSkyUrls('anime','day');
      const fb=skyLoader.load(fallbackUrls);
      if(scene)scene.background=fb;
    });
    cube.generateMipmaps=false;
    cube.minFilter=THREE.LinearFilter;
    cube.magFilter=THREE.LinearFilter;
    skyCache.set(key,cube);
  }
  scene.background=cube;

  // Fog & ambient tint
  let fogCol=0xa8c8e8;
  if(target==='sunset')fogCol=0xd87038;
  else if(target==='night')fogCol=0x0a1020;
  else if(target==='rain')fogCol=0x404854;
  else if(target==='thunder')fogCol=0x20242e;
  if(scene.fog)scene.fog.color.setHex(fogCol);

  // Weather particles
  if(rainSystem)rainSystem.visible=(currentWeather==='rain'||currentWeather==='thunder');
}

function initRain(){
  const geom=new THREE.BufferGeometry();
  const pos=new Float32Array(RAIN_COUNT*3);
  for(let i=0;i<RAIN_COUNT;i++){
    pos[i*3]=(Math.random()-0.5)*44;
    pos[i*3+1]=Math.random()*26;
    pos[i*3+2]=(Math.random()-0.5)*44;
  }
  geom.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const mat=new THREE.PointsMaterial({color:0xa0c8ff,size:0.18,transparent:true,opacity:0.68});
  rainSystem=new THREE.Points(geom,mat);
  rainSystem.visible=(currentWeather==='rain'||currentWeather==='thunder');
  scene.add(rainSystem);
}

function updateRain(dt){
  if(!rainSystem||!rainSystem.visible)return;
  rainSystem.position.set(P.x,P.y,P.z);
  const pos=rainSystem.geometry.attributes.position.array;
  for(let i=0;i<RAIN_COUNT;i++){
    pos[i*3+1]-=36*dt;
    if(pos[i*3+1]<-6){
      pos[i*3+1]=24;
      pos[i*3]=(Math.random()-0.5)*44;
      pos[i*3+2]=(Math.random()-0.5)*44;
    }
  }
  rainSystem.geometry.attributes.position.needsUpdate=true;
}

let worldTicks=6000;
function tickTime(dt){
  if(!autoDayNight||currentWeather!=='clear')return;
  worldTicks=(worldTicks+dt*18)%24000;
  let newTime='day';
  if(worldTicks>=11500&&worldTicks<13500)newTime='sunset';
  else if(worldTicks>=13500&&worldTicks<22500)newTime='night';
  else if(worldTicks>=22500&&worldTicks<24000)newTime='sunset';
  if(newTime!==currentTime){
    currentTime=newTime;
    updateSkybox();
  }
}

function setSky(skyId){
  currentSky=skyId;localStorage.setItem('wc_sky',skyId);
  updateSkyUIElements();
  updateSkybox();
}
function setTimeOfDay(t){
  currentTime=t;localStorage.setItem('wc_time',t);
  updateSkyUIElements();
  updateSkybox();
}
function setWeather(w){
  currentWeather=w;localStorage.setItem('wc_weather',w);
  updateSkyUIElements();
  updateSkybox();
}

function updateSkyUIElements(){
  document.querySelectorAll('.sky-btn').forEach(b=>b.classList.toggle('active',b.dataset.sky===currentSky));
  document.querySelectorAll('.time-btn').forEach(b=>b.classList.toggle('active',b.dataset.time===currentTime));
  document.querySelectorAll('.weather-btn').forEach(b=>b.classList.toggle('active',b.dataset.weather===currentWeather));
  const autoCb=document.getElementById('chk-auto-time-lobby');
  if(autoCb)autoCb.checked=autoDayNight;
  const autoCbIn=document.getElementById('chk-auto-time-ingame');
  if(autoCbIn)autoCbIn.checked=autoDayNight;
}

async function loadSkiesList(){
  try{
    const res=await fetch('/api/skies');
    availableSkies=await res.json();
  }catch(e){
    availableSkies=[
      {id:'anime',name:'☁️ Anime Clouds (Default)',desc:'Stylized vibrant anime cloudscapes'},
      {id:'realistic',name:'🌅 Realistic Atmosphere',desc:'Ultra realistic sky, sunset & rain'},
      {id:'dramatic',name:'⚡ Dramatic Skies',desc:'Photorealistic 3D celestial skybox'}
    ];
  }
  populateSkyLists();
}

function populateSkyLists(){
  ['sky-list','ingame-sky-list'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.innerHTML='';
    availableSkies.forEach(s=>{
      const btn=document.createElement('button');
      btn.className='touch-btn sky-btn';
      btn.dataset.sky=s.id;
      btn.style.cssText='width:100%;padding:10px 14px;font-size:13px;text-align:left;border-radius:8px;justify-content:flex-start';
      btn.innerHTML=`<div><strong>${s.name}</strong><div style="font-size:11px;color:var(--dim);margin-top:2px">${s.desc||''}</div></div>`;
      if(s.id===currentSky)btn.classList.add('active');
      btn.onclick=()=>setSky(s.id);
      el.appendChild(btn);
    });
  });
  updateSkyUIElements();
}

// Bind lobby & in-game sky toggles
document.addEventListener('click',e=>{
  const tb=e.target.closest('.time-btn');
  if(tb&&tb.dataset.time)setTimeOfDay(tb.dataset.time);
  const wb=e.target.closest('.weather-btn');
  if(wb&&wb.dataset.weather)setWeather(wb.dataset.weather);
});

const onAutoChange=e=>{
  autoDayNight=e.target.checked;
  localStorage.setItem('wc_auto_time',autoDayNight);
  const a1=document.getElementById('chk-auto-time-lobby');if(a1)a1.checked=autoDayNight;
  const a2=document.getElementById('chk-auto-time-ingame');if(a2)a2.checked=autoDayNight;
};
document.addEventListener('change',e=>{
  if(e.target.id==='chk-auto-time-lobby'||e.target.id==='chk-auto-time-ingame')onAutoChange(e);
});

loadSkiesList();

// ---------- Lobby ----------
$('#name').value=localStorage.getItem('wc_name')||'';
async function loadWorlds(sel){
  try{
    const l=await(await fetch('/api/worlds')).json();
    const opts=l.map(w=>`<option value="${w.id}">${w.name}</option>`).join('');
    $('#world').innerHTML=opts;
    if(document.getElementById('world-lan'))document.getElementById('world-lan').innerHTML=opts;
    if(sel){$('#world').value=sel;if(document.getElementById('world-lan'))document.getElementById('world-lan').value=sel;}
  }catch(e){console.error(e);}
}
loadWorlds();

// Upload .mcworld – works on all devices including mobile
$('#upfile').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  const bar=document.getElementById('upbar');
  const barFill=document.getElementById('upbar-fill');
  const st=document.getElementById('upst');
  const errEl=document.getElementById('uperr');
  st.textContent='Uploading…';if(bar)bar.style.display='block';if(errEl)errEl.textContent='';
  try{
    // Use XHR for upload progress on mobile
    const result=await new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();
      xhr.open('POST','/api/upload?name='+encodeURIComponent(f.name));
      xhr.upload.onprogress=ev=>{
        if(ev.lengthComputable&&barFill){
          barFill.style.width=Math.round(ev.loaded/ev.total*60)+'%';
        }
      };
      xhr.onload=()=>{
        if(barFill)barFill.style.width='80%';
        try{resolve(JSON.parse(xhr.responseText));}catch(e){reject(new Error('Bad server response'));}
      };
      xhr.onerror=()=>reject(new Error('Network error during upload'));
      xhr.send(f);
    });
    if(result.error)throw new Error(result.error);
    if(barFill)barFill.style.width='100%';
    st.textContent='✅ Converting… up to 60 seconds';
    // Poll for world to appear
    let tries=0;
    const poll=setInterval(async()=>{
      tries++;
      try{
        const wl=await(await fetch('/api/worlds')).json();
        if(wl.find(w=>w.id===result.id)){
          clearInterval(poll);
          await loadWorlds(result.id);
          st.textContent='✅ Loaded: '+(result.name||f.name);
          if(bar)bar.style.display='none';
        }
      }catch(e){}
      if(tries>30){clearInterval(poll);st.textContent='Conversion timed out';}
    },2000);
  }catch(x){
    st.textContent='';
    if(errEl)errEl.textContent='Upload failed: '+x.message;
    if(bar)bar.style.display='none';
  }
};


// ---- connect helpers ----
function connect(first, wsUrl){
  localStorage.setItem('wc_name',$('#name').value);$('#err').textContent='';
  const url = wsUrl || ((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');
  ws=new WebSocket(url);
  ws.onopen=()=>ws.send(JSON.stringify({...first,name:$('#name').value||'Player'}));
  ws.onmessage=e=>onMsg(JSON.parse(e.data));
  ws.onclose=()=>{if(S.started){alert('Disconnected from the room.');location.reload();}};
}

// Internet room: host
$('#create').onclick=()=>connect({t:'create',world:$('#world').value,publish:document.getElementById('publish')?.checked});

// Internet room: join by code
$('#join').onclick=()=>connect({t:'join',code:$('#code').value.toUpperCase().trim()});

// LAN: host
document.getElementById('create-lan').onclick=()=>{
  const w=document.getElementById('world-lan').value;
  connect({t:'create',world:w,publish:false});
  // show local IP hint after connecting
  if(typeof loadLanInfo==='function')loadLanInfo();
};

// LAN: join by IP + code
document.getElementById('join-lan').onclick=()=>{
  const hostAddr=(document.getElementById('lan-host-ip').value||'').trim();
  const code=(document.getElementById('lan-code').value||'').toUpperCase().trim();
  if(!hostAddr||!code){$('#err').textContent='Enter both the host address and room code.';return;}
  // Construct ws URL from host address
  const proto=location.protocol==='https:'?'wss://':'ws://';
  const wsUrl=proto+hostAddr+'/ws';
  connect({t:'join',code},wsUrl);
};

const send=m=>ws&&ws.readyState===1&&ws.send(JSON.stringify(m));


// ---------- Audio Pop Effect ----------
function playPopSound(){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type='sine';
    osc.frequency.setValueAtTime(650,ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1300,ctx.currentTime+0.07);
    gain.gain.setValueAtTime(0.22,ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0,ctx.currentTime+0.07);
    osc.connect(gain);gain.connect(ctx.destination);
    osc.start();osc.stop(ctx.currentTime+0.07);
  }catch(e){}
}

// ---------- Block & World Data ----------
const chunks=new Map(),cols=new Set(),pendingCols=new Set(),meshes=new Map(),editsBy=new Map(),meshQ=new Set();
let SKIP=[],SOLID=[],WATER=[],IS_DOOR=[],IS_STAIR=[],IS_SLAB=[],BLOCK_TILES=[];
const NOMESH=/(short_grass|tall_grass|^minecraft:grass$|fern|flower|poppy|dandelion|torch|sapling|vine|carpet|button|lever|rail|redstone_wire|tripwire|pressure_plate|wall_sign|standing_sign|_sign$|banner|lantern|candle|fire$|kelp|seagrass|coral_fan|mushroom$|frame|air$|light_block|structure_void|barrier|rose|tulip|orchid|allium|azure|cornflower|lily|peony|lilac|sweet_berry|wheat|carrots|potatoes|beetroots|reeds|bamboo_sapling|cobweb|web$|flower_pot|ladder)/;

function getBlockTiles(name){
  if(atlasMeta&&atlasMeta.blocks&&atlasMeta.blocks[name])return atlasMeta.blocks[name];
  const clean=name.replace('minecraft:','').toLowerCase();
  for(const [k,v] of Object.entries(atlasMeta?atlasMeta.blocks:{})){
    if(k.includes(clean)||clean.includes(k.replace('minecraft:','')))return v;
  }
  return [154,154,154]; // default stone
}

function rebuildDerived(){
  SKIP=[];SOLID=[];WATER=[];IS_DOOR=[];IS_STAIR=[];IS_SLAB=[];BLOCK_TILES=[];
  S.names.forEach((n,i)=>{
    const w=/water|lava/.test(n);
    const d=/_door$/.test(n)||n==='minecraft:door';
    const st=/stairs$/.test(n);
    const sl=/_slab$/.test(n)&&!/double/.test(n);
    SKIP[i]=NOMESH.test(n);
    WATER[i]=w;
    IS_DOOR[i]=d;
    IS_STAIR[i]=st;
    IS_SLAB[i]=sl;
    // Solid for full-cube collision: doors, stairs, slabs have specialized collision handling
    SOLID[i]=i>0&&!SKIP[i]&&!w&&!d;
    BLOCK_TILES[i]=getBlockTiles(n);
  });
  // Trigger remesh
  for(const k of chunks.keys())meshQ.add(k);
}

function getB(x,y,z){
  if(y<-64||y>319)return 0;
  const cx=x>>4,cz=z>>4,a=chunks.get(cx+','+(y>>4)+','+cz);
  if(a)return a[(x&15)*256+(z&15)*16+(y&15)];
  return cols.has(cx+','+cz)?0:-1;
}

function setB(x,y,z,id,record=true){
  const cx=x>>4,cy=y>>4,cz=z>>4,k=cx+','+cy+','+cz,i=(x&15)*256+(z&15)*16+(y&15);
  if(record){if(!editsBy.has(k))editsBy.set(k,new Map());editsBy.get(k).set(i,id);}
  let a=chunks.get(k);if(!a){if(!cols.has(cx+','+cz))return;a=new Uint16Array(4096);chunks.set(k,a);}
  a[i]=id;meshQ.add(k);
  const lx=x&15,ly=y&15,lz=z&15;
  if(lx==0)meshQ.add((cx-1)+','+cy+','+cz);if(lx==15)meshQ.add((cx+1)+','+cy+','+cz);
  if(ly==0)meshQ.add(cx+','+(cy-1)+','+cz);if(ly==15)meshQ.add(cx+','+(cy+1)+','+cz);
  if(lz==0)meshQ.add(cx+','+cy+','+(cz-1));if(lz==15)meshQ.add(cx+','+cy+','+(cz+1));
  invalidateMapChunk(cx,cz);
  // Clean up door mesh if door was replaced/removed
  unregisterDoorAt(x,y,z);
  unregisterDoorAt(x,y-1,z);
  unregisterDoorAt(x,y+1,z);
}

// ---------- Three.js Setup ----------
let renderer,scene,camera,hl,R=6;
let atlasTex,blockMat;
const FACES=[
  [[1,0,0],[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],0.8,0],   // 0: +X (Order A)
  [[-1,0,0],[[0,0,0],[0,0,1],[0,1,1],[0,1,0]],0.8,1],  // 1: -X (Order B)
  [[0,1,0],[[0,1,0],[0,1,1],[1,1,1],[1,1,0]],1.0,0],   // 2: +Y (Order A)
  [[0,-1,0],[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],0.55,1], // 3: -Y (Order B)
  [[0,0,1],[[0,0,1],[1,0,1],[1,1,1],[0,1,1]],0.7,1],   // 4: +Z (Order B)
  [[0,0,-1],[[0,0,0],[0,1,0],[1,1,0],[1,0,0]],0.7,0]   // 5: -Z (Order A)
];

function initThree(){
  renderer=new THREE.WebGLRenderer({canvas:$('#c'),antialias:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(75,1,.05,450);
  camera.rotation.order='YXZ';
  scene.add(camera);

  // Sky & Atmosphere + Rain setup
  scene.fog=new THREE.Fog(0xa8c8e8,80,R*16+100);
  initRain();
  updateSkybox();

  // Block Texture Atlas – loaded from selected pack or fallback /atlas.png
  const _atlasUrl=`/packs/${currentPack}/atlas.png`;
  atlasTex=new THREE.TextureLoader().load(_atlasUrl,
    ()=>{for(const k of chunks.keys())meshQ.add(k);},
    undefined,
    ()=>{const img=new Image();img.onload=()=>{atlasTex.image=img;atlasTex.needsUpdate=true;for(const k of chunks.keys())meshQ.add(k);};img.src='/atlas.png';}
  );
  atlasTex.magFilter=THREE.NearestFilter;
  atlasTex.minFilter=THREE.NearestFilter;

  blockMat=new THREE.MeshBasicMaterial({
    map:atlasTex,
    vertexColors:true,
    side:THREE.DoubleSide,
    alphaTest:0.1
  });

  hl=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004,1.004,1.004)),new THREE.LineBasicMaterial({color:0x000000}));
  hl.visible=false;scene.add(hl);

  initHeldHand();

  const rs=()=>{
    renderer.setSize(innerWidth,innerHeight,false);
    camera.aspect=innerWidth/innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize',rs);rs();
}

// ---------- Doors System ----------
const doorMeshes=new Map(); // key -> { group, geom, axis, closedAngle, openAngle, currentAngle }
const doorOpenStates=new Map(); // key -> boolean
const chunkDoors=new Map(); // chunkKey -> Set<key>

function getDoorBaseKey(x,y,z){
  let by=y;
  while(by>-64 && IS_DOOR[getB(x,by-1,z)]) by--;
  return x+','+by+','+z;
}

function isDoorOpen(key){
  return !!doorOpenStates.get(key);
}

function playDoorSound(isOpen){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type='triangle';
    const t=ctx.currentTime;
    if(isOpen){
      osc.frequency.setValueAtTime(260,t);
      osc.frequency.exponentialRampToValueAtTime(540,t+0.12);
    }else{
      osc.frequency.setValueAtTime(500,t);
      osc.frequency.exponentialRampToValueAtTime(180,t+0.12);
    }
    gain.gain.setValueAtTime(0.28,t);
    gain.gain.linearRampToValueAtTime(0,t+0.12);
    osc.connect(gain);gain.connect(ctx.destination);
    osc.start(t);osc.stop(t+0.12);
  }catch(e){}
}

function toggleDoor(x,y,z){
  const key=getDoorBaseKey(x,y,z);
  const [bx,by,bz]=key.split(',').map(Number);
  const nextOpen=!isDoorOpen(key);
  doorOpenStates.set(key,nextOpen);
  playDoorSound(nextOpen);
  send({t:'door',x:bx,y:by,z:bz,open:nextOpen});
}

function unregisterDoorAt(x,y,z){
  const keys = [
    x+','+y+','+z,
    x+','+(y-1)+','+z,
    x+','+(y+1)+','+z,
    getDoorBaseKey(x,y,z)
  ];
  for(const k of keys){
    const dm=doorMeshes.get(k);
    if(dm){
      scene.remove(dm.group);
      dm.geom.dispose();
      doorMeshes.delete(k);
      doorOpenStates.delete(k);
    }
  }
}

function createDoorGeometry(tileTop,tileBot){
  const g=new THREE.BufferGeometry();
  const P=[],C=[],UV=[],I=[];
  let n=0;
  function addQuad(p0,p1,p2,p3,u0,v0,u1,v1,sh){
    P.push(...p0,...p1,...p2,...p3);
    C.push(sh,sh,sh, sh,sh,sh, sh,sh,sh, sh,sh,sh);
    UV.push(u0,v0, u1,v0, u1,v1, u0,v1);
    I.push(n,n+1,n+2, n,n+2,n+3);
    n+=4;
  }
  const w=1.0,d=0.1875,z0=-d/2,z1=d/2;
  const colB=tileBot%32,rowB=Math.floor(tileBot/32);
  const ub0=colB/32,ub1=(colB+1)/32,vb1=1-rowB/32,vb0=vb1-1/32;
  const colT=tileTop%32,rowT=Math.floor(tileTop/32);
  const ut0=colT/32,ut1=(colT+1)/32,vt1=1-rowT/32,vt0=vt1-1/32;

  // Front (+Z)
  addQuad([0,0,z1],[w,0,z1],[w,1,z1],[0,1,z1],ub0,vb0,ub1,vb1,0.85);
  addQuad([0,1,z1],[w,1,z1],[w,2,z1],[0,2,z1],ut0,vt0,ut1,vt1,0.85);

  // Back (-Z)
  addQuad([w,0,z0],[0,0,z0],[0,1,z0],[w,1,z0],ub1,vb0,ub0,vb1,0.85);
  addQuad([w,1,z0],[0,1,z0],[0,2,z0],[w,2,z0],ut1,vt0,ut0,vt1,0.85);

  // Hinge side (X = 0)
  addQuad([0,0,z0],[0,0,z1],[0,2,z1],[0,2,z0],ub0,vb0,ub0+(ub1-ub0)*0.1875,vb1,0.7);
  // Outer side (X = 1)
  addQuad([w,0,z1],[w,0,z0],[w,2,z0],[w,2,z1],ub0,vb0,ub0+(ub1-ub0)*0.1875,vb1,0.7);
  // Top (Y = 2)
  addQuad([0,2,z1],[w,2,z1],[w,2,z0],[0,2,z0],ut0,vt0,ut1,vt0+(vt1-vt0)*0.1875,1.0);
  // Bottom (Y = 0)
  addQuad([0,0,z0],[w,0,z0],[w,0,z1],[0,0,z1],ub0,vb0,ub1,vb0+(vb1-vb0)*0.1875,0.55);

  g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(C,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(UV,2));
  g.setIndex(I);
  g.computeBoundingSphere();
  return g;
}

function getDoorPlacement(wx,wy,wz){
  function isWall(x,y,z){
    const b=getB(x,y,z);
    if(!b||b<0)return false;
    return !SKIP[b]&&!IS_DOOR[b]&&!WATER[b]&&b>0;
  }

  // Count wall support around the door opening
  const wW = isWall(wx-1,wy,wz) || isWall(wx-1,wy+1,wz);
  const wE = isWall(wx+1,wy,wz) || isWall(wx+1,wy+1,wz);
  const wN = isWall(wx,wy,wz-1) || isWall(wx,wy+1,wz-1);
  const wS = isWall(wx,wy,wz+1) || isWall(wx,wy+1,wz+1);

  const ewScore = (wW?1:0) + (wE?1:0);
  const nsScore = (wN?1:0) + (wS?1:0);

  let isEW = true;
  if(ewScore > nsScore){
    isEW = true;
  }else if(nsScore > ewScore){
    isEW = false;
  }else{
    // If tied, align with player facing
    const yaw = P ? P.yaw : 0;
    isEW = Math.abs(Math.cos(yaw)) >= Math.abs(Math.sin(yaw));
  }

  if(isEW){
    // Wall runs East-West: doorway opening is along X (wx to wx+1), centered at Z = wz+0.5
    let hingeWest = true;
    if(wW && !wE) hingeWest = true;
    else if(wE && !wW) hingeWest = false;
    else hingeWest = true;

    // Detect if North or South is inside the house
    const northInside = isWall(wx,wy+2,wz-1) || isWall(wx,wy,wz-1);
    const southInside = isWall(wx,wy+2,wz+1) || isWall(wx,wy,wz+1);
    const swingNorth = northInside && !southInside;

    if(hingeWest){
      // Hinge at West: (wx, wy, wz+0.5). Closed: extends +X to wx+1.
      const openAngle = swingNorth ? Math.PI/2 : -Math.PI/2;
      return { pos:[wx, wy, wz+0.5], closedAngle:0, openAngle };
    }else{
      // Hinge at East: (wx+1, wy, wz+0.5). Closed: extends -X to wx.
      const openAngle = swingNorth ? Math.PI/2 : -Math.PI/2;
      return { pos:[wx+1, wy, wz+0.5], closedAngle:Math.PI, openAngle };
    }
  }else{
    // Wall runs North-South: doorway opening is along Z (wz to wz+1), centered at X = wx+0.5
    let hingeNorth = true;
    if(wN && !wS) hingeNorth = true;
    else if(wS && !wN) hingeNorth = false;
    else hingeNorth = true;

    // Detect if West or East is inside the house
    const westInside = isWall(wx-1,wy+2,wz) || isWall(wx-1,wy,wz);
    const eastInside = isWall(wx+1,wy+2,wz) || isWall(wx+1,wy,wz);
    const swingWest = westInside && !eastInside;

    if(hingeNorth){
      // Hinge at North: (wx+0.5, wy, wz). Closed: extends +Z to wz+1.
      const openAngle = swingWest ? Math.PI : 0;
      return { pos:[wx+0.5, wy, wz], closedAngle:-Math.PI/2, openAngle };
    }else{
      // Hinge at South: (wx+0.5, wy, wz+1). Closed: extends -Z to wz.
      const openAngle = swingWest ? Math.PI : 0;
      return { pos:[wx+0.5, wy, wz+1], closedAngle:Math.PI/2, openAngle };
    }
  }
}

function registerDoor(wx,wy,wz,b,chunkKey){
  const key=wx+','+wy+','+wz;
  const p=getDoorPlacement(wx,wy,wz);

  if(doorMeshes.has(key)){
    const ex=doorMeshes.get(key);
    if(ex.pos && (ex.pos[0]!==p.pos[0] || ex.pos[1]!==p.pos[1] || ex.pos[2]!==p.pos[2])){
      scene.remove(ex.group);
      ex.geom.dispose();
      doorMeshes.delete(key);
    }else{
      return;
    }
  }

  if(!chunkDoors.has(chunkKey))chunkDoors.set(chunkKey,new Set());
  chunkDoors.get(chunkKey).add(key);

  const bTiles=BLOCK_TILES[b]||[112,112,112];
  const tileTop=bTiles[0],tileBot=bTiles[1];
  const geom=createDoorGeometry(tileTop,tileBot);
  const mesh=new THREE.Mesh(geom,blockMat);

  const group=new THREE.Group();
  group.position.set(p.pos[0], p.pos[1], p.pos[2]);

  const isOpen=isDoorOpen(key);
  const curAngle=isOpen?p.openAngle:p.closedAngle;
  group.rotation.y=curAngle;

  group.add(mesh);
  scene.add(group);

  doorMeshes.set(key,{
    group,geom,
    pos:p.pos,
    closedAngle:p.closedAngle,
    openAngle:p.openAngle,
    currentAngle:curAngle
  });
}

function updateDoorMeshes(dt){
  for(const [key,dm] of doorMeshes){
    const target=isDoorOpen(key)?dm.openAngle:dm.closedAngle;
    dm.currentAngle=THREE.MathUtils.lerp(dm.currentAngle,target,Math.min(1,dt*15));
    dm.group.rotation.y=dm.currentAngle;
  }
}

// ---------- Stairs System ----------
function getStairFacing(wx,wy,wz){
  // 1. Ascending staircase check
  if(IS_STAIR[getB(wx,wy+1,wz+1)])return 'south';
  if(IS_STAIR[getB(wx,wy+1,wz-1)])return 'north';
  if(IS_STAIR[getB(wx+1,wy+1,wz)])return 'east';
  if(IS_STAIR[getB(wx-1,wy+1,wz)])return 'west';
  // 2. Descending staircase check
  if(IS_STAIR[getB(wx,wy-1,wz-1)])return 'south';
  if(IS_STAIR[getB(wx,wy-1,wz+1)])return 'north';
  if(IS_STAIR[getB(wx-1,wy-1,wz)])return 'east';
  if(IS_STAIR[getB(wx+1,wy-1,wz)])return 'west';
  // 3. Upper solid block / floor connection
  if(SOLID[getB(wx,wy+1,wz+1)])return 'south';
  if(SOLID[getB(wx,wy+1,wz-1)])return 'north';
  if(SOLID[getB(wx+1,wy+1,wz)])return 'east';
  if(SOLID[getB(wx-1,wy+1,wz)])return 'west';
  // 4. Wall neighbors
  const sS=SOLID[getB(wx,wy,wz+1)],sN=SOLID[getB(wx,wy,wz-1)];
  const sE=SOLID[getB(wx+1,wy,wz)],sW=SOLID[getB(wx-1,wy,wz)];
  if(sS&&!sN)return 'south';
  if(sN&&!sS)return 'north';
  if(sE&&!sW)return 'east';
  if(sW&&!sE)return 'west';
  return 'south';
}

function quad(p0,p1,p2,p3,su0,sv0,su1,sv1,sh,P,C,UV,I,j){
  const f=sh*(0.94+0.06*j);
  const n=P.length/3;
  P.push(p0[0],p0[1],p0[2], p1[0],p1[1],p1[2], p2[0],p2[1],p2[2], p3[0],p3[1],p3[2]);
  C.push(f,f,f, f,f,f, f,f,f, f,f,f);
  UV.push(su0,sv0, su1,sv0, su1,sv1, su0,sv1);
  I.push(n,n+1,n+2, n,n+2,n+3);
}

function meshStair(wx,wy,wz,b,bTiles,P,C,UV,I){
  const tile=bTiles[2]||154;
  const col=tile%32,row=Math.floor(tile/32);
  const u0=col/32,u1=(col+1)/32;
  const v1=1-row/32,v0=v1-1/32;
  const uHalf=(u0+u1)*0.5,vHalf=(v0+v1)*0.5;
  const j=(((wx*73856093)^(wy*19349663)^(wz*83492791))>>>0)%100/100;
  const facing=getStairFacing(wx,wy,wz);

  // Bottom face (Y = wy, normal -Y, sh 0.55)
  if(!SOLID[getB(wx,wy-1,wz)]){
    quad([wx,wy,wz],[wx+1,wy,wz],[wx+1,wy,wz+1],[wx,wy,wz+1],u0,v0,u1,v1,0.55,P,C,UV,I,j);
  }

  if(facing==='south'){
    // Step is at Z = wz+0.5..wz+1
    // Lower tread (top of base at Y=wy+0.5, Z: wz..wz+0.5)
    quad([wx,wy+0.5,wz+0.5],[wx+1,wy+0.5,wz+0.5],[wx+1,wy+0.5,wz],[wx,wy+0.5,wz],u0,v0,u1,vHalf,1.0,P,C,UV,I,j);
    // Upper tread (top of step at Y=wy+1.0, Z: wz+0.5..wz+1)
    if(!SOLID[getB(wx,wy+1,wz)]){
      quad([wx,wy+1,wz+1],[wx+1,wy+1,wz+1],[wx+1,wy+1,wz+0.5],[wx,wy+1,wz+0.5],u0,vHalf,u1,v1,1.0,P,C,UV,I,j);
    }
    // Front lower face (at Z = wz, Y: wy..wy+0.5)
    if(!SOLID[getB(wx,wy,wz-1)]){
      quad([wx+1,wy,wz],[wx,wy,wz],[wx,wy+0.5,wz],[wx+1,wy+0.5,wz],u0,v0,u1,vHalf,0.7,P,C,UV,I,j);
    }
    // Step riser (at Z = wz+0.5, Y: wy+0.5..wy+1)
    quad([wx+1,wy+0.5,wz+0.5],[wx,wy+0.5,wz+0.5],[wx,wy+1,wz+0.5],[wx+1,wy+1,wz+0.5],u0,vHalf,u1,v1,0.7,P,C,UV,I,j);
    // Back face (at Z = wz+1, Y: wy..wy+1)
    if(!SOLID[getB(wx,wy,wz+1)]){
      quad([wx,wy,wz+1],[wx+1,wy,wz+1],[wx+1,wy+1,wz+1],[wx,wy+1,wz+1],u0,v0,u1,v1,0.7,P,C,UV,I,j);
    }
    // Left side (-X)
    if(!SOLID[getB(wx-1,wy,wz)]){
      quad([wx,wy,wz],[wx,wy,wz+1],[wx,wy+0.5,wz+1],[wx,wy+0.5,wz],u0,v0,u1,vHalf,0.8,P,C,UV,I,j);
      quad([wx,wy+0.5,wz+0.5],[wx,wy+0.5,wz+1],[wx,wy+1,wz+1],[wx,wy+1,wz+0.5],uHalf,vHalf,u1,v1,0.8,P,C,UV,I,j);
    }
    // Right side (+X)
    if(!SOLID[getB(wx+1,wy,wz)]){
      quad([wx+1,wy,wz+1],[wx+1,wy,wz],[wx+1,wy+0.5,wz],[wx+1,wy+0.5,wz+1],u0,v0,u1,vHalf,0.8,P,C,UV,I,j);
      quad([wx+1,wy+0.5,wz+1],[wx+1,wy+0.5,wz+0.5],[wx+1,wy+1,wz+0.5],[wx+1,wy+1,wz+1],uHalf,vHalf,u1,v1,0.8,P,C,UV,I,j);
    }
  }else if(facing==='north'){
    // Step is at Z = wz..wz+0.5
    // Lower tread (top of base at Y=wy+0.5, Z: wz+0.5..wz+1)
    quad([wx,wy+0.5,wz+1],[wx+1,wy+0.5,wz+1],[wx+1,wy+0.5,wz+0.5],[wx,wy+0.5,wz+0.5],u0,vHalf,u1,v1,1.0,P,C,UV,I,j);
    // Upper tread (top of step at Y=wy+1.0, Z: wz..wz+0.5)
    if(!SOLID[getB(wx,wy+1,wz)]){
      quad([wx,wy+1,wz+0.5],[wx+1,wy+1,wz+0.5],[wx+1,wy+1,wz],[wx,wy+1,wz],u0,v0,u1,vHalf,1.0,P,C,UV,I,j);
    }
    // Front lower face (at Z = wz+1, Y: wy..wy+0.5)
    if(!SOLID[getB(wx,wy,wz+1)]){
      quad([wx,wy,wz+1],[wx+1,wy,wz+1],[wx+1,wy+0.5,wz+1],[wx,wy+0.5,wz+1],u0,v0,u1,vHalf,0.7,P,C,UV,I,j);
    }
    // Step riser (at Z = wz+0.5, Y: wy+0.5..wy+1)
    quad([wx,wy+0.5,wz+0.5],[wx+1,wy+0.5,wz+0.5],[wx+1,wy+1,wz+0.5],[wx,wy+1,wz+0.5],u0,vHalf,u1,v1,0.7,P,C,UV,I,j);
    // Back face (at Z = wz, Y: wy..wy+1)
    if(!SOLID[getB(wx,wy,wz-1)]){
      quad([wx+1,wy,wz],[wx,wy,wz],[wx,wy+1,wz],[wx+1,wy+1,wz],u0,v0,u1,v1,0.7,P,C,UV,I,j);
    }
    // Left side (-X)
    if(!SOLID[getB(wx-1,wy,wz)]){
      quad([wx,wy,wz],[wx,wy,wz+1],[wx,wy+0.5,wz+1],[wx,wy+0.5,wz],u0,v0,u1,vHalf,0.8,P,C,UV,I,j);
      quad([wx,wy+0.5,wz],[wx,wy+0.5,wz+0.5],[wx,wy+1,wz+0.5],[wx,wy+1,wz],u0,vHalf,uHalf,v1,0.8,P,C,UV,I,j);
    }
    // Right side (+X)
    if(!SOLID[getB(wx+1,wy,wz)]){
      quad([wx+1,wy,wz+1],[wx+1,wy,wz],[wx+1,wy+0.5,wz],[wx+1,wy+0.5,wz+1],u0,v0,u1,vHalf,0.8,P,C,UV,I,j);
      quad([wx+1,wy+0.5,wz+0.5],[wx+1,wy+0.5,wz],[wx+1,wy+1,wz],[wx+1,wy+1,wz+0.5],u0,vHalf,uHalf,v1,0.8,P,C,UV,I,j);
    }
  }else if(facing==='east'){
    // Step is at X = wx+0.5..wx+1
    // Lower tread (top of base at Y=wy+0.5, X: wx..wx+0.5)
    quad([wx,wy+0.5,wz+1],[wx+0.5,wy+0.5,wz+1],[wx+0.5,wy+0.5,wz],[wx,wy+0.5,wz],u0,v0,uHalf,v1,1.0,P,C,UV,I,j);
    // Upper tread (top of step at Y=wy+1.0, X: wx+0.5..wx+1)
    if(!SOLID[getB(wx,wy+1,wz)]){
      quad([wx+0.5,wy+1,wz+1],[wx+1,wy+1,wz+1],[wx+1,wy+1,wz],[wx+0.5,wy+1,wz],uHalf,v0,u1,v1,1.0,P,C,UV,I,j);
    }
    // Front lower face (at X = wx, Y: wy..wy+0.5)
    if(!SOLID[getB(wx-1,wy,wz)]){
      quad([wx,wy,wz],[wx,wy,wz+1],[wx,wy+0.5,wz+1],[wx,wy+0.5,wz],u0,v0,u1,vHalf,0.8,P,C,UV,I,j);
    }
    // Step riser (at X = wx+0.5, Y: wy+0.5..wy+1)
    quad([wx+0.5,wy+0.5,wz],[wx+0.5,wy+0.5,wz+1],[wx+0.5,wy+1,wz+1],[wx+0.5,wy+1,wz],u0,vHalf,u1,v1,0.8,P,C,UV,I,j);
    // Back face (at X = wx+1, Y: wy..wy+1)
    if(!SOLID[getB(wx+1,wy,wz)]){
      quad([wx+1,wy,wz+1],[wx+1,wy,wz],[wx+1,wy+1,wz],[wx+1,wy+1,wz+1],u0,v0,u1,v1,0.8,P,C,UV,I,j);
    }
    // North side (-Z)
    if(!SOLID[getB(wx,wy,wz-1)]){
      quad([wx+1,wy,wz],[wx,wy,wz],[wx,wy+0.5,wz],[wx+1,wy+0.5,wz],u0,v0,u1,vHalf,0.7,P,C,UV,I,j);
      quad([wx+1,wy+0.5,wz],[wx+0.5,wy+0.5,wz],[wx+0.5,wy+1,wz],[wx+1,wy+1,wz],uHalf,vHalf,u1,v1,0.7,P,C,UV,I,j);
    }
    // South side (+Z)
    if(!SOLID[getB(wx,wy,wz+1)]){
      quad([wx,wy,wz+1],[wx+1,wy,wz+1],[wx+1,wy+0.5,wz+1],[wx,wy+0.5,wz+1],u0,v0,u1,vHalf,0.7,P,C,UV,I,j);
      quad([wx+0.5,wy+0.5,wz+1],[wx+1,wy+0.5,wz+1],[wx+1,wy+1,wz+1],[wx+0.5,wy+1,wz+1],uHalf,vHalf,u1,v1,0.7,P,C,UV,I,j);
    }
  }else{ // 'west'
    // Step is at X = wx..wx+0.5
    // Lower tread (top of base at Y=wy+0.5, X: wx+0.5..wx+1)
    quad([wx+0.5,wy+0.5,wz+1],[wx+1,wy+0.5,wz+1],[wx+1,wy+0.5,wz],[wx+0.5,wy+0.5,wz],uHalf,v0,u1,v1,1.0,P,C,UV,I,j);
    // Upper tread (top of step at Y=wy+1.0, X: wx..wx+0.5)
    if(!SOLID[getB(wx,wy+1,wz)]){
      quad([wx,wy+1,wz+1],[wx+0.5,wy+1,wz+1],[wx+0.5,wy+1,wz],[wx,wy+1,wz],u0,v0,uHalf,v1,1.0,P,C,UV,I,j);
    }
    // Front lower face (at X = wx+1, Y: wy..wy+0.5)
    if(!SOLID[getB(wx+1,wy,wz)]){
      quad([wx+1,wy,wz+1],[wx+1,wy,wz],[wx+1,wy+0.5,wz],[wx+1,wy+0.5,wz+1],u0,v0,u1,vHalf,0.8,P,C,UV,I,j);
    }
    // Step riser (at X = wx+0.5, Y: wy+0.5..wy+1)
    quad([wx+0.5,wy+0.5,wz+1],[wx+0.5,wy+0.5,wz],[wx+0.5,wy+1,wz],[wx+0.5,wy+1,wz+1],u0,vHalf,u1,v1,0.8,P,C,UV,I,j);
    // Back face (at X = wx, Y: wy..wy+1)
    if(!SOLID[getB(wx-1,wy,wz)]){
      quad([wx,wy,wz],[wx,wy,wz+1],[wx,wy+1,wz+1],[wx,wy+1,wz],u0,v0,u1,v1,0.8,P,C,UV,I,j);
    }
    // North side (-Z)
    if(!SOLID[getB(wx,wy,wz-1)]){
      quad([wx+1,wy,wz],[wx,wy,wz],[wx,wy+0.5,wz],[wx+1,wy+0.5,wz],u0,v0,u1,vHalf,0.7,P,C,UV,I,j);
      quad([wx+0.5,wy+0.5,wz],[wx,wy+0.5,wz],[wx,wy+1,wz],[wx+0.5,wy+1,wz],u0,vHalf,uHalf,v1,0.7,P,C,UV,I,j);
    }
    // South side (+Z)
    if(!SOLID[getB(wx,wy,wz+1)]){
      quad([wx,wy,wz+1],[wx+1,wy,wz+1],[wx+1,wy+0.5,wz+1],[wx,wy+0.5,wz+1],u0,v0,u1,vHalf,0.7,P,C,UV,I,j);
      quad([wx,wy+0.5,wz+1],[wx+0.5,wy+0.5,wz+1],[wx+0.5,wy+1,wz+1],[wx,wy+1,wz+1],u0,vHalf,uHalf,v1,0.7,P,C,UV,I,j);
    }
  }
}

function meshSlab(wx,wy,wz,b,bTiles,P,C,UV,I){
  const tileTop=bTiles[0], tileBot=bTiles[1], tileSide=bTiles[2];
  const j=(((wx*73856093)^(wy*19349663)^(wz*83492791))>>>0)%100/100;

  // Top face (Y = wy + 0.5, sh 1.0)
  if(!SOLID[getB(wx,wy+1,wz)]){
    const col=tileTop%32,row=Math.floor(tileTop/32);
    const u0=col/32,u1=(col+1)/32,v1=1-row/32,v0=v1-1/32;
    quad([wx,wy+0.5,wz],[wx,wy+0.5,wz+1],[wx+1,wy+0.5,wz+1],[wx+1,wy+0.5,wz],u0,v0,u1,v1,1.0,P,C,UV,I,j);
  }
  // Bottom face (Y = wy, sh 0.55)
  if(!SOLID[getB(wx,wy-1,wz)]){
    const col=tileBot%32,row=Math.floor(tileBot/32);
    const u0=col/32,u1=(col+1)/32,v1=1-row/32,v0=v1-1/32;
    quad([wx,wy,wz],[wx+1,wy,wz],[wx+1,wy,wz+1],[wx,wy,wz+1],u0,v0,u1,v1,0.55,P,C,UV,I,j);
  }
  // 4 side faces (height: wy to wy+0.5)
  const col=tileSide%32,row=Math.floor(tileSide/32);
  const u0=col/32,u1=(col+1)/32,v1=1-row/32,v0=v1-1/32;
  const vHalf=(v0+v1)*0.5;

  // North (-Z)
  if(!SOLID[getB(wx,wy,wz-1)]){
    quad([wx+1,wy,wz],[wx,wy,wz],[wx,wy+0.5,wz],[wx+1,wy+0.5,wz],u0,v0,u1,vHalf,0.7,P,C,UV,I,j);
  }
  // South (+Z)
  if(!SOLID[getB(wx,wy,wz+1)]){
    quad([wx,wy,wz+1],[wx+1,wy,wz+1],[wx+1,wy+0.5,wz+1],[wx,wy+0.5,wz+1],u0,v0,u1,vHalf,0.7,P,C,UV,I,j);
  }
  // West (-X)
  if(!SOLID[getB(wx-1,wy,wz)]){
    quad([wx,wy,wz],[wx,wy,wz+1],[wx,wy+0.5,wz+1],[wx,wy+0.5,wz],u0,v0,u1,vHalf,0.8,P,C,UV,I,j);
  }
  // East (+X)
  if(!SOLID[getB(wx+1,wy,wz)]){
    quad([wx+1,wy,wz+1],[wx+1,wy,wz],[wx+1,wy+0.5,wz],[wx+1,wy+0.5,wz+1],u0,v0,u1,vHalf,0.8,P,C,UV,I,j);
  }
}

function meshChunk(k){
  const a=chunks.get(k),old=meshes.get(k);
  if(old){scene.remove(old);old.geometry.dispose();meshes.delete(k);}
  if(!a)return;

  // Clean up any door meshes in this chunk that are no longer door blocks
  const doors = chunkDoors.get(k);
  if(doors){
    for(const key of Array.from(doors)){
      const [dx,dy,dz]=key.split(',').map(Number);
      if(!IS_DOOR[getB(dx,dy,dz)]){
        const dm=doorMeshes.get(key);
        if(dm){scene.remove(dm.group);dm.geom.dispose();doorMeshes.delete(key);}
        doors.delete(key);
      }
    }
  }

  const [cx,cy,cz]=k.split(',').map(Number),P=[],C=[],UV=[],I=[];let n=0;
  
  for(let x=0;x<16;x++)for(let z=0;z<16;z++)for(let y=0;y<16;y++){
    const b=a[x*256+z*16+y];
    if(!b||SKIP[b])continue;
    const wx=cx*16+x,wy=cy*16+y,wz=cz*16+z;
    const bTiles=BLOCK_TILES[b]||[154,154,154];

    // Doors: rendered as dynamic 3D opening panels
    if(IS_DOOR[b]){
      if(!IS_DOOR[getB(wx,wy-1,wz)]){
        registerDoor(wx,wy,wz,b,k);
      }
      continue;
    }

    // Stairs: rendered with authentic Minecraft L-shaped step geometry
    if(IS_STAIR[b]){
      meshStair(wx,wy,wz,b,bTiles,P,C,UV,I);
      n=P.length/3;
      continue;
    }

    // Slabs: rendered as authentic half-height blocks (height 0.5)
    if(IS_SLAB[b]){
      meshSlab(wx,wy,wz,b,bTiles,P,C,UV,I);
      n=P.length/3;
      continue;
    }

    for(let fIdx=0;fIdx<FACES.length;fIdx++){
      const [d,v,sh,order]=FACES[fIdx];
      const nb=getB(wx+d[0],wy+d[1],wz+d[2]);
      if(nb<0)continue;
      if(nb!==0&&!SKIP[nb]&&!(WATER[nb]&&!WATER[b]))continue;
      if(nb===b)continue;

      // Select tile
      let tileIdx=bTiles[2]; // default side
      if(fIdx===2)tileIdx=bTiles[0]; // top
      else if(fIdx===3)tileIdx=bTiles[1]; // bottom

      // UV calculation
      const col=tileIdx%32,row=Math.floor(tileIdx/32);
      const u0=col/32,u1=(col+1)/32;
      const v1=1-row/32,v0=v1-1/32;

      // Shading multiplier
      const j=(((wx*73856093)^(wy*19349663)^(wz*83492791))>>>0)%100/100;
      const f=sh*(0.94+0.06*j);

      for(const q of v){
        P.push(wx+q[0],wy+q[1],wz+q[2]);
        C.push(f,f,f);
      }

      if(order===0){
        UV.push(u0,v0, u0,v1, u1,v1, u1,v0);
      }else{
        UV.push(u0,v0, u1,v0, u1,v1, u0,v1);
      }

      I.push(n,n+1,n+2,n,n+2,n+3);
      n+=4;
    }
  }

  if(!n)return;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(C,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(UV,2));
  g.setIndex(I);
  g.computeBoundingSphere();
  const m=new THREE.Mesh(g,blockMat);
  scene.add(m);meshes.set(k,m);
}

async function loadCol(cx,cz){
  const k=cx+','+cz;pendingCols.add(k);
  try{
    const buf=new Uint8Array(await(await fetch(`/col/${S.world}/${cx}/${cz}`)).arrayBuffer()),dv=new DataView(buf.buffer);
    let o=0;const n=buf[o++];
    for(let i=0;i<n;i++){
      const sy=dv.getInt8(o),len=dv.getUint32(o+1,true);o+=5;const raw=buf.slice(o,o+len);o+=len;
      const ab=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
      chunks.set(cx+','+sy+','+cz,new Uint16Array(ab));
    }
    cols.add(k);
    for(let sy=-4;sy<20;sy++){
      const ck=cx+','+sy+','+cz,e=editsBy.get(ck);
      if(e){let a=chunks.get(ck);if(!a){a=new Uint16Array(4096);chunks.set(ck,a);}for(const [i,id] of e)a[i]=id;}
    }
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)if(cols.has((cx+dx)+','+(cz+dz)))for(let sy=-4;sy<20;sy++){
      const ck=(cx+dx)+','+sy+','+(cz+dz);if(chunks.has(ck))meshQ.add(ck);
    }
  }catch(e){console.error(e);}finally{pendingCols.delete(k);}
}

function streamWorld(px,pz){
  const pcx=Math.floor(px/16),pcz=Math.floor(pz/16);
  if(pendingCols.size<14){
    const want=[];
    for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
      const d=dx*dx+dz*dz;
      if(d<=R*R){
        const k=(pcx+dx)+','+(pcz+dz);
        if(!cols.has(k)&&!pendingCols.has(k))want.push([d,pcx+dx,pcz+dz]);
      }
    }
    want.sort((a,b)=>a[0]-b[0]);
    for(const w of want.slice(0,14-pendingCols.size))loadCol(w[1],w[2]);
  }
  const t0=performance.now();
  for(const k of meshQ){
    meshQ.delete(k);meshChunk(k);
    if(performance.now()-t0>14)break;
  }
}

setInterval(()=>{
  if(!S.started)return;
  const pcx=Math.floor(P.x/16),pcz=Math.floor(P.z/16);
  for(const k of [...cols]){
    const [x,z]=k.split(',').map(Number);
    if(Math.abs(x-pcx)>R+2||Math.abs(z-pcz)>R+2){
      cols.delete(k);chunkMapTiles.delete(k);
      for(let sy=-4;sy<20;sy++){
        const ck=x+','+sy+','+z;chunks.delete(ck);
        const m=meshes.get(ck);if(m){scene.remove(m);m.geometry.dispose();meshes.delete(ck);}
        const dKeys=chunkDoors.get(ck);
        if(dKeys){
          for(const dk of dKeys){
            const dm=doorMeshes.get(dk);
            if(dm){scene.remove(dm.group);dm.geom.dispose();doorMeshes.delete(dk);}
          }
          chunkDoors.delete(ck);
        }
      }
    }
  }
},1500);

// ---------- Player & Physics ----------
const P={x:0,y:100,z:0,vx:0,vy:0,vz:0,yaw:0,pitch:0,ground:false,fly:false};
const K={};let lastSpace=0,slot=0;

const solidAt=(x,y,z)=>{
  const b=getB(Math.floor(x),Math.floor(y),Math.floor(z));
  if(b<0)return y<=-60;
  if(!b||SKIP[b]||WATER[b])return false;
  if(IS_DOOR[b])return !isDoorOpen(getDoorBaseKey(Math.floor(x),Math.floor(y),Math.floor(z)));
  return SOLID[b];
};

function hits(px,py,pz){
  const pMinX=px-.3,pMaxX=px+.3;
  const pMinY=py,   pMaxY=py+1.79;
  const pMinZ=pz-.3,pMaxZ=pz+.3;

  for(let x=Math.floor(pMinX);x<=Math.floor(pMaxX);x++)
    for(let y=Math.floor(pMinY);y<=Math.floor(pMaxY);y++)
      for(let z=Math.floor(pMinZ);z<=Math.floor(pMaxZ);z++){
        const b=getB(x,y,z);
        if(b<0){if(y<=-60)return true;continue;}
        if(!b||SKIP[b]||WATER[b])continue;

        if(IS_DOOR[b]){
          const dKey=getDoorBaseKey(x,y,z);
          if(!isDoorOpen(dKey))return true;
          continue;
        }

        if(IS_STAIR[b]){
          if(pMinY<y+0.5&&pMaxY>y)return true;
          if(pMinY<y+1.0&&pMaxY>y+0.5){
            const facing=getStairFacing(x,y,z);
            let sMinX=x,sMaxX=x+1,sMinZ=z,sMaxZ=z+1;
            if(facing==='south')sMinZ=z+0.5;
            else if(facing==='north')sMaxZ=z+0.5;
            else if(facing==='east')sMinX=x+0.5;
            else if(facing==='west')sMaxX=x+0.5;
            if(pMaxX>sMinX&&pMinX<sMaxX&&pMaxZ>sMinZ&&pMinZ<sMaxZ)return true;
          }
          continue;
        }

        if(IS_SLAB[b]){
          if(pMinY<y+0.5&&pMaxY>y)return true;
          continue;
        }

        if(SOLID[b])return true;
      }
  return false;
}

function physics(dt){
  const spd=P.fly?14:K.ShiftLeft?11.2:4.3;
  const fw=(K.KeyW?1:0)-(K.KeyS?1:0),st=(K.KeyD?1:0)-(K.KeyA?1:0);
  const s=Math.sin(P.yaw),c=Math.cos(P.yaw);
  let mx=-s*fw+c*st,mz=-c*fw-s*st;
  const l=Math.hypot(mx,mz)||1;
  P.vx=mx/l*spd*(fw||st?1:0);
  P.vz=mz/l*spd*(fw||st?1:0);

  if(P.fly){P.vy=(K.Space?9:0)-(K.ShiftLeft?9:0);}
  else{P.vy=Math.max(P.vy-25*dt,-50);if(K.Space&&P.ground)P.vy=8.2;}

  P.ground=false;dt=Math.min(dt,.05);

  const mv=(ax,d)=>{
    const n={x:P.x,y:P.y,z:P.z};
    n[ax]+=d;
    if(!hits(n.x,n.y,n.z)){
      P[ax]=n[ax];
    }else{
      // Minecraft step-up mechanism for stairs and slabs
      if(ax!=='y'&&P.ground){
        if(!hits(n.x,n.y+0.52,n.z)&&!hits(P.x,P.y+0.52,P.z)){
          P[ax]=n[ax];P.y+=0.52;return;
        }
      }
      if(ax==='y'&&P.vy<0)P.ground=true;
      if(ax==='y')P.vy=0;
    }
  };

  mv('x',P.vx*dt);mv('z',P.vz*dt);mv('y',P.vy*dt);
  if(P.fly&&P.ground&&!K.Space)P.fly=false;
  if(P.y<-90)send({t:'respawn'});
}

// ---------- First-Person Held Weapon / Item Hand ----------
let heldGroup,heldMesh=null,heldItemStr='',heldSlot=-1,swingProgress=1;

function initHeldHand(){
  heldGroup=new THREE.Group();
  heldGroup.position.set(0.34,-0.32,-0.48);
  camera.add(heldGroup);
}

function applyBoxUVs(geom,tiles){
  const uvAttr=geom.attributes.uv;
  const faceTiles=[tiles[2],tiles[2],tiles[0],tiles[1],tiles[2],tiles[2]];
  for(let f=0;f<6;f++){
    const t=faceTiles[f];
    const col=t%32,row=Math.floor(t/32);
    const u0=col/32,u1=(col+1)/32;
    const v1=1-row/32,v0=v1-1/32;
    const b=f*8;
    uvAttr.array[b]=u0;uvAttr.array[b+1]=v1;
    uvAttr.array[b+2]=u1;uvAttr.array[b+3]=v1;
    uvAttr.array[b+4]=u0;uvAttr.array[b+5]=v0;
    uvAttr.array[b+6]=u1;uvAttr.array[b+7]=v0;
  }
  uvAttr.needsUpdate=true;
}

function updateHeldHand(){
  if(!heldGroup)return;
  const it=S.inv[slot];
  const curStr=it?it.id:'';
  if(curStr===heldItemStr&&slot===heldSlot)return;
  heldItemStr=curStr;heldSlot=slot;

  if(heldMesh){heldGroup.remove(heldMesh);heldMesh=null;}

  if(!it){
    // Bare player fist
    const g=new THREE.BoxGeometry(0.12,0.12,0.36);
    const m=new THREE.MeshBasicMaterial({color:0xc48756});
    heldMesh=new THREE.Mesh(g,m);
    heldMesh.position.set(0,0,0);
    heldMesh.rotation.set(-0.3,0.2,-0.1);
    heldGroup.add(heldMesh);
  }else{
    const clean=it.id.replace('minecraft:','');
    const isTool=/(sword|pickaxe|axe|shovel|hoe|bow|arrow|stick|apple)$/.test(clean);
    if(isTool){
      const tex=new THREE.TextureLoader().load('/items/'+clean+'.png');
      tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;
      const g=new THREE.PlaneGeometry(0.42,0.42);
      const m=new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide,alphaTest:0.1});
      heldMesh=new THREE.Mesh(g,m);
      heldMesh.rotation.set(-0.2,0.6,-0.4);
      heldMesh.position.set(0.04,0.06,0.06);
      heldGroup.add(heldMesh);
    }else{
      // 3D Mini Block
      const g=new THREE.BoxGeometry(0.22,0.22,0.22);
      const tiles=getBlockTiles(it.id);
      applyBoxUVs(g,tiles);
      heldMesh=new THREE.Mesh(g,blockMat);
      heldMesh.rotation.set(0.3,0.6,-0.2);
      heldGroup.add(heldMesh);
    }
  }
}

function animateHeldHand(dt,now){
  if(!heldGroup)return;
  if(mouseL&&swingProgress>=1)swingProgress=0;
  if(swingProgress<1)swingProgress=Math.min(1,swingProgress+dt*5.5);

  const isMoving=(P.vx||P.vz)&&P.ground;
  const bobX=isMoving?Math.cos(now*0.008)*0.015:0;
  const bobY=isMoving?Math.abs(Math.sin(now*0.008))*0.02:Math.sin(now*0.003)*0.005;

  heldGroup.position.set(0.34+bobX,-0.32+bobY,-0.48);

  const swing=Math.sin(swingProgress*Math.PI);
  heldGroup.rotation.x=-swing*0.7;
  heldGroup.rotation.y=swing*0.35;
  heldGroup.rotation.z=-swing*0.2;
}

// ---------- Dropped Item Entities ----------
const groundDrops=new Map(); // id -> { mesh, baseY, t, id, item }

function addGroundDrop(d){
  if(groundDrops.has(d.id))return;
  const clean=d.item.replace('minecraft:','');
  const isTool=/(sword|pickaxe|axe|shovel|hoe|bow|arrow|stick|apple)$/.test(clean);
  let mesh;
  if(isTool){
    const tex=new THREE.TextureLoader().load('/items/'+clean+'.png');
    tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;
    const g=new THREE.PlaneGeometry(0.32,0.32);
    const m=new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide,alphaTest:0.1});
    mesh=new THREE.Mesh(g,m);
  }else{
    const g=new THREE.BoxGeometry(0.26,0.26,0.26);
    const tiles=getBlockTiles(d.item);
    applyBoxUVs(g,tiles);
    mesh=new THREE.Mesh(g,blockMat);
  }
  mesh.position.set(d.p[0],d.p[1],d.p[2]);
  scene.add(mesh);
  groundDrops.set(d.id,{mesh,baseY:d.p[1],id:d.id,item:d.item,p:d.p,picking:false});
}

function removeGroundDrop(id){
  const d=groundDrops.get(id);
  if(d){scene.remove(d.mesh);d.mesh.geometry.dispose();groundDrops.delete(id);}
}

function updateGroundDrops(dt,now){
  for(const d of groundDrops.values()){
    d.mesh.rotation.y+=dt*2.5;
    d.mesh.position.y=d.baseY+Math.sin(now*0.005+d.id)*0.08;

    const dist=Math.hypot(P.x-d.mesh.position.x,(P.y+0.8)-d.mesh.position.y,P.z-d.mesh.position.z);
    if(dist<2.2){
      // Magnet pull towards player
      d.mesh.position.lerp(new THREE.Vector3(P.x,P.y+0.8,P.z),0.18);
      if(dist<0.55&&!d.picking){
        d.picking=true;
        send({t:'pickup',id:d.id});
      }
    }
  }
}

// ---------- Raycast / Mining ----------
function ray(){
  const o=[P.x,P.y+1.62,P.z],d=[-Math.sin(P.yaw)*Math.cos(P.pitch),Math.sin(P.pitch),-Math.cos(P.yaw)*Math.cos(P.pitch)];
  let p=o.map(Math.floor);const step=d.map(v=>v>0?1:-1),tD=d.map(v=>Math.abs(1/(v||1e-9))),tM=d.map((v,i)=>(v>0?p[i]+1-o[i]:o[i]-p[i])*tD[i]);
  let last=[0,0,0];
  for(let i=0;i<70;i++){
    const b=getB(p[0],p[1],p[2]);
    if(b>0&&!SKIP[b]&&!WATER[b])return{p:[...p],n:last,b};
    const a=tM[0]<tM[1]?(tM[0]<tM[2]?0:2):(tM[1]<tM[2]?1:2);
    if(tM[a]>6)break;
    p[a]+=step[a];tM[a]+=tD[a];last=[0,0,0];last[a]=-step[a];
  }
  return null;
}

function hardness(n){
  n=n.replace('minecraft:','');
  if(n==='bedrock'||n==='barrier')return{h:-1};
  if(/leaves/.test(n))return{h:.2};if(/glass|ice$/.test(n))return{h:.3};
  if(/dirt|grass_block|podzol|mycelium|farmland|sand$|gravel|clay|snow|mud|soul_/.test(n))return{h:.6,t:'shovel'};
  if(/log|planks|wood|_stem|chest|crafting_table|fence|door|bookshelf|barrel|sign|ladder|trapdoor/.test(n))return{h:2,t:'axe'};
  if(/obsidian/.test(n))return{h:50,t:'pickaxe',need:1};
  if(/^stone$|cobblestone|stone_brick|deepslate|_ore|brick|concrete$|terracotta|andesite|granite|diorite|furnace|basalt|blackstone|prismarine|sandstone|quartz|copper|purpur|netherrack|end_stone/.test(n))return{h:2,t:'pickaxe',need:1};
  if(/wool/.test(n))return{h:.8};return{h:1};
}

let mine=null,mouseL=false;
function breakTime(n){
  if(S.creative)return .12;
  const h=hardness(n);if(h.h<0)return 1e9;
  const it=S.inv[slot],m=/(wooden|stone|iron|golden|diamond|netherite)_(pickaxe|axe|shovel|sword)$/.exec(it&&it.id||'');
  const mult={wooden:2,stone:4,iron:6,golden:12,diamond:8,netherite:9}[m?m[1]:'']||1;
  const good=m&&m[2]===h.t;
  if(h.need&&!good)return h.h*5;
  return good?h.h*1.5/mult:h.h*1.5;
}

function mining(dt){
  const t=ray();hl.visible=!!t;if(t){hl.position.set(t.p[0]+.5,t.p[1]+.5,t.p[2]+.5);}
  if(!mouseL||!t||ui){mine=null;$('#brk').style.display='none';return;}
  const k=t.p.join(',');if(!mine||mine.k!==k)mine={k,t:0};mine.t+=dt;
  const need=breakTime(S.names[t.b]);
  $('#brk').style.display=need<.3?'none':'block';
  $('#brk i').style.width=Math.min(100,mine.t/need*100)+'%';
  if(mine.t>=need){send({t:'break',x:t.p[0],y:t.p[1],z:t.p[2],slot});mine={k,t:-.25};}
}

// ---------- Other Players ----------
const others=new Map();
function label(text){
  const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');
  g.font='700 32px sans-serif';g.textAlign='center';g.fillStyle='#0008';g.fillRect(0,8,256,48);g.fillStyle='#fff';g.fillText(text,128,44);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));
  s.scale.set(1.6,.4,1);s.position.y=2.2;return s;
}

function syncPlayers(list){
  S.players=new Map(list.map(p=>[p.id,p]));
  for(const p of list){
    if(p.id===S.me||others.has(p.id))continue;
    const g=new THREE.Group(),h=(p.id*67)%360;
    const body=new THREE.Mesh(new THREE.BoxGeometry(.6,1.8,.6),new THREE.MeshBasicMaterial({color:new THREE.Color(`hsl(${h},55%,50%)`)}));
    body.position.y=.9;g.add(body,label(p.name));
    g.position.set(...p.p);g.userData.t=p.p.slice();scene.add(g);others.set(p.id,g);
  }
  for(const [id,g] of others)if(!S.players.has(id)){scene.remove(g);others.delete(id);}
  $('#pcount').textContent=list.length+' player'+(list.length>1?'s':'');renderHost();
}

// ---------- UI & Icons ----------
const short=id=>id.replace('minecraft:','').replace(/_/g,' ');

function iconUrlFor(id){
  const clean=id.replace('minecraft:','').toLowerCase();
  const isTool=/(sword|pickaxe|axe|shovel|hoe|bow|arrow|stick|apple|door)$/.test(clean);
  if(isTool)return '/items/'+clean+'.png';
  if(atlasMeta&&atlasMeta.blocks&&atlasMeta.blocks[id]){
    const tileIdx=atlasMeta.blocks[id][2];
    const texName=REV_TEX[tileIdx];
    if(texName)return '/blocks/'+texName+'.png';
  }
  return '/blocks/'+clean+'.png';
}

function slotEl(s,area,i,extra=''){
  const d=document.createElement('div');
  d.className='slot '+extra;d.dataset.area=area;d.dataset.i=i;
  if(s){
    d.title=short(s.id);
    const url=iconUrlFor(s.id);
    d.innerHTML=`<img src="${url}" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><span style="display:none">${short(s.id).split(' ').map(w=>w.slice(0,4)).join(' ')}</span>${s.n>1?`<b>${s.n}</b>`:''}`;
  }
  return d;
}

function renderUI(){
  const hb=$('#hotbar');hb.innerHTML='';
  for(let i=0;i<9;i++){const e=slotEl(S.inv[i],'inv',i,i===slot?'sel':'');hb.append(e);}
  const inv=$('#inv');inv.innerHTML='';
  for(let r=0;r<4;r++){
    const row=document.createElement('div');row.className='row';if(r===3)row.style.marginTop='10px';
    for(let c=0;c<9;c++){const i=r===3?c:9+r*9+c;row.append(slotEl(S.inv[i],'inv',i));}
    inv.append(row);
  }
  const cr=$('#craft');cr.innerHTML='';S.craft.forEach((s,i)=>cr.append(slotEl(s,'craft',i)));
  $('#out').innerHTML='';$('#out').append(slotEl(S.out,'out',0));
  const ch=$('#chest');ch.innerHTML='';
  if(S.chest)for(let r=0;r<3;r++){
    const row=document.createElement('div');row.className='row';
    for(let c=0;c<9;c++)row.append(slotEl(S.chest[r*9+c],'chest',r*9+c));
    ch.append(row);
  }
  $('#chestbox').style.display=S.chest?'block':'none';
  $('#craftbox').style.display=S.chest?'none':'flex';
  $('#creative').style.display=S.creative?'block':'none';
  const cu=$('#cursor');cu.style.display=S.cursor?'block':'none';cu.innerHTML='';
  if(S.cursor)cu.append(slotEl(S.cursor,'x',0));
  updateHeldHand();
}

function renderPalette(){
  const q=$('#palq').value.toLowerCase();
  const allWeapons=['diamond','netherite','iron','golden','stone','wooden'].flatMap(m=>['sword','pickaxe','axe','shovel'].map(t=>`minecraft:${m}_${t}`));
  const doors=['minecraft:oak_door','minecraft:spruce_door','minecraft:dark_oak_door','minecraft:iron_door','minecraft:jungle_door'];
  const stairs=['minecraft:oak_stairs','minecraft:spruce_stairs','minecraft:brick_stairs','minecraft:stone_stairs','minecraft:stone_brick_stairs','minecraft:sandstone_stairs'];
  const essentials=['minecraft:stick','minecraft:bow','minecraft:arrow','minecraft:apple','minecraft:chest','minecraft:crafting_table','minecraft:furnace','minecraft:glass','minecraft:bricks','minecraft:stone_bricks','minecraft:oak_planks','minecraft:spruce_planks','minecraft:cobblestone'];
  const items=[...new Set([...allWeapons,...doors,...stairs,...essentials,...S.names])]
    .filter(n=>n!=='minecraft:air'&&n.includes(q)&&!NOMESH.test(n)).slice(0,200);
  const p=$('#pal');p.innerHTML='';
  for(const n of items){
    const e=slotEl({id:n,n:1},'pal',0);
    e.onclick=()=>send({t:'give',id:n});
    p.append(e);
  }
}
$('#palq').oninput=renderPalette;$('#trash').onclick=()=>send({t:'trash'});

document.addEventListener('click',e=>{
  const s=e.target.closest('.slot');
  if(s&&s.dataset.area&&!['pal','x'].includes(s.dataset.area)&&ui&&ui!=='host')
    send({t:'click',area:s.dataset.area,i:+s.dataset.i});
});
addEventListener('mousemove',e=>{
  const c=$('#cursor');c.style.left=e.clientX-24+'px';c.style.top=e.clientY-24+'px';
});

function renderHost(){
  if(!S.host)return;$('#pls').innerHTML='';
  for(const p of S.players.values()){
    const d=document.createElement('div');d.className='pl';
    d.innerHTML=`<span>${p.name}${p.host?' (host)':''}</span>`;
    const b=document.createElement('span');
    const cb=document.createElement('button');cb.textContent=p.creative?'Creative':'Survival';
    cb.onclick=()=>send({t:'setCreative',id:p.id,on:!p.creative});b.append(cb);
    if(!p.host){
      const k=document.createElement('button');k.textContent='Kick';k.style.marginLeft='6px';
      k.onclick=()=>send({t:'kick',id:p.id});b.append(k);
    }
    d.append(b);$('#pls').append(d);
  }
  $('#allc').checked=S.allCreative;
}
$('#allc').onchange=e=>{S.allCreative=e.target.checked;send({t:'allCreative',on:e.target.checked});};

function openUI(name){
  ui=name;try{document.exitPointerLock();}catch(e){}
  $('#invp').style.display=(name==='inv'||name==='chest')?'block':'none';
  $('#hostp').style.display=name==='host'?'block':'none';
  if($('#skyp'))$('#skyp').style.display=name==='sky'?'block':'none';
  if($('#mapp'))$('#mapp').style.display=name==='map'?'block':'none';
  if($('#chatbox'))$('#chatbox').style.display=name==='chat'?'block':'none';
  if(name==='chat')$('#chatin').focus();
  if(name==='inv')renderPalette();
  if(name==='sky')populateSkyLists();
  if(name==='map')onOpenMap();
}
function closeUI(){
  if(ui==='inv'||ui==='chest'){send({t:'closeInv'});if(S.chest)send({t:'closeChest'});}
  ui=null;openUIHide();
}
function openUIHide(){
  $('#invp').style.display=$('#hostp').style.display='none';
  if($('#skyp'))$('#skyp').style.display='none';
  if($('#mapp'))$('#mapp').style.display='none';
  if($('#chatbox'))$('#chatbox').style.display='none';
  $('#chatin').blur();
  if(!document.body.classList.contains('touch-enabled')){
    try{$('#c').requestPointerLock();}catch(e){}
  }
}
function submitChat(){
  const t=$('#chatin').value.trim();
  if(t){
    // Chat commands for time, weather and sky
    if(t==='/time day'||t==='/day'){setTimeOfDay('day');chatLine('System','Time set to Day');}
    else if(t==='/time sunset'||t==='/sunset'){setTimeOfDay('sunset');chatLine('System','Time set to Sunset');}
    else if(t==='/time night'||t==='/night'){setTimeOfDay('night');chatLine('System','Time set to Night');}
    else if(t==='/weather clear'||t==='/clear'){setWeather('clear');chatLine('System','Weather set to Clear');}
    else if(t==='/weather rain'||t==='/rain'){setWeather('rain');chatLine('System','Weather set to Rain');}
    else if(t==='/weather thunder'||t==='/thunder'){setWeather('thunder');chatLine('System','Weather set to Thunderstorm');}
    else if(t==='/sky anime'){setSky('anime');chatLine('System','Atmosphere changed to Anime Clouds');}
    else if(t==='/sky realistic'){setSky('realistic');chatLine('System','Atmosphere changed to Realistic Atmosphere');}
    else if(t==='/sky dramatic'){setSky('dramatic');chatLine('System','Atmosphere changed to Dramatic Skies');}
    else send({t:'chat',text:t});
  }
  $('#chatin').value='';closeUI();
}
if($('#btn-sky-ui'))$('#btn-sky-ui').onclick=()=>openUI('sky');
if($('#chatsend'))$('#chatsend').onclick=submitChat;
if($('#chatclose'))$('#chatclose').onclick=closeUI;

$('#rc').onclick=()=>navigator.clipboard&&navigator.clipboard.writeText(S.code);
function modeText(){$('#mode').textContent=S.creative?'Creative mode':'Survival mode';}
function chatLine(name,text){
  const d=document.createElement('div');d.textContent=name+': '+text;
  $('#chatlog').append(d);setTimeout(()=>d.remove(),12000);
}

// ---------- Input ----------
addEventListener('keydown',e=>{
  if(!S.started)return;
  if(ui==='chat'){
    if(e.code==='Enter'){submitChat();return;}
    else if(e.code==='Escape')closeUI();return;
  }
  if(e.code==='Escape'){if(ui)closeUI();return;}
  if(e.code==='KeyE'){if(ui==='inv'||ui==='chest')closeUI();else if(!ui)openUI('inv');e.preventDefault();return;}
  if(e.code==='KeyK'){if(ui==='sky')closeUI();else if(!ui)openUI('sky');e.preventDefault();return;}
  if(e.code==='KeyM'){if(ui==='map')closeUI();else if(!ui)openUI('map');e.preventDefault();return;}
  if(ui==='map'&&e.code==='KeyT'){teleportToMarked();e.preventDefault();return;}
  if(e.code==='Tab'){e.preventDefault();if(S.host){ui==='host'?closeUI():(!ui&&openUI('host'),renderHost());}return;}
  if(ui)return;

  if(e.code==='KeyQ'){send({t:'dropHeld',slot});return;} // Drop held item
  if(e.code==='KeyT'||e.code==='Slash'){e.preventDefault();openUI('chat');if(e.code==='Slash')$('#chatin').value='/';return;}
  if(e.code==='KeyR')send({t:'respawn'});
  if(e.code==='Space'&&!K.Space){
    const now=performance.now();
    if(S.creative&&now-lastSpace<300){P.fly=!P.fly;P.vy=0;}
    lastSpace=now;
  }
  if(/Digit[1-9]/.test(e.code)){slot=+e.code.slice(5)-1;renderUI();}
  K[e.code]=true;
});
addEventListener('keyup',e=>{K[e.code]=false;});
addEventListener('wheel',e=>{if(ui||!S.started)return;slot=(slot+(e.deltaY>0?1:8))%9;renderUI();});

// Direct touch/click on hotbar slots
document.addEventListener('pointerdown',e=>{
  const s=e.target.closest('#hotbar .slot');
  if(s&&!ui&&S.started){
    const i=+s.dataset.i;
    if(!isNaN(i)&&i>=0&&i<9){slot=i;renderUI();}
  }
});

addEventListener('mousemove',e=>{
  if(document.pointerLockElement===$('#c')){
    P.yaw-=e.movementX*.0022;
    P.pitch=Math.max(-1.55,Math.min(1.55,P.pitch-e.movementY*.0022));
  }
});
$('#c').addEventListener('click',()=>{
  if(!ui&&!document.body.classList.contains('touch-enabled')){
    try{$('#c').requestPointerLock();}catch(e){}
  }
});

addEventListener('mousedown',e=>{
  if(!S.started||ui||(!document.body.classList.contains('touch-enabled')&&document.pointerLockElement!==$('#c')))return;
  if(e.button===0){
    const t=ray();
    if(t&&IS_DOOR[t.b]&&!K.ShiftLeft){
      toggleDoor(t.p[0],t.p[1],t.p[2]);
      return;
    }
    mouseL=true;
  }
  if(e.button===2){
    const t=ray();if(!t)return;
    if(IS_DOOR[t.b]){
      toggleDoor(t.p[0],t.p[1],t.p[2]);
      return;
    }
    const blockName=S.names[t.b];
    if(blockName==='minecraft:chest'&&!K.ShiftLeft){send({t:'openChest',x:t.p[0],y:t.p[1],z:t.p[2]});return;}
    const it=S.inv[slot];
    if(it)send({t:'place',x:t.p[0]+t.n[0],y:t.p[1]+t.n[1],z:t.p[2]+t.n[2],slot});
  }
  if(e.button===1){
    e.preventDefault();const t=ray();
    if(t&&S.creative){const n=S.names[t.b];send({t:'give',id:n});}
  }
});
addEventListener('mouseup',e=>{if(e.button===0)mouseL=false;});
addEventListener('contextmenu',e=>e.preventDefault());

// ---------- Mobile Touch Controls ----------
const isTouchDevice=('ontouchstart' in window)||navigator.maxTouchPoints>0||/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||window.innerWidth<=900;
if(isTouchDevice)document.body.classList.add('touch-enabled');

// Touch-to-Look: Drag on game screen to rotate camera
let lookTouchId=null,lastLookX=0,lastLookY=0;
window.addEventListener('touchstart',e=>{
  if(!S.started||ui)return;
  for(let i=0;i<e.changedTouches.length;i++){
    const t=e.changedTouches[i];
    const el=document.elementFromPoint(t.clientX,t.clientY);
    if(el&&el.closest('#touch-dpad,#touch-actions,#touch-top-bar,#hotbar,.panel,input,button,select')){
      continue;
    }
    if(lookTouchId===null){
      lookTouchId=t.identifier;
      lastLookX=t.clientX;
      lastLookY=t.clientY;
    }
  }
},{passive:false});

window.addEventListener('touchmove',e=>{
  if(!S.started||ui)return;
  for(let i=0;i<e.changedTouches.length;i++){
    const t=e.changedTouches[i];
    if(t.identifier===lookTouchId){
      const dx=t.clientX-lastLookX;
      const dy=t.clientY-lastLookY;
      P.yaw-=dx*0.0055;
      P.pitch=Math.max(-1.55,Math.min(1.55,P.pitch-dy*0.0055));
      lastLookX=t.clientX;
      lastLookY=t.clientY;
      e.preventDefault();
    }
  }
},{passive:false});

const endLookTouch=e=>{
  for(let i=0;i<e.changedTouches.length;i++){
    if(e.changedTouches[i].identifier===lookTouchId)lookTouchId=null;
  }
};
window.addEventListener('touchend',endLookTouch,{passive:false});
window.addEventListener('touchcancel',endLookTouch,{passive:false});

// D-Pad Touch Handlers (Multi-touch compatible)
function bindDpadBtn(btnId,keyCode){
  const el=document.getElementById(btnId);
  if(!el)return;
  const onStart=e=>{e.preventDefault();e.stopPropagation();K[keyCode]=true;el.classList.add('pressed');};
  const onEnd=e=>{e.preventDefault();e.stopPropagation();K[keyCode]=false;el.classList.remove('pressed');};
  el.addEventListener('touchstart',onStart,{passive:false});
  el.addEventListener('touchend',onEnd,{passive:false});
  el.addEventListener('touchcancel',onEnd,{passive:false});
  el.addEventListener('mousedown',onStart);
  el.addEventListener('mouseup',onEnd);
  el.addEventListener('mouseleave',onEnd);
}
bindDpadBtn('btn-up','KeyW');
bindDpadBtn('btn-down','KeyS');
bindDpadBtn('btn-left','KeyA');
bindDpadBtn('btn-right','KeyD');

// D-pad sliding support
const dpadEl=document.getElementById('touch-dpad');
if(dpadEl){
  dpadEl.addEventListener('touchmove',e=>{
    e.preventDefault();
    for(let i=0;i<e.touches.length;i++){
      const t=e.touches[i];
      const target=document.elementFromPoint(t.clientX,t.clientY);
      const btns=[{id:'btn-up',k:'KeyW'},{id:'btn-down',k:'KeyS'},{id:'btn-left',k:'KeyA'},{id:'btn-right',k:'KeyD'}];
      btns.forEach(b=>{
        const el=document.getElementById(b.id);
        if(el){
          if(target===el){K[b.k]=true;el.classList.add('pressed');}
          else if(!target||!target.classList.contains('dpad-btn')){K[b.k]=false;el.classList.remove('pressed');}
        }
      });
    }
  },{passive:false});
}

// Sprint Toggle
let isSprinting=false;
const sprintBtn=document.getElementById('btn-sprint');
if(sprintBtn){
  const toggleSprint=e=>{
    e.preventDefault();e.stopPropagation();
    isSprinting=!isSprinting;
    K.ShiftLeft=isSprinting;
    if(isSprinting)sprintBtn.classList.add('active');
    else sprintBtn.classList.remove('active');
  };
  sprintBtn.addEventListener('touchstart',toggleSprint,{passive:false});
  sprintBtn.addEventListener('click',toggleSprint);
}

// Jump Button (with double-tap fly support in creative)
const jumpBtn=document.getElementById('btn-jump');
if(jumpBtn){
  const startJump=e=>{
    e.preventDefault();e.stopPropagation();
    jumpBtn.classList.add('pressed');
    const now=performance.now();
    if(S.creative&&now-lastSpace<350){P.fly=!P.fly;P.vy=0;}
    lastSpace=now;
    K.Space=true;
  };
  const stopJump=e=>{
    e.preventDefault();e.stopPropagation();
    jumpBtn.classList.remove('pressed');
    K.Space=false;
  };
  jumpBtn.addEventListener('touchstart',startJump,{passive:false});
  jumpBtn.addEventListener('touchend',stopJump,{passive:false});
  jumpBtn.addEventListener('touchcancel',stopJump,{passive:false});
  jumpBtn.addEventListener('mousedown',startJump);
  jumpBtn.addEventListener('mouseup',stopJump);
  jumpBtn.addEventListener('mouseleave',stopJump);
}

// Mine Button (hold to mine, door toggle check)
const mineBtn=document.getElementById('btn-mine');
if(mineBtn){
  const startMine=e=>{
    e.preventDefault();e.stopPropagation();
    mineBtn.classList.add('pressed');
    const t=ray();
    if(t&&IS_DOOR[t.b]&&!K.ShiftLeft){
      toggleDoor(t.p[0],t.p[1],t.p[2]);
      return;
    }
    mouseL=true;
  };
  const stopMine=e=>{
    e.preventDefault();e.stopPropagation();
    mineBtn.classList.remove('pressed');
    mouseL=false;
  };
  mineBtn.addEventListener('touchstart',startMine,{passive:false});
  mineBtn.addEventListener('touchend',stopMine,{passive:false});
  mineBtn.addEventListener('touchcancel',stopMine,{passive:false});
  mineBtn.addEventListener('mousedown',startMine);
  mineBtn.addEventListener('mouseup',stopMine);
  mineBtn.addEventListener('mouseleave',stopMine);
}

// Place Button
const placeBtn=document.getElementById('btn-place');
if(placeBtn){
  const doPlace=e=>{
    e.preventDefault();e.stopPropagation();
    placeBtn.classList.add('pressed');
    setTimeout(()=>placeBtn.classList.remove('pressed'),120);
    const t=ray();
    if(!t)return;
    if(IS_DOOR[t.b]){
      toggleDoor(t.p[0],t.p[1],t.p[2]);
      return;
    }
    const blockName=S.names[t.b];
    if(blockName==='minecraft:chest'&&!K.ShiftLeft){
      send({t:'openChest',x:t.p[0],y:t.p[1],z:t.p[2]});
      return;
    }
    const it=S.inv[slot];
    if(it)send({t:'place',x:t.p[0]+t.n[0],y:t.p[1]+t.n[1],z:t.p[2]+t.n[2],slot});
  };
  placeBtn.addEventListener('touchstart',doPlace,{passive:false});
  placeBtn.addEventListener('click',doPlace);
}

// Top Bar Buttons
if($('#btn-inv'))$('#btn-inv').onclick=()=>{ui==='inv'?closeUI():openUI('inv');};
if($('#btn-map-ui'))$('#btn-map-ui').onclick=()=>{ui==='map'?closeUI():openUI('map');};
if($('#btn-top-map'))$('#btn-top-map').onclick=()=>{ui==='map'?closeUI():openUI('map');};
if($('#btn-drop'))$('#btn-drop').onclick=()=>send({t:'dropHeld',slot});
if($('#btn-chat'))$('#btn-chat').onclick=()=>openUI('chat');
if($('#btn-fly'))$('#btn-fly').onclick=()=>{if(S.creative){P.fly=!P.fly;P.vy=0;}};
if($('#btn-host-ui'))$('#btn-host-ui').onclick=()=>{if(S.host){ui==='host'?closeUI():(!ui&&openUI('host'),renderHost());}};
if($('#btn-toggle-touch'))$('#btn-toggle-touch').onclick=()=>{document.body.classList.toggle('touch-enabled');};

// ---------- Network ----------
function onMsg(m){
  switch(m.t){
    case'err':$('#err').textContent=m.msg;if(S.started){alert(m.msg);location.reload();}break;
    case'init':
      S.started=true;S.me=m.you;S.host=m.host;S.world=m.world;S.code=m.code;S.names=m.names;
      S.creative=m.creative;S.allCreative=m.allCreative;rebuildDerived();
      if(m.doors)for(const k of m.doors)doorOpenStates.set(k,true);
      for(const [k,id] of m.edits){const [x,y,z]=k.split(',').map(Number);setB(x,y,z,id);}
      P.x=m.spawn[0];P.y=m.spawn[1]+1;P.z=m.spawn[2];
      $('#lobby').style.display='none';$('#c').style.display='block';$('#hud').style.display='block';
      if($('#coords-hud'))$('#coords-hud').style.display='block';
      if($('#minimap-box'))$('#minimap-box').style.display='block';
      $('#rc').textContent=m.code;modeText();initThree();initMapEvents();
      if(m.drops)for(const d of m.drops)addGroundDrop(d);
      syncPlayers(m.players);renderUI();
      if($('#btn-fly'))$('#btn-fly').style.display=m.creative?'flex':'none';
      if($('#btn-host-ui'))$('#btn-host-ui').style.display=m.host?'flex':'none';
      if(!document.body.classList.contains('touch-enabled')){
        try{$('#c').requestPointerLock();}catch(e){}
      }
      requestAnimationFrame(loop);
      break;
    case'names':S.names=m.names;rebuildDerived();break;
    case'block':setB(m.x,m.y,m.z,m.id);break;
    case'door':{
      const dk=m.x+','+m.y+','+m.z;
      doorOpenStates.set(dk,m.open);
      playDoorSound(m.open);
      break;}
    case'inv':S.inv=m.inv;S.cursor=m.cursor;S.craft=m.craft;S.out=m.out;renderUI();break;
    case'chest':
      if(m.items){S.chest=m.items;if(ui!=='chest')openUI('chest');}
      else{S.chest=null;if(ui==='chest')closeUI();}
      renderUI();break;
    case'players':syncPlayers(m.players);break;
    case'pos':{const g=others.get(m.id);if(g){g.userData.t=m.p;g.rotation.y=m.r[0];}break;}
    case'creative':
      S.creative=m.on;if(!m.on)P.fly=false;modeText();renderUI();
      if($('#btn-fly'))$('#btn-fly').style.display=m.on?'flex':'none';
      break;
    case'respawn':P.x=m.p[0];P.y=m.p[1];P.z=m.p[2];P.vy=0;break;
    case'host':
      S.host=true;renderHost();
      if($('#btn-host-ui'))$('#btn-host-ui').style.display='flex';
      break;
    case'chat':chatLine(m.name,m.text);break;
    case'drop':addGroundDrop(m.drop);break;
    case'pickup':
      removeGroundDrop(m.id);
      if(m.player===S.me)playPopSound();
      break;
    case'rmDrop':removeGroundDrop(m.id);break;
  }
}

// ---------- Main Game Loop ----------
let last=performance.now(),tSend=0;
function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min((now-last)/1000,.1);
  last=now;
  if(!ui){physics(dt);mining(dt);}else hl.visible=false;
  updateDoorMeshes(dt);
  streamWorld(P.x,P.z);
  camera.position.set(P.x,P.y+1.62,P.z);
  camera.rotation.set(P.pitch,P.yaw,0);

  animateHeldHand(dt,now);
  updateGroundDrops(dt,now);
  updateRain(dt);
  tickTime(dt);

  updateCoordsHUD();
  updateMinimap(now);
  if(ui==='map')renderBigMap();

  for(const g of others.values())g.position.lerp(new THREE.Vector3(...g.userData.t),.25);
  if(now-tSend>100){tSend=now;send({t:'pos',p:[P.x,P.y,P.z],r:[P.yaw,P.pitch]});}
  renderer.render(scene,camera);
}

// ==================== MINIMAP & WORLD NAVIGATION SYSTEM ====================
let minimapCanvas = null, minimapCtx = null;
let bigmapCanvas = null, bigmapCtx = null;
const chunkMapTiles = new Map(); // 'cx,cz' -> { canvas, yMap }

let mapPanX = 0, mapPanZ = 0;
let mapZoom = 1.6; // pixels per block
let markedPoint = null; // { x, z }
let isMapDragging = false, dragStartX = 0, dragStartY = 0, dragStartPanX = 0, dragStartPanZ = 0;
let mapHoverX = 0, mapHoverZ = 0;

function getMapBlockColor(name) {
  if (!name || name === 'minecraft:air') return null;
  const n = name.replace('minecraft:', '').toLowerCase();
  if (n.includes('water')) return [38, 115, 235];
  if (n.includes('lava')) return [240, 85, 20];
  if (n.includes('grass_block') || n === 'grass') return [84, 155, 48];
  if (n.includes('leaves')) return [46, 110, 32];
  if (n.includes('dirt') || n.includes('path') || n.includes('farmland') || n.includes('podzol')) return [135, 95, 60];
  if (n.includes('sandstone')) return [215, 200, 145];
  if (n.includes('sand')) return [225, 215, 155];
  if (n.includes('cobble') || n.includes('stone') || n.includes('gravel') || n.includes('andesite') || n.includes('diorite')) return [125, 125, 130];
  if (n.includes('deepslate') || n.includes('bedrock') || n.includes('blackstone')) return [65, 65, 70];
  if (n.includes('plank') || n.includes('log') || n.includes('wood') || n.includes('door') || n.includes('stair') || n.includes('slab')) {
    if (n.includes('spruce') || n.includes('dark_oak')) return [80, 55, 35];
    if (n.includes('birch')) return [200, 185, 140];
    if (n.includes('acacia')) return [180, 95, 55];
    if (n.includes('jungle')) return [150, 105, 70];
    return [160, 125, 75]; // oak
  }
  if (n.includes('brick')) return [160, 70, 50];
  if (n.includes('glass')) return [180, 220, 235];
  if (n.includes('snow') || n.includes('ice')) return [235, 245, 255];
  if (n.includes('clay')) return [160, 168, 182];
  if (n.includes('terracotta')) return [155, 95, 70];
  if (n.includes('wool') || n.includes('concrete')) {
    if (n.includes('red')) return [180, 45, 45];
    if (n.includes('blue')) return [45, 75, 180];
    if (n.includes('yellow')) return [225, 205, 50];
    if (n.includes('green')) return [60, 150, 50];
    if (n.includes('white')) return [240, 240, 240];
    return [160, 160, 160];
  }
  if (n.includes('iron')) return [220, 220, 220];
  if (n.includes('gold')) return [250, 215, 60];
  if (n.includes('diamond')) return [90, 230, 225];
  if (n.includes('nether')) return [115, 35, 40];
  return [120, 120, 120];
}

function getTopBlockAt(wx, wz) {
  const cx = wx >> 4, cz = wz >> 4;
  if (!cols.has(cx + ',' + cz)) return null;
  const lx = wx & 15, lz = wz & 15;
  const colOffset = lx * 256 + lz * 16;
  let topBlock = null;
  let waterDepth = 0;
  let groundY = -64;

  for (let sy = 12; sy >= -4; sy--) {
    const a = chunks.get(cx + ',' + sy + ',' + cz);
    if (!a) continue;
    for (let ly = 15; ly >= 0; ly--) {
      const id = a[colOffset + ly];
      if (!id) continue;
      const name = S.names[id];
      if (!name || name === 'minecraft:air' || name.endsWith(':air') || name.includes('void')) continue;

      const y = (sy << 4) + ly;
      if (!topBlock) {
        topBlock = { id, name, y };
        groundY = y;
        if (!name.includes('water')) {
          return { ...topBlock, waterDepth: 0, groundY };
        }
      }
      if (name.includes('water')) {
        waterDepth++;
      } else {
        groundY = y;
        return { ...topBlock, waterDepth, groundY };
      }
    }
  }
  return topBlock ? { ...topBlock, waterDepth, groundY } : null;
}

function getBiomeAt(wx, wz) {
  const top = getTopBlockAt(wx, wz);
  if (!top) return 'Unexplored';
  const n = top.name.toLowerCase();
  if (n.includes('water')) return top.waterDepth > 5 ? 'Deep Ocean' : 'River / Lake';
  if (n.includes('sand')) return 'Desert / Coast';
  if (n.includes('snow') || n.includes('ice')) return 'Snowy Peaks';
  if (n.includes('leaves') || n.includes('wood') || n.includes('log')) return 'Forest';
  if (n.includes('stone') || n.includes('cobble') || top.y > 90) return 'Mountain';
  if (n.includes('brick') || n.includes('plank') || n.includes('door') || n.includes('glass')) return 'Settlement / House';
  return 'Plains';
}

function getChunkMapTile(cx, cz) {
  const k = cx + ',' + cz;
  if (!cols.has(k)) return null;
  let tile = chunkMapTiles.get(k);
  if (tile) return tile;

  const cvs = document.createElement('canvas');
  cvs.width = 16; cvs.height = 16;
  const ctx = cvs.getContext('2d');
  const imgData = ctx.createImageData(16, 16);
  const data = imgData.data;
  const yMap = new Int16Array(256);

  const baseX = cx * 16;
  const baseZ = cz * 16;

  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const wx = baseX + lx;
      const wz = baseZ + lz;
      const top = getTopBlockAt(wx, wz);
      const pixelIdx = (lz * 16 + lx) * 4;

      if (!top) {
        data[pixelIdx] = 10;
        data[pixelIdx + 1] = 16;
        data[pixelIdx + 2] = 22;
        data[pixelIdx + 3] = 255;
        yMap[lz * 16 + lx] = -100;
        continue;
      }

      yMap[lz * 16 + lx] = top.y;
      let rgb = getMapBlockColor(top.name) || [100, 100, 100];
      let r = rgb[0], g = rgb[1], b = rgb[2];

      if (top.name.includes('water')) {
        if (top.waterDepth > 4) { r = 18; g = 58; b = 160; }
        else if (top.waterDepth > 2) { r = 32; g = 95; b = 210; }
        else { r = 52; g = 148; b = 245; }
      }

      // Elevation relief shading
      const northTop = getTopBlockAt(wx, wz - 1);
      if (northTop) {
        const diff = top.y - northTop.y;
        if (diff > 0) {
          r = Math.min(255, r * 1.15 + 14);
          g = Math.min(255, g * 1.15 + 14);
          b = Math.min(255, b * 1.15 + 14);
        } else if (diff < 0) {
          r = Math.max(0, r * 0.85 - 10);
          g = Math.max(0, g * 0.85 - 10);
          b = Math.max(0, b * 0.85 - 10);
        }
      }

      data[pixelIdx] = r;
      data[pixelIdx + 1] = g;
      data[pixelIdx + 2] = b;
      data[pixelIdx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  tile = { canvas: cvs, yMap };
  chunkMapTiles.set(k, tile);
  return tile;
}

function invalidateMapChunk(cx, cz) {
  chunkMapTiles.delete(cx + ',' + cz);
}

let lastMinimapRender = 0;
function updateMinimap(now) {
  if (now - lastMinimapRender < 60) return;
  lastMinimapRender = now;
  if (!minimapCanvas) {
    minimapCanvas = document.getElementById('minimap-canvas');
    if (minimapCanvas) minimapCtx = minimapCanvas.getContext('2d');
  }
  if (!minimapCtx) return;

  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  const ctx = minimapCtx;
  const cx = w / 2, cy = h / 2;
  const radius = w / 2 - 3;
  const scale = 1.25;

  ctx.clearRect(0, 0, w, h);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = '#0a1016';
  ctx.fillRect(0, 0, w, h);

  const pcx = Math.floor(P.x / 16);
  const pcz = Math.floor(P.z / 16);
  const chunkRadius = 4;

  for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
    for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
      const chX = pcx + dx;
      const chZ = pcz + dz;
      const tile = getChunkMapTile(chX, chZ);
      if (!tile) continue;

      const worldX = chX * 16;
      const worldZ = chZ * 16;
      const screenX = cx + (worldX - P.x) * scale;
      const screenY = cy + (worldZ - P.z) * scale;
      const tileSize = 16 * scale;

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tile.canvas, screenX, screenY, tileSize, tileSize);
    }
  }

  // Draw other players
  for (const [id, g] of others.entries()) {
    const ox = g.position.x;
    const oz = g.position.z;
    const sx = cx + (ox - P.x) * scale;
    const sy = cy + (oz - P.z) * scale;
    if (Math.hypot(sx - cx, sy - cy) < radius - 4) {
      ctx.fillStyle = '#42a5f5';
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Draw marked destination pin (if any)
  if (markedPoint) {
    const mx = cx + (markedPoint.x - P.x) * scale;
    const my = cy + (markedPoint.z - P.z) * scale;
    const d = Math.hypot(mx - cx, my - cy);
    let px = mx, py = my;
    if (d > radius - 8) {
      px = cx + ((mx - cx) / d) * (radius - 8);
      py = cy + ((my - cy) / d) * (radius - 8);
    }
    const pulse = Math.sin(now * 0.008) * 2;
    ctx.fillStyle = '#f5c842';
    ctx.beginPath();
    ctx.arc(px, py, 4.5 + pulse * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e04030';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw player arrow in center pointing in direction P.yaw
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-P.yaw);

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#2979ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 5);
  ctx.lineTo(0, 2);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Crosshair
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
  ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
  ctx.stroke();

  ctx.restore();

  // Compass ring bezel & cardinal points
  ctx.save();
  ctx.strokeStyle = 'rgba(245,200,66,0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = 'bold 10px "Barlow Semi Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff5252';
  ctx.fillText('N', cx, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('S', cx, h - 8);
  ctx.fillText('W', 8, cy);
  ctx.fillText('E', w - 8, cy);
  ctx.restore();
}

let lastCoordsUpdate = 0;
function updateCoordsHUD() {
  const now = performance.now();
  if (now - lastCoordsUpdate < 80) return;
  lastCoordsUpdate = now;

  const xyzEl = document.getElementById('coord-xyz');
  if (!xyzEl) return;

  const bx = Math.floor(P.x);
  const by = Math.floor(P.y);
  const bz = Math.floor(P.z);
  xyzEl.textContent = `X: ${bx}, Y: ${by}, Z: ${bz}`;

  const deg = ((P.yaw * 180 / Math.PI) % 360 + 360) % 360;
  let dir = 'South (+Z)';
  if (deg >= 45 && deg < 135) dir = 'West (-X)';
  else if (deg >= 135 && deg < 225) dir = 'North (-Z)';
  else if (deg >= 225 && deg < 315) dir = 'East (+X)';

  const facingEl = document.getElementById('coord-facing');
  if (facingEl) facingEl.textContent = `Facing: ${dir}`;

  const biomeEl = document.getElementById('coord-biome');
  if (biomeEl) {
    const biome = getBiomeAt(bx, bz);
    biomeEl.textContent = `Biome: ${biome}`;
  }
}

function onOpenMap() {
  if (!bigmapCanvas) {
    bigmapCanvas = document.getElementById('bigmap-canvas');
    if (bigmapCanvas) bigmapCtx = bigmapCanvas.getContext('2d');
    initMapEvents();
  }
  mapPanX = P.x;
  mapPanZ = P.z;
  updateMarkedInfoUI();
  renderBigMap();
}

function renderBigMap() {
  if (!bigmapCanvas) {
    bigmapCanvas = document.getElementById('bigmap-canvas');
    if (bigmapCanvas) bigmapCtx = bigmapCanvas.getContext('2d');
  }
  if (!bigmapCtx) return;

  const w = bigmapCanvas.width;
  const h = bigmapCanvas.height;
  const ctx = bigmapCtx;
  const cx = w / 2;
  const cy = h / 2;

  ctx.fillStyle = '#0c1219';
  ctx.fillRect(0, 0, w, h);

  const halfVisibleBlocksX = (w / 2) / mapZoom;
  const halfVisibleBlocksZ = (h / 2) / mapZoom;
  const minChunkX = Math.floor((mapPanX - halfVisibleBlocksX) / 16);
  const maxChunkX = Math.floor((mapPanX + halfVisibleBlocksX) / 16);
  const minChunkZ = Math.floor((mapPanZ - halfVisibleBlocksZ) / 16);
  const maxChunkZ = Math.floor((mapPanZ + halfVisibleBlocksZ) / 16);

  ctx.imageSmoothingEnabled = false;

  for (let cz = minChunkZ; cz <= maxChunkZ; cz++) {
    for (let cxIdx = minChunkX; cxIdx <= maxChunkX; cxIdx++) {
      const tile = getChunkMapTile(cxIdx, cz);
      const worldX = cxIdx * 16;
      const worldZ = cz * 16;
      const screenX = cx + (worldX - mapPanX) * mapZoom;
      const screenY = cy + (worldZ - mapPanZ) * mapZoom;
      const size = 16 * mapZoom;

      if (tile) {
        ctx.drawImage(tile.canvas, screenX, screenY, size, size);
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.strokeRect(screenX, screenY, size, size);
      }
    }
  }

  // Draw subtle grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  const gridStep = 16 * mapZoom;
  const startGridX = cx + (minChunkX * 16 - mapPanX) * mapZoom;
  const startGridZ = cy + (minChunkZ * 16 - mapPanZ) * mapZoom;
  ctx.beginPath();
  for (let gx = startGridX; gx <= w; gx += gridStep) {
    ctx.moveTo(gx, 0); ctx.lineTo(gx, h);
  }
  for (let gz = startGridZ; gz <= h; gz += gridStep) {
    ctx.moveTo(0, gz); ctx.lineTo(w, gz);
  }
  ctx.stroke();

  // Draw other players
  for (const [id, g] of others.entries()) {
    const ox = g.position.x;
    const oz = g.position.z;
    const sx = cx + (ox - mapPanX) * mapZoom;
    const sy = cy + (oz - mapPanZ) * mapZoom;
    ctx.fillStyle = '#42a5f5';
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Draw current player position
  const playerScreenX = cx + (P.x - mapPanX) * mapZoom;
  const playerScreenY = cy + (P.z - mapPanZ) * mapZoom;

  ctx.save();
  ctx.translate(playerScreenX, playerScreenY);
  ctx.rotate(-P.yaw);

  ctx.fillStyle = 'rgba(58, 143, 255, 0.25)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 24 * mapZoom, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#2979ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-6, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Draw marked destination pin
  if (markedPoint) {
    const markScreenX = cx + (markedPoint.x - mapPanX) * mapZoom;
    const markScreenY = cy + (markedPoint.z - mapPanZ) * mapZoom;

    const now = performance.now();
    const ring = (now * 0.003) % 1;
    ctx.strokeStyle = `rgba(245, 200, 66, ${1 - ring})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(markScreenX, markScreenY, 6 + ring * 16, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#e53935';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(markScreenX, markScreenY - 8, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e53935';
    ctx.beginPath();
    ctx.moveTo(markScreenX - 4, markScreenY - 5);
    ctx.lineTo(markScreenX, markScreenY);
    ctx.lineTo(markScreenX + 4, markScreenY - 5);
    ctx.fill();

    ctx.fillStyle = '#f5c842';
    ctx.beginPath();
    ctx.arc(markScreenX, markScreenY - 8, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#0a1016';
    const tagText = `[${Math.round(markedPoint.x)}, ${Math.round(markedPoint.z)}]`;
    const tw = ctx.measureText(tagText).width;
    ctx.fillRect(markScreenX - tw / 2 - 4, markScreenY - 26, tw + 8, 16);
    ctx.strokeStyle = '#f5c842';
    ctx.strokeRect(markScreenX - tw / 2 - 4, markScreenY - 26, tw + 8, 16);
    ctx.fillStyle = '#f5c842';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tagText, markScreenX, markScreenY - 18);
  }

  // Center crosshair
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
  ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
  ctx.stroke();
}

let mapEventsInitialized = false;
function initMapEvents() {
  if (mapEventsInitialized || !document.getElementById('bigmap-canvas')) return;
  mapEventsInitialized = true;
  const cvs = document.getElementById('bigmap-canvas');

  let dragMoved = false;

  cvs.onmousedown = e => {
    isMapDragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = mapPanX;
    dragStartPanZ = mapPanZ;
  };

  window.addEventListener('mousemove', e => {
    if (!bigmapCanvas || ui !== 'map') return;
    const rect = cvs.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    if (clientX >= 0 && clientX <= rect.width && clientY >= 0 && clientY <= rect.height) {
      const cx = cvs.width / 2;
      const cy = cvs.height / 2;
      const scaleFactorX = cvs.width / rect.width;
      const scaleFactorY = cvs.height / rect.height;
      const canvasX = clientX * scaleFactorX;
      const canvasY = clientY * scaleFactorY;

      mapHoverX = Math.floor(mapPanX + (canvasX - cx) / mapZoom);
      mapHoverZ = Math.floor(mapPanZ + (canvasY - cy) / mapZoom);

      const top = getTopBlockAt(mapHoverX, mapHoverZ);
      const biome = getBiomeAt(mapHoverX, mapHoverZ);
      const hoverEl = document.getElementById('map-hover-coords');
      if (hoverEl) {
        let blockDesc = top ? (top.name.replace('minecraft:', '').replace(/_/g, ' ') + ` (Y: ${top.y})`) : 'Unloaded';
        hoverEl.textContent = `Cursor: X: ${mapHoverX}, Z: ${mapHoverZ} · ${biome} (${blockDesc})`;
      }
    }

    if (isMapDragging) {
      const dx = (e.clientX - dragStartX) / mapZoom;
      const dz = (e.clientY - dragStartY) / mapZoom;
      if (Math.abs(e.clientX - dragStartX) > 3 || Math.abs(e.clientY - dragStartY) > 3) {
        dragMoved = true;
      }
      mapPanX = dragStartPanX - dx;
      mapPanZ = dragStartPanZ - dz;
      renderBigMap();
    }
  });

  window.addEventListener('mouseup', e => {
    if (!isMapDragging) return;
    isMapDragging = false;
    if (!dragMoved && ui === 'map') {
      const rect = cvs.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      if (clientX >= 0 && clientX <= rect.width && clientY >= 0 && clientY <= rect.height) {
        const cx = cvs.width / 2;
        const cy = cvs.height / 2;
        const scaleFactorX = cvs.width / rect.width;
        const scaleFactorY = cvs.height / rect.height;
        const canvasX = clientX * scaleFactorX;
        const canvasY = clientY * scaleFactorY;

        const targetX = Math.floor(mapPanX + (canvasX - cx) / mapZoom);
        const targetZ = Math.floor(mapPanZ + (canvasY - cy) / mapZoom);

        markedPoint = { x: targetX, z: targetZ };
        updateMarkedInfoUI();
        renderBigMap();
      }
    }
  });

  cvs.onwheel = e => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.82 : 1.22;
    mapZoom = Math.max(0.4, Math.min(6.0, mapZoom * zoomFactor));
    renderBigMap();
  };

  const btnZoomIn = document.getElementById('map-zoom-in');
  if (btnZoomIn) btnZoomIn.onclick = () => { mapZoom = Math.min(6.0, mapZoom * 1.3); renderBigMap(); };

  const btnZoomOut = document.getElementById('map-zoom-out');
  if (btnZoomOut) btnZoomOut.onclick = () => { mapZoom = Math.max(0.4, mapZoom * 0.75); renderBigMap(); };

  const btnCenterMe = document.getElementById('map-center-me');
  if (btnCenterMe) btnCenterMe.onclick = () => { mapPanX = P.x; mapPanZ = P.z; renderBigMap(); };

  const btnTp = document.getElementById('btn-teleport');
  if (btnTp) btnTp.onclick = teleportToMarked;

  const btnClear = document.getElementById('btn-clear-mark');
  if (btnClear) btnClear.onclick = () => {
    markedPoint = null;
    updateMarkedInfoUI();
    renderBigMap();
  };
}

function updateMarkedInfoUI() {
  const markEl = document.getElementById('mark-coords');
  const distEl = document.getElementById('mark-dist');
  const btnTp = document.getElementById('btn-teleport');
  const promptEl = document.getElementById('waypoint-prompt');
  const promptText = document.getElementById('wp-prompt-text');

  if (markedPoint) {
    const dist = Math.round(Math.hypot(P.x - markedPoint.x, P.z - markedPoint.z));
    const biome = getBiomeAt(markedPoint.x, markedPoint.z);
    if (markEl) markEl.textContent = `X: ${markedPoint.x}, Z: ${markedPoint.z} (${biome})`;
    if (distEl) distEl.textContent = `${dist}m away`;
    if (btnTp) {
      btnTp.style.opacity = '1';
      btnTp.style.pointerEvents = 'auto';
    }
    if (promptEl) {
      promptEl.style.display = 'flex';
      if (promptText) promptText.textContent = `Waypoint [${markedPoint.x}, ${markedPoint.z}] · ${dist}m`;
    }
  } else {
    if (markEl) markEl.textContent = 'None (click on map)';
    if (distEl) distEl.textContent = '—';
    if (btnTp) {
      btnTp.style.opacity = '0.5';
      btnTp.style.pointerEvents = 'none';
    }
    if (promptEl) promptEl.style.display = 'none';
  }
}

function teleportToMarked() {
  if (!markedPoint) return;
  const top = getTopBlockAt(markedPoint.x, markedPoint.z);
  const safeY = top ? top.groundY + 1.8 : (P.y > -50 ? P.y : 70);

  P.x = markedPoint.x + 0.5;
  P.y = safeY;
  P.z = markedPoint.z + 0.5;
  P.vx = 0; P.vy = 0; P.vz = 0;

  streamWorld(P.x, P.z);
  camera.position.set(P.x, P.y + 1.62, P.z);

  send({ t: 'pos', p: [P.x, P.y, P.z], r: [P.yaw, P.pitch] });
  playPopSound();
  chatLine('System', `⚡ Teleported to [X: ${Math.round(P.x)}, Y: ${Math.round(P.y)}, Z: ${Math.round(P.z)}]`);

  closeUI();
  updateMarkedInfoUI();
}

window.openUI = openUI;
window.closeUI = closeUI;
window.teleportToMarked = teleportToMarked;

