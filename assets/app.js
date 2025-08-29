/* Main application JS for NCM tool (split file) */
const ANNOUNCEMENT_URL = 'https://cdn-cf.dormant.top/ncm/announcement.md';
const CORE_KEY = CryptoJS.enc.Utf8.parse('hzHRAmso5kInbaxW');
const META_KEY = CryptoJS.enc.Utf8.parse("#14ljk_!\\]&0U<'(");

let zip = null;
const globalObjectURLs = new Set();
const playingContext = { audio: null, raf: null, angle: 0, lastTs: 0, playing: false, audioUrl: null, coverUrl: null, coverBlob: null };

const list = document.getElementById('list');
const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const zipBtn = document.getElementById('zipBtn');
const clearBtn = document.getElementById('clearBtn');
const releaseBtn = document.getElementById('releaseBtn');
const footerLogo = document.getElementById('footerLogo');

const modal = document.getElementById('modal');
const discImg = document.getElementById('discImg');
const playerTitle = document.getElementById('playerTitle');
const playerSub = document.getElementById('playerSub');
const curTimeEl = document.getElementById('curTime');
const durTimeEl = document.getElementById('durTime');
const progressBar = document.getElementById('playerProgressBar');
const progressFill = document.getElementById('playerProgressFill');
const btnPlay = document.getElementById('btnPlay');
const btnStop = document.getElementById('btnStop');
const btnClose = document.getElementById('btnClose');
const btnDownloadCover = document.getElementById('btnDownloadCover');
const svgPlay = document.getElementById('svgPlay');
const svgPause = document.getElementById('svgPause');

const announceMask = document.getElementById('announceMask');
const announceContent = document.getElementById('announceContent');
const announceOk = document.getElementById('announceOk');
const announceRetry = document.getElementById('announceRetry');
const announceDontShow = document.getElementById('announceDontShow');

const btnSettings = document.getElementById('btnSettings');
const settingsMask = document.getElementById('settingsMask');
const settingsClose = document.getElementById('settingsClose');
const openAnnouncementFromSettings = document.getElementById('openAnnouncementFromSettings');
const themeSelect = document.getElementById('themeSelect');
const ghLightLink = document.getElementById('gh-markdown-light');
const ghDarkLink = document.getElementById('gh-markdown-dark');

const THEME_KEY = 'ncm_theme_pref';
const ANNOUNCE_HIDE_KEY = 'ncm_announce_hide_until';

/* Theme handling */
function applyTheme(pref){
  if (pref === 'auto'){
    const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('theme-dark', systemDark);
    document.body.classList.toggle('theme-light', !systemDark);
    ghLightLink.disabled = systemDark;
    ghDarkLink.disabled = !systemDark;
  } else if (pref === 'light'){
    document.body.classList.add('theme-light');
    document.body.classList.remove('theme-dark');
    ghLightLink.disabled = false;
    ghDarkLink.disabled = true;
  } else {
    document.body.classList.add('theme-dark');
    document.body.classList.remove('theme-light');
    ghLightLink.disabled = true;
    ghDarkLink.disabled = false;
  }
}
function initTheme(){
  const saved = localStorage.getItem(THEME_KEY) || 'auto';
  themeSelect.value = saved;
  applyTheme(saved);
  if (saved === 'auto' && window.matchMedia){
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', ()=> applyTheme('auto'));
  }
}
themeSelect.addEventListener('change', (e)=>{ const v = e.target.value; localStorage.setItem(THEME_KEY, v); applyTheme(v); });
initTheme();

/* Announcement handling (with 30-day hide) */
function shouldShowAnnouncement(){
  const until = localStorage.getItem(ANNOUNCE_HIDE_KEY);
  if (!until) return true;
  const t = parseInt(until,10);
  if (isNaN(t)) return true;
  return Date.now() > t;
}

