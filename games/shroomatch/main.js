// ═══════════════════════════════════════════════════════
// SHROOMATCH — main.js
// Pixi.js v7 — con animazioni spawn, match, idle, tap
// ═══════════════════════════════════════════════════════
'use strict';

const { Application, Graphics, Sprite, Texture, Container, Ticker } = PIXI;

// ── COSTANTI ────────────────────────────────────────────
const ROWS         = 6;
const COLS         = 6;
const GAP          = 5;
const CORNER       = 10;
const GRID_PAD     = 8;
const SPIDER_EVERY = 2;
const POWER_MAX    = 20;
const ANIM_MS      = 200;
const CASCADE_MS   = 260;

const COLOR_NAMES = ['red','yellow','blue','green','orange','purple'];
const COLORS = {
  red: 0xe74c3c, yellow: 0xf1c40f, blue: 0x3498db,
  green: 0x2ecc71, orange: 0xe67e22, purple: 0x9b59b6,
};
const POWER_COLORS = {
  red:'#e74c3c', yellow:'#f1c40f', blue:'#3498db',
  green:'#2ecc71', orange:'#e67e22', purple:'#9b59b6',
};
const SPIDER_THRESHOLDS = [
  { min: 2000, level: 4 },
  { min: 1500, level: 3 },
  { min:  500, level: 2 },
  { min:    0, level: 1 },
];

const ASSETS = {
  mushrooms: {
    red:'assets/mushrooms/red.png', yellow:'assets/mushrooms/yellow.png',
    blue:'assets/mushrooms/blue.png', green:'assets/mushrooms/green.png',
    orange:'assets/mushrooms/orange.png', purple:'assets/mushrooms/purple.png',
  },
  scared: {
    red:'assets/mushrooms/red_scared.png', yellow:'assets/mushrooms/yellow_scared.png',
    blue:'assets/mushrooms/blue_scared.png', green:'assets/mushrooms/green_scared.png',
    orange:'assets/mushrooms/orange_scared.png', purple:'assets/mushrooms/purple_scared.png',
  },
  spiders: {
    1:'assets/spiders/spider1.png', 2:'assets/spiders/spider2.png',
    3:'assets/spiders/spider3.png', 4:'assets/spiders/caterpillar.png',
  },
  specials: {
    web:'assets/specials/web.png', petrified:'assets/specials/petrified.png',
    witch:'assets/specials/witch.png', bomber:'assets/specials/bomber.png',
  },
  bombs: {
    h:'assets/bombs/bomb_h.png', v:'assets/bombs/bomb_v.png',
    cross:'assets/bombs/bomb_cross.png',
  },
};

// ── STATO ───────────────────────────────────────────────
let grid=[], queue=[], reserve=null;
let score=0, tapCount=0, gameOver=false, busy=false, cascading=0;
let needSpawn=false, spiderSeq=0;
let powerCharge={red:0,yellow:0,blue:0,green:0,orange:0,purple:0};

let app, gridContainer, cellObjects=[], textures={};
let CELL=52; // dimensione cella, calcolata in initPixi

// ── ANIMAZIONI ───────────────────────────────────────────
// Coda animazioni attive: { container, type, t, duration, from, to, onDone }
const anims = [];

function addAnim(container, type, duration, from, to, onDone) {
  // Rimuovi animazione precedente dello stesso tipo sullo stesso container
  for (let i = anims.length-1; i >= 0; i--) {
    if (anims[i].container === container && anims[i].type === type) anims.splice(i,1);
  }
  anims.push({ container, type, t:0, duration, from, to, onDone });
}

// Idle: ogni cella ha una fase sfasata per il dondolio
function idlePhase(r, c) { return (r * COLS + c) * 0.4; }

function lerp(a, b, t) { return a + (b-a)*t; }
function easeOutBounce(t) {
  if (t < 1/2.75) return 7.5625*t*t;
  if (t < 2/2.75) { t-=1.5/2.75; return 7.5625*t*t+0.75; }
  if (t < 2.5/2.75) { t-=2.25/2.75; return 7.5625*t*t+0.9375; }
  t-=2.625/2.75; return 7.5625*t*t+0.984375;
}
function easeInOut(t) { return t<0.5 ? 2*t*t : -1+(4-2*t)*t; }

