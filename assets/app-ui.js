/* assets/app-ui.js (修复：确保 init 在 DOM 已就绪时总会执行；增加上传调试/容错) */
(function(){
  const CORE = window.NCMCore;
  if (!CORE) { console.error('NCMCore 未就绪 — 请先加载 app-core.js'); return; }

  let refs = {};
  let zip = null;
  // 使用共享命名空间以便拆分模块时复用状态
  window.NCM_UI = window.NCM_UI || {};
  window.NCM_UI.globalObjectURLs = window.NCM_UI.globalObjectURLs || new Set();
  window.NCM_UI.playingContext = window.NCM_UI.playingContext || { audio: null, raf: null, angle: 0, lastTs: 0, playing: false, audioUrl: null, coverUrl: null, coverBlob: null };
  const globalObjectURLs = window.NCM_UI.globalObjectURLs;
  const playingContext = window.NCM_UI.playingContext;
  const MIN_WIDTH = 600, MIN_HEIGHT = 520;
  const ANNOUNCEMENT_URL = 'https://cdn-cf.dormant.top/ncm/announcement.md';
  const ANNOUNCE_HIDE_KEY = 'ncm_announce_hide_until';

  /* modal helpers moved to assets/ui/modals.js */
  const _findModalInner = (...args) => window.NCM_UI._findModalInner?.(...args);
  const showModal = (...args) => window.NCM_UI.showModal?.(...args);
  const hideModal = (...args) => window.NCM_UI.hideModal?.(...args);
  const attachMaskCloseBehavior = (...args) => window.NCM_UI.attachMaskCloseBehavior?.(...args);

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
  // 供其他模块访问 refs
  window.NCM_UI._refs = refs;
  }

  /* size check */
  function checkWindowSize(){
    const ok = window.innerWidth >= MIN_WIDTH && window.innerHeight >= MIN_HEIGHT;
    if (!ok){ if (refs.sizeWarning) showModal(refs.sizeWarning); if (refs.list) refs.list.style.display = 'none'; if (refs.drop) refs.drop.setAttribute('aria-disabled','true'); }
    else { if (refs.sizeWarning) hideModal(refs.sizeWarning); if (refs.list) refs.list.style.display = ''; if (refs.drop) refs.drop.removeAttribute('aria-disabled'); }
    return ok;
  }

  /* player helpers moved to assets/ui/player.js for modularity */
  // 保留 seeking 状态用于 progress 交互
  let seeking = false;

  function releaseMemory(){ window.NCM_UI.cleanupPlayer && window.NCM_UI.cleanupPlayer(); globalObjectURLs.forEach(u=>{ try{ URL.revokeObjectURL(u);}catch(e){} }); globalObjectURLs.clear(); document.querySelectorAll('.row.item').forEach(r=>{ r.__audioBlob=null; r.__coverBlob=null; if (r.__audioUrl){ try{ URL.revokeObjectURL(r.__audioUrl);}catch(e){} r.__audioUrl=null; } if (r.__coverUrl){ try{ URL.revokeObjectURL(r.__coverUrl);}catch(e){} r.__coverUrl=null; } }); if (typeof mdui !== 'undefined') mdui.snackbar({message:'已释放内存并撤销临时资源'}); }

  /* announcement */
  function shouldShowAnnouncement(){ const until = localStorage.getItem(ANNOUNCE_HIDE_KEY); if (!until) return true; const t = parseInt(until,10); if (isNaN(t)) return true; return Date.now() > t; }
  async function fetchAndShowAnnouncement(){
    if (!shouldShowAnnouncement()) return;
    try{
      if (refs.announceContent) refs.announceContent.textContent='正在加载公告…';
      if (refs.announceRetry) refs.announceRetry.style.display='none';
      if (refs.announceMask) showModal(refs.announceMask);
      const res = await fetch(ANNOUNCEMENT_URL,{cache:'no-cache'});
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const md = await res.text();
      const html = marked.parse(md || '');
      let safe;
      try {
        if (typeof DOMPurify !== 'undefined') {
          // Prefer to just call sanitize; try to read default config for allowed tags when available
          const cfg = (typeof DOMPurify.getDefaultCfg === 'function') ? DOMPurify.getDefaultCfg() : (DOMPurify.defaultConfig || {});
          const allowed = cfg && cfg.ALLOWED_TAGS ? cfg.ALLOWED_TAGS : undefined;
          safe = (allowed && Array.isArray(allowed)) ? DOMPurify.sanitize(html, {ALLOWED_TAGS: allowed}) : DOMPurify.sanitize(html);
        } else {
          console.warn('DOMPurify 未加载，公告内容将不被消毒');
          safe = html;
        }
      } catch (e) {
        console.error('DOMPurify sanitize failed, falling back to plain html', e);
        try { safe = (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) ? DOMPurify.sanitize(html) : html; } catch(e2) { safe = html; }
      }
      if (refs.announceContent) refs.announceContent.innerHTML = safe;
    }catch(err){
      console.error('公告加载失败', err);
      if (refs.announceContent) refs.announceContent.innerHTML = `<div class="announceError">公告加载失败：${CORE.escapeHtml(String(err))}</div>`;
      if (refs.announceRetry) refs.announceRetry.style.display='inline-block';
    }
  }

  /* file UI */
  function createRow(){ const row = document.createElement('div'); row.className='row item'; row.innerHTML = `<div><img class="cover" src="" alt="cover" style="opacity:.18;border-radius:8px"></div><div><div class="titleStrong">解析中…</div><div class="meta small">文件：<span class="filename"></span></div><div style="margin-top:8px" class="rowProgress" hidden><i style="width:0%"></i></div></div><div class="small format">--</div><div class="small duration">--:--</div><div style="text-align:right" class="rightActions"><button class="iconBtn preview" disabled title="播放">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
</button>
<button class="iconBtn download" disabled title="下载">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
</button>
<button class="iconBtn coverDl" disabled title="下载封面">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="14" rx="2"></rect>
    <path d="M21 15l-5-5-4 4-3-3-4 4"></path>
    <line x1="12" y1="17" x2="12" y2="22"></line>
    <polyline points="9 19 12 22 15 19"></polyline>
  </svg>
</button></div>`; if (refs.list) refs.list.appendChild(row); return row; }
  function setRowProgress(row,pct){ const bar = row.querySelector('.rowProgress'); const inner = bar?.querySelector('i'); if(!bar) return; bar.hidden=false; inner.style.width = Math.min(100, Math.max(0, pct)) + '%'; if(pct>=100) setTimeout(()=>bar.hidden=true,300); }

  async function processOne(file){
    const row = createRow();
    if (row.querySelector('.filename')) row.querySelector('.filename').textContent = file.name;
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
        const img = row.querySelector('.cover'); if (img) { img.src = coverUrl; img.style.opacity = 1; }
        row.__coverBlob = coverBlob; row.__coverUrl = coverUrl;
      }
      const title = (out.meta && out.meta.musicName) ? out.meta.musicName : file.name.replace(/\.ncm$/i,'');
      const artist = (out.meta && out.meta.artist) ? out.meta.artist.map(a=>a[0]).join(', ') : (out.meta && out.meta.artistName) ? out.meta.artistName : '';
      const album = (out.meta && (out.meta.album || out.meta.albumName)) ? (out.meta.album || out.meta.albumName) : '';
      const titleEl = row.querySelector('.titleStrong'); if (titleEl) titleEl.textContent = title + (artist ? (' — ' + artist) : '');
      if (album && row.querySelector('.meta')) row.querySelector('.meta').textContent = '专辑：' + album;
      const ext = (out.ext && out.ext.toLowerCase()) || (out.mime && out.mime.includes('flac') ? 'flac' : 'mp3');
      const mime = out.mime || (ext === 'flac' ? 'audio/flac' : 'audio/mpeg');
      const audioBlob = new Blob([out.audio], {type:mime});
      const audioUrl = URL.createObjectURL(audioBlob);
      globalObjectURLs.add(audioUrl);
      row.__audioBlob = audioBlob; row.__audioUrl = audioUrl;

      const aTmp = new Audio(); aTmp.preload='metadata'; aTmp.src=audioUrl;
      aTmp.addEventListener('loadedmetadata', ()=>{ const d=aTmp.duration; const durationEl = row.querySelector('.duration'); if (durationEl) durationEl.textContent = isFinite(d) ? CORE.formatTime(d) : '--:--'; aTmp.src=''; });

      const previewBtn = row.querySelector('.preview');
      const dlBtn = row.querySelector('.download');
      const coverDl = row.querySelector('.coverDl');
      if (previewBtn) previewBtn.disabled = false;
      if (dlBtn) dlBtn.disabled = false;
      if (coverDl) coverDl.disabled = !row.__coverBlob;

  if (previewBtn) previewBtn.addEventListener('click', ()=> window.NCM_UI.openPlayer && window.NCM_UI.openPlayer({ title, artist, album, audioBlob, coverBlob: row.__coverBlob }));
      if (dlBtn) dlBtn.addEventListener('click', ()=> saveAs(audioBlob, CORE.sanitize(`${title} - ${artist || 'unknown'}.${ext}`)));
      if (coverDl) coverDl.addEventListener('click', ()=> {
        if (!row.__coverBlob) return;
        const extn = CORE.detectImageMime(new Uint8Array(row.__coverBlob.slice(0,4))) === 'image/png' ? '.png' : '.jpg';
        saveAs(row.__coverBlob, CORE.sanitize(`${title} - ${artist || 'unknown'}${extn}`));
      });

      if (!zip) zip = new JSZip();
      zip.file(CORE.sanitize(`${title} - ${artist || 'unknown'}.${ext}`), audioBlob);
      if (refs.zipBtn) refs.zipBtn.disabled = false;
      setRowProgress(row,100);
    } catch (err){
      console.error('处理文件出错', err);
      const titleEl = row.querySelector('.titleStrong');
      if (titleEl) titleEl.textContent = '解密失败：' + (err.message || err);
      setRowProgress(row,100);
      // show error modal with diagnostics
      try { showErrorModal(err, file); } catch(e2){ console.error('显示错误模态失败', e2); }
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
      if (refs.errorContent) refs.errorContent.textContent = txt;
      if (refs.errorMask) showModal(refs.errorMask);
    } catch(e){
      console.error('显示错误模态失败', e);
    }
  }
  function copyDiagnostics(){
    const txt = refs.errorContent?.textContent || '';
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(()=> { if (typeof mdui !== 'undefined') mdui.snackbar({message:'已复制诊断信息'}); }).catch(()=> fallbackCopy(txt));
    } else fallbackCopy(txt);
  }
  function fallbackCopy(text){
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); if (typeof mdui !== 'undefined') mdui.snackbar({message:'已复制诊断信息'}); }catch(e){ if (typeof mdui !== 'undefined') mdui.snackbar({message:'复制失败，请手动复制'}); }
    ta.remove();
  }
  function reportViaMail(){ const subject = encodeURIComponent('NCM 工具 — 错误反馈'); const body = encodeURIComponent(refs.errorContent?.textContent || '无诊断信息'); window.location.href = `mailto:?subject=${subject}&body=${body}`; }

  /* utilities */
  function clearAll(){
    document.querySelectorAll('.row.item').forEach(r=>{
      if (r.__audioUrl){ try{ URL.revokeObjectURL(r.__audioUrl);}catch(e){} r.__audioUrl=null; }
      if (r.__coverUrl){ try{ URL.revokeObjectURL(r.__coverUrl);}catch(e){} r.__coverUrl=null; }
      r.__audioBlob=null; r.__coverBlob=null; r.remove();
    });
    zip = null; if (refs.zipBtn) refs.zipBtn.disabled = true;
    if (typeof mdui !== 'undefined') mdui.snackbar({message:'列表已清空'});
  }

  /* bind events and init */
  function bindEvents(){
    if (!refs) return;
  // size
  // 移除“我知道了”按钮的关闭事件，使模态框只能自动关闭
  window.addEventListener('resize', ()=> checkWindowSize());

  attachMaskCloseBehavior(refs.modalMask, ()=> { if (window.NCM_UI && typeof window.NCM_UI.closePlayer === 'function') window.NCM_UI.closePlayer(); });
    attachMaskCloseBehavior(refs.announceMask, ()=> hideModal(refs.announceMask));
    attachMaskCloseBehavior(refs.settingsMask, ()=> hideModal(refs.settingsMask));
    attachMaskCloseBehavior(refs.errorMask, ()=> hideModal(refs.errorMask));

    if (refs.btnSettings) refs.btnSettings.addEventListener('click', ()=> showModal(refs.settingsMask));
    if (refs.settingsClose) refs.settingsClose.addEventListener('click', ()=> hideModal(refs.settingsMask));
    if (refs.openAnnouncementFromSettings) {
      refs.openAnnouncementFromSettings.addEventListener('click', () => {
        hideModal(refs.settingsMask);
        fetchAndShowAnnouncement().catch(err => {
          console.error('公告加载失败', err);
          if (refs.announceContent) refs.announceContent.textContent = '公告加载失败，请重试。';
          if (refs.announceRetry) refs.announceRetry.style.display = 'inline';
        });
      });
    }

    if (refs.announceOk) refs.announceOk.addEventListener('click', ()=> { if (refs.announceDontShow && refs.announceDontShow.checked){ const days30 = Date.now() + 30*24*3600*1000; localStorage.setItem(ANNOUNCE_HIDE_KEY, String(days30)); } hideModal(refs.announceMask); });
    if (refs.announceRetry) refs.announceRetry.addEventListener('click', ()=> fetchAndShowAnnouncement());

    if (refs.drop){
      ['dragenter','dragover'].forEach(ev => refs.drop.addEventListener(ev, e => { e.preventDefault(); refs.drop.classList.add('drag'); }));
      ['dragleave','drop'].forEach(ev => refs.drop.addEventListener(ev, e => { e.preventDefault(); refs.drop.classList.remove('drag'); }));
      refs.drop.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
    }
    if (refs.fileInput) refs.fileInput.addEventListener('change', e => handleFiles(e.target.files));

    if (refs.clearBtn) refs.clearBtn.addEventListener('click', clearAll);
    if (refs.releaseBtn) refs.releaseBtn.addEventListener('click', releaseMemory);
    if (refs.zipBtn) refs.zipBtn.addEventListener('click', async ()=> { if (!zip) return; const blob = await zip.generateAsync({type:'blob'}); saveAs(blob, `ncm_exports_${Date.now()}.zip`); });

    // player progress
    const progressEl = refs.playerProgressBar;
    if (progressEl){
  progressEl.addEventListener('pointerdown', (e)=>{ if (!window.NCM_UI.playingContext?.audio) return; seeking=true; progressEl.setPointerCapture(e.pointerId); window.NCM_UI.seekToPct(window.NCM_UI.computePctFromEvent(e,progressEl)); });
  progressEl.addEventListener('pointermove', (e)=>{ if(!seeking) return; window.NCM_UI.seekToPct(window.NCM_UI.computePctFromEvent(e,progressEl)); });
      progressEl.addEventListener('pointerup', (e)=>{ if(!seeking) return; seeking=false; try{ progressEl.releasePointerCapture(e.pointerId);}catch(e){} });
  progressEl.addEventListener('click', (e)=>{ if(!window.NCM_UI.playingContext?.audio) return; window.NCM_UI.seekToPct(window.NCM_UI.computePctFromEvent(e,progressEl)); });
    }

    // player controls
  if (refs.btnPlay) refs.btnPlay.addEventListener('click', ()=> { const audio = window.NCM_UI.playingContext.audio; if(!audio) return; if (window.NCM_UI.playingContext.playing){ audio.pause(); window.NCM_UI.playingContext.playing=false; window.NCM_UI.stopDiscLoop(); if (refs.svgPlay) refs.svgPlay.style.display='inline'; if (refs.svgPause) refs.svgPause.style.display='none'; } else { audio.play().then(()=>{ window.NCM_UI.playingContext.playing=true; window.NCM_UI.startDiscLoop(); if (refs.svgPlay) refs.svgPlay.style.display='none'; if (refs.svgPause) refs.svgPause.style.display='inline'; }).catch(()=>{}); } });
  if (refs.btnStop) refs.btnStop.addEventListener('click', ()=> { if(!window.NCM_UI.playingContext.audio) return; try{ window.NCM_UI.playingContext.audio.pause(); window.NCM_UI.playingContext.audio.currentTime = 0; }catch(e){} window.NCM_UI.playingContext.playing=false; window.NCM_UI.stopDiscLoop(); if (refs.svgPlay) refs.svgPlay.style.display='inline'; if (refs.svgPause) refs.svgPause.style.display='none'; window.NCM_UI.updateProgressUI(); });
  if (refs.btnClose) refs.btnClose.addEventListener('click', ()=> window.NCM_UI.closePlayer());
  if (refs.btnDownloadCover) refs.btnDownloadCover.addEventListener('click', ()=> { if (!window.NCM_UI.playingContext.coverBlob) return; const ext = CORE.detectImageMime(new Uint8Array(window.NCM_UI.playingContext.coverBlob.slice(0,4)))==='image/png'?'.png':'.jpg'; saveAs(window.NCM_UI.playingContext.coverBlob, CORE.sanitize(`${refs.playerTitle.textContent} - ${refs.playerSub.textContent || 'cover'}${ext}`)); });

    // footer logo drag
    if (refs.footerLogo){
      refs.footerLogo.addEventListener('dragover', e=>{ e.preventDefault(); refs.footerLogo.style.outline='1px dashed rgba(255,255,255,0.12)'; });
      refs.footerLogo.addEventListener('dragleave', e=>{ refs.footerLogo.style.outline=''; });
      refs.footerLogo.addEventListener('drop', e=>{ e.preventDefault(); refs.footerLogo.style.outline=''; const f = e.dataTransfer.files[0]; if(!f) return; const url = URL.createObjectURL(f); refs.footerLogo.innerHTML=''; const img = document.createElement('img'); img.src=url; img.style.width='100%'; img.style.height='100%'; img.style.objectFit='contain'; refs.footerLogo.appendChild(img); globalObjectURLs.add(url); });
    }

    // error modal buttons
    if (refs.errorCopy) refs.errorCopy.addEventListener('click', copyDiagnostics);
    if (refs.errorReport) refs.errorReport.addEventListener('click', reportViaMail);
    if (refs.errorClose) refs.errorClose.addEventListener('click', ()=> hideModal(refs.errorMask));
  }

  function handleFiles(files){
    try {
      console.log('[NCM] handleFiles called, files:', files && files.length ? files.length : 0);
      if (!checkWindowSize()) { if (typeof mdui !== 'undefined') mdui.snackbar({message:'窗口太小，无法处理文件'}); return; }
      const arr = Array.from(files || []).filter(f=>f && f.name && f.name.toLowerCase().endsWith('.ncm'));
      if (arr.length === 0){ if (typeof mdui !== 'undefined') mdui.snackbar({message:'未检测到 .ncm 文件'}); return; }
      if (!zip) zip = new JSZip();
      arr.forEach(f => processOne(f));
    } catch (err) {
      console.error('handleFiles 错误', err);
      try { showErrorModal(err, { name: (files && files[0] && files[0].name) ? files[0].name : '未知' }); } catch(e){ console.error('显示错误模态失败', e); }
    }
  }

  function init(){
    try {
      initDOMRefs();
      bindEvents();
      checkWindowSize();
      // theme
      // 移除主题切换功能
      // const themeToggleBtn = document.getElementById('themeToggleBtn');
      // const lightThemeCss = document.getElementById('gh-markdown-light');
      // const darkThemeCss = document.getElementById('gh-markdown-dark');
      //
      // function setTheme(isDark) {
      //   document.documentElement.classList.toggle('dark', isDark);
      //   lightThemeCss.disabled = isDark;
      //   darkThemeCss.disabled = !isDark;
      //   localStorage.setItem('theme', isDark ? 'dark' : 'light');
      // }
      //
      // themeToggleBtn.addEventListener('click', () => {
      //   setTheme(!document.documentElement.classList.contains('dark'));
      // });
      //
      // // 初始化主题
      // const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      // const savedTheme = localStorage.getItem('theme');
      // setTheme(savedTheme === 'dark' || (savedTheme === null && prefersDark));
      
      // 统一使用暗色主题
      document.documentElement.classList.add('dark');
      if (document.getElementById('gh-markdown-light')) {
        document.getElementById('gh-markdown-light').disabled = true;
      }
      if (document.getElementById('gh-markdown-dark')) {
        document.getElementById('gh-markdown-dark').disabled = false;
      }
      // announcement
      fetchAndShowAnnouncement().catch(()=>{});
      console.log('[NCM] UI initialized');
    } catch(e){
      console.error('初始化 UI 时出错', e);
      try { showErrorModal(e); } catch(err2){ console.error('显示错误模态失败', err2); }
    }
  }

  // 不要覆盖整个 window.NCM_UI，逐个注册方法以保留其它模块导出的函数
  window.NCM_UI.releaseMemory = releaseMemory;
  window.NCM_UI.checkWindowSize = checkWindowSize;

  // IMPORTANT FIX: ensure init runs whether DOMContentLoaded already fired or not
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already ready — initialize immediately
    init();
  }
})();