async function fetchAndShowAnnouncement(){
  if (!shouldShowAnnouncement()) return;
  try {
    announceContent.textContent = '正在加载公告…';
    announceRetry.style.display = 'none';
    announceMask.style.display = 'flex';
    const res = await fetch(ANNOUNCEMENT_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const md = await res.text();
    const html = marked.parse(md || '');
    const safe = DOMPurify.sanitize(html, {ALLOWED_TAGS: DOMPurify.getDefaultWhiteList()});
    announceContent.innerHTML = safe;
  } catch (err) {
    console.error('公告加载失败', err);
    announceContent.innerHTML = `<div class="announceError">公告加载失败：${escapeHtml(String(err))}</div>`;
    announceRetry.style.display = 'inline-block';
  }
}
announceOk.addEventListener('click', ()=> {
  if (announceDontShow.checked){
    const days30 = Date.now() + 30*24*3600*1000;
    localStorage.setItem(ANNOUNCE_HIDE_KEY, String(days30));
  }
  announceMask.style.display = 'none';
});
announceRetry.addEventListener('click', ()=> fetchAndShowAnnouncement());

/* Settings modal handlers */
btnSettings.addEventListener('click', ()=> settingsMask.style.display = 'flex');
settingsClose.addEventListener('click', ()=> settingsMask.style.display = 'none');
openAnnouncementFromSettings.addEventListener('click', ()=> {
  settingsMask.style.display = 'none';
  fetchAndShowAnnouncement();
});

/* Player: seeking, RAF rotation, controls (same logic) */
let seeking = false;
function computePctFromEvent(e, el){
  const rect = el.getBoundingClientRect();
  const x = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX);
  return Math.min(1, Math.max(0, (x - rect.left) / rect.width));
}
progressBar.addEventListener('pointerdown', (e)=>{ if (!playingContext.audio) return; seeking = true; progressBar.setPointerCapture(e.pointerId); seekToPct(computePctFromEvent(e, progressBar)); });
progressBar.addEventListener('pointermove', (e)=>{ if (!seeking) return; seekToPct(computePctFromEvent(e, progressBar)); });
progressBar.addEventListener('pointerup', (e)=>{ if (!seeking) return; seeking = false; try{ progressBar.releasePointerCapture(e.pointerId);}catch(e){} });
progressBar.addEventListener('click', (e)=>{ if (!playingContext.audio) return; seekToPct(computePctFromEvent(e, progressBar)); });

function seekToPct(pct){
  const audio = playingContext.audio;
  if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return;
  audio.currentTime = pct * audio.duration;
  updateProgressUI();
}

function startDiscLoop(){
  if (playingContext.raf) return;
  playingContext.lastTs = performance.now();
  function step(ts){
    if (!playingContext.playing || !playingContext.audio) { playingContext.raf = null; return; }
    const dt = (ts - playingContext.lastTs) / 1000;
    playingContext.lastTs = ts;
    const speed = 60;
    playingContext.angle = (playingContext.angle + speed * dt) % 360;
    discImg.style.transform = `rotate(${playingContext.angle}deg)`;
    updateProgressUI();
    playingContext.raf = requestAnimationFrame(step);
  }
  playingContext.raf = requestAnimationFrame(step);
}
function stopDiscLoop(){ if (playingContext.raf){ cancelAnimationFrame(playingContext.raf); playingContext.raf = null; } }

function updateProgressUI(){
  const audio = playingContext.audio;
  if (!audio){ progressFill.style.width = '0%'; curTimeEl.textContent = '0:00'; durTimeEl.textContent = '0:00'; return; }
  const dur = isFinite(audio.duration) ? audio.duration : 0;
  const cur = isFinite(audio.currentTime) ? audio.currentTime : 0;
  const pct = dur > 0 ? (cur / dur) * 100 : 0;
  progressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
  curTimeEl.textContent = formatTime(cur);
  durTimeEl.textContent = formatTime(dur);
}

btnPlay.addEventListener('click', ()=>{
  const audio = playingContext.audio;
  if (!audio) return;
  if (playingContext.playing){ audio.pause(); playingContext.playing=false; stopDiscLoop(); svgPlay.style.display='inline'; svgPause.style.display='none'; }
  else { audio.play().then(()=>{ playingContext.playing=true; startDiscLoop(); svgPlay.style.display='none'; svgPause.style.display='inline'; }).catch(()=>{}); }
});
btnStop.addEventListener('click', ()=> {
  if (!playingContext.audio) return;
  try{ playingContext.audio.pause(); playingContext.audio.currentTime = 0; }catch(e){}
  playingContext.playing=false; stopDiscLoop(); svgPlay.style.display='inline'; svgPause.style.display='none'; updateProgressUI();
});
btnClose.addEventListener('click', ()=> closePlayer());
btnDownloadCover.addEventListener('click', ()=> {
  if (!playingContext.coverBlob) return;
  const ext = detectImageMime(new Uint8Array(playingContext.coverBlob.slice(0,4)))==='image/png' ? '.png' : '.jpg';
  saveAs(playingContext.coverBlob, sanitize(`${playerTitle.textContent} - ${playerSub.textContent || 'cover'}${ext}`));
});