// Ticker principale — animazioni
let globalTime = 0;
function tickAnimations(delta) {
  const dt = delta / 60; // secondi
  globalTime += dt;

  // Animazioni attive
  for (let i = anims.length-1; i >= 0; i--) {
    const a = anims[i];
    a.t += dt / (a.duration / 1000);
    const p = Math.min(a.t, 1);

    if (a.type === 'spawn') {
      const s = lerp(a.from, a.to, easeOutBounce(p));
      a.container.scale.set(s);
    } else if (a.type === 'match') {
      const s = p < 0.5 ? lerp(1, 1.35, p*2) : lerp(1.35, 0, (p-0.5)*2);
      a.container.scale.set(s);
      a.container.alpha = p < 0.8 ? 1 : lerp(1, 0, (p-0.8)*5);
    } else if (a.type === 'tap') {
      const s = p < 0.5 ? lerp(1, 0.85, p*2) : lerp(0.85, 1, (p-0.5)*2);
      a.container.scale.set(s);
    } else if (a.type === 'flash') {
      // Flash colore: tint oscillante
      const intensity = Math.sin(p * Math.PI);
      a.container.alpha = lerp(1, 1.8, intensity);
    }

    if (p >= 1) {
      // Fine animazione: reset
      if (a.type === 'match') { a.container.alpha = 1; }
      a.container.scale.set(1);
      if (a.onDone) a.onDone();
      anims.splice(i, 1);
    }
  }

  // Idle dondolio su tutti i funghi (senza ragni/ragnatele/bombe/empty)
  for (let r=0; r<ROWS; r++) {
    for (let c=0; c<COLS; c++) {
      const d = grid[r][c];
      if (!d || d.empty || d.black || d.spider || d.web || d.bomb) continue;
      // Controlla che non ci sia un'animazione attiva su questa cella
      const cell = cellObjects[r][c];
      if (!cell) continue;
      const hasAnim = anims.some(a => a.container === cell.container);
      if (hasAnim) continue;

      const phase = idlePhase(r, c);
      const skew  = Math.sin(globalTime * 1.8 + phase) * 0.06; // skewX lieve
      const bob   = Math.sin(globalTime * 1.8 + phase) * 1.2;  // translateY pixel
      cell.spr.skew.x  = skew;
      cell.spr.position.y = bob;
    }
  }
}

