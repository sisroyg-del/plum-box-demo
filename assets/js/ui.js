/* plum box — small shared UI helpers */
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  const stack = [];
  function modal(html, opts) {
    const o = Object.assign({ size: '', onClose: null }, opts);
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${o.size}" role="dialog" aria-modal="true"><button class="modal-close" aria-label="סגירה">×</button>${html}</div>`;
    const close = () => {
      back.remove();
      const i = stack.indexOf(close); if (i >= 0) stack.splice(i, 1);
      document.body.style.overflow = stack.length ? 'hidden' : '';
      o.onClose && o.onClose();
    };
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    back.querySelector('.modal-close').addEventListener('click', close);
    (document.getElementById('modalRoot') || document.body).appendChild(back);
    document.body.style.overflow = 'hidden';
    stack.push(close);
    return { el: back.querySelector('.modal'), close };
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1](); });

  let toastTimer;
  function toast(msg) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2600);
  }

  window.UI = { esc, $, $$, modal, toast, closeAll: () => [...stack].reverse().forEach((c) => c()) };
})();