function openPlayer({title, artist, album, audioBlob, coverBlob}){
  cleanupPlayer();
  playerTitle.textContent = title || '未知';
  playerSub.textContent = artist || album || '';

  if (coverBlob){
    const coverUrl = URL.createObjectURL(coverBlob);
    globalObjectURLs.add(coverUrl);
    playingContext.coverUrl = coverUrl;
    playingContext.coverBlob = coverBlob;
    discImg.src = coverUrl;
  } else { discImg.src = ''; playingContext.coverBlob = null; }

  const audioUrl = URL.createObjectURL(audioBlob);
  globalObjectURLs.add(audioUrl);
  playingContext.audioUrl = audioUrl;
  const audio = new Audio();
  audio.src = audioUrl;
  audio.preload = 'metadata';
  playingContext.audio = audio;
  playingContext.playing = false;

  audio.addEventListener('loadedmetadata', ()=> updateProgressUI());
  audio.addEventListener('timeupdate', ()=> updateProgressUI());
  audio.addEventListener('ended', ()=> { playingContext.playing=false; stopDiscLoop(); svgPlay.style.display='inline'; svgPause.style.display='none'; updateProgressUI(); });

  modal.style.display = 'flex';
  setTimeout(()=> {
    audio.play().then(()=> {
      playingContext.playing = true; startDiscLoop(); svgPlay.style.display='none'; svgPause.style.display='inline';
    }).catch(()=> {
      playingContext.playing = false; svgPlay.style.display='inline'; svgPause.style.display='none';
    });
  }, 140);
}

function cleanupPlayer(){
  if (playingContext.audio){
    try{ playingContext.audio.pause(); playingContext.audio.src = ''; }catch(e){}
    playingContext.audio = null;
  }
  stopDiscLoop();
}

function closePlayer(){
  cleanupPlayer();
  if (playingContext.audioUrl){ try{ URL.revokeObjectURL(playingContext.audioUrl); }catch(e){} globalObjectURLs.delete(playingContext.audioUrl); playingContext.audioUrl = null; }
  if (playingContext.coverUrl){ try{ URL.revokeObjectURL(playingContext.coverUrl); }catch(e){} globalObjectURLs.delete(playingContext.coverUrl); playingContext.coverUrl = null; playingContext.coverBlob = null; }
  modal.style.display = 'none';
  progressFill.style.width = '0%';
  curTimeEl.textContent = '0:00'; durTimeEl.textContent = '0:00';
  svgPlay.style.display = 'inline'; svgPause.style.display = 'none';
}

function releaseMemory(){
  cleanupPlayer();
  globalObjectURLs.forEach(u => { try{ URL.revokeObjectURL(u); }catch(e){} });
  globalObjectURLs.clear();
  document.querySelectorAll('.row.item').forEach(r => {
    r.__audioBlob = null; r.__coverBlob = null;
    if (r.__audioUrl){ try{ URL.revokeObjectURL(r.__audioUrl); }catch(e){} r.__audioUrl = null; }
    if (r.__coverUrl){ try{ URL.revokeObjectURL(r.__coverUrl); }catch(e){} r.__coverUrl = null; }
  });
  mdui.snackbar({message:'已释放内存并撤销临时资源'});
}