// ── INIT PIXI ────────────────────────────────────────────
async function initPixi() {
  const maxW = Math.min(360, window.innerWidth * 0.96);
  CELL = Math.floor((maxW - GRID_PAD*2 - GAP*(COLS-1)) / COLS);
  const SIZE = CELL*COLS + GAP*(COLS-1) + GRID_PAD*2;

  app = new Application({
    width: SIZE, height: SIZE,
    background: 0x0d1b2a,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  // Maschera bordi arrotondati
  const mask = new Graphics();
  mask.beginFill(0xffffff);
  mask.drawRoundedRect(0,0,SIZE,SIZE,12);
  mask.endFill();
  app.stage.mask = mask;
  app.stage.addChild(mask);

  document.getElementById('canvas-wrap').appendChild(app.view);

  await loadTextures();

  gridContainer = new Container();
  app.stage.addChild(gridContainer);
  cellObjects = [];

  for (let r=0; r<ROWS; r++) {
    cellObjects[r] = [];
    for (let c=0; c<COLS; c++) {
      const container = new Container();
      container.x = GRID_PAD + c*(CELL+GAP);
      container.y = GRID_PAD + r*(CELL+GAP);
      container.pivot.set(CELL/2, CELL/2);
      container.position.x += CELL/2;
      container.position.y += CELL/2;
      container.interactive = true;
      container.buttonMode  = true;
      container.on('pointerdown', () => onCellTap(r, c));

      const bg = new Graphics();
      bg.name = 'bg';
      container.addChild(bg);

      const spr = new Sprite(Texture.EMPTY);
      spr.name = 'mushroom';
      spr.width = CELL; spr.height = CELL;
      spr.alpha = 0; // invisibile finché non ha texture reale
      container.addChild(spr);

      const overlay = new Sprite(Texture.EMPTY);
      overlay.name = 'overlay';
      overlay.width = CELL; overlay.height = CELL;
      overlay.alpha = 0;
      container.addChild(overlay);

      gridContainer.addChild(container);
      cellObjects[r][c] = { container, bg, spr, overlay };
    }
  }

  // Avvia ticker animazioni
  app.ticker.add(tickAnimations);
}

async function loadTextures() {
  const paths = [];
  const collect = (obj) => { for (const k in obj) { if (typeof obj[k]==='string') paths.push(obj[k]); else collect(obj[k]); } };
  collect(ASSETS);
  await Promise.allSettled(paths.map(p => PIXI.Assets.load(p).then(t => { textures[p]=t; }).catch(()=>{})));
}

function getTex(path) { return textures[path] || Texture.EMPTY; }

// ── SPAWN ANIMATION ──────────────────────────────────────
function animSpawn(r, c) {
  const cell = cellObjects[r][c];
  if (!cell) return;
  cell.container.scale.set(0.1);
  cell.container.alpha = 1;
  addAnim(cell.container, 'spawn', 320, 0.1, 1);
}

function animMatch(r, c, onDone) {
  const cell = cellObjects[r][c];
  if (!cell) return;
  addAnim(cell.container, 'match', 250, 1, 0, onDone);
}

function animTap(r, c) {
  const cell = cellObjects[r][c];
  if (!cell) return;
  addAnim(cell.container, 'tap', 150, 1, 0.85);
}

// ── RENDER CELLA ─────────────────────────────────────────
function renderCell(r, c, spawn=false) {
  const d   = grid[r][c];
  const obj = cellObjects[r][c];
  if (!obj) return;
  const { container, bg, spr, overlay } = obj;

  bg.clear();
  spr.texture = Texture.EMPTY; spr.alpha = 0;
  overlay.texture = Texture.EMPTY; overlay.alpha = 0;
  spr.skew.x = 0; spr.position.y = 0;
  container.alpha = 1;
  container.interactive = !d.empty && !d.web && !d.black;

  if (d.empty) {
    bg.beginFill(0x000000, 0.45);
    bg.drawRoundedRect(0,0,CELL,CELL,CORNER);
    bg.endFill();
    return;
  }

  if (d.black && !d.spider) {
    bg.beginFill(0x111111);
    bg.drawRoundedRect(0,0,CELL,CELL,CORNER);
    bg.endFill();
    overlay.texture = getTex(ASSETS.specials.petrified);
    overlay.alpha   = 1;
    return;
  }

  const hasImgBomb = d.bomb && textures[ASSETS.bombs[d.bomb]];

  // Sfondo cella: scuro neutro sempre, il colore viene dal PNG del fungo
  bg.beginFill(hasImgBomb ? 0x1a1a2e : 0x2a2a3e, hasImgBomb ? 0.5 : 0.6);
  bg.drawRoundedRect(0,0,CELL,CELL,CORNER);
  bg.endFill();

  // Fungo normale o scared
  const hasSpider = d.spider || d.web;
  const scaredPath = hasSpider ? ASSETS.scared[d.color] : null;
  const mushroomPath = (scaredPath && textures[scaredPath]) ? scaredPath : ASSETS.mushrooms[d.color];
  if (mushroomPath && textures[mushroomPath] && !hasImgBomb) {
    spr.texture = textures[mushroomPath];
    spr.alpha   = 1;
  }

  // Overlay: bomba > ragnatela > ragno
  if (hasImgBomb) {
    overlay.texture = getTex(ASSETS.bombs[d.bomb]);
    overlay.alpha   = 1;
  } else if (d.web) {
    overlay.texture = getTex(ASSETS.specials.web);
    overlay.alpha   = 1;
    container.interactive = false;
  } else if (d.spider) {
    overlay.texture = getTex(ASSETS.spiders[d.spider]);
    overlay.alpha   = 1;
    container.interactive = false;
  }

  if (spawn) animSpawn(r, c);
}

function renderAllCells() {
  for (let r=0; r<ROWS; r++)
    for (let c=0; c<COLS; c++)
      renderCell(r, c);
}

// ── UI ───────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

let feedbackTimer = null;
function feedback(msg, color, ms) {
  clearTimeout(feedbackTimer);
  const fb = el('feedback');
  fb.textContent = msg; fb.style.color = color||'#888';
  if (ms) feedbackTimer = setTimeout(() => { fb.textContent=''; fb.style.color=''; }, ms);
}

function renderCountdown() {
  const rem = SPIDER_EVERY - (tapCount % SPIDER_EVERY);
  el('spider-countdown').textContent = rem;
}
function renderScore() { el('score').textContent = score; }

function buildPowerBars() {
  const wrap = el('power-bars');
  wrap.innerHTML = '';
  COLOR_NAMES.forEach(color => {
    const bar = document.createElement('div');
    bar.className = 'power-bar'; bar.id = 'pb-'+color;
    bar.innerHTML = `<div class="power-bar-track"><div class="power-bar-fill" id="pbf-${color}" style="background:${POWER_COLORS[color]}"></div></div><div class="power-bar-label">${color[0].toUpperCase()+color.slice(1)}</div>`;
    wrap.appendChild(bar);
  });
}

function renderPowerBar(color) {
  const fill = el('pbf-'+color), bar = el('pb-'+color);
  if (!fill) return;
  fill.style.width = (powerCharge[color]/POWER_MAX*100)+'%';
  bar.classList.toggle('ready', powerCharge[color] >= POWER_MAX);
}

function addPowerCharge(color, amount) {
  if (!Object.prototype.hasOwnProperty.call(powerCharge, color)) return;
  if (powerCharge[color] >= POWER_MAX) return;
  powerCharge[color] = Math.min(POWER_MAX, powerCharge[color]+amount);
  renderPowerBar(color);
  if (powerCharge[color] >= POWER_MAX) setTimeout(() => activatePower(color), 300);
}

function renderTokenSlot(domEl, token) {
  domEl.innerHTML = '';
  if (!token) return;
  let path = token==='witch' ? ASSETS.specials.witch : token==='bomber' ? ASSETS.specials.bomber : ASSETS.mushrooms[token];
  if (path) {
    const img = document.createElement('img');
    img.src = path;
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
    domEl.appendChild(img);
  } else {
    domEl.style.background = '#333';
  }
}

function renderQueue() {
  for (let i=0; i<3; i++) renderTokenSlot(el('q'+i), queue[i]);
}
function renderReserve() {
  const slot = el('reserve-slot');
  slot.classList.toggle('filled', !!reserve);
  renderTokenSlot(slot, reserve);
}

// ── LOGICA ───────────────────────────────────────────────
function rndColor() { return COLOR_NAMES[Math.floor(Math.random()*COLOR_NAMES.length)]; }
function rndToken() {
  const r = Math.random();
  if (r < 1/7) return 'witch';
  if (r < 2/7) return 'bomber';
  return rndColor();
}

function mkCell(color) {
  return { color:color||rndColor(), bomb:null, spider:0, spiderId:0, web:false, black:false, empty:false };
}
function mkEmptyCell() {
  return { color:null, bomb:null, spider:0, spiderId:0, web:false, black:false, empty:true };
}

function canMatch(r, c) {
  const d = grid[r][c];
  return !d.black && !d.bomb && !d.empty;
}

function freeCells() {
  const free=[];
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
    const d=grid[r][c];
    if (!d.spider&&!d.web&&!d.black&&!d.bomb&&!d.empty) free.push({r,c});
  }
  return free;
}

function findMatches() {
  const runs=[];
  for (let r=0;r<ROWS;r++) {
    let s=0;
    for (let c=1;c<=COLS;c++) {
      const cont=c<COLS&&canMatch(r,c)&&canMatch(r,c-1)&&grid[r][c].color===grid[r][c-1].color;
      if (!cont) { if(c-s>=3&&canMatch(r,s)) runs.push({cells:Array.from({length:c-s},(_,i)=>({r,c:s+i})),dir:'h'}); s=c; }
    }
  }
  for (let c=0;c<COLS;c++) {
    let s=0;
    for (let r=1;r<=ROWS;r++) {
      const cont=r<ROWS&&canMatch(r,c)&&canMatch(r-1,c)&&grid[r][c].color===grid[r-1][c].color;
      if (!cont) { if(r-s>=3&&canMatch(s,c)) runs.push({cells:Array.from({length:r-s},(_,i)=>({r:s+i,c})),dir:'v'}); s=r; }
    }
  }
  if (!runs.length) return [];
  const cellToRun={}, used=new Set(), merged=[];
  runs.forEach((run,idx)=>run.cells.forEach(({r,c})=>{const k=r+','+c;(cellToRun[k]=cellToRun[k]||[]).push(idx);}));
  runs.forEach((run,idx)=>{
    if(used.has(idx))return;
    const group=new Set([idx]);
    run.cells.forEach(({r,c})=>(cellToRun[r+','+c]||[]).forEach(j=>group.add(j)));
    group.forEach(j=>used.add(j));
    const allCells=new Map(), dirs=new Set();
    group.forEach(j=>{runs[j].cells.forEach(cell=>allCells.set(cell.r+','+cell.c,cell));dirs.add(runs[j].dir);});
    const cells=[...allCells.values()];
    const type=dirs.size>1?'cross':cells.length>3?runs[[...group][0]].dir:'none';
    merged.push({cells,type});
  });
  return merged;
}

function bombType(match) {
  if (match.type==='cross') return 'cross';
  if (match.type==='h'&&match.cells.length>=4) return 'h';
  if (match.type==='v'&&match.cells.length>=4) return 'v';
  return null;
}

function spawnCells(keys, bombPlacements, withAnim=true) {
  keys.forEach(key=>{
    const [r,c]=key.split(',').map(Number);
    if(grid[r][c].empty) return;
    grid[r][c]=mkCell();
    addPowerCharge(grid[r][c].color,1);
    renderCell(r,c,withAnim);
  });
  bombPlacements.forEach(({r,c,type,color})=>{
    grid[r][c]=mkCell(color);
    grid[r][c].bomb=type;
    renderCell(r,c,false);
  });
}

function resolveBoard(onComplete) {
  const matches=findMatches();
  if (!matches.length) { if(onComplete)onComplete(); return; }
  cascading++;
  const toSpawn=new Set(), bombs=[];
  matches.forEach(match=>{
    const bt=bombType(match);
    match.cells.forEach(({r,c})=>toSpawn.add(r+','+c));
    if(bt){const mid=match.cells[Math.floor(match.cells.length/2)];bombs.push({r:mid.r,c:mid.c,type:bt,color:grid[mid.r][mid.c].color});}
  });
  // Anima match (flash + scomparsa)
  let pending = toSpawn.size;
  const afterMatch = () => {
    pending--;
    if (pending > 0) return;
    spawnCells(toSpawn, bombs, true);
    cascading--;
    setTimeout(()=>resolveBoard(onComplete), CASCADE_MS);
  };
  if (pending === 0) { spawnCells(toSpawn,bombs,true); cascading--; setTimeout(()=>resolveBoard(onComplete),CASCADE_MS); return; }
  toSpawn.forEach(key=>{
    const [r,c]=key.split(',').map(Number);
    animMatch(r,c,afterMatch);
  });
}

function applyMatches(matches, tapR, tapC) {
  if (!matches.length) return false;
  const toSpawn=new Set(), bombs=[];
  matches.forEach(match=>{
    const bt=bombType(match);
    const colorCount={};
    match.cells.forEach(({r,c})=>{
      toSpawn.add(r+','+c);
      const col=grid[r]?.[c]?.color; if(col)colorCount[col]=(colorCount[col]||0)+1;
    });
    Object.entries(colorCount).forEach(([col,amt])=>addPowerCharge(col,amt));
    if(bt){
      const inMatch=tapR!==undefined&&match.cells.some(d=>d.r===tapR&&d.c===tapC);
      const pos=inMatch?{r:tapR,c:tapC}:match.cells[Math.floor(match.cells.length/2)];
      bombs.push({r:pos.r,c:pos.c,type:bt,color:grid[pos.r][pos.c].color});
    }
  });
  score+=toSpawn.size*10; renderScore();
  cascading++;
  let pending=toSpawn.size;
  const afterMatch=()=>{
    pending--;
    if(pending>0)return;
    spawnCells(toSpawn,bombs,true);
    cascading--;
    setTimeout(()=>resolveBoard(()=>{moveSpiders();busy=false;}),CASCADE_MS);
  };
  toSpawn.forEach(key=>{const[r,c]=key.split(',').map(Number);animMatch(r,c,afterMatch);});
  return matches.some(m=>m.type!=='none')?'good':'small';
}

function currentSpiderLevel() {
  for(const{min,level}of SPIDER_THRESHOLDS)if(score>=min)return level;
  return 1;
}

function spawnSpider() {
  const lvl=currentSpiderLevel(), free=freeCells();
  if(!free.length){triggerGameOver();return;}
  const pos=free[Math.floor(Math.random()*free.length)];
  spiderSeq++;
  grid[pos.r][pos.c].spider=lvl;
  grid[pos.r][pos.c].spiderId=spiderSeq;
  renderCell(pos.r,pos.c,true);
  const msg=lvl===4?'🐛 Il bruco!':lvl===3?'💀 Ragno nero!':lvl===2?'🕷 Ragno velenoso!':'🕷 Ragno!';
  feedback(msg,'#e74c3c',1800);
  if(freeCells().length===0)triggerGameOver();
}

function moveSpiders() {
  const spiders=[];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)
    if(grid[r][c].spider)spiders.push({r,c,lvl:grid[r][c].spider,sid:grid[r][c].spiderId});
  if(!spiders.length)return;
  spiders.forEach(({r,c,lvl})=>{
    grid[r][c].spider=0;grid[r][c].spiderId=0;
    if(lvl===2)grid[r][c].web=true;
    if(lvl===3)grid[r][c].black=true;
    if(lvl===4)grid[r][c]=mkEmptyCell();
  });
  const taken=new Set();
  spiders.forEach(({r,c,lvl,sid})=>{
    renderCell(r,c,false);
    if(lvl===4)return;
    const free=[];
    for(let rr=0;rr<ROWS;rr++)for(let cc=0;cc<COLS;cc++){
      const k=rr+','+cc,d=grid[rr][cc];
      if(!d.web&&!d.black&&!d.bomb&&!d.spider&&!d.empty&&!taken.has(k))free.push({r:rr,c:cc});
    }
    if(!free.length)return;
    const dest=free[Math.floor(Math.random()*free.length)];
    taken.add(dest.r+','+dest.c);
    grid[dest.r][dest.c].spider=lvl;
    grid[dest.r][dest.c].spiderId=sid;
    renderCell(dest.r,dest.c,false);
  });
  if(freeCells().length===0)triggerGameOver();
}

