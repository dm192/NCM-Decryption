/* assets/app-ui.js (更新：错误模态 & 全模态动画绑定 + 错误诊断复制/反馈) */
(function(){
  const CORE = window.NCMCore;
  if (!CORE) { console.error('NCMCore 未就绪 — 请先加载 app-core.js'); return; }

  let refs = {};
  let zip = null;
  const globalObjectURLs = new Set();
  const playingContext = { audio: null, raf: null, angle: 0, lastTs: 0, playing: false, audioUrl: null, coverUrl: null, coverBlob: null };
  const MIN_WIDTH = 600, MIN_HEIGHT = 520;
  const ANNOUNCEMENT_URL = 'https://cdn-cf.dormant.top/ncm/announcement.md';
  const ANNOUNCE_HIDE_KEY = 'ncm_announce_hide_until';

  /* modal helpers */
  function _findModalInner(el){ if (!el) return null; return el.querySelector('[data-modal-inner]') || el.querySelector('.modal') || el.querySelector('.announceBox'); }
  function showModal(el){
    if (!el) return;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    el.style.display = 'flex';
    el.setAttribute('aria-hidden','false');
    requestAnimationFrame(()=> {
      const inner = _findModalInner(el);
      if (inner) inner.classList.add('open');
      // also add .open for sizeWarning if present
      if (el.id === 'sizeWarning') el.classList.add('open');
    });
  }
  function hideModal(el){
    if (!el) return;
    const inner = _findModalInner(el);
    if (inner) inner.classList.remove('open');
    if (el.id === 'sizeWarning') el.classList.remove('open');
    setTimeout(()=>{
      el.style.display = 'none';
      el.setAttribute('aria-hidden','true');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }, 260);
  }
  function attachMaskCloseBehavior(maskEl, onMaskClose){
    if (!maskEl) return;
    maskEl.addEventListener('click', (ev)=>{
      const inner = _findModalInner(maskEl);
      if (!inner) return;
      if (!inner.contains(ev.target)) {
        if (typeof onMaskClose === 'function') onMaskClose();
        else hideModal(maskEl);
      }
    });
  }

  /* DOM refs */
  function initDOMRefs(){
    refs = {
      list: document.getElementById('list'),
      drop: document.getElementById('drop'),
      fileInput: document.getElementById('fileInput'),
      zipBtn: document.getElementById('zipBtn'),
      clearBtn: document.getElementById('clearBtn'),
      releaseBtn: document.getElementById('releaseBtn'),
      footerLogo: document.getElementById('footerLogo'),
      modalMask: document.getElementById('modal'),
      discImg: document.getElementById('discImg'),
      playerTitle: document.getElementById('playerTitle'),
      playerSub: document.getElementById('playerSub'),
      curTime: document.getElementById('curTime'),
      durTime: document.getElementById('durTime'),
      playerFill: document.getElementById('playerProgressFill'),
      playerProgressBar: document.getElementById('playerProgressBar'),
      btnPlay: document.getElementById('btnPlay'),
      btnStop: document.getElementById('btnStop'),
      btnClose: document.getElementById('btnClose'),
      btnDownloadCover: document.getElementById('btnDownloadCover'),
      svgPlay: document.getElementById('svgPlay'),
      svgPause: document.getElementById('svgPause'),
      announceMask: document.getElementById('announceMask'),
      announceContent: document.getElementById('announceContent'),
      announceOk: document.getElementById('announceOk'),
      announceRetry: document.getElementById('announceRetry'),
      announceDontShow: document.getElementById('announceDontShow'),
      btnSettings: document.getElementById('btnSettings'),
      settingsMask: document.getElementById('settingsMask'),
      settingsClose: document.getElementById('settingsClose'),
      openAnnouncementFromSettings: document.getElementById('openAnnouncementFromSettings'),
      themeSelect: document.getElementById('themeSelect'),
      sizeWarning: document.getElementById('sizeWarning'),
      sizeOk: document.getElementById('sizeOk'),
      errorMask: document.getElementById('errorMask'),
      errorContent: document.getElementById('errorContent'),
      errorCopy: document.getElementById('errorCopy'),
      errorReport: document.getElementById('errorReport'),
      errorClose: document.getElementById('errorClose'),
    };
  }

  /* size check */
  function checkWindowSize(){
    const ok = window.innerWidth >= MIN_WIDTH && window.innerHeight >= MIN_HEIGHT;
    if (!ok){ showModal(refs.sizeWarning); refs.list.style.display = 'none'; refs.drop.setAttribute('aria-disabled','true'); }
    else { hideModal(refs.sizeWarning); refs.list.style.display = ''; refs.drop.removeAttribute('aria-disabled'); }
    return ok;
  }

  /* player helpers */
  let seeking = false;
  function computePctFromEvent(e, el){ const rect = el.getBoundingClientRect(); const x = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX); return Math.min(1, Math.max(0, (x - rect.left) / rect.width)); }
  function updateProgressUI(){ const audio = playingContext.audio; if (!audio){ refs.playerFill.style.width='0%'; refs.curTime.textContent='0:00'; refs.durTime.textContent='0:00'; return; } const dur = isFinite(audio.duration)?audio.duration:0; const cur = isFinite(audio.currentTime)?audio.currentTime:0; const pct = dur>0?(cur/dur)*100:0; refs.playerFill.style.width=Math.min(100,Math.max(0,pct))+'%'; refs.curTime.textContent = CORE.formatTime(cur); refs.durTime.textContent = CORE.formatTime(dur); }
  function startDiscLoop(){ if (playingContext.raf) return; playingContext.lastTs = performance.now(); function step(ts){ if (!playingContext.playing || !playingContext.audio){ playingContext.raf=null; return; } const dt=(ts-playingContext.lastTs)/1000; playingContext.lastTs=ts; const speed=60; playingContext.angle=(playingContext.angle+speed*dt)%360; if (refs.discImg) refs.discImg.style.transform=`rotate(${playingContext.angle}deg)`; updateProgressUI(); playingContext.raf = requestAnimationFrame(step);} playingContext.raf = requestAnimationFrame(step); }
  function stopDiscLoop(){ if (playingContext.raf){ cancelAnimationFrame(playingContext.raf); playingContext.raf=null; } }
  function seekToPct(pct){ const audio = playingContext.audio; if (!audio || !isFinite(audio.duration) || audio.duration<=0) return; audio.currentTime = pct*audio.duration; updateProgressUI(); }

  function cleanupPlayer(){ if (playingContext.audio){ try{ playingContext.audio.pause(); playingContext.audio.src=''; }catch(e){} playingContext.audio=null; } stopDiscLoop(); }
  function openPlayer({title, artist, album, audioBlob, coverBlob}){
    cleanupPlayer();
    refs.playerTitle.textContent = title || '未知';
    refs.playerSub.textContent = artist || album || '';
    if (coverBlob){ const coverUrl = URL.createObjectURL(coverBlob); globalObjectURLs.add(coverUrl); playingContext.coverUrl = coverUrl; playingContext.coverBlob = coverBlob; refs.discImg.src = coverUrl; } else { refs.discImg.src=''; playingContext.coverBlob=null; }
    const audioUrl = URL.createObjectURL(audioBlob); globalObjectURLs.add(audioUrl); playingContext.audioUrl = audioUrl;
    const audio = new Audio(); audio.src = audioUrl; audio.preload = 'metadata'; playingContext.audio = audio; playingContext.playing = false;
    audio.addEventListener('loadedmetadata', ()=> updateProgressUI());
    audio.addEventListener('timeupdate', ()=> updateProgressUI());
    audio.addEventListener('ended', ()=> { playingContext.playing=false; stopDiscLoop(); refs.svgPlay.style.display='inline'; refs.svgPause.style.display='none'; updateProgressUI(); });
    showModal(refs.modalMask);
    setTimeout(()=> { audio.play().then(()=>{ playingContext.playing=true; startDiscLoop(); refs.svgPlay.style.display='none'; refs.svgPause.style.display='inline'; }).catch(()=>{ playingContext.playing=false; refs.svgPlay.style.display='inline'; refs.svgPause.style.display='none'; }); }, 140);
  }
  function closePlayer(){ cleanupPlayer(); if (playingContext.audioUrl){ try{ URL.revokeObjectURL(playingContext.audioUrl);}catch(e){} globalObjectURLs.delete(playingContext.audioUrl); playingContext.audioUrl=null; } if (playingContext.coverUrl){ try{ URL.revokeObjectURL(playingContext.coverUrl);}catch(e){} globalObjectURLs.delete(playingContext.coverUrl); playingContext.coverUrl=null; playingContext.coverBlob=null; } hideModal(refs.modalMask); refs.playerFill.style.width='0%'; refs.curTime.textContent='0:00'; refs.durTime.textContent='0:00'; refs.svgPlay.style.display='inline'; refs.svgPause.style.display='none'; }

  function releaseMemory(){ cleanupPlayer(); globalObjectURLs.forEach(u=>{ try{ URL.revokeObjectURL(u);}catch(e){} }); globalObjectURLs.clear(); document.querySelectorAll('.row.item').forEach(r=>{ r.__audioBlob=null; r.__coverBlob=null; if (r.__audioUrl){ try{ URL.revokeObjectURL(r.__audioUrl);}catch(e){} r.__audioUrl=null;} if (r.__coverUrl){ try{ URL.revokeObjectURL(r.__coverUrl);}catch(e){} r.__coverUrl=null;} }); if (typeof mdui !== 'undefined') mdui.snackbar({message:'已释放内存并撤销临时资源'}); }

  /* announcement */
  function shouldShowAnnouncement(){ const until = localStorage.getItem(ANNOUNCE_HIDE_KEY); if (!until) return true; const t = parseInt(until,10); if (isNaN(t)) return true; return Date.now() > t; }
  async function fetchAndShowAnnouncement(){ if (!shouldShowAnnouncement()) return; try{ refs.announceContent.textContent='正在加载公告…'; refs.announceRetry.style.display='none'; showModal(refs.announceMask); const res = await fetch(ANNOUNCEMENT_URL,{cache:'no-cache'}); if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`); const md = await res.text(); const html = marked.parse(md || ''); const safe = DOMPurify.sanitize(html, {ALLOWED_TAGS: DOMPurify.getDefaultWhiteList()}); refs.announceContent.innerHTML = safe; }catch(err){ console.error('公告加载失败', err); refs.announceContent.innerHTML = `<div class="announceError">公告加载失败：${CORE.escapeHtml(String(err))}</div>`; refs.announceRetry.style.display='inline-block'; } }

  /* file UI */
  function createRow(){ const row = document.createElement('div'); row.className='row item'; row.innerHTML = `<div><img class="cover" src="" alt="cover" style="opacity:.18;border-radius:8px"></div><div><div class="titleStrong">解析中…</div><div class="meta small">文件：<span class="filename"></span></div><div style="margin-top:8px" class="rowProgress" hidden><i style="width:0%"></i></div></div><div class="small format">--</div><div class="small duration">--:--</div><div style="text-align:right" class="rightActions"><button class="iconBtn preview" disabled title="播放">▶</button><button class="iconBtn download" disabled title="下载">⬇</button><button class="iconBtn coverDl" disabled title="下载封面">🖼</button></div>`; refs.list.appendChild(row); return row; }
  function setRowProgress(row,pct){ const bar = row.querySelector('.rowProgress'); const inner = bar?.querySelector('i'); if(!bar) return; bar.hidden=false; inner.style.width = Math.min(100, Math.max(0, pct)) + '%'; if(pct>=100) setTimeout(()=>bar.hidden=true,300); }

  async function processOne(file){
    const row = createRow();
    row.querySelector('.filename').textContent = file.name;
    try {
      const ab = await file.arrayBuffer();
      const data = new Uint8Array(ab);
      setRowProgress(row,5);
      const out = CORE.ncmDecrypt(data, p => setRowProgress(row, p*0.9 + 5));
      setRowProgress(row,90);
      if (out.cover && out.cover.length > 8){
        const mime = CORE.detectImageMime(out.cover);
        const coverBlob = new Blob([out.cover], {type:mime});
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
      const audioBlob = new Blob([out.audio], {type:mime});
      const audioUrl = URL.createObjectURL(audioBlob);
      globalObjectURLs.add(audioUrl);
      row.__audioBlob = audioBlob; row.__audioUrl = audioUrl;

      const aTmp = new Audio(); aTmp.preload='metadata'; aTmp.src=audioUrl;
      aTmp.addEventListener('loadedmetadata', ()=>{ const d=aTmp.duration; row.querySelector('.duration').textContent = isFinite(d) ? CORE.formatTime(d) : '--:--'; aTmp.src=''; });

      const previewBtn = row.querySelector('.preview');
      const dlBtn = row.querySelector('.download');
      const coverDl = row.querySelector('.coverDl');
      previewBtn.disabled = false; dlBtn.disabled = false; coverDl.disabled = !row.__coverBlob;
      previewBtn.addEventListener('click', ()=> openPlayer({ title, artist, album, audioBlob, coverBlob: row.__coverBlob }));
      dlBtn.addEventListener('click', ()=> saveAs(audioBlob, CORE.sanitize(`${title} - ${artist || 'unknown'}.${ext}`)));
      coverDl.addEventListener('click', ()=> {
        if (!row.__coverBlob) return;
        const extn = CORE.detectImageMime(new Uint8Array(row.__coverBlob.slice(0,4))) === 'image/png' ? '.png' : '.jpg';
        saveAs(row.__coverBlob, CORE.sanitize(`${title} - ${artist || 'unknown'}${extn}`));
      });

      if (!zip) zip = new JSZip();
      zip.file(CORE.sanitize(`${title} - ${artist || 'unknown'}.${ext}`), audioBlob);
      refs.zipBtn.disabled = false;
      setRowProgress(row,100);
    } catch (err){
      console.error('处理文件出错', err);
      row.querySelector('.titleStrong').textContent = '解密失败：' + (err.message || err);
      setRowProgress(row,100);
      // show error modal with diagnostics
      showErrorModal(err, file);
    }
  }

  /* ---------- error modal ---------- */
  function buildDiagnosticText(err, file){
    const lines = [];
    lines.push(`文件: ${file?.name || '未知'}`);
    lines.push(`时间: ${new Date().toISOString()}`);
    lines.push(`错误: ${String(err?.message || err)}`);
    if (err && err.stack) { lines.push('堆栈:'); lines.push(err.stack); }
    lines.push('');
    lines.push('浏览器信息:');
    lines.push(navigator.userAgent || '未知');
    lines.push('');
    lines.push('请把上面的信息复制并贴在反馈中（或直接用“用邮箱提交反馈”按钮）。');
    return lines.join('\n');
  }

  function showErrorModal(err, file){
    try {
      const txt = buildDiagnosticText(err, file);
      refs.errorContent.textContent = txt;
      showModal(refs.errorMask);
    } catch(e){
      console.error('显示错误模态失败', e);
    }
  }
  // copy button
  function copyDiagnostics(){
    const txt = refs.errorContent.textContent || '';
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(()=> { if (typeof mdui !== 'undefined') mdui.snackbar({message:'已复制诊断信息'}); }).catch(()=> fallbackCopy(txt));
    } else fallbackCopy(txt);
  }
  function fallbackCopy(text){
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); if (typeof mdui !== 'undefined') mdui.snackbar({message:'已复制诊断信息'}); }catch(e){ if (typeof mdui !== 'undefined') mdui.snackbar({message:'复制失败，请手动复制'}); }
    ta.remove();
  }
  // report via mailto
  function reportViaMail(){
    const subject = encodeURIComponent('NCM 工具 — 错误反馈');
    const body = encodeURIComponent(refs.errorContent.textContent || '无诊断信息');
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  /* utilities */
  function clearAll(){
    document.querySelectorAll('.row.item').forEach(r=>{
      if (r.__audioUrl){ try{ URL.revokeObjectURL(r.__audioUrl);}catch(e){} r.__audioUrl=null; }
      if (r.__coverUrl){ try{ URL.revokeObjectURL(r.__coverUrl);}catch(e){} r.__coverUrl=null; }
      r.__audioBlob=null; r.__coverBlob=null; r.remove();
    });
    zip = null; refs.zipBtn.disabled = true;
    if (typeof mdui !== 'undefined') mdui.snackbar({message:'列表已清空'});
  }

  /* bind events and init */
  function bindEvents(){
    // size
    refs.sizeOk.addEventListener('click', ()=> hideModal(refs.sizeWarning));
    window.addEventListener('resize', ()=> checkWindowSize());

    attachMaskCloseBehavior(refs.modalMask, ()=> closePlayer());
    attachMaskCloseBehavior(refs.announceMask, ()=> hideModal(refs.announceMask));
    attachMaskCloseBehavior(refs.settingsMask, ()=> hideModal(refs.settingsMask));
    attachMaskCloseBehavior(refs.errorMask, ()=> hideModal(refs.errorMask));

    refs.btnSettings.addEventListener('click', ()=> showModal(refs.settingsMask));
    refs.settingsClose.addEventListener('click', ()=> hideModal(refs.settingsMask));
    refs.openAnnouncementFromSettings.addEventListener('click', ()=> { hideModal(refs.settingsMask); fetchAndShowAnnouncement(); });

    refs.announceOk.addEventListener('click', ()=> { if (refs.announceDontShow && refs.announceDontShow.checked){ const days30 = Date.now() + 30*24*3600*1000; localStorage.setItem(ANNOUNCE_HIDE_KEY, String(days30)); } hideModal(refs.announceMask); });
    refs.announceRetry.addEventListener('click', ()=> fetchAndShowAnnouncement());

    ['dragenter','dragover'].forEach(ev => refs.drop.addEventListener(ev, e => { e.preventDefault(); refs.drop.classList.add('drag'); }));
    ['dragleave','drop'].forEach(ev => refs.drop.addEventListener(ev, e => { e.preventDefault(); refs.drop.classList.remove('drag'); }));
    refs.drop.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
    refs.fileInput.addEventListener('change', e => handleFiles(e.target.files));

    refs.clearBtn.addEventListener('click', clearAll);
    refs.releaseBtn.addEventListener('click', releaseMemory);
    refs.zipBtn.addEventListener('click', async ()=> { if (!zip) return; const blob = await zip.generateAsync({type:'blob'}); saveAs(blob, `ncm_exports_${Date.now()}.zip`); });

    // player progress
    const progressEl = refs.playerProgressBar;
    if (progressEl){
      progressEl.addEventListener('pointerdown', (e)=>{ if (!playingContext.audio) return; seeking=true; progressEl.setPointerCapture(e.pointerId); seekToPct(computePctFromEvent(e,progressEl)); });
      progressEl.addEventListener('pointermove', (e)=>{ if(!seeking) return; seekToPct(computePctFromEvent(e,progressEl)); });
      progressEl.addEventListener('pointerup', (e)=>{ if(!seeking) return; seeking=false; try{ progressEl.releasePointerCapture(e.pointerId);}catch(e){} });
      progressEl.addEventListener('click', (e)=>{ if(!playingContext.audio) return; seekToPct(computePctFromEvent(e,progressEl)); });
    }

    // player controls
    if (refs.btnPlay){ refs.btnPlay.addEventListener('click', ()=> { const audio = playingContext.audio; if(!audio) return; if (playingContext.playing){ audio.pause(); playingContext.playing=false; stopDiscLoop(); refs.svgPlay.style.display='inline'; refs.svgPause.style.display='none'; } else { audio.play().then(()=>{ playingContext.playing=true; startDiscLoop(); refs.svgPlay.style.display='none'; refs.svgPause.style.display='inline'; }).catch(()=>{}); } }); }
    if (refs.btnStop) refs.btnStop.addEventListener('click', ()=> { if(!playingContext.audio) return; try{ playingContext.audio.pause(); playingContext.audio.currentTime = 0; }catch(e){} playingContext.playing=false; stopDiscLoop(); refs.svgPlay.style.display='inline'; refs.svgPause.style.display='none'; updateProgressUI(); });
    if (refs.btnClose) refs.btnClose.addEventListener('click', ()=> closePlayer());
    if (refs.btnDownloadCover) refs.btnDownloadCover.addEventListener('click', ()=> { if (!playingContext.coverBlob) return; const ext = CORE.detectImageMime(new Uint8Array(playingContext.coverBlob.slice(0,4)))==='image/png'?'.png':'.jpg'; saveAs(playingContext.coverBlob, CORE.sanitize(`${refs.playerTitle.textContent} - ${refs.playerSub.textContent || 'cover'}${ext}`)); });

    // footer logo drag
    refs.footerLogo.addEventListener('dragover', e=>{ e.preventDefault(); refs.footerLogo.style.outline='1px dashed rgba(255,255,255,0.12)'; });
    refs.footerLogo.addEventListener('dragleave', e=>{ refs.footerLogo.style.outline=''; });
    refs.footerLogo.addEventListener('drop', e=>{ e.preventDefault(); refs.footerLogo.style.outline=''; const f = e.dataTransfer.files[0]; if(!f) return; const url = URL.createObjectURL(f); refs.footerLogo.innerHTML=''; const img = document.createElement('img'); img.src=url; img.style.width='100%'; img.style.height='100%'; img.style.objectFit='contain'; refs.footerLogo.appendChild(img); globalObjectURLs.add(url); });

    // error modal buttons
    refs.errorCopy.addEventListener('click', copyDiagnostics);
    refs.errorReport.addEventListener('click', reportViaMail);
    refs.errorClose.addEventListener('click', ()=> hideModal(refs.errorMask));
  }

  function handleFiles(files){
    if (!checkWindowSize()) { if (typeof mdui !== 'undefined') mdui.snackbar({message:'窗口太小，无法处理文件'}); return; }
    const arr = Array.from(files).filter(f=>f.name.toLowerCase().endsWith('.ncm'));
    if (arr.length === 0){ if (typeof mdui !== 'undefined') mdui.snackbar({message:'未检测到 .ncm 文件'}); return; }
    if (!zip) zip = new JSZip();
    arr.forEach(f => processOne(f));
  }

  function init(){
    initDOMRefs();
    bindEvents();
    checkWindowSize();
    // theme
    try{
      const saved = localStorage.getItem('ncm_theme_pref') || 'auto';
      if (refs.themeSelect) refs.themeSelect.value = saved;
      if (refs.themeSelect) refs.themeSelect.addEventListener('change', (e)=>{ localStorage.setItem('ncm_theme_pref', e.target.value); applyTheme(e.target.value); });
      applyTheme(localStorage.getItem('ncm_theme_pref') || 'auto');
    }catch(e){}
    // announcement
    fetchAndShowAnnouncement().catch(()=>{});
  }

  function applyTheme(pref){
    const ghLight = document.getElementById('gh-markdown-light');
    const ghDark = document.getElementById('gh-markdown-dark');
    if (pref === 'auto'){ const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; document.body.classList.toggle('theme-dark', systemDark); document.body.classList.toggle('theme-light', !systemDark); if (ghLight && ghDark){ ghLight.disabled = systemDark; ghDark.disabled = !systemDark; } }
    else if (pref === 'light'){ document.body.classList.add('theme-light'); document.body.classList.remove('theme-dark'); if (ghLight && ghDark){ ghLight.disabled = false; ghDark.disabled = true; } }
    else { document.body.classList.add('theme-dark'); document.body.classList.remove('theme-light'); if (ghLight && ghDark){ ghLight.disabled = true; ghDark.disabled = false; } }
  }

  window.NCM_UI = { openPlayer, closePlayer, releaseMemory, checkWindowSize };

  document.addEventListener('DOMContentLoaded', init);
})();
