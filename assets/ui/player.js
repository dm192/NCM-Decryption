/* assets/ui/player.js
   播放器子模块：处理播放、UI 绑定与进度更新
*/
(function(){
  const CORE = window.NCMCore;
  window.NCM_UI = window.NCM_UI || {};
  const refsGetter = () => window.NCM_UI._refs || {};
  const globalObjectURLs = window.NCM_UI.globalObjectURLs || new Set();
  const playingContext = window.NCM_UI.playingContext || { audio: null, raf: null, angle: 0, lastTs: 0, playing: false, audioUrl: null, coverUrl: null, coverBlob: null };

  function computePctFromEvent(e, el){ const rect = el.getBoundingClientRect(); const x = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX); return Math.min(1, Math.max(0, (x - rect.left) / rect.width)); }

  function updateProgressUI(){ const refs = refsGetter(); const audio = playingContext.audio; if (!audio){ if (refs.playerFill) refs.playerFill.style.width='0%'; if (refs.curTime) refs.curTime.textContent='0:00'; if (refs.durTime) refs.durTime.textContent='0:00'; return; } const dur = isFinite(audio.duration)?audio.duration:0; const cur = isFinite(audio.currentTime)?audio.currentTime:0; const pct = dur>0?(cur/dur)*100:0; if (refs.playerFill) refs.playerFill.style.width=Math.min(100,Math.max(0,pct))+'%'; if (refs.curTime) refs.curTime.textContent = CORE.formatTime(cur); if (refs.durTime) refs.durTime.textContent = CORE.formatTime(dur); }

  function startDiscLoop(){ const refs = refsGetter(); if (playingContext.raf) return; playingContext.lastTs = performance.now(); function step(ts){ if (!playingContext.playing || !playingContext.audio){ playingContext.raf=null; return; } const dt=(ts-playingContext.lastTs)/1000; playingContext.lastTs=ts; const speed=60; playingContext.angle=(playingContext.angle+speed*dt)%360; if (refs.discImg) refs.discImg.style.transform=`rotate(${playingContext.angle}deg)`; updateProgressUI(); playingContext.raf = requestAnimationFrame(step);} playingContext.raf = requestAnimationFrame(step); }
  function stopDiscLoop(){ if (playingContext.raf){ cancelAnimationFrame(playingContext.raf); playingContext.raf=null; } }
  function seekToPct(pct){ const audio = playingContext.audio; if (!audio || !isFinite(audio.duration) || audio.duration<=0) return; audio.currentTime = pct*audio.duration; updateProgressUI(); }

  function cleanupPlayer(){ if (playingContext.audio){ try{ playingContext.audio.pause(); playingContext.audio.src=''; }catch(e){} playingContext.audio=null; } stopDiscLoop(); }

  function openPlayer({title, artist, album, audioBlob, coverBlob}){
    const refs = refsGetter();
    cleanupPlayer();
    if (refs.playerTitle) refs.playerTitle.textContent = title || '未知';
    if (refs.playerSub) refs.playerSub.textContent = artist || album || '';
    if (coverBlob && refs.discImg){ const coverUrl = URL.createObjectURL(coverBlob); globalObjectURLs.add(coverUrl); playingContext.coverUrl = coverUrl; playingContext.coverBlob = coverBlob; refs.discImg.src = coverUrl; } else { if (refs.discImg) refs.discImg.src=''; playingContext.coverBlob=null; }
    const audioUrl = URL.createObjectURL(audioBlob); globalObjectURLs.add(audioUrl); playingContext.audioUrl = audioUrl;
    const audio = new Audio(); audio.src = audioUrl; audio.preload = 'metadata'; playingContext.audio = audio; playingContext.playing = false;
    audio.addEventListener('loadedmetadata', ()=> updateProgressUI());
    audio.addEventListener('timeupdate', ()=> updateProgressUI());
    audio.addEventListener('ended', ()=> { playingContext.playing=false; stopDiscLoop(); const refs2 = refsGetter(); if (refs2.svgPlay) refs2.svgPlay.style.display='inline'; if (refs2.svgPause) refs2.svgPause.style.display='none'; updateProgressUI(); });
    if (refs.modalMask) showModal(refs.modalMask);
    setTimeout(()=> { audio.play().then(()=>{ playingContext.playing=true; startDiscLoop(); const refs2 = refsGetter(); if (refs2.svgPlay) refs2.svgPlay.style.display='none'; if (refs2.svgPause) refs2.svgPause.style.display='inline'; }).catch(()=>{ playingContext.playing=false; const refs2 = refsGetter(); if (refs2.svgPlay) refs2.svgPlay.style.display='inline'; if (refs2.svgPause) refs2.svgPause.style.display='none'; }); }, 140);
  }

  function closePlayer(){ const refs = refsGetter(); cleanupPlayer(); if (playingContext.audioUrl){ try{ URL.revokeObjectURL(playingContext.audioUrl);}catch(e){} globalObjectURLs.delete(playingContext.audioUrl); playingContext.audioUrl=null; } if (playingContext.coverUrl){ try{ URL.revokeObjectURL(playingContext.coverUrl);}catch(e){} globalObjectURLs.delete(playingContext.coverUrl); playingContext.coverUrl=null; playingContext.coverBlob=null; } if (refs.modalMask) hideModal(refs.modalMask); if (refs.playerFill) refs.playerFill.style.width='0%'; if (refs.curTime) refs.curTime.textContent='0:00'; if (refs.durTime) refs.durTime.textContent='0:00'; if (refs.svgPlay) refs.svgPlay.style.display='inline'; if (refs.svgPause) refs.svgPause.style.display='none'; }

  // 导出到共享命名空间
  window.NCM_UI.openPlayer = openPlayer;
  window.NCM_UI.closePlayer = closePlayer;
  window.NCM_UI.updateProgressUI = updateProgressUI;
  window.NCM_UI.seekToPct = seekToPct;
  window.NCM_UI.startDiscLoop = startDiscLoop;
  window.NCM_UI.stopDiscLoop = stopDiscLoop;

  // 由于 player 模块运行在页面脚本后载入，它不能直接调用 showModal/hideModal 定义在另一个模块中；
  // 但这些函数会在全局作用域内存在于 app-ui.js，因此在需要时可以直接调用。
})();