function explodeBomb(r,c,exploded){
  if(!exploded)exploded=new Set();
  const key0=r+','+c;
  if(exploded.has(key0))return;
  exploded.add(key0);
  const bt=grid[r][c].bomb;
  if(!bt)return;
  const hit=new Set();
  if(bt==='h'||bt==='cross')for(let cc=0;cc<COLS;cc++){if(!grid[r][cc].empty)hit.add(r+','+cc);}
  if(bt==='v'||bt==='cross')for(let rr=0;rr<ROWS;rr++){if(!grid[rr][c].empty)hit.add(rr+','+c);}
  const chain=[];
  hit.forEach(k=>{const[rr,cc]=k.split(',').map(Number);if((rr!==r||cc!==c)&&grid[rr][cc].bomb&&!exploded.has(k))chain.push({r:rr,c:cc});});
  hit.forEach(k=>{const[rr,cc]=k.split(',').map(Number);const d=grid[rr][cc];d.spider=0;d.spiderId=0;d.web=false;d.black=false;});
  score+=hit.size*10;renderScore();
  chain.forEach(({r:rr,c:cc})=>explodeBomb(rr,cc,exploded));
  cascading++;
  let pending=hit.size;
  const afterExplode=()=>{
    pending--;
    if(pending>0)return;
    hit.forEach(k=>{const[rr,cc]=k.split(',').map(Number);if(!grid[rr][cc].empty){addPowerCharge(grid[rr][cc].color||'red',1);grid[rr][cc]=mkCell();}renderCell(rr,cc,true);});
    cascading--;
    resolveBoard(()=>{moveSpiders();busy=false;});
  };
  hit.forEach(key=>{const[rr,cc]=key.split(',').map(Number);animMatch(rr,cc,afterExplode);});
}

