/* assets/ui/audio.js
   音频处理模块：音频分析、可视化和高级播放功能
*/
(function(){
  window.NCM_UI = window.NCM_UI || {};
  const state = window.NCM_UI.state || {};
  const playingContext = window.NCM_UI.playingContext = window.NCM_UI.playingContext || {};

  // 音频分析器
  let audioContext = null;
  let analyser = null;
  let source = null;
  let animationFrame = null;

  function initAudioAnalysis() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
    }
  }

  function connectAudioSource(audioElement) {
    if (!audioContext) initAudioAnalysis();
    if (source) {
      source.disconnect();
      source = null;
    }
    
    source = audioContext.createMediaElementSource(audioElement);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
  }

  // 波形绘制
  function drawWaveform(canvas) {
    if (!analyser || !canvas) return;
    
    const canvasCtx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function draw() {
      animationFrame = requestAnimationFrame(draw);
      
      analyser.getByteTimeDomainData(dataArray);
      
      canvasCtx.fillStyle = 'var(--bg-0)';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
      
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = 'var(--accent)';
      canvasCtx.beginPath();
      
      const sliceWidth = canvas.width * 1.0 / bufferLength;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height/2;
        
        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }
        
        x += sliceWidth;
      }
      
      canvasCtx.lineTo(canvas.width, canvas.height/2);
      canvasCtx.stroke();
    }
    
    draw();
  }

  function stopWaveform() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  // 音频元数据解析
  function parseAudioMetadata(audioBlob) {
    return new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onload = function(e) {
        try {
          const buffer = e.target.result;
          // 这里可以添加更多格式的元数据解析
          const metadata = {
            format: detectFormat(buffer),
            sampleRate: null,
            channels: null,
            bitDepth: null,
            duration: null
          };
          resolve(metadata);
        } catch (err) {
          reject(err);
        }
      };
      fileReader.onerror = reject;
      fileReader.readAsArrayBuffer(audioBlob);
    });
  }

  function detectFormat(buffer) {
    const header = new Uint8Array(buffer.slice(0, 4));
    if (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0) return 'MP3';
    if (String.fromCharCode(...header) === 'fLaC') return 'FLAC';
    return 'Unknown';
  }

  // 播放控制增强
  function setPlaybackRate(rate) {
    if (playingContext.audio) {
      playingContext.audio.playbackRate = rate;
      state.settings.playbackSpeed = rate;
      window.NCM_UI.saveSettings();
    }
  }

  function setVolume(volume) {
    if (playingContext.audio) {
      playingContext.audio.volume = volume;
      state.settings.volume = volume;
      window.NCM_UI.saveSettings();
    }
  }

  // 导出函数
  Object.assign(window.NCM_UI, {
    connectAudioSource,
    drawWaveform,
    stopWaveform,
    parseAudioMetadata,
    setPlaybackRate,
    setVolume
  });
})();
