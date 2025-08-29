/* assets/app-core.js
   NCM 解密核心 (AES-ECB + RC4 变体) + 工具函数
   暴露到全局：window.NCMCore = { ncmDecrypt, detectImageMime, formatTime, sanitize }
*/

(function(global){
  const CORE_KEY = CryptoJS.enc.Utf8.parse('hzHRAmso5kInbaxW');
  const META_KEY = CryptoJS.enc.Utf8.parse("#14ljk_!\\]&0U<'(");

  function aesEcbDecrypt(bytes, key){
    const wa = CryptoJS.lib.WordArray.create(bytes);
    const dec = CryptoJS.AES.decrypt({ciphertext: wa}, key, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 });
    const out = new Uint8Array(dec.sigBytes);
    const words = dec.words;
    for (let i=0;i<out.length;i++){
      const w = words[Math.floor(i/4)];
      const shift = 24 - 8*(i%4);
      out[i] = (w >>> shift) & 0xff;
    }
    return out;
  }

  function initKeyBox(seed){
    const box = new Uint8Array(256);
    for (let i=0;i<256;i++) box[i]=i;
    let last=0, idx=0;
    for (let i=0;i<256;i++){
      last = (box[i] + last + seed[idx]) & 0xff;
      [box[i], box[last]] = [box[last], box[i]];
      idx = (idx + 1) % seed.length;
    }
    return box;
  }

  function audioDec(enc, box, onProgress){
    const out = new Uint8Array(enc.length);
    const CHUNK = 0x8000;
    for (let i=0;i<enc.length;i++){
      const j = (i+1) & 0xff;
      out[i] = enc[i] ^ box[(box[j] + box[(box[j] + j) & 0xff]) & 0xff];
      if (onProgress && (i%CHUNK===0)) onProgress(i/enc.length*100);
    }
    if (onProgress) onProgress(100);
    return out;
  }

  function guessExt(bytes){
    if (bytes[0]===0x66 && bytes[1]===0x4C && bytes[2]===0x61 && bytes[3]===0x43) return 'flac';
    if (bytes[0]===0xFF && (bytes[1]&0xE0)===0xE0) return 'mp3';
    return 'mp3';
  }

  function detectImageMime(bytes){
    if (!bytes || bytes.length < 4) return 'application/octet-stream';
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
    if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
    return 'application/octet-stream';
  }

  function formatTime(s){ if (!isFinite(s) || s <= 0) return '0:00'; const m = Math.floor(s/60); const sec = Math.floor(s%60).toString().padStart(2,'0'); return `${m}:${sec}`; }
  function sanitize(s){ return String(s||'').replace(/[\\/:*?"<>|]/g,'_').replace(/\s+/g,' ').trim(); }
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

  // export
  global.NCMCore = {
    ncmDecrypt,
    detectImageMime,
    formatTime,
    sanitize,
    escapeHtml
  };

})(window);