function checkStalemate(){
  const nextColor=queue[0];
  if(nextColor==='witch'||nextColor==='bomber')return;
  const available=new Set([nextColor]);
  if(reserve&&reserve!=='witch'&&reserve!=='bomber')available.add(reserve);
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const d=grid[r][c];
    if(!d.spider&&!d.web&&!d.black&&!d.bomb&&!d.empty&&!available.has(d.color))return;
  }
  triggerGameOver();
}

// ── POWER UPS ────────────────────────────────────────────
function activatePower(color){
  powerCharge[color]=0;renderPowerBar(color);
  feedback('⚡ '+color.toUpperCase()+' POWER!',POWER_COLORS[color],2000);
  switch(color){
    case 'red':    powerRed();break;
    case 'yellow': powerYellow();break;
    case 'blue':   powerBlue();break;
    case 'green':  powerGreen();break;
    case 'orange': powerOrange();break;
    case 'purple': powerPurple();break;
  }
}

function flashPowerCells(cells,color,callback){
  // Flash: tint giallo su ogni cella, poi esplodi
  cells.forEach(k=>{
    const[r,c]=k.split(',').map(Number);
    const obj=cellObjects[r][c];
    if(obj){obj.container.alpha=0.5;}
  });
  setTimeout(()=>{
    cells.forEach(k=>{
      const[r,c]=k.split(',').map(Number);
      const obj=cellObjects[r][c];
      if(obj)obj.container.alpha=1;
      if(!grid[r][c].empty){addPowerCharge(grid[r][c].color||color,1);grid[r][c]=mkCell();}
      renderCell(r,c,true);
    });
    if(callback)callback();
    setTimeout(()=>resolveBoard(()=>{moveSpiders();busy=false;}),CASCADE_MS);
  },350);
}

