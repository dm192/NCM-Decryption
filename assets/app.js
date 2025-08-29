/* Main application JS for NCM tool (modal selector & accessibility fixes) */
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

/* --------------------------
   Modal helpers: show/hide with animation + accessibility
   -------------------------- */
function _findModalInner(el){
  // priority: data-modal-inner, then common class names
  if (!el) return null;
  return el.querySelector('[data-modal-inner]') || el.querySelector('.modal') || el.querySelector('.announceBox');
}
function showModal(el){
  if (!el) return;
  // prevent body scroll
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  el.style.display = 'flex';
  el.setAttribute('aria-hidden','false');

  // small delay to ensure layout applied, then add open class
  requestAnimationFrame(()=> {
    const inner = _findModalInner(el);
    if (inner) inner.classList.add('open');
  });
}
function hideModal(el){
  if (!el) return;
  const inner = _findModalInner(el);
  if (inner) inner.classList.remove('open');

  // re-enable scroll after transition
  setTimeout(()=>{
    el.style.display = 'none';
    el.setAttribute('aria-hidden','true');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }, 260);
}

// allow clicking on mask (outside inner) to close modal
function attachMaskCloseBehavior(maskEl){
  if (!maskEl) return;
  maskEl.addEventListener('click', (ev)=>{
    // if clicked directly on mask (not on inner)
    const inner = _findModalInner(maskEl);
    if (!inner) return;
    if (!inner.contains(ev.target)) {
      // close depending which mask
      if (maskEl === modal) {
        closePlayer();
      } else {
        hideModal(maskEl);
      }
    }
  });
}
attachMaskCloseBehavior(modal);
attachMaskCloseBehavior(announceMask);
attachMaskCloseBehavior(settingsMask);

/* --------------------------
   Theme handling (same variables as CSS)
   -------------------------- */
function applyTheme(pref){
  if (pref === 'auto'){
    const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('theme-dark', systemDark);
    document.body.classList.toggle('theme-light', !systemDark);
    if (ghLightLink && ghDarkLink) { ghLightLink.disabled = systemDark; ghDarkLink.disabled = !systemDark; }
  } else if (pref === 'light'){
    document.body.classList.add('theme-light');
    document.body.classList.remove('theme-dark');
    if (ghLightLink && ghDarkLink) { ghLightLink.disabled = false; ghDarkLink.disabled = true; }
  } else {
    document.body.classList.add('theme-dark');
    document.body.classList.remove('theme-light');
    if (ghLightLink && ghDarkLink) { ghLightLink.disabled = true; ghDarkLink.disabled = false; }
  }
}
function initTheme(){
  const saved = localStorage.getItem(THEME_KEY) || 'auto';
  if (themeSelect) themeSelect.value = saved;
  applyTheme(saved);
  if (saved === 'auto' && window.matchMedia){
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', ()=> applyTheme('auto'));
  }
}
if (themeSelect){
  themeSelect.addEventListener('change', (e)=>{ const v = e.target.value; localStorage.setItem(THEME_KEY, v); applyTheme(v); });
}
initTheme();

/* --------------------------
   Announcement fetching & 30-day hide
   -------------------------- */
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
    if (announceContent) announceContent.textContent = '正在加载公告…';
    if (announceRetry) announceRetry.style.display = 'none';
    showModal(announceMask);
    const res = await fetch(ANNOUNCEMENT_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const md = await res.text();
    const html = marked.parse(md || '');
    const safe = DOMPurify.sanitize(html, {ALLOWED_TAGS: DOMPurify.getDefaultWhiteList()});
    if (announceContent) announceContent.innerHTML = safe;
  } catch (err) {
    console.error('公告加载失败', err);
    if (announceContent) announceContent.innerHTML = `<div class="announceError">公告加载失败：${escapeHtml(String(err))}</div>`;
    if (announceRetry) announceRetry.style.display = 'inline-block';
  }
}
if (announceOk) announceOk.addEventListener('click', ()=> {
  if (announceDontShow && announceDontShow.checked){
    const days30 = Date.now() + 30*24*3600*1000;
    localStorage.setItem(ANNOUNCE_HIDE_KEY, String(days30));
  }
  hideModal(announceMask);
});
if (announceRetry) announceRetry.addEventListener('click', ()=> fetchAndShowAnnouncement());

/* settings modal */
if (btnSettings) btnSettings.addEventListener('click', ()=> showModal(settingsMask));
if (settingsClose) settingsClose.addEventListener('click', ()=> hideModal(settingsMask));
if (openAnnouncementFromSettings) openAnnouncementFromSettings.addEventListener('click', ()=> { hideModal(settingsMask); fetchAndShowAnnouncement(); });

/* --------------------------
   Player controls: seeking, RAF rotation, etc.
   -------------------------- */
let seeking = false;
function computePctFromEvent(e, el){
  const rect = el.getBoundingClientRect();
  const x = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX);
  return Math.min(1, Math.max(0, (x - rect.left) / rect.width));
}
if (progressBar){
  progressBar.addEventListener('pointerdown', (e)=>{ if (!playingContext.audio) return; seeking = true; progressBar.setPointerCapture(e.pointerId); seekToPct(computePctFromEvent(e, progressBar)); });
  progressBar.addEventListener('pointermove', (e)=>{ if (!seeking) return; seekToPct(computePctFromEvent(e, progressBar)); });
  progressBar.addEventListener('pointerup', (e)=>{ if (!seeking) return; seeking = false; try{ progressBar.releasePointerCapture(e.pointerId);}catch(e){} });
  progressBar.addEventListener('click', (e)=>{ if (!playingContext.audio) return; seekToPct(computePctFromEvent(e, progressBar)); });
}

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
    if (discImg) discImg.style.transform = `rotate(${playingContext.angle}deg)`;
    updateProgressUI();
    playingContext.raf = requestAnimationFrame(step);
  }
  playingContext.raf = requestAnimationFrame(step);
}
function stopDiscLoop(){ if (playingContext.raf){ cancelAnimationFrame(playingContext.raf); playingContext.raf = null; } }

