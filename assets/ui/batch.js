/* assets/ui/batch.js
   批量操作模块：多选、队列处理和进度管理
*/
(function(){
  window.NCM_UI = window.NCM_UI || {};
  const state = window.NCM_UI.state || {};
  
  // 进度追踪
  let totalFiles = 0;
  let completedFiles = 0;
  let currentFile = null;
  let processingQueue = [];
  
  // 创建并缓存DOM元素引用
  const elements = {
    batchActions: null,
    totalProgress: null,
    processedCount: null,
    totalCount: null,
    progressFill: null,
    processEta: null
  };

  function initBatchProcessing() {
    // 使用DocumentFragment优化DOM操作
    const fragment = document.createDocumentFragment();
    
    const batchActions = document.createElement('div');
    batchActions.id = 'batchActions';
    batchActions.className = 'batch-actions';
    batchActions.style.display = 'none';
    batchActions.innerHTML = `
      <span class="count"></span>
      <div class="btn-group">
        <button class="btn outline" id="batchDownload">下载选中</button>
        <button class="btn outline" id="batchDelete">删除选中</button>
      </div>
    `;
    
    const totalProgress = document.createElement('div');
    totalProgress.id = 'totalProgress';
    totalProgress.className = 'total-progress';
    totalProgress.style.display = 'none';
    totalProgress.innerHTML = `
      <div class="progress-text">
        <span class="current">处理中... (<span id="processedCount">0</span>/<span id="totalCount">0</span>)</span>
        <span class="eta" id="processEta"></span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" id="totalProgressFill"></div>
      </div>
    `;
    
    fragment.appendChild(totalProgress);
    fragment.appendChild(batchActions);
    
    // 一次性插入DOM
    const controls = document.querySelector('.controls');
    if (controls) {
      controls.after(fragment);
      
      // 缓存DOM元素引用
      elements.batchActions = batchActions;
      elements.totalProgress = totalProgress;
      elements.processedCount = document.getElementById('processedCount');
      elements.totalCount = document.getElementById('totalCount');
      elements.progressFill = document.getElementById('totalProgressFill');
      elements.processEta = document.getElementById('processEta');
      
      // 使用事件委托优化事件绑定
      batchActions.addEventListener('click', e => {
        const target = e.target;
        if (target.id === 'batchDownload') downloadSelected();
        else if (target.id === 'batchDelete') deleteSelected();
      });
  }

  // 使用Web Worker处理文件打包
  let zipWorker = null;

  // 批量下载
  async function downloadSelected() {
    const selected = getSelectedItems();
    if (selected.length === 0) return;
    
    if (selected.length === 1) {
      // 单个文件直接下载 - 使用缓存的查询结果
      const item = selected[0];
      if (item.__audioBlob) {
        const fileInfo = getFileInfo(item);
        saveAs(item.__audioBlob, formatFileName(fileInfo.title, fileInfo.artist, fileInfo.ext));
      }
      return;
    }
    
    // 多个文件打包下载
    startBatchOperation(selected.length);
    
    try {
      // 创建文件信息数组以减少DOM查询
      const files = selected.reduce((acc, item) => {
        if (item.__audioBlob) {
          const fileInfo = getFileInfo(item);
          acc.push({
            name: formatFileName(fileInfo.title, fileInfo.artist, fileInfo.ext),
            blob: item.__audioBlob
          });
        }
        return acc;
      }, []);
      
      // 分批处理文件以优化内存使用
      const BATCH_SIZE = 10;
      const zip = new JSZip();
      
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async file => {
          zip.file(file.name, file.blob);
          updateProgress();
        }));
        
        // 在批次之间允许GC回收内存
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6 // 平衡压缩率和速度
        }
      });
      
      saveAs(zipBlob, 'selected_tracks.zip');
    } catch (error) {
      console.error('下载失败:', error);
      if (typeof mdui !== 'undefined') {
        mdui.snackbar({message: '下载失败，请重试'});
      }
    } finally {
      endBatchOperation();
    }
  }
  
  // 缓存文件信息以减少DOM查询
  function getFileInfo(item) {
    return {
      title: item.querySelector('.titleStrong')?.textContent || 'unknown',
      artist: item.dataset.artist || 'unknown',
      ext: item.querySelector('.format')?.textContent?.toLowerCase() || 'mp3'
    };
  }

    // 批量删除 - 使用DocumentFragment优化性能
  async function deleteSelected() {
    if (!confirm('确定要删除选中的文件吗？')) return;
    
    const selected = getSelectedItems();
    if (selected.length === 0) return;
    
    startBatchOperation(selected.length);
    
    try {
      // 使用DocumentFragment优化DOM操作
      const fragment = document.createDocumentFragment();
      const parent = selected[0].parentNode;
      
      // 批量处理以优化性能
      const BATCH_SIZE = 20;
      for (let i = 0; i < selected.length; i += BATCH_SIZE) {
        const batch = selected.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async item => {
          // 清理资源
          ['__audioUrl', '__coverUrl'].forEach(url => {
            if (item[url]) {
              try { 
                URL.revokeObjectURL(item[url]);
                item[url] = null;
              } catch(e) {
                console.error(`清理资源失败: ${url}`, e);
              }
            }
          });
          
          fragment.appendChild(item);
          updateProgress();
        }));
        
        // 允许GC回收内存
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      // 一次性从DOM中移除所有元素
      requestAnimationFrame(() => {
        parent.removeChild(fragment);
        window.NCM_UI.updatePlayQueue?.();
        
        if (typeof mdui !== 'undefined') {
          mdui.snackbar({message: `已删除 ${selected.length} 个文件`});
        }
      });
      
    } catch (error) {
      console.error('删除失败:', error);
      if (typeof mdui !== 'undefined') {
        mdui.snackbar({message: '删除失败，请重试'});
      }
    } finally {
      endBatchOperation();
    }
  }

  // 工具函数 - 使用缓存优化性能
  const selectedItemsCache = {
    items: null,
    timestamp: 0
  };

  function getSelectedItems() {
    const now = Date.now();
    if (now - selectedItemsCache.timestamp < 100 && selectedItemsCache.items) {
      return selectedItemsCache.items;
    }
    
    selectedItemsCache.items = Array.from(document.querySelectorAll('.row.item.selected'));
    selectedItemsCache.timestamp = now;
    return selectedItemsCache.items;
  }

  // 文件名格式化 - 使用缓存优化性能
  const fileNameCache = new WeakMap();
  
  function formatFileName(title, artist, ext) {
    // 使用对象作为缓存键，避免字符串连接
    const key = {title, artist, ext};
    const cached = fileNameCache.get(key);
    if (cached) return cached;
    
    const template = state.settings?.namingTemplate || '{title} - {artist}';
    const fileName = template
      .replace('{title}', sanitizeFileName(title))
      .replace('{artist}', sanitizeFileName(artist)) + '.' + ext;
    
    fileNameCache.set(key, fileName);
    return fileName;
  }

  // 文件名清理 - 使用正则缓存优化性能
  const sanitizeRegex = /[<>:"/\\|?*]/g;
  const sanitizeFileName = name => name.replace(sanitizeRegex, '_');

  // ETA格式化 - 简化实现
  const formatEta = remaining => remaining <= 1 ? 
    ['完成', '1 个文件'][remaining] : 
    `${remaining} 个文件`;

  // 进度管理
  // 使用防抖优化频繁更新
  const debounce = (fn, delay) => {
    let timer = null;
    return function (...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  // 使用 requestAnimationFrame 优化进度更新
  const updateProgressUI = () => {
    if (!elements.processedCount || !elements.progressFill || !elements.processEta) return;
    
    elements.processedCount.textContent = String(completedFiles);
    
    const percent = (completedFiles / totalFiles) * 100;
    elements.progressFill.style.width = percent + '%';
    
    if (completedFiles > 0) {
      const remaining = totalFiles - completedFiles;
      elements.processEta.textContent = remaining > 0 
        ? `预计剩余 ${formatEta(remaining)}`
        : '';
    }
  };

  const debouncedUpdateUI = debounce(() => {
    requestAnimationFrame(updateProgressUI);
  }, 16); // 约60fps

  function startBatchOperation(total) {
    totalFiles = total;
    completedFiles = 0;
    
    if (elements.totalProgress) {
      elements.totalProgress.style.display = 'block';
    }
    if (elements.totalCount) {
      elements.totalCount.textContent = String(total);
    }
    debouncedUpdateUI();
  }

  function updateProgress() {
    completedFiles++;
    debouncedUpdateUI();
  }

  function endBatchOperation() {
    if (elements.totalProgress) {
      requestAnimationFrame(() => {
        elements.totalProgress.style.display = 'none';
      });
    }
  }

  // 工具函数
  function getSelectedItems() {
    return Array.from(document.querySelectorAll('.row.item.selected'));
  }

  function formatFileName(title, artist, ext) {
    const template = state.settings?.namingTemplate || '{title} - {artist}';
    return template
      .replace('{title}', sanitizeFileName(title))
      .replace('{artist}', sanitizeFileName(artist)) + '.' + ext;
  }

  function sanitizeFileName(name) {
    return name.replace(/[<>:"/\\|?*]/g, '_');
  }

  function formatEta(remaining) {
    if (remaining <= 0) return '完成';
    if (remaining === 1) return '1 个文件';
    return `${remaining} 个文件`;
  }

  // 初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBatchProcessing);
  } else {
    initBatchProcessing();
  }

  // 导出函数
  Object.assign(window.NCM_UI, {
    downloadSelected,
    deleteSelected,
    startBatchOperation,
    updateProgress,
    endBatchOperation
  });
})();