function powerRed(){
  const free=[];
  for(let r=1;r<ROWS-1;r++)for(let c=1;c<COLS-1;c++)free.push({r,c});
  for(let i=0;i<2;i++){
    if(!free.length)break;
    const idx=Math.floor(Math.random()*free.length);
    const{r,c}=free.splice(idx,1)[0];
    const cells=new Set();
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const r2=r+dr,c2=c+dc;if(r2>=0&&r2<ROWS&&c2>=0&&c2<COLS&&!grid[r2][c2].empty)cells.add(r2+','+c2);}
    flashPowerCells(cells,'red');
  }
}
function powerYellow(){const set=Math.random()<0.5?[0,2,4]:[1,3,5];const cells=new Set();set.forEach(r=>{for(let c=0;c<COLS;c++){if(!grid[r][c].empty)cells.add(r+','+c);}});flashPowerCells(cells,'yellow');}
function powerBlue(){
  const cells=new Set();
  for(let c=0;c<COLS;c++){if(!grid[0][c].empty)cells.add('0,'+c);if(!grid[ROWS-1][c].empty)cells.add((ROWS-1)+','+c);}
  for(let r=1;r<ROWS-1;r++){if(!grid[r][0].empty)cells.add(r+',0');if(!grid[r][COLS-1].empty)cells.add(r+','+(COLS-1));}
  const cr=Math.floor(ROWS/2),cc=Math.floor(COLS/2);
  [[cr-1,cc-1],[cr-1,cc],[cr,cc-1],[cr,cc]].forEach(([r,c])=>{if(!grid[r][c].empty)cells.add(r+','+c);});
  flashPowerCells(cells,'blue');
}
function powerGreen(){
  const free=[];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){if(!grid[r][c].bomb&&!grid[r][c].spider&&!grid[r][c].web&&!grid[r][c].black&&!grid[r][c].empty)free.push({r,c});}
  for(let i=0;i<3;i++){
    if(!free.length)break;
    const idx=Math.floor(Math.random()*free.length);
    const{r,c}=free.splice(idx,1)[0];
    grid[r][c].bomb='cross';renderCell(r,c,false);
  }
  feedback('🟢 3 Bombe Croce!','',1500);
}
function powerOrange(){const set=Math.random()<0.5?[0,2,4]:[1,3,5];const cells=new Set();set.forEach(c=>{for(let r=0;r<ROWS;r++){if(!grid[r][c].empty)cells.add(r+','+c);}});flashPowerCells(cells,'orange');}
function powerPurple(){
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    if(grid[r][c].spider||grid[r][c].web){grid[r][c].spider=0;grid[r][c].spiderId=0;grid[r][c].web=false;renderCell(r,c,false);}
  }
  feedback('🟣 Ragni eliminati!','#9b59b6',1500);
}