function updateProgressUI(){
  const audio = playingContext.audio;
  if (!audio){ if (progressFill) progressFill.style.width = '0%'; if(curTimeEl) curTimeEl.textContent = '0:00'; if(durTimeEl) durTimeEl.textContent = '0:00'; return; }
  const dur = isFinite(audio.duration) ? audio.duration : 0;
  const cur = isFinite(audio.currentTime) ? audio.currentTime : 0;
  const pct = dur > 0 ? (cur / dur) * 100 : 0;
  if (progressFill) progressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
  if (curTimeEl) curTimeEl.textContent = formatTime(cur);
  if (durTimeEl) durTimeEl.textContent = formatTime(dur);
}

/* play/pause/stop/close bindings */
if (btnPlay){
  btnPlay.addEventListener('click', ()=>{
    const audio = playingContext.audio;
    if (!audio) return;
    if (playingContext.playing){ audio.pause(); playingContext.playing=false; stopDiscLoop(); if(svgPlay) svgPlay.style.display='inline'; if(svgPause) svgPause.style.display='none'; }
    else { audio.play().then(()=>{ playingContext.playing=true; startDiscLoop(); if(svgPlay) svgPlay.style.display='none'; if(svgPause) svgPause.style.display='inline'; }).catch(()=>{}); }
  });
}
if (btnStop){
  btnStop.addEventListener('click', ()=> {
    if (!playingContext.audio) return;
    try{ playingContext.audio.pause(); playingContext.audio.currentTime = 0; }catch(e){}
    playingContext.playing=false; stopDiscLoop(); if(svgPlay) svgPlay.style.display='inline'; if(svgPause) svgPause.style.display='none'; updateProgressUI();
  });
}
if (btnClose) btnClose.addEventListener('click', ()=> closePlayer());
if (btnDownloadCover) btnDownloadCover.addEventListener('click', ()=> {
  if (!playingContext.coverBlob) return;
  const ext = detectImageMime(new Uint8Array(playingContext.coverBlob.slice(0,4)))==='image/png' ? '.png' : '.jpg';
  saveAs(playingContext.coverBlob, sanitize(`${playerTitle.textContent} - ${playerSub.textContent || 'cover'}${ext}`));
});

function openPlayer({title, artist, album, audioBlob, coverBlob}){
  cleanupPlayer();
  if (playerTitle) playerTitle.textContent = title || '未知';
  if (playerSub) playerSub.textContent = artist || album || '';

  if (coverBlob && discImg){
    const coverUrl = URL.createObjectURL(coverBlob);
    globalObjectURLs.add(coverUrl);
    playingContext.coverUrl = coverUrl;
    playingContext.coverBlob = coverBlob;
    discImg.src = coverUrl;
  } else { if (discImg) discImg.src = ''; playingContext.coverBlob = null; }

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
  audio.addEventListener('ended', ()=> { playingContext.playing=false; stopDiscLoop(); if(svgPlay) svgPlay.style.display='inline'; if(svgPause) svgPause.style.display='none'; updateProgressUI(); });

  showModal(modal);
  setTimeout(()=> {
    audio.play().then(()=> {
      playingContext.playing = true; startDiscLoop(); if(svgPlay) svgPlay.style.display='none'; if(svgPause) svgPause.style.display='inline';
    }).catch(()=> {
      playingContext.playing = false; if(svgPlay) svgPlay.style.display='inline'; if(svgPause) svgPause.style.display='none';
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
  hideModal(modal);
  if (progressFill) progressFill.style.width = '0%';
  if (curTimeEl) curTimeEl.textContent = '0:00'; if (durTimeEl) durTimeEl.textContent = '0:00';
  if (svgPlay) svgPlay.style.display = 'inline'; if (svgPause) svgPause.style.display = 'none';
}

/* release memory */
function releaseMemory(){
  cleanupPlayer();
  globalObjectURLs.forEach(u => { try{ URL.revokeObjectURL(u); }catch(e){} });
  globalObjectURLs.clear();
  document.querySelectorAll('.row.item').forEach(r => {
    r.__audioBlob = null; r.__coverBlob = null;
    if (r.__audioUrl){ try{ URL.revokeObjectURL(r.__audioUrl); }catch(e){} r.__audioUrl = null; }
    if (r.__coverUrl){ try{ URL.revokeObjectURL(r.__coverUrl); }catch(e){} r.__coverUrl = null; }
  });
  if (typeof mdui !== 'undefined') mdui.snackbar({message:'已释放内存并撤销临时资源'});
}

/* file handling and UI rows */
['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
drop.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
fileInput.addEventListener('change', e => handleFiles(e.target.files));
if (clearBtn) clearBtn.addEventListener('click', clearAll);
if (zipBtn) zipBtn.addEventListener('click', async ()=> { if (!zip) return; const blob = await zip.generateAsync({type:'blob'}); saveAs(blob, `ncm_exports_${Date.now()}.zip`); });

function handleFiles(files){
  const arr = Array.from(files).filter(f=>f.name.toLowerCase().endsWith('.ncm'));
  if (arr.length === 0){ if (typeof mdui !== 'undefined') mdui.snackbar({message:'未检测到 .ncm 文件'}); r
