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
  
  function initBatchProcessing() {
    const batchActionsHtml = `
      <div id="batchActions" class="batch-actions" style="display:none">
        <span class="count"></span>
        <div class="btn-group">
          <button class="btn outline" id="batchDownload">下载选中</button>
          <button class="btn outline" id="batchDelete">删除选中</button>
        </div>
      </div>
    `;
    
    const totalProgressHtml = `
      <div id="totalProgress" class="total-progress" style="display:none">
        <div class="progress-text">
          <span class="current">处理中... (<span id="processedCount">0</span>/<span id="totalCount">0</span>)</span>
          <span class="eta" id="processEta"></span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" id="totalProgressFill"></div>
        </div>
      </div>
    `;
    
    // 插入批量操作 UI
    const controls = document.querySelector('.controls');
    if (controls) {
      controls.insertAdjacentHTML('afterend', batchActionsHtml);
      controls.insertAdjacentHTML('afterend', totalProgressHtml);
    }
    
    // 绑定事件
    document.getElementById('batchDownload')?.addEventListener('click', downloadSelected);
    document.getElementById('batchDelete')?.addEventListener('click', deleteSelected);
  }

  // 批量下载
  async function downloadSelected() {
    const selected = getSelectedItems();
    if (selected.length === 0) return;
    
    if (selected.length === 1) {
      // 单个文件直接下载
      const item = selected[0];
      if (item.__audioBlob) {
        const title = item.querySelector('.titleStrong')?.textContent || 'unknown';
        const artist = item.dataset.artist || 'unknown';
        const ext = item.querySelector('.format')?.textContent?.toLowerCase() || 'mp3';
        saveAs(item.__audioBlob, formatFileName(title, artist, ext));
      }
    } else {
      // 多个文件打包下载
      const zip = new JSZip();
      
      startBatchOperation(selected.length);
      
      for (const item of selected) {
        if (item.__audioBlob) {
          const title = item.querySelector('.titleStrong')?.textContent || 'unknown';
          const artist = item.dataset.artist || 'unknown';
          const ext = item.querySelector('.format')?.textContent?.toLowerCase() || 'mp3';
          const fileName = formatFileName(title, artist, ext);
          
          zip.file(fileName, item.__audioBlob);
          updateProgress();
        }
      }
      
      const zipBlob = await zip.generateAsync({type: 'blob'});
      saveAs(zipBlob, 'selected_tracks.zip');
      
      endBatchOperation();
    }
  }

  // 批量删除
  function deleteSelected() {
    if (!confirm('确定要删除选中的文件吗？')) return;
    
    const selected = getSelectedItems();
    if (selected.length === 0) return;
    
    startBatchOperation(selected.length);
    
    for (const item of selected) {
      if (item.__audioUrl) {
        try { URL.revokeObjectURL(item.__audioUrl); } catch(e) {}
      }
      if (item.__coverUrl) {
        try { URL.revokeObjectURL(item.__coverUrl); } catch(e) {}
      }
      item.remove();
      updateProgress();
    }
    
    endBatchOperation();
    window.NCM_UI.updatePlayQueue?.();
    
    if (typeof mdui !== 'undefined') {
      mdui.snackbar({message: `已删除 ${selected.length} 个文件`});
    }
  }

  // 进度管理
  function startBatchOperation(total) {
    totalFiles = total;
    completedFiles = 0;
    const totalProgress = document.getElementById('totalProgress');
    const totalCount = document.getElementById('totalCount');
    if (totalProgress) totalProgress.style.display = 'block';
    if (totalCount) totalCount.textContent = String(total);
    updateProgress();
  }

  function updateProgress() {
    completedFiles++;
    const processedCount = document.getElementById('processedCount');
    const totalProgressFill = document.getElementById('totalProgressFill');
    const processEta = document.getElementById('processEta');
    
    if (processedCount) {
      processedCount.textContent = String(completedFiles);
    }
    
    if (totalProgressFill) {
      const percent = (completedFiles / totalFiles) * 100;
      totalProgressFill.style.width = percent + '%';
    }
    
    // 更新预计剩余时间
    if (processEta && completedFiles > 0) {
      const remaining = totalFiles - completedFiles;
      if (remaining > 0) {
        processEta.textContent = `预计剩余 ${formatEta(remaining)}`;
      } else {
        processEta.textContent = '';
      }
    }
  }

  function endBatchOperation() {
    const totalProgress = document.getElementById('totalProgress');
    if (totalProgress) {
      setTimeout(() => {
        totalProgress.style.display = 'none';
      }, 1000);
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