// ── TAP ──────────────────────────────────────────────────
function onCellTap(r,c){
  if(gameOver||busy)return;
  const d=grid[r][c];
  if(d.spider||d.web||d.black||d.empty)return;
  busy=true;
  animTap(r,c);

  if(d.bomb){
    tapCount++;if(tapCount%SPIDER_EVERY===0)needSpawn=true;renderCountdown();
    explodeBomb(r,c);return;
  }

  const color=queue[0];
  if(color!=='witch'&&color!=='bomber'&&d.color===color){busy=false;return;}

  if(color==='witch'||color==='bomber'){tapCount++;if(tapCount%SPIDER_EVERY===0)needSpawn=true;renderCountdown();}

  if(color==='witch'){
    const targetColor=d.color;
    queue.shift();queue.push(rndToken());renderQueue();
    const toMatch=new Set();
    for(let r2=0;r2<ROWS;r2++)for(let c2=0;c2<COLS;c2++){
      if(grid[r2][c2].color===targetColor&&!grid[r2][c2].black&&!grid[r2][c2].bomb&&!grid[r2][c2].empty)toMatch.add(r2+','+c2);
    }
    score+=toMatch.size*10;renderScore();
    feedback('✨ Magia! +'+toMatch.size*10,'#ffd700',2000);
    cascading++;
    let pending=toMatch.size||1;
    const after=()=>{pending--;if(pending>0)return;cascading--;resolveBoard(()=>{moveSpiders();busy=false;});};
    if(toMatch.size===0){cascading--;resolveBoard(()=>{moveSpiders();busy=false;});}
    else toMatch.forEach(k=>{const[r2,c2]=k.split(',').map(Number);animMatch(r2,c2,()=>{addPowerCharge(targetColor,1);grid[r2][c2]=mkCell();renderCell(r2,c2,true);after();});});
    if(needSpawn){needSpawn=false;spawnSpider();}
    return;
  }

  if(color==='bomber'){
    queue.shift();queue.push(rndToken());renderQueue();
    const toExplode=new Set();
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const r2=r+dr,c2=c+dc;if(r2>=0&&r2<ROWS&&c2>=0&&c2<COLS&&!grid[r2][c2].empty)toExplode.add(r2+','+c2);}
    score+=toExplode.size*10;renderScore();
    feedback('💥 Boom! +'+toExplode.size*10,'#ff6b00',1500);
    const chainBombs=[];
    toExplode.forEach(k=>{const[r2,c2]=k.split(',').map(Number);if(grid[r2][c2].bomb)chainBombs.push({r:r2,c:c2,bomb:grid[r2][c2].bomb});});
    cascading++;
    let pending=toExplode.size||1;
    const after=()=>{pending--;if(pending>0)return;
      toExplode.forEach(k=>{const[r2,c2]=k.split(',').map(Number);if(!grid[r2][c2].empty){addPowerCharge(grid[r2][c2].color||'red',1);grid[r2][c2]=mkCell();}renderCell(r2,c2,true);});
      chainBombs.forEach(({r:r2,c:c2,bomb})=>{grid[r2][c2].bomb=bomb;explodeBomb(r2,c2);});
      cascading--;resolveBoard(()=>{moveSpiders();busy=false;});
    };
    toExplode.forEach(k=>{const[r2,c2]=k.split(',').map(Number);animMatch(r2,c2,after);});
    if(needSpawn){needSpawn=false;spawnSpider();}
    return;
  }

  grid[r][c]=mkCell(color);
  queue.shift();queue.push(rndToken());
  renderCell(r,c,true);
  renderQueue();

  tapCount++;if(tapCount%SPIDER_EVERY===0)needSpawn=true;renderCountdown();

  const matches=findMatches();
  const result=applyMatches(matches,r,c);

  if(result===false){
    moveSpiders();
    if(needSpawn){needSpawn=false;spawnSpider();}
    busy=false;
  } else {
    if(needSpawn){needSpawn=false;setTimeout(()=>spawnSpider(),500);}
  }
  checkStalemate();
}