/* File handling / UI */
['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
drop.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
fileInput.addEventListener('change', e => handleFiles(e.target.files));
clearBtn.addEventListener('click', clearAll);
zipBtn.addEventListener('click', async ()=> { if (!zip) return; const blob = await zip.generateAsync({type:'blob'}); saveAs(blob, `ncm_exports_${Date.now()}.zip`); });

function handleFiles(files){
  const arr = Array.from(files).filter(f=>f.name.toLowerCase().endsWith('.ncm'));
  if (arr.length === 0){ mdui.snackbar({message:'未检测到 .ncm 文件'}); return; }
  if (!zip) zip = new JSZip();
  arr.forEach(f => processOne(f));
}

function createRow(){
  const row = document.createElement('div');
  row.className = 'row item';
  row.innerHTML = `
    <div><img class="cover" src="" alt="cover" style="opacity:.18;border-radius:8px"></div>
    <div>
      <div class="titleStrong">解析中…</div>
      <div class="meta small">文件：<span class="filename"></span></div>
      <div style="margin-top:8px" class="rowProgress" hidden><i style="width:0%"></i></div>
    </div>
    <div class="small format">--</div>
    <div class="small duration">--:--</div>
    <div style="text-align:right" class="rightActions">
      <button class="iconBtn preview" disabled title="播放">▶</button>
      <button class="iconBtn download" disabled title="下载">⬇</button>
      <button class="iconBtn coverDl" disabled title="下载封面">🖼</button>
    </div>
  `;
  list.appendChild(row);
  return row;
}

function setRowProgress(row, pct){
  const bar = row.querySelector('.rowProgress'); const inner = bar?.querySelector('i');
  if (!bar) return; bar.hidden = false; inner.style.width = Math.min(100, Math.max(0, pct)) + '%';
  if (pct >= 100) setTimeout(()=> bar.hidden = true, 300);
}

async function processOne(file){
  const row = createRow();
  row.querySelector('.filename').textContent = file.name;
  try {
    const ab = await file.arrayBuffer();
    const data = new Uint8Array(ab);
    setRowProgress(row, 5);
    const out = ncmDecrypt(data, p => setRowProgress(row, p*0.9 + 5));
    setRowProgress(row, 90);

    if (out.cover && out.cover.length > 8){
      const mime = detectImageMime(out.cover);
      const coverBlob = new Blob([out.cover], {type: mime});
      const coverUrl = URL.createObjectURL(coverBlob);
      globalObjectURLs.add(coverUrl);
      const img = row.querySelector('.cover'); img.src = coverUrl; img.style.opacity = 1;
      row.__coverBlob = coverBlob; row.__coverUrl = coverUrl;
    }

    const title = (out.meta && out.meta.musicName) ? out.meta.musicName : file.name.replace(/\.ncm$/i,'');
    const artist = (out.meta && out.meta.artist) ? out.meta.artist.map(a=>a[0]).join(', ') : (out.meta && out.meta.artistName) ? out.meta.artistName : '';
    const album = (out.meta && (out.meta.album || out.meta.albumName)) ? (out.meta.album || out.meta.albumName) : '';
    row.querySelector('.titleStrong').textContent = title + (artist ? (' — ' + artist) : '');
    if (album) row.querySelector('.meta').textContent = '专辑：' + album;

    const ext = (out.ext && out.ext.toLowerCase()) || (out.mime && out.mime.includes('flac') ? 'flac' : 'mp3');
    const mime = out.mime || (ext === 'flac' ? 'audio/flac' : 'audio/mpeg');
    const audioBlob = new Blob([out.audio], {type: mime});
    const audioUrl = URL.createObjectURL(audioBlob);
    globalObjectURLs.add(audioUrl);
    row.__audioBlob = audioBlob; row.__audioUrl = audioUrl;

    const aTmp = new Audio(); aTmp.preload = 'metadata'; aTmp.src = audioUrl;
    aTmp.addEventListener('loadedmetadata', ()=>{ const d = aTmp.duration; row.querySelector('.duration').textContent = isFinite(d) ? formatTime(d) : '--:--'; aTmp.src = ''; });

    const previewBtn = row.querySelector('.preview');
    const dlBtn = row.querySelector('.download');
    const coverDl = row.querySelector('.coverDl');
    previewBtn.disabled = false; dlBtn.disabled = false; coverDl.disabled = !row.__coverBlob;

    previewBtn.addEventListener('click', ()=> openPlayer({ title, artist, album, audioBlob, coverBlob: row.__coverBlob }));
    dlBtn.addEventListener('click', ()=> saveAs(audioBlob, sanitize(`${title} - ${artist || 'unknown'}.${ext}`)));
    coverDl.addEventListener('click', ()=> {
      if (!row.__coverBlob) return;
      const extn = detectImageMime(new Uint8Array(row.__coverBlob.slice(0,4))) === 'image/png' ? '.png' : '.jpg';
      saveAs(row.__coverBlob, sanitize(`${title} - ${artist || 'unknown'}${extn}`));
    });

    if (!zip) zip = new JSZip();
    zip.file(sanitize(`${title} - ${artist || 'unknown'}.${ext}`), audioBlob);
    zipBtn.disabled = false;

    setRowProgress(row, 100);
  } catch (err) {
    console.error(err);
    row.querySelector('.titleStrong').textContent = '解密失败：' + (err.message || err);
    setRowProgress(row, 100);
  }
}

/* utilities and NCM core (same as before) */
function detectImageMime(bytes){ if (!bytes || bytes.length < 4) return 'application/octet-stream'; if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg'; if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png'; if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif'; return 'application/octet-stream'; }
function sanitize(s){ return String(s||'').replace(/[\\/:*?"<>|]/g,'_').replace(/\s+/g,' ').trim(); }
function formatTime(s){ if (!isFinite(s) || s <= 0) return '0:00'; const m = Math.floor(s/60); const sec = Math.floor(s%60).toString().padStart(2,'0'); return `${m}:${sec}`; }
function escapeHtml(s){ return (s+'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function ncmDecrypt(data, onProgress){
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const MAGIC = 'CTENFDAM';
  const sig = String.fromCharCode(...data.slice(0,8));
  if (sig !== MAGIC) throw new Error('不是有效的 NCM 文件（缺少 CTENFDAM）');
  let off = 8 + 2;
  const keyLen = dv.getUint32(off, true); off += 4;
  let keyData = data.slice(off, off+keyLen); off += keyLen;
  for (let i=0;i<keyData.length;i++) keyData[i] ^= 0x64;
  const rc4Seed = aesEcbDecrypt(keyData, CORE_KEY);
  const seed = rc4Seed.slice(17);
  const keyBox = initKeyBox(seed);
  const metaLen = dv.getUint32(off, true); off += 4;
  let metaRaw = data.slice(off, off+metaLen); off += metaLen;
  for (let i=0;i<metaRaw.length;i++) metaRaw[i] ^= 0x63;
  const prefix = "163 key(Don't modify):";
  let metaStr = new TextDecoder().decode(metaRaw);
  metaStr = metaStr.slice(prefix.length);
  const metaBytes = Uint8Array.from(atob(metaStr), c=>c.charCodeAt(0));
  const metaDec = aesEcbDecrypt(metaBytes, META_KEY);
  const jsonStr = new TextDecoder().decode(metaDec).replace(/^music:/,'');
  let meta = {};
  try{ meta = JSON.parse(jsonStr); }catch(e){ meta = {}; }
  off += 4 + 5;
  const imgSize = dv.getUint32(off, true); off += 4;
  const cover = data.slice(off, off+imgSize); off += imgSize;
  const audioEnc = data.slice(off);
  const audio = audioDec(audioEnc, keyBox, onProgress);
  const ext = (meta.format && meta.format.toLowerCase()) || guessExt(audio);
  const mime = ext === 'flac' ? 'audio/flac' : 'audio/mpeg';
  return { audio, meta, cover, mime, ext };
}
function aesEcbDecrypt(bytes, key){ const wa = CryptoJS.lib.WordArray.create(bytes); const dec = CryptoJS.AES.decrypt({ciphertext: wa}, key, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }); const out = new Uint8Array(dec.sigBytes); const words = dec.words; for (let i=0;i<out.length;i++){ const w = words[Math.floor(i/4)]; const shift = 24 - 8*(i%4); out[i] = (w >>> shift) & 0xff; } return out; }
function initKeyBox(seed){ const box = new Uint8Array(256); for (let i=0;i<256;i++) box[i]=i; let last=0, idx=0; for (let i=0;i<256;i++){ last = (box[i] + last + seed[idx]) & 0xff; [box[i], box[last]] = [box[last], box[i]]; idx = (idx + 1) % seed.length; } return box; }
function audioDec(enc, box, onProgress){ const out = new Uint8Array(enc.length); const CHUNK = 0x8000; for (let i=0;i<enc.length;i++){ const j = (i+1) & 0xff; out[i] = enc[i] ^ box[(box[j] + box[(box[j] + j) & 0xff]) & 0xff]; if (onProgress && (i%CHUNK===0)) onProgress(i/enc.length*100); } if (onProgress) onProgress(100); return out; }
function guessExt(bytes){ if (bytes[0]===0x66 && bytes[1]===0x4C && bytes[2]===0x61 && bytes[3]===0x43) return 'flac'; if (bytes[0]===0xFF && (bytes[1]&0xE0)===0xE0) return 'mp3'; return 'mp3'; }

/* Footer logo drop */
footerLogo.addEventListener('dragover', e=>{ e.preventDefault(); footerLogo.style.outline = '1px dashed rgba(255,255,255,0.12)'; });
footerLogo.addEventListener('dragleave', e=>{ footerLogo.style.outline = ''; });
footerLogo.addEventListener('drop', e=>{ e.preventDefault(); footerLogo.style.outline=''; const f = e.dataTransfer.files[0]; if (!f) return; const url = URL.createObjectURL(f); footerLogo.innerHTML = ''; const img = document.createElement('img'); img.src = url; img.style.width='100%'; img.style.height='100%'; img.style.objectFit='contain'; footerLogo.appendChild(img); globalObjectURLs.add(url); });

/* Clear list */
def_clear_all_placeholder = True
