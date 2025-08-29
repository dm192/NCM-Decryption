/* assets/ui/state.js
   状态管理模块：处理选中项、播放列表、设置等
*/
(function(){
  window.NCM_UI = window.NCM_UI || {};
  
  // 状态存储
  const state = {
    selected: new Set(),
    processingQueue: [],
    totalProgress: 0,
    settings: loadSettings(),
    playQueue: [],
    currentPlayIndex: -1,
    searchTerm: '',
    sortConfig: { field: 'title', direction: 'asc' }
  };

  // 设置持久化
  function loadSettings() {
    try {
      const saved = localStorage.getItem('ncm_settings');
      return saved ? JSON.parse(saved) : getDefaultSettings();
    } catch (e) {
      console.error('加载设置失败', e);
      return getDefaultSettings();
    }
  }

  function getDefaultSettings() {
    return {
      theme: 'auto',
      volume: 1,
      playbackSpeed: 1,
      namingTemplate: '{title} - {artist}',
      listView: 'list', // 'list' or 'grid'
      fontSize: 'normal',
      shortcuts: getDefaultShortcuts(),
      showWaveform: true,
      highContrast: false,
      autoPlay: true
    };
  }

  function getDefaultShortcuts() {
    return {
      togglePlay: 'Space',
      nextTrack: 'ArrowRight',
      prevTrack: 'ArrowLeft',
      selectAll: 'Control+a',
      search: 'Control+f',
      delete: 'Delete'
    };
  }

  function saveSettings() {
    try {
      localStorage.setItem('ncm_settings', JSON.stringify(state.settings));
    } catch (e) {
      console.error('保存设置失败', e);
    }
  }

  // 选择管理
  function toggleSelection(id, multiSelect = false) {
    if (!multiSelect) {
      state.selected.clear();
    }
    if (state.selected.has(id)) {
      state.selected.delete(id);
    } else {
      state.selected.add(id);
    }
    updateSelectionUI();
  }

  function selectRange(startId, endId) {
    const items = Array.from(document.querySelectorAll('.row.item'));
    const startIdx = items.findIndex(item => item.dataset.id === startId);
    const endIdx = items.findIndex(item => item.dataset.id === endId);
    if (startIdx === -1 || endIdx === -1) return;

    const [min, max] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
    for (let i = min; i <= max; i++) {
      state.selected.add(items[i].dataset.id);
    }
    updateSelectionUI();
  }

  function updateSelectionUI() {
    document.querySelectorAll('.row.item').forEach(row => {
      const selected = state.selected.has(row.dataset.id);
      row.classList.toggle('selected', selected);
      row.setAttribute('aria-selected', selected);
    });
    updateBatchActions();
  }

  function updateBatchActions() {
    const count = state.selected.size;
    const batchActions = document.getElementById('batchActions');
    if (batchActions) {
      batchActions.style.display = count > 0 ? 'flex' : 'none';
      const countText = batchActions.querySelector('.count');
      if (countText) {
        countText.textContent = `已选择 ${count} 个文件`;
      }
    }
  }

  // 播放队列管理
  function updatePlayQueue() {
    state.playQueue = Array.from(document.querySelectorAll('.row.item')).map(row => ({
      id: row.dataset.id,
      title: row.querySelector('.titleStrong')?.textContent,
      artist: row.dataset.artist,
      audioBlob: row.__audioBlob,
      coverBlob: row.__coverBlob
    }));
  }

  function playNext() {
    if (state.currentPlayIndex < state.playQueue.length - 1) {
      state.currentPlayIndex++;
      playCurrentTrack();
    }
  }

  function playPrev() {
    if (state.currentPlayIndex > 0) {
      state.currentPlayIndex--;
      playCurrentTrack();
    }
  }

  function playCurrentTrack() {
    const track = state.playQueue[state.currentPlayIndex];
    if (track && window.NCM_UI.openPlayer) {
      window.NCM_UI.openPlayer({
        title: track.title,
        artist: track.artist,
        audioBlob: track.audioBlob,
        coverBlob: track.coverBlob
      });
    }
  }

  // 搜索和排序
  function setSearchTerm(term) {
    state.searchTerm = term.toLowerCase();
    filterAndSortItems();
  }

  function setSortConfig(field, direction) {
    state.sortConfig = { field, direction };
    filterAndSortItems();
  }

  function filterAndSortItems() {
    const list = document.getElementById('list');
    const items = Array.from(list.querySelectorAll('.row.item'));
    const header = list.querySelector('.row.header');
    
    // 暂存并移除所有项目
    items.forEach(item => item.remove());
    
    // 过滤
    const filtered = items.filter(item => {
      const text = item.textContent.toLowerCase();
      return text.includes(state.searchTerm);
    });
    
    // 排序
    filtered.sort((a, b) => {
      const aVal = a.dataset[state.sortConfig.field] || '';
      const bVal = b.dataset[state.sortConfig.field] || '';
      const modifier = state.sortConfig.direction === 'asc' ? 1 : -1;
      return aVal.localeCompare(bVal) * modifier;
    });
    
    // 重新插入
    if (header) list.appendChild(header);
    filtered.forEach(item => list.appendChild(item));
    
    // 更新空状态提示
    if (filtered.length === 0 && state.searchTerm) {
      const empty = document.createElement('div');
      empty.className = 'empty-message';
      empty.textContent = '没有找到匹配的文件';
      list.appendChild(empty);
    }
  }

  // 导出到共享命名空间
  Object.assign(window.NCM_UI, {
    state,
    toggleSelection,
    selectRange,
    updatePlayQueue,
    playNext,
    playPrev,
    setSearchTerm,
    setSortConfig,
    saveSettings
  });
})();