// ── GAME OVER ────────────────────────────────────────────
function triggerGameOver(){
  gameOver=true;
  el('go-score').textContent='Punteggio finale: '+score;
  el('gameover').classList.add('show');
}

// ── NEW GAME ─────────────────────────────────────────────
function newGame(){
  gameOver=false;busy=false;cascading=0;
  score=0;tapCount=0;needSpawn=false;spiderSeq=0;reserve=null;
  powerCharge={red:0,yellow:0,blue:0,green:0,orange:0,purple:0};
  anims.length=0;
  el('gameover').classList.remove('show');
  el('feedback').textContent='';
  renderScore();renderCountdown();
  COLOR_NAMES.forEach(c=>{el('pbf-'+c).style.width='0%';el('pb-'+c).classList.remove('ready');});
  grid=Array.from({length:ROWS},()=>Array.from({length:COLS},()=>mkCell()));
  queue=[rndToken(),rndToken(),rndToken()];
  renderAllCells();renderQueue();renderReserve();
  setTimeout(()=>resolveBoard(null),150);
}

function onReserveTap(){
  if(gameOver||busy)return;
  const cur=queue[0];
  if(!reserve){reserve=cur;queue.shift();queue.push(rndToken());}
  else{[reserve,queue[0]]=[queue[0],reserve];}
  renderReserve();renderQueue();
}

// ── START ────────────────────────────────────────────────
(async()=>{
  buildPowerBars();
  await initPixi();
  el('reserve-slot').addEventListener('click',onReserveTap);
  el('btn-new').addEventListener('click',newGame);
  el('go-btn').addEventListener('click',newGame);
  newGame();
})();
