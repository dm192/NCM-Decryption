/* assets/ui/modals.js
   模态框辅助函数模块，导出到 window.NCM_UI
*/
(function(){
  window.NCM_UI = window.NCM_UI || {};

  function _findModalInner(el){ if (!el) return null; return el.querySelector('[data-modal-inner]') || el.querySelector('.modal') || el.querySelector('.announceBox') || el.querySelector('.box'); }

  function showModal(el){
    if (!el) return;
    if (el.__hideTimer) { clearTimeout(el.__hideTimer); el.__hideTimer = null; }
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    el.style.display = 'flex';
    el.setAttribute('aria-hidden','false');
    requestAnimationFrame(()=>{
      const inner = _findModalInner(el);
      if (inner) inner.classList.add('open');
      if (el.id === 'sizeWarning') el.classList.add('open');
    });
  }

  function hideModal(el){
    if (!el) return;
    const inner = _findModalInner(el);
    if (inner) inner.classList.remove('open');
    if (el.id === 'sizeWarning') el.classList.remove('open');
    if (el.__hideTimer) clearTimeout(el.__hideTimer);
    el.__hideTimer = setTimeout(()=>{
      const innerNow = _findModalInner(el);
      const isOpen = (innerNow && innerNow.classList.contains('open')) || el.classList.contains('open');
      if (isOpen) { el.__hideTimer = null; return; }
      el.style.display = 'none';
      el.setAttribute('aria-hidden','true');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      el.__hideTimer = null;
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

  window.NCM_UI._findModalInner = _findModalInner;
  window.NCM_UI.showModal = showModal;
  window.NCM_UI.hideModal = hideModal;
  window.NCM_UI.attachMaskCloseBehavior = attachMaskCloseBehavior;
})();
