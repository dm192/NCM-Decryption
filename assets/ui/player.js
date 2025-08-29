/* assets/ui/player.js
   播放器子模块：处理播放、UI 绑定与进度更新
*/
(function(){
    const CORE = window.NCMCore || {
        formatTime: t => {
            if (!isFinite(t) || t<=0) return '0:00';
            const m = Math.floor(t/60), s = Math.floor(t%60).toString().padStart(2,'0');
            return `${m}:${s}`;
        },
        sanitize: s => (s||'').replace(/[\\/:*?"<>|]/g,'_')
    };

    // global namespace
    window.NCM_UI = window.NCM_UI || {};
    const refsGetter = () => window.NCM_UI._refs || {};
    const globalObjectURLs = window.NCM_UI.globalObjectURLs = window.NCM_UI.globalObjectURLs || new Set();
    const playingContext = window.NCM_UI.playingContext = window.NCM_UI.playingContext || {
        audio: null, raf: null, angle: 0, lastTs: 0, playing: false, audioUrl: null, coverUrl: null, coverBlob: null
    };

    // small helper
    function clamp01(v){ return Math.min(1, Math.max(0, v)); }

    function computePctFromEvent(e, el){
        const rect = el.getBoundingClientRect();
        const x = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX);
        return clamp01((x - rect.left) / rect.width);
    }
    window.NCM_UI.computePctFromEvent = computePctFromEvent;

    // 更新 UI：进度条/时间文本
    function updateProgressUI(){
        const refs = refsGetter();
        const audio = playingContext.audio;
        if (!audio){
            if (refs.playerFill) refs.playerFill.style.width = '0%';
            if (refs.curTime) refs.curTime.textContent = '0:00';
            if (refs.durTime) refs.durTime.textContent = '0:00';
            return;
        }
        const dur = isFinite(audio.duration) ? audio.duration : 0;
        const cur = isFinite(audio.currentTime) ? audio.currentTime : 0;
        const pct = dur > 0 ? (cur/dur)*100 : 0;
        if (refs.playerFill) refs.playerFill.style.width = pct + '%';
        if (refs.curTime) refs.curTime.textContent = CORE.formatTime(cur);
        if (refs.durTime) refs.durTime.textContent = CORE.formatTime(dur);
    }

    // 旋转与同步的 RAF loop（让封面旋转与进度更流畅）
    function startDiscLoop(){
        const refs = refsGetter();
        if (playingContext.raf) return;
        playingContext.lastTs = performance.now();
        function step(ts){
            if (!playingContext.playing || !playingContext.audio){ playingContext.raf = null; return; }
            const dt = (ts - playingContext.lastTs)/1000;
            playingContext.lastTs = ts;
            const speed = 60; // degrees per second
            playingContext.angle = (playingContext.angle + speed * dt) % 360;
            if (refs.discImg) refs.discImg.style.transform = `rotate(${playingContext.angle}deg)`;
            // RAF 同步也更新进度（比单靠 timeupdate 更平滑）
            updateProgressUI();
            playingContext.raf = requestAnimationFrame(step);
        }
        playingContext.raf = requestAnimationFrame(step);
    }
    function stopDiscLoop(){ if (playingContext.raf){ cancelAnimationFrame(playingContext.raf); playingContext.raf = null; } }

    function seekToPct(pct){
        const audio = playingContext.audio;
        if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return;
        audio.currentTime = clamp01(pct) * audio.duration;
        updateProgressUI();
    }

    function cleanupPlayer(){
        if (playingContext.audio){
            try { playingContext.audio.pause(); playingContext.audio.src = ''; } catch(e){}
            playingContext.audio = null;
        }
        stopDiscLoop();
    }

    // open player and auto-play
    function openPlayer({title, artist, album, audioBlob, coverBlob}){
        const refs = refsGetter();
        cleanupPlayer();

        if (refs.playerTitle) refs.playerTitle.textContent = title || '未知';
        if (refs.playerSub) refs.playerSub.textContent = artist || album || '';

        if (coverBlob && refs.discImg){
            try {
                const coverUrl = URL.createObjectURL(coverBlob);
                globalObjectURLs.add(coverUrl);
                playingContext.coverUrl = coverUrl; playingContext.coverBlob = coverBlob;
                refs.discImg.src = coverUrl;
            } catch(e){ refs.discImg.src = ''; }
        } else { if (refs.discImg) refs.discImg.src = ''; playingContext.coverBlob = null; }

        const audioUrl = URL.createObjectURL(audioBlob);
        globalObjectURLs.add(audioUrl);
        playingContext.audioUrl = audioUrl;

        const audio = new Audio();
        audio.src = audioUrl;
        audio.preload = 'metadata';
        playingContext.audio = audio;
        playingContext.playing = false;

        // events
        audio.addEventListener('loadedmetadata', ()=> updateProgressUI());
        audio.addEventListener('timeupdate', ()=> updateProgressUI());
        audio.addEventListener('ended', ()=>{
            playingContext.playing = false;
            stopDiscLoop();
            const r = refsGetter();
            if (r.svgPlay) r.svgPlay.style.display = 'inline';
            if (r.svgPause) r.svgPause.style.display = 'none';
            updateProgressUI();
        });

        // show modal (delegate to global showModal if exists)
        if (refs.modalMask && window.NCM_UI.showModal) window.NCM_UI.showModal(refs.modalMask);

        // start playback
        setTimeout(()=>{
            audio.play().then(()=>{
                playingContext.playing = true;
                startDiscLoop();
                const r = refsGetter();
                if (r.svgPlay) r.svgPlay.style.display = 'none';
                if (r.svgPause) r.svgPause.style.display = 'inline';
                // ensure discImg not paused class
                if (r.discImg) r.discImg.classList.remove('paused');
            }).catch(()=>{ // autoplay blocked
                playingContext.playing = false;
                const r = refsGetter();
                if (r.svgPlay) r.svgPlay.style.display = 'inline';
                if (r.svgPause) r.svgPause.style.display = 'none';
            });
        }, 120);
    }

    function closePlayer(){
        const refs = refsGetter();
        cleanupPlayer();
        if (playingContext.audioUrl){ try { URL.revokeObjectURL(playingContext.audioUrl); }catch(e){} globalObjectURLs.delete(playingContext.audioUrl); playingContext.audioUrl = null; }
        if (playingContext.coverUrl){ try { URL.revokeObjectURL(playingContext.coverUrl); }catch(e){} globalObjectURLs.delete(playingContext.coverUrl); playingContext.coverUrl = null; playingContext.coverBlob = null; }
        if (refs.modalMask && window.NCM_UI.hideModal) window.NCM_UI.hideModal(refs.modalMask);
        if (refs.playerFill) refs.playerFill.style.width = '0%';
        if (refs.curTime) refs.curTime.textContent = '0:00';
        if (refs.durTime) refs.durTime.textContent = '0:00';
        if (refs.svgPlay) refs.svgPlay.style.display = 'inline';
        if (refs.svgPause) refs.svgPause.style.display = 'none';
    }

    // Bind player UI controls (call after refs are injected)
    function bindPlayerControls(){
        const refs = refsGetter();
        if (!refs) return;
        // play/pause toggle
        if (refs.btnPlay){
            refs.btnPlay.addEventListener('click', ()=>{
                const audio = playingContext.audio;
                if (!audio) return;
                if (playingContext.playing){
                    audio.pause();
                    playingContext.playing = false;
                    stopDiscLoop();
                    if (refs.svgPlay) refs.svgPlay.style.display = 'inline';
                    if (refs.svgPause) refs.svgPause.style.display = 'none';
                    if (refs.discImg) refs.discImg.classList.add('paused');
                } else {
                    audio.play().then(()=>{
                        playingContext.playing = true;
                        startDiscLoop();
                        if (refs.svgPlay) refs.svgPlay.style.display = 'none';
                        if (refs.svgPause) refs.svgPause.style.display = 'inline';
                        if (refs.discImg) refs.discImg.classList.remove('paused');
                    }).catch(()=>{});
                }
            });
        }
        // stop
        if (refs.btnStop){
            refs.btnStop.addEventListener('click', ()=>{
                if (!playingContext.audio) return;
                try { playingContext.audio.pause(); playingContext.audio.currentTime = 0; } catch(e){}
                playingContext.playing = false;
                stopDiscLoop();
                if (refs.svgPlay) refs.svgPlay.style.display = 'inline';
                if (refs.svgPause) refs.svgPause.style.display = 'none';
                updateProgressUI();
                if (refs.discImg) refs.discImg.classList.add('paused');
            });
        }
        // close
        if (refs.btnClose){
            refs.btnClose.addEventListener('click', ()=> closePlayer());
        }
        // download cover
        if (refs.btnDownloadCover){
            refs.btnDownloadCover.addEventListener('click', ()=>{
                if (!playingContext.coverBlob) return;
                const ext = 'png'; // fallback — better to detect mime if available
                const name = CORE.sanitize((refs.playerTitle?.textContent||'track') + '_cover.' + ext);
                if (typeof saveAs !== 'undefined') saveAs(playingContext.coverBlob, name);
            });
        }

        // progress bar: support pointer drag + click
        if (refs.playerProgressBar){
            let isSeeking = false;
            let lastPctDuringDrag = 0;

            refs.playerProgressBar.addEventListener('pointerdown', (ev) => {
                if (!playingContext.audio) return;
                isSeeking = true;
                refs.playerProgressBar.setPointerCapture(ev.pointerId);
                lastPctDuringDrag = computePctFromEvent(ev, refs.playerProgressBar);
                // visually update fill during drag
                if (refs.playerFill) refs.playerFill.style.width = (lastPctDuringDrag*100) + '%';
                if (refs.curTime && isFinite(playingContext.audio.duration)) refs.curTime.textContent = CORE.formatTime(lastPctDuringDrag * playingContext.audio.duration);
            });

            refs.playerProgressBar.addEventListener('pointermove', (ev) => {
                if (!isSeeking) return;
                lastPctDuringDrag = computePctFromEvent(ev, refs.playerProgressBar);
                if (refs.playerFill) refs.playerFill.style.width = (lastPctDuringDrag*100) + '%';
                if (refs.curTime && isFinite(playingContext.audio.duration)) refs.curTime.textContent = CORE.formatTime(lastPctDuringDrag * playingContext.audio.duration);
            });

            refs.playerProgressBar.addEventListener('pointerup', (ev) => {
                if (!isSeeking) return;
                isSeeking = false;
                try { refs.playerProgressBar.releasePointerCapture(ev.pointerId); } catch(e){}
                const pct = computePctFromEvent(ev, refs.playerProgressBar);
                seekToPct(pct);
            });

            // click quick seek (when not dragging)
            refs.playerProgressBar.addEventListener('click', (ev)=>{
                if (!playingContext.audio) return;
                const pct = computePctFromEvent(ev, refs.playerProgressBar);
                seekToPct(pct);
            });
        }
    }

    // Expose functions
    window.NCM_UI.openPlayer = openPlayer;
    window.NCM_UI.closePlayer = closePlayer;
    window.NCM_UI.updateProgressUI = updateProgressUI;
    window.NCM_UI.seekToPct = seekToPct;
    window.NCM_UI.startDiscLoop = startDiscLoop;
    window.NCM_UI.stopDiscLoop = stopDiscLoop;
    window.NCM_UI.cleanupPlayer = cleanupPlayer;
    window.NCM_UI.bindPlayerControls = bindPlayerControls;

    // Try auto-binding if refs already present
    try {
        const autoRefs = refsGetter();
        if (autoRefs && autoRefs.playerProgressBar) {
            // delay a tick to ensure other modules finished wiring
            setTimeout(()=> {
                try { bindPlayerControls(); } catch(e){ /* ignore */ }
            }, 50);
        }
    } catch(e){}
})();
