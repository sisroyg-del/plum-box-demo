/* plum box — operator console */
(async function () {
  const { D, money } = Store;
  const { esc, $, $$, modal, toast } = UI;
  await Store.load();
  const db = () => Store.db;

  // ---------- login (demo-grade: client-side password) ----------
  const AUTH = 'plumbox-admin';
  const authed = () => { try { return sessionStorage.getItem(AUTH) === '1'; } catch (e) { return window.__authed; } };
  function gate() {
    $('#login').hidden = authed(); $('#app').hidden = !authed();
    if (authed()) go(location.hash.slice(1) || 'dashboard');
  }
  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.pw.value === db().settings.adminPassword) {
      try { sessionStorage.setItem(AUTH, '1'); } catch (err) { window.__authed = true; }
      gate();
    } else { $('#loginErr').hidden = false; }
  });
  $('#logout').addEventListener('click', () => { try { sessionStorage.removeItem(AUTH); } catch (e) { window.__authed = false; } gate(); });

  // ---------- routing ----------
  let current = 'dashboard';
  const views = {};
  function go(v) {
    if (!views[v]) v = 'dashboard';
    current = v; history.replaceState(null, '', `#${v}`);
    $$('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    views[v]();
  }
  $('#nav').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) go(b.dataset.view); });
  const rerender = () => views[current] && views[current]();
  Store.onChange(() => { if (!document.querySelector('.modal-back')) rerender(); });
  const view = (html) => { $('#view').innerHTML = html; return $('#view'); };

  // ---------- shared bits ----------
  const thumb = (item) => esc(item?.images?.[0] || '');
  const catName = (id) => Store.category(id)?.name || '';
  const GROUPS = { type: 'סוג פריט', color: 'צבעוניות', material: 'חומר' };
  const nextOrder = (list) => (list.length ? Math.max(...list.map((x) => x.order ?? 0)) + 1 : 0);
  const custName = (b) => (b.kind === 'block' ? 'חסימה פנימית' : Store.customer(b.customerId)?.name || 'לקוח לא ידוע');
  function statusTag(b) {
    if (b.status === 'cancelled') return '<span class="tag bad">בוטלה</span>';
    if (b.kind === 'block') return '<span class="tag dark">חסימה</span>';
    if (b.end < D.today()) return '<span class="tag">הסתיימה</span>';
    if (b.start <= D.today()) return '<span class="tag warn">בהשכרה</span>';
    return '<span class="tag ok">מאושרת</span>';
  }
  // Highest number of units held on any future day (to warn before lowering stock).
  function peakHeld(productId) {
    let peak = 0;
    for (const b of db().bookings) {
      if (b.status !== 'confirmed' || b.end < D.today()) continue;
      for (const d of D.range(b.start > D.today() ? b.start : D.today(), b.end)) peak = Math.max(peak, Inventory.heldOn(productId, d));
    }
    return peak;
  }

  // Downscale an uploaded photo so the demo database stays light.
  function readImage(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = rej;
      fr.onload = () => {
        const img = new Image();
        img.onerror = rej;
        img.onload = () => {
          const max = 1100, r = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.85));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  // Image list editor: upload, add by URL, drag to reorder, remove. First image is the cover.
  function imageEditor(el, images) {
    const list = [...images];
    let dragFrom = null;
    function draw() {
      el.innerHTML = `
        <div class="img-grid">
          ${list.map((src, i) => `
            <div class="img-cell" draggable="true" data-i="${i}">
              <img src="${esc(src)}" alt="">
              ${i === 0 ? '<span class="tag dark cover">תמונה ראשית</span>' : ''}
              <button type="button" class="img-x" data-x="${i}" aria-label="הסרה">×</button>
            </div>`).join('')}
          <label class="img-add">
            <input type="file" accept="image/*" multiple hidden>
            <span>＋</span><small>העלאת תמונות</small>
          </label>
        </div>
        <div class="row small" style="margin-top:8px"><input class="input" placeholder="או הדביקו קישור לתמונה" data-url><button type="button" class="btn ghost sm" data-addurl>הוספה</button></div>
        <p class="muted small" style="margin:6px 0 0">גררו כדי לשנות סדר. התמונה הראשונה מוצגת בגלריה.</p>`;
    }
    el.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]'); if (x) { list.splice(+x.dataset.x, 1); draw(); }
      if (e.target.closest('[data-addurl]')) { const u = el.querySelector('[data-url]').value.trim(); if (u) { list.push(u); draw(); } }
    });
    el.addEventListener('change', async (e) => {
      if (e.target.type !== 'file') return;
      for (const f of e.target.files) { try { list.push(await readImage(f)); } catch (err) { toast('לא ניתן לקרוא את הקובץ'); } }
      draw();
    });
    el.addEventListener('dragstart', (e) => { const c = e.target.closest('.img-cell'); if (c) { dragFrom = +c.dataset.i; c.classList.add('dragging'); } });
    el.addEventListener('dragover', (e) => { if (dragFrom !== null && e.target.closest('.img-cell')) e.preventDefault(); });
    el.addEventListener('drop', (e) => {
      const c = e.target.closest('.img-cell'); if (!c || dragFrom === null) return;
      e.preventDefault();
      const to = +c.dataset.i; const [m] = list.splice(dragFrom, 1); list.splice(to, 0, m); dragFrom = null; draw();
    });
    el.addEventListener('dragend', () => { dragFrom = null; draw(); });
    draw();
    return () => list;
  }

  // Category picker grouped by filter group.
  function categoryPicker(el, selected) {
    const sel = new Set(selected);
    function draw() {
      el.innerHTML = Object.entries(GROUPS).map(([g, label]) => {
        const cats = db().categories.filter((c) => c.group === g);
        if (!cats.length) return '';
        return `<div class="cat-group"><span class="muted small">${label}</span><div class="chips">${cats.map((c) => `
          <button type="button" class="chip ${sel.has(c.id) ? 'on' : ''}" data-c="${c.id}">${c.swatch ? `<span class="sw" style="background:${c.swatch}"></span>` : ''}${esc(c.name)}</button>`).join('')}</div></div>`;
      }).join('');
    }
    el.addEventListener('click', (e) => { const c = e.target.closest('[data-c]'); if (c) { sel.has(c.dataset.c) ? sel.delete(c.dataset.c) : sel.add(c.dataset.c); draw(); } });
    draw();
    return () => [...sel];
  }

  // Drag-to-reorder for a grid of cards; writes back the `order` field.
  function sortableGrid(gridEl, list) {
    let from = null;
    gridEl.addEventListener('dragstart', (e) => { const c = e.target.closest('[data-id]'); if (c) { from = c.dataset.id; c.classList.add('dragging'); } });
    gridEl.addEventListener('dragover', (e) => {
      if (!from) return;
      const c = e.target.closest('[data-id]'); if (!c || c.dataset.id === from) return;
      e.preventDefault();
      const dragged = gridEl.querySelector(`[data-id="${from}"]`);
      const r = c.getBoundingClientRect();
      const before = (e.clientX > r.left + r.width / 2); // RTL: right half = before
      c.parentNode.insertBefore(dragged, before ? c : c.nextSibling);
    });
    gridEl.addEventListener('dragend', async () => {
      if (!from) return;
      from = null;
      $$('[data-id]', gridEl).forEach((c, i) => { const x = list.find((y) => y.id === c.dataset.id); if (x) x.order = i; c.classList.remove('dragging'); });
      await Store.save();
      toast('הסדר נשמר');
    });
  }

  // =====================================================================
  // DASHBOARD
  // =====================================================================
  views.dashboard = () => {
    const t = D.today();
    const active = db().bookings.filter((b) => b.status === 'confirmed');
    const pickups = active.filter((b) => b.start === t), returns = active.filter((b) => b.end === t);
    const out = active.filter((b) => b.start <= t && b.end >= t && b.kind !== 'block');
    const upcoming = active.filter((b) => b.start > t).sort((a, b) => a.start.localeCompare(b.start));
    const revenue = active.filter((b) => b.start >= D.add(t, -30) && b.total).reduce((s, b) => s + b.total, 0);
    const units = db().products.reduce((s, p) => s + p.stock, 0);
    const outUnits = db().products.reduce((s, p) => s + Inventory.heldOn(p.id, t), 0);
    const leads = db().leads.filter((l) => l.status === 'new').length;
    const list = (arr, empty) => (arr.length ? arr.map((b) => `
      <button class="mini-order" data-order="${b.id}"><b>#${b.id.replace('o_', '')}</b><span>${esc(custName(b))}</span><span class="muted">${D.fmt(b.start)}–${D.fmt(b.end)}</span>${statusTag(b)}</button>`).join('') : `<p class="muted small">${empty}</p>`);
    const el = view(`
      <div class="page-head"><div><h1>${new Date().getHours() < 12 ? 'בוקר טוב' : new Date().getHours() < 18 ? 'צהריים טובים' : 'ערב טוב'}</h1><p class="muted">${D.fmtLong(t)}</p></div></div>
      <div class="kpis">
        <div class="kpi"><span>הזמנות פעילות כרגע</span><b>${out.length}</b></div>
        <div class="kpi"><span>יחידות בחוץ היום</span><b>${outUnits}<small> / ${units}</small></b></div>
        <div class="kpi"><span>הזמנות עתידיות</span><b>${upcoming.length}</b></div>
        <div class="kpi"><span>פניות ייעוץ חדשות</span><b>${leads}</b></div>
        <div class="kpi"><span>מוצרים · חבילות</span><b>${db().products.length} · ${db().packages.length}</b></div>
      </div>
      <div class="dash-grid">
        <section class="panel"><h3>איסופים היום</h3>${list(pickups, 'אין איסופים היום')}</section>
        <section class="panel"><h3>החזרות היום</h3>${list(returns, 'אין החזרות היום')}</section>
        <section class="panel wide"><h3>הזמנות קרובות</h3>${list(upcoming.slice(0, 8), 'אין הזמנות עתידיות')}</section>
      </div>
      ${revenue ? `<p class="muted small">הכנסות מהזמנות אונליין ב-30 הימים האחרונים: ${money(revenue)}</p>` : ''}`);
    el.addEventListener('click', (e) => { const o = e.target.closest('[data-order]'); if (o) orderDetails(o.dataset.order); });
  };

  // =====================================================================
  // PRODUCTS
  // =====================================================================
  let prodFilter = { q: '', cat: '' };
  views.products = () => {
    const list = Store.sorted(db().products).filter((p) => (!prodFilter.cat || p.categoryIds.includes(prodFilter.cat)) && (!prodFilter.q || p.name.includes(prodFilter.q)));
    const canDrag = !prodFilter.q && !prodFilter.cat;
    const el = view(`
      <div class="page-head">
        <div><h1>מוצרים</h1><p class="muted">${db().products.length} מוצרים · ${db().products.reduce((s, p) => s + p.stock, 0)} יחידות במלאי</p></div>
        <button class="btn" data-new>＋ מוצר חדש</button>
      </div>
      <div class="toolbar">
        <input class="input" placeholder="חיפוש לפי שם" value="${esc(prodFilter.q)}" data-q>
        <select class="input" data-cat><option value="">כל הקטגוריות</option>${db().categories.map((c) => `<option value="${c.id}" ${prodFilter.cat === c.id ? 'selected' : ''}>${esc(GROUPS[c.group])}: ${esc(c.name)}</option>`).join('')}</select>
        <span class="muted small">${canDrag ? 'גררו כרטיסים כדי לקבוע את סדר ההצגה בגלריה' : 'נקו סינון כדי לסדר בגרירה'}</span>
      </div>
      <div class="a-grid" id="pgrid">
        ${list.map((p) => {
          const pk = Store.packagesContaining(p.id);
          return `
          <article class="a-card" data-id="${p.id}" draggable="${canDrag}">
            <div class="a-img"><img src="${thumb(p)}" alt="">${p.isNew ? '<span class="tag dark">חדש</span>' : ''}<span class="img-count">${p.images.length} 📷</span></div>
            <div class="a-body">
              <b>${esc(p.name)}</b>
              <div class="small">${money(p.rentPrice)} / ${p.rentDays} ימים · מלאי ${p.stock}${p.buyPrice ? ` · קנייה ${money(p.buyPrice)}` : ''}</div>
              <div class="a-tags">${p.categoryIds.map((c) => `<span>${esc(catName(c))}</span>`).join('')}</div>
              ${pk.length ? `<div class="small muted">בחבילות: ${pk.map((k) => esc(k.name)).join(', ')}</div>` : ''}
            </div>
          </article>`;
        }).join('')}
      </div>`);
    el.querySelector('[data-new]').onclick = () => editProduct(null);
    el.querySelector('[data-q]').oninput = (e) => { prodFilter.q = e.target.value; const pos = e.target.selectionStart; views.products(); const i = $('[data-q]'); i.focus(); i.setSelectionRange(pos, pos); };
    el.querySelector('[data-cat]').onchange = (e) => { prodFilter.cat = e.target.value; views.products(); };
    el.querySelector('#pgrid').addEventListener('click', (e) => { const c = e.target.closest('[data-id]'); if (c) editProduct(c.dataset.id); });
    if (canDrag) sortableGrid(el.querySelector('#pgrid'), db().products);
  };

  function editProduct(id) {
    const p = id ? Store.product(id) : null;
    const v = p || { name: '', description: '', images: [], stock: 1, rentPrice: 40, rentDays: db().settings.minDays, buyPrice: '', categoryIds: [], attributes: [['חומר', ''], ['מידות', '']], isNew: true };
    const inPk = new Set(id ? Store.packagesContaining(id).map((k) => k.id) : []);
    const m = modal(`
      <form class="modal-body edit" id="pf">
        <h2>${p ? 'עריכת מוצר' : 'מוצר חדש'}</h2>
        <div class="edit-cols">
          <div>
            <div class="field"><label>תמונות</label><div id="imgs"></div></div>
            <div class="field"><label>קטגוריות וקבוצות סינון</label><div id="cats"></div>
              <span class="muted small">הפריט יופיע בכל קבוצה שנבחרה (למשל גם "אגרטלים" וגם "לבן").</span></div>
          </div>
          <div>
            <div class="field"><label>שם המוצר</label><input name="name" required value="${esc(v.name)}"></div>
            <div class="field"><label>תיאור ומאפיינים (טקסט חופשי)</label><textarea name="description">${esc(v.description)}</textarea></div>
            <div class="grid-2">
              <div class="field"><label>יחידות זמינות להשכרה</label><input name="stock" type="number" min="0" required value="${v.stock}"></div>
              <div class="field"><label>מחיר קנייה (₪)</label><input name="buyPrice" type="number" min="0" value="${v.buyPrice ?? ''}"></div>
              <div class="field"><label>מחיר השכרה (₪)</label><input name="rentPrice" type="number" min="0" required value="${v.rentPrice}"></div>
              <div class="field"><label>משך השכרה בסיסי (ימים)</label><input name="rentDays" type="number" min="${db().settings.minDays}" required value="${v.rentDays}"></div>
            </div>
            <div class="field"><label>מאפיינים מובנים</label><div id="attrs"></div></div>
            ${db().packages.length ? `<div class="field"><label>שיוך לחבילות</label><div class="chips">${db().packages.map((k) => `
              <label class="chip ${inPk.has(k.id) ? 'on' : ''}"><input type="checkbox" hidden name="pk" value="${k.id}" ${inPk.has(k.id) ? 'checked' : ''}>${esc(k.name)}</label>`).join('')}</div></div>` : ''}
            <label class="check"><input type="checkbox" name="isNew" ${v.isNew ? 'checked' : ''}> סימון כ"חדש" (יופיע בשורת החדשים ובבאנר)</label>
          </div>
        </div>
        <div class="edit-foot">
          ${p ? '<button type="button" class="btn danger" data-del>מחיקת מוצר</button>' : '<span></span>'}
          <div class="row"><button type="button" class="btn ghost" data-cancel>ביטול</button><button class="btn">שמירה</button></div>
        </div>
      </form>`);
    const getImgs = imageEditor(m.el.querySelector('#imgs'), v.images);
    const getCats = categoryPicker(m.el.querySelector('#cats'), v.categoryIds);
    const getAttrs = attrEditor(m.el.querySelector('#attrs'), v.attributes || []);
    m.el.querySelectorAll('label.chip input').forEach((i) => i.addEventListener('change', () => i.parentElement.classList.toggle('on', i.checked)));
    m.el.querySelector('[data-cancel]').onclick = m.close;
    m.el.querySelector('#pf').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const stock = +f.stock.value;
      if (p) {
        const peak = peakHeld(p.id);
        if (stock < peak && !confirm(`יש הזמנות עתידיות שמחזיקות עד ${peak} יחידות במקביל. הורדת המלאי ל-${stock} תיצור חריגה בלוח הזמינות. להמשיך?`)) return;
      }
      const data = {
        name: f.name.value.trim(), description: f.description.value.trim(), stock,
        rentPrice: +f.rentPrice.value, rentDays: +f.rentDays.value, buyPrice: f.buyPrice.value ? +f.buyPrice.value : null,
        images: getImgs(), categoryIds: getCats(), attributes: getAttrs(), isNew: f.isNew.checked,
      };
      if (!data.images.length) return toast('הוסיפו לפחות תמונה אחת');
      let target = p;
      if (p) Object.assign(p, data);
      else { target = { id: Store.uid('p'), order: nextOrder(db().products), createdAt: D.today(), ...data }; db().products.push(target); }
      const want = new Set($$('input[name=pk]:checked', f).map((i) => i.value));
      for (const k of db().packages) {
        const has = k.items.some((i) => i.productId === target.id);
        if (want.has(k.id) && !has) k.items.push({ productId: target.id, qty: 1 });
        if (!want.has(k.id) && has) k.items = k.items.filter((i) => i.productId !== target.id);
      }
      await Store.save(); m.close(); rerender(); toast('המוצר נשמר');
    };
    const del = m.el.querySelector('[data-del]');
    if (del) del.onclick = async () => {
      const future = db().bookings.filter((b) => b.status === 'confirmed' && b.end >= D.today() && Inventory.allocationOf(b).get(p.id));
      if (future.length) return toast(`לא ניתן למחוק: הפריט משוריין ב-${future.length} הזמנות עתידיות`);
      if (!confirm(`למחוק את "${p.name}"? הוא יוסר גם מכל החבילות.`)) return;
      db().products = db().products.filter((x) => x.id !== p.id);
      db().packages.forEach((k) => { k.items = k.items.filter((i) => i.productId !== p.id); });
      await Store.save(); m.close(); rerender(); toast('המוצר נמחק');
    };
  }

  function attrEditor(el, attrs) {
    const list = attrs.map((a) => [...a]);
    function draw() {
      el.innerHTML = `${list.map(([k, v], i) => `
        <div class="attr-row"><input class="input" placeholder="מאפיין (למשל גובה)" value="${esc(k)}" data-k="${i}"><input class="input" placeholder="ערך" value="${esc(v)}" data-v="${i}"><button type="button" class="img-x static" data-rm="${i}">×</button></div>`).join('')}
        <button type="button" class="link small" data-add>＋ הוספת מאפיין</button>`;
    }
    el.addEventListener('input', (e) => { if (e.target.dataset.k) list[+e.target.dataset.k][0] = e.target.value; if (e.target.dataset.v) list[+e.target.dataset.v][1] = e.target.value; });
    el.addEventListener('click', (e) => { if (e.target.closest('[data-add]')) { list.push(['', '']); draw(); } const r = e.target.closest('[data-rm]'); if (r) { list.splice(+r.dataset.rm, 1); draw(); } });
    draw();
    return () => list.filter(([k, v]) => k.trim() && v.trim()).map(([k, v]) => [k.trim(), v.trim()]);
  }

  // =====================================================================
  // PACKAGES
  // =====================================================================
  views.packages = () => {
    const el = view(`
      <div class="page-head">
        <div><h1>חבילות</h1><p class="muted">קיבוץ מוצרים לסט אחד עם מחיר ומשך השכרה משלו. פריטי החבילה ממשיכים להופיע גם כפריטים בודדים.</p></div>
        <button class="btn" data-new>＋ חבילה חדשה</button>
      </div>
      <div class="a-grid wide" id="kgrid">
        ${Store.sorted(db().packages).map((k) => {
          const worth = k.items.reduce((s, it) => s + (Store.product(it.productId)?.rentPrice || 0) * it.qty, 0);
          return `
          <article class="a-card" data-id="${k.id}" draggable="true">
            <div class="a-img cover"><img src="${thumb(k)}" alt="">${k.isNew ? '<span class="tag dark">חדש</span>' : ''}</div>
            <div class="a-body">
              <b class="big">${esc(k.name)}</b>
              <div class="small">${money(k.rentPrice)} / ${k.rentDays} ימים · ${k.items.reduce((s, i) => s + i.qty, 0)} פריטים · שווי בנפרד ${money(worth)}</div>
              <div class="k-items">${k.items.slice(0, 12).map((it) => `<img src="${thumb(Store.product(it.productId))}" alt="">`).join('')}${k.items.length > 12 ? `<span>+${k.items.length - 12}</span>` : ''}</div>
            </div>
          </article>`;
        }).join('')}
      </div>`);
    el.querySelector('[data-new]').onclick = () => editPackage(null);
    el.querySelector('#kgrid').addEventListener('click', (e) => { const c = e.target.closest('[data-id]'); if (c) editPackage(c.dataset.id); });
    sortableGrid(el.querySelector('#kgrid'), db().packages);
  };

  function editPackage(id) {
    const k = id ? Store.pkg(id) : null;
    const v = k || { name: '', tagline: '', description: '', images: [], rentPrice: 900, rentDays: db().settings.minDays, categoryIds: [], items: [], isNew: true };
    let items = v.items.map((i) => ({ ...i }));
    const m = modal(`
      <form class="modal-body edit" id="kf">
        <h2>${k ? 'עריכת חבילה' : 'חבילה חדשה'}</h2>
        <div class="edit-cols">
          <div>
            <div class="field"><label>תמונות ייחודיות לחבילה</label><div id="imgs"></div>
              <span class="muted small">בעמוד החבילה הלקוחות יראו את התמונות האלו ואחריהן את תמונות כל הפריטים הכלולים.</span></div>
            <div class="field"><label>קטגוריות וקבוצות סינון</label><div id="cats"></div></div>
          </div>
          <div>
            <div class="field"><label>שם החבילה</label><input name="name" required value="${esc(v.name)}"></div>
            <div class="field"><label>שורת תיאור קצרה</label><input name="tagline" value="${esc(v.tagline || '')}"></div>
            <div class="field"><label>תיאור</label><textarea name="description">${esc(v.description)}</textarea></div>
            <div class="grid-2">
              <div class="field"><label>מחיר השכרה לחבילה (₪)</label><input name="rentPrice" type="number" min="0" required value="${v.rentPrice}"></div>
              <div class="field"><label>משך השכרה לחבילה (ימים)</label><input name="rentDays" type="number" min="${db().settings.minDays}" required value="${v.rentDays}"></div>
            </div>
            <label class="check"><input type="checkbox" name="isNew" ${v.isNew ? 'checked' : ''}> סימון כ"חדש"</label>
          </div>
        </div>
        <div class="field" style="margin-top:10px"><label>פריטים בחבילה</label><div id="kitems"></div></div>
        <div class="edit-foot">
          ${k ? '<button type="button" class="btn danger" data-del>מחיקת חבילה</button>' : '<span></span>'}
          <div class="row"><button type="button" class="btn ghost" data-cancel>ביטול</button><button class="btn">שמירה</button></div>
        </div>
      </form>`);
    const getImgs = imageEditor(m.el.querySelector('#imgs'), v.images);
    const getCats = categoryPicker(m.el.querySelector('#cats'), v.categoryIds);
    const box = m.el.querySelector('#kitems');
    let pickQ = '';
    function drawItems() {
      const worth = items.reduce((s, it) => s + (Store.product(it.productId)?.rentPrice || 0) * it.qty, 0);
      const chosen = new Set(items.map((i) => i.productId));
      const pool = Store.sorted(db().products).filter((p) => !chosen.has(p.id) && (!pickQ || p.name.includes(pickQ) || p.categoryIds.some((c) => catName(c).includes(pickQ))));
      box.innerHTML = `
        <div class="k-chosen">${items.length ? items.map((it, i) => { const p = Store.product(it.productId); return p ? `
          <div class="k-line"><img src="${thumb(p)}" alt=""><span>${esc(p.name)}<small class="muted"> · מלאי ${p.stock}</small></span>
            <div class="stepper"><button type="button" data-kd="${i}">−</button><span>${it.qty}</span><button type="button" data-ki="${i}">+</button></div>
            <button type="button" class="img-x static" data-kr="${i}">×</button></div>` : ''; }).join('') : '<p class="muted small">עוד לא נבחרו פריטים. בחרו מהרשימה למטה.</p>'}</div>
        <p class="small">שווי הפריטים בנפרד: <b>${money(worth)}</b></p>
        <div class="k-pick">
          <input class="input" placeholder="הוספת פריט: חיפוש לפי שם או קטגוריה" value="${esc(pickQ)}" data-pq>
          <div class="k-pool">${pool.map((p) => `<button type="button" class="k-opt" data-add="${p.id}"><img src="${thumb(p)}" alt=""><span>${esc(p.name)}</span></button>`).join('')}</div>
        </div>`;
    }
    box.addEventListener('click', (e) => {
      const a = e.target.closest('[data-add]'); if (a) { items.push({ productId: a.dataset.add, qty: 1 }); drawItems(); return; }
      const inc = e.target.closest('[data-ki]'); if (inc) { const it = items[+inc.dataset.ki]; if (it.qty < (Store.product(it.productId)?.stock || 1)) it.qty++; else toast('אין יותר יחידות במלאי'); drawItems(); return; }
      const dec = e.target.closest('[data-kd]'); if (dec) { const it = items[+dec.dataset.kd]; it.qty = Math.max(1, it.qty - 1); drawItems(); return; }
      const rm = e.target.closest('[data-kr]'); if (rm) { items.splice(+rm.dataset.kr, 1); drawItems(); }
    });
    box.addEventListener('input', (e) => {
      if (e.target.dataset.pq === undefined) return;
      pickQ = e.target.value; const pos = e.target.selectionStart; drawItems();
      const i = box.querySelector('[data-pq]'); i.focus(); i.setSelectionRange(pos, pos);
    });
    drawItems();
    m.el.querySelector('[data-cancel]').onclick = m.close;
    m.el.querySelector('#kf').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      if (!items.length) return toast('הוסיפו לפחות פריט אחד לחבילה');
      const data = { name: f.name.value.trim(), tagline: f.tagline.value.trim(), description: f.description.value.trim(), rentPrice: +f.rentPrice.value, rentDays: +f.rentDays.value, isNew: f.isNew.checked, images: getImgs(), categoryIds: getCats(), items };
      if (!data.images.length) data.images = items.slice(0, 1).map((i) => Store.product(i.productId)?.images[0]).filter(Boolean);
      if (k) Object.assign(k, data);
      else db().packages.push({ id: Store.uid('k'), order: nextOrder(db().packages), createdAt: D.today(), ...data });
      await Store.save(); m.close(); rerender(); toast('החבילה נשמרה');
    };
    const del = m.el.querySelector('[data-del]');
    if (del) del.onclick = async () => {
      if (!confirm(`למחוק את החבילה "${k.name}"? הפריטים עצמם יישארו בקטלוג. הזמנות קיימות ימשיכו להחזיק את הפריטים שהוקצו להן.`)) return;
      // freeze the allocation of existing orders so they keep holding the items
      db().bookings.forEach((b) => { if (!b.allocations && b.lines.some((l) => l.kind === 'package' && l.id === k.id)) b.allocations = Object.fromEntries(Inventory.expand(b.lines)); });
      db().packages = db().packages.filter((x) => x.id !== k.id);
      db().banners = db().banners.filter((b) => !(b.link?.kind === 'package' && b.link.id === k.id));
      await Store.save(); m.close(); rerender(); toast('החבילה נמחקה');
    };
  }

  // =====================================================================
  // CATEGORIES
  // =====================================================================
  views.categories = () => {
    const count = (id) => db().products.filter((p) => p.categoryIds.includes(id)).length + db().packages.filter((k) => k.categoryIds.includes(id)).length;
    const el = view(`
      <div class="page-head"><div><h1>קטגוריות וסינונים</h1><p class="muted">כל פריט יכול להשתייך לכמה קבוצות. הקבוצות הופכות לשורות ולמסנני חיפוש באתר הלקוחות.</p></div></div>
      <div class="cat-cols">
        ${Object.entries(GROUPS).map(([g, label]) => `
          <section class="panel">
            <h3>${label}</h3>
            ${db().categories.filter((c) => c.group === g).map((c) => `
              <div class="cat-row" data-id="${c.id}">
                ${g === 'color' ? `<input type="color" value="${/^#/.test(c.swatch || '') ? c.swatch : '#cccccc'}" data-sw title="צבע">` : ''}
                <input class="input" value="${esc(c.name)}" data-name>
                <span class="muted small">${count(c.id)}</span>
                <button class="img-x static" data-del title="מחיקה">×</button>
              </div>`).join('')}
            <form class="cat-add" data-group="${g}"><input class="input" placeholder="קטגוריה חדשה" required><button class="btn sm">הוספה</button></form>
          </section>`).join('')}
      </div>`);
    el.addEventListener('change', async (e) => {
      const row = e.target.closest('[data-id]'); if (!row) return;
      const c = Store.category(row.dataset.id);
      if (e.target.dataset.name !== undefined) c.name = e.target.value.trim() || c.name;
      if (e.target.dataset.sw !== undefined) c.swatch = e.target.value;
      await Store.save(); toast('נשמר');
    });
    el.addEventListener('click', async (e) => {
      const d = e.target.closest('[data-del]'); if (!d) return;
      const id = d.closest('[data-id]').dataset.id;
      if (!confirm(`למחוק את "${catName(id)}"? הפריטים יישארו, רק השיוך יוסר.`)) return;
      db().categories = db().categories.filter((c) => c.id !== id);
      [...db().products, ...db().packages].forEach((x) => { x.categoryIds = x.categoryIds.filter((c) => c !== id); });
      await Store.save(); rerender();
    });
    el.addEventListener('submit', async (e) => {
      e.preventDefault();
      const g = e.target.dataset.group, name = e.target.querySelector('input').value.trim();
      db().categories.push({ id: Store.uid('c'), name, group: g, ...(g === 'color' ? { swatch: '#cccccc' } : {}) });
      await Store.save(); rerender();
    });
  };

  // =====================================================================
  // BANNERS
  // =====================================================================
  views.banners = () => {
    const el = view(`
      <div class="page-head"><div><h1>באנרים</h1><p class="muted">הבאנר המתחלף בראש אתר הלקוחות: מבצעים, חבילות ופריטים חדשים.</p></div><button class="btn" data-new>＋ באנר חדש</button></div>
      <div class="banner-list">
        ${db().banners.map((b, i) => `
          <article class="banner-row" data-i="${i}">
            <img src="${esc(b.image)}" alt="">
            <div><span class="muted small">${esc(b.kicker || '')}</span><b>${esc(b.title)}</b><p class="small muted">${esc(b.text)}</p></div>
            <div class="row">
              <button class="btn ghost sm" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button class="btn ghost sm" data-down="${i}" ${i === db().banners.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="btn ghost sm" data-edit="${i}">עריכה</button>
            </div>
          </article>`).join('') || '<p class="muted">אין באנרים</p>'}
      </div>`);
    el.querySelector('[data-new]').onclick = () => editBanner(null);
    el.addEventListener('click', async (e) => {
      const bs = db().banners;
      const up = e.target.closest('[data-up]'); if (up) { const i = +up.dataset.up; [bs[i - 1], bs[i]] = [bs[i], bs[i - 1]]; await Store.save(); return rerender(); }
      const dn = e.target.closest('[data-down]'); if (dn) { const i = +dn.dataset.down; [bs[i + 1], bs[i]] = [bs[i], bs[i + 1]]; await Store.save(); return rerender(); }
      const ed = e.target.closest('[data-edit]'); if (ed) editBanner(+ed.dataset.edit);
    });
  };
  function editBanner(i) {
    const b = i === null ? null : db().banners[i];
    const v = b || { kicker: 'חדש', title: '', text: '', image: '', link: { kind: 'filter', id: 'new' }, cta: 'לפרטים' };
    const linkVal = v.link ? `${v.link.kind}:${v.link.id}` : '';
    const m = modal(`
      <form class="modal-body" id="bf">
        <h2>${b ? 'עריכת באנר' : 'באנר חדש'}</h2>
        <div class="field"><label>תמונת רקע (רחבה; הטקסט מוצג בצד ימין)</label><div id="bimg"></div></div>
        <div class="grid-2">
          <div class="field"><label>כותרת עליונה</label><input name="kicker" value="${esc(v.kicker || '')}"></div>
          <div class="field"><label>כותרת</label><input name="title" required value="${esc(v.title)}"></div>
        </div>
        <div class="field"><label>טקסט</label><textarea name="text">${esc(v.text)}</textarea></div>
        <div class="grid-2">
          <div class="field"><label>קישור</label><select name="link">
            <option value="filter:new" ${linkVal === 'filter:new' ? 'selected' : ''}>כל הפריטים החדשים</option>
            <option value="filter:packages" ${linkVal === 'filter:packages' ? 'selected' : ''}>כל החבילות</option>
            <optgroup label="חבילה">${db().packages.map((k) => `<option value="package:${k.id}" ${linkVal === `package:${k.id}` ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</optgroup>
            <optgroup label="מוצר">${Store.sorted(db().products).map((p) => `<option value="product:${p.id}" ${linkVal === `product:${p.id}` ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>
            <optgroup label="קטגוריה">${db().categories.map((c) => `<option value="filter:${c.id}" ${linkVal === `filter:${c.id}` ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>
          </select></div>
          <div class="field"><label>טקסט כפתור</label><input name="cta" value="${esc(v.cta || '')}"></div>
        </div>
        <div class="edit-foot">
          ${b ? '<button type="button" class="btn danger" data-del>מחיקה</button>' : '<span></span>'}
          <div class="row"><button type="button" class="btn ghost" data-cancel>ביטול</button><button class="btn">שמירה</button></div>
        </div>
      </form>`, { size: 'mid' });
    const getImg = imageEditor(m.el.querySelector('#bimg'), v.image ? [v.image] : []);
    m.el.querySelector('[data-cancel]').onclick = m.close;
    m.el.querySelector('#bf').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target; const imgs = getImg();
      if (!imgs.length) return toast('בחרו תמונה לבאנר');
      const [kind, id] = f.link.value.split(':');
      const data = { kicker: f.kicker.value, title: f.title.value, text: f.text.value, cta: f.cta.value, image: imgs[0], link: { kind, id } };
      if (b) Object.assign(b, data); else db().banners.push({ id: Store.uid('b'), ...data });
      await Store.save(); m.close(); rerender(); toast('הבאנר נשמר');
    };
    const del = m.el.querySelector('[data-del]');
    if (del) del.onclick = async () => { if (!confirm('למחוק את הבאנר?')) return; db().banners.splice(i, 1); await Store.save(); m.close(); rerender(); };
  }

  // =====================================================================
  // CALENDAR (module 3 view)
  // =====================================================================
  const cal = { month: D.today().slice(0, 7), cat: '', q: '' };
  views.calendar = () => {
    const [y, mo] = cal.month.split('-').map(Number);
    const first = `${cal.month}-01`;
    const nDays = new Date(y, mo, 0).getDate();
    const dayList = Array.from({ length: nDays }, (_, i) => D.add(first, i));
    const WD = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    const prods = Store.sorted(db().products).filter((p) => (!cal.cat || p.categoryIds.includes(cal.cat)) && (!cal.q || p.name.includes(cal.q)));
    const t = D.today();
    const cell = (p, d) => {
      const held = Inventory.heldOn(p.id, d);
      const ratio = p.stock ? held / p.stock : (held ? 2 : 0);
      const cls = held === 0 ? '' : ratio > 1 ? 'over' : ratio === 1 ? 'full' : 'part';
      return `<td class="c ${cls} ${d === t ? 'today' : ''} ${d < t ? 'past' : ''}" data-p="${p.id}" data-d="${d}" title="${esc(p.name)} · ${D.fmt(d)}: ${held}/${p.stock} תפוסות">${held ? `${held}/${p.stock}` : ''}</td>`;
    };
    const pkgCell = (k, d) => {
      const n = Inventory.maxQty('package', k.id, d, d);
      return `<td class="c pk ${n === 0 ? 'none' : ''} ${d === t ? 'today' : ''} ${d < t ? 'past' : ''}" title="${esc(k.name)}: ${n} זמינות">${n === 0 ? '✕' : n}</td>`;
    };
    const monthTitle = D.parse(first).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
    const el = view(`
      <div class="page-head">
        <div><h1>לוח זמינות</h1><p class="muted">מקור האמת למלאי: כל הזמנה נועלת יחידות פיזיות לכל ימי ההשכרה. חבילות מפורקות לפריטים שבתוכן.</p></div>
        <button class="btn" data-block>＋ חסימת פריטים</button>
      </div>
      <div class="toolbar">
        <div class="month-nav"><button class="btn ghost sm" data-m="-1">›</button><b>${monthTitle}</b><button class="btn ghost sm" data-m="1">‹</button><button class="btn ghost sm" data-m="0">היום</button></div>
        <select class="input" data-cat><option value="">כל הקטגוריות</option>${db().categories.filter((c) => c.group === 'type').map((c) => `<option value="${c.id}" ${cal.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <input class="input" placeholder="חיפוש פריט" value="${esc(cal.q)}" data-q>
        <span class="legend"><i class="part"></i>תפוס חלקית <i class="full"></i>תפוס במלואו <i class="over"></i>חריגה</span>
      </div>
      <div class="cal-wrap">
        <table class="cal">
          <thead><tr><th class="sticky">פריט</th>${dayList.map((d) => `<th class="${d === t ? 'today' : ''} ${D.parse(d).getDay() === 6 ? 'sat' : ''}"><span>${WD[D.parse(d).getDay()]}</span>${+d.slice(8)}</th>`).join('')}</tr></thead>
          <tbody>
            ${!cal.cat && !cal.q ? `<tr class="grp"><th class="sticky">חבילות: סטים זמינים</th><td colspan="${nDays}"></td></tr>
            ${Store.sorted(db().packages).map((k) => `<tr><th class="sticky"><img src="${thumb(k)}" alt=""><span>${esc(k.name)}</span></th>${dayList.map((d) => pkgCell(k, d)).join('')}</tr>`).join('')}
            <tr class="grp"><th class="sticky">פריטים: תפוסות / מלאי</th><td colspan="${nDays}"></td></tr>` : ''}
            ${prods.map((p) => `<tr><th class="sticky"><img src="${thumb(p)}" alt=""><span>${esc(p.name)}<small>מלאי ${p.stock}</small></span></th>${dayList.map((d) => cell(p, d)).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="muted small">לחיצה על משבצת מציגה אילו הזמנות מחזיקות את היחידות באותו יום, ואת מספרי היחידות שהוקצו לכל הזמנה.</p>`);
    el.querySelector('.toolbar').addEventListener('click', (e) => {
      const m = e.target.closest('[data-m]'); if (!m) return;
      if (+m.dataset.m === 0) cal.month = D.today().slice(0, 7);
      else { const d = new Date(y, mo - 1 + +m.dataset.m, 1); cal.month = D.iso(d).slice(0, 7); }
      views.calendar();
    });
    el.querySelector('[data-cat]').onchange = (e) => { cal.cat = e.target.value; views.calendar(); };
    el.querySelector('[data-q]').onchange = (e) => { cal.q = e.target.value.trim(); views.calendar(); };
    el.querySelector('[data-block]').onclick = () => blockItems();
    el.querySelector('.cal').addEventListener('click', (e) => { const c = e.target.closest('td[data-p]'); if (c) cellDetails(c.dataset.p, c.dataset.d); });
    const todayCol = el.querySelector('th.today');
    if (todayCol) todayCol.scrollIntoView({ inline: 'center', block: 'nearest' });
  };

  function cellDetails(pid, d) {
    const p = Store.product(pid);
    const held = Inventory.heldOn(pid, d);
    const units = Inventory.unitAssignments(pid);
    const bs = Inventory.bookingsOn(pid, d);
    const m = modal(`
      <div class="modal-body">
        <div class="row"><img src="${thumb(p)}" class="cd-img" alt=""><div><h2>${esc(p.name)}</h2><p class="muted">${D.fmtLong(d)}</p></div></div>
        <div class="kpis small-kpis">
          <div class="kpi"><span>מלאי</span><b>${p.stock}</b></div>
          <div class="kpi"><span>תפוסות</span><b>${held}</b></div>
          <div class="kpi"><span>פנויות</span><b class="${p.stock - held < 0 ? 'bad-text' : ''}">${p.stock - held}</b></div>
        </div>
        <div class="unit-strip">${Array.from({ length: Math.max(p.stock, held) }, (_, i) => {
          const owner = bs.find((b) => (units[b.id] || []).some((u) => u.n === i + 1));
          return `<div class="unit ${owner ? 'taken' : ''} ${i >= p.stock ? 'over' : ''}"><b>#${i + 1}</b><span>${owner ? `הזמנה ${owner.id.replace('o_', '')}` : 'פנויה'}</span></div>`;
        }).join('')}</div>
        <h3 style="margin:18px 0 8px">הזמנות שמחזיקות את הפריט ביום זה</h3>
        ${bs.length ? bs.map((b) => `
          <button class="mini-order" data-order="${b.id}"><b>#${b.id.replace('o_', '')}</b><span>${esc(custName(b))}</span><span class="muted">${D.fmt(b.start)}–${D.fmt(b.end)}</span><span>יחידות ${(units[b.id] || []).map((u) => `#${u.n}`).join(', ')}</span>${b.lines.some((l) => l.kind === 'package') ? '<span class="tag">דרך חבילה</span>' : ''}</button>`).join('') : '<p class="muted">כל היחידות פנויות ביום זה.</p>'}
        <div class="row" style="margin-top:18px"><button class="btn ghost sm" data-block>חסימת יחידות של פריט זה</button></div>
      </div>`, { size: 'mid' });
    m.el.addEventListener('click', (e) => {
      const o = e.target.closest('[data-order]'); if (o) orderDetails(o.dataset.order);
      if (e.target.closest('[data-block]')) { m.close(); blockItems(pid, d); }
    });
  }

  function blockItems(pid, from) {
    let sel = { start: from || null, end: null };
    const m = modal(`
      <div class="modal-body">
        <h2>חסימת פריטים</h2>
        <p class="muted">להוצאת יחידות מהזמינות: תיקון, צילום פנימי, הזמנה טלפונית וכו׳. אין מינימום ימים לחסימה.</p>
        <div class="grid-2" style="margin-top:12px">
          <div class="field"><label>פריט</label><select class="input" id="bp">${Store.sorted(db().products).map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)} (מלאי ${p.stock})</option>`).join('')}</select></div>
          <div class="field"><label>כמות</label><input class="input" id="bq" type="number" min="1" value="1"></div>
        </div>
        <div class="field"><label>סיבה / הערה</label><input class="input" id="bn" placeholder="לדוגמה: תיקון ריפוד"></div>
        <div id="brp"></div>
        <div class="edit-foot"><span class="small" id="bsum"></span><button class="btn" id="bgo" disabled>חסימה</button></div>
      </div>`, { size: 'mid' });
    const q = () => Math.max(1, +m.el.querySelector('#bq').value || 1);
    const p = () => m.el.querySelector('#bp').value;
    const rp = new RangePicker(m.el.querySelector('#brp'), {
      minDays: 1, start: sel.start, months: window.innerWidth < 800 ? 1 : 2,
      isAvailable: (iso) => Inventory.freeOn(p(), iso) >= q(),
      onChange: (s, e) => { sel = { start: s, end: e }; upd(); },
    });
    function upd() {
      const ok = sel.start && sel.end;
      m.el.querySelector('#bgo').disabled = !ok;
      m.el.querySelector('#bsum').textContent = ok ? `${D.fmt(sel.start)} – ${D.fmt(sel.end)} · ${q()} יחידות` : 'בחרו טווח תאריכים (לחיצה כפולה על אותו יום לחסימת יום בודד)';
    }
    upd();
    const reset = () => { sel = { start: null, end: null }; rp.set(null, null); upd(); };
    m.el.querySelector('#bp').onchange = reset;
    m.el.querySelector('#bq').oninput = reset;
    m.el.querySelector('#bgo').onclick = async () => {
      try {
        await Inventory.book({ kind: 'block', lines: [{ kind: 'product', id: p(), qty: q() }], start: sel.start, end: sel.end, note: m.el.querySelector('#bn').value });
        m.close(); rerender(); toast('היחידות נחסמו');
      } catch (err) { toast(err.message); }
    };
  }

  // =====================================================================
  // ORDERS
  // =====================================================================
  let orderTab = 'upcoming';
  views.orders = () => {
    const t = D.today();
    const all = [...db().bookings].sort((a, b) => a.start.localeCompare(b.start));
    const tabs = {
      upcoming: ['קרובות ופעילות', all.filter((b) => b.status === 'confirmed' && b.end >= t)],
      past: ['הסתיימו', all.filter((b) => b.status === 'confirmed' && b.end < t).reverse()],
      cancelled: ['בוטלו', all.filter((b) => b.status === 'cancelled')],
      all: ['הכל', all],
    };
    const list = tabs[orderTab][1];
    const el = view(`
      <div class="page-head"><div><h1>הזמנות</h1><p class="muted">הזמנות לקוחות וחסימות פנימיות. ביטול משחרר מיד את היחידות בלוח הזמינות.</p></div></div>
      <div class="tabs">${Object.entries(tabs).map(([k, [label, l]]) => `<button class="${k === orderTab ? 'on' : ''}" data-tab="${k}">${label} <span>${l.length}</span></button>`).join('')}</div>
      <table class="tbl">
        <thead><tr><th>#</th><th>לקוח</th><th>תאריכים</th><th>פריטים</th><th>סכום</th><th>סטטוס</th><th></th></tr></thead>
        <tbody>${list.map((b) => `
          <tr data-order="${b.id}">
            <td><b>${b.id.replace('o_', '')}</b></td>
            <td>${esc(custName(b))}${b.kind !== 'block' && Store.customer(b.customerId)?.studio ? `<div class="muted small">${esc(Store.customer(b.customerId).studio)}</div>` : ''}</td>
            <td>${D.fmt(b.start)} – ${D.fmt(b.end)}<div class="muted small">${D.span(b.start, b.end)} ימים</div></td>
            <td><div class="order-thumbs">${b.lines.map((l) => { const it = Store.itemOf(l.kind, l.id); return it ? `<img src="${thumb(it)}" title="${esc(it.name)} ×${l.qty}" alt="">` : ''; }).join('')}</div></td>
            <td>${b.total ? money(b.total) : '—'}</td>
            <td>${statusTag(b)}</td>
            <td>${b.status === 'confirmed' && b.end >= t ? `<button class="btn danger sm" data-cancel="${b.id}">ביטול</button>` : ''}</td>
          </tr>`).join('') || `<tr><td colspan="7" class="muted">אין הזמנות</td></tr>`}</tbody>
      </table>`);
    el.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { orderTab = b.dataset.tab; views.orders(); } };
    el.querySelector('.tbl').addEventListener('click', async (e) => {
      const c = e.target.closest('[data-cancel]');
      if (c) { e.stopPropagation(); if (confirm('לבטל את ההזמנה ולשחרר את היחידות?')) { await Inventory.cancel(c.dataset.cancel); toast('ההזמנה בוטלה'); rerender(); } return; }
      const r = e.target.closest('[data-order]'); if (r) orderDetails(r.dataset.order);
    });
  };

  function orderDetails(id) {
    const b = db().bookings.find((x) => x.id === id);
    if (!b) return;
    const c = Store.customer(b.customerId);
    const alloc = Inventory.allocationOf(b);
    const m = modal(`
      <div class="modal-body">
        <div class="row" style="justify-content:space-between"><h2>${b.kind === 'block' ? 'חסימה' : 'הזמנה'} #${b.id.replace('o_', '')}</h2>${statusTag(b)}</div>
        <p class="muted">${D.fmtLong(b.start)} – ${D.fmtLong(b.end)} · ${D.span(b.start, b.end)} ימים${b.createdAt ? ` · נוצרה ${D.fmt(b.createdAt)}` : ''}</p>
        ${c ? `<div class="panel tight"><b>${esc(c.name)}</b> · ${esc(c.studio || '')}<div class="small muted">${esc(c.phone || '')} · ${esc(c.email)}</div></div>` : ''}
        ${b.note ? `<div class="panel tight"><span class="muted small">הערה</span><div>${esc(b.note)}</div></div>` : ''}
        <h3 style="margin:16px 0 8px">מה הוזמן</h3>
        ${b.lines.map((l) => { const it = Store.itemOf(l.kind, l.id); return `<div class="k-line"><img src="${thumb(it)}" alt=""><span>${esc(it?.name || 'נמחק')}${l.kind === 'package' ? ' <span class="tag">חבילה</span>' : ''}</span><b>×${l.qty}</b></div>`; }).join('')}
        <h3 style="margin:16px 0 8px">יחידות שהוקצו (מה לארוז)</h3>
        <table class="tbl compact"><thead><tr><th>פריט</th><th>כמות</th><th>יחידות</th></tr></thead><tbody>
          ${[...alloc].map(([pid, qty]) => { const p = Store.product(pid); const u = Inventory.unitAssignments(pid)[b.id] || []; return `<tr><td>${esc(p?.name || 'נמחק')}</td><td>${qty}</td><td>${b.status === 'confirmed' ? u.map((x) => `<span class="tag ${x.over ? 'bad' : ''}">#${x.n}</span>`).join(' ') : '—'}</td></tr>`; }).join('')}
        </tbody></table>
        ${b.total ? `<p style="margin-top:12px">סה״כ: <b>${money(b.total)}</b></p>` : ''}
        ${b.status === 'confirmed' && b.end >= D.today() ? '<div class="edit-foot"><span></span><button class="btn danger" data-cancel>ביטול הזמנה</button></div>' : ''}
      </div>`, { size: 'mid' });
    const cb = m.el.querySelector('[data-cancel]');
    if (cb) cb.onclick = async () => { if (!confirm('לבטל את ההזמנה ולשחרר את היחידות?')) return; await Inventory.cancel(b.id); m.close(); UI.closeAll(); rerender(); toast('ההזמנה בוטלה'); };
  }

  // =====================================================================
  // LEADS (track 3: personal consultation)
  // =====================================================================
  views.leads = () => {
    const leads = [...db().leads].reverse();
    const el = view(`
      <div class="page-head"><div><h1>פניות ייעוץ וליווי אישי</h1><p class="muted">פניות שהגיעו ממסלול 3 באתר הלקוחות.</p></div></div>
      ${leads.length ? `<table class="tbl"><thead><tr><th>תאריך</th><th>שם</th><th>טלפון</th><th>תאריך צילום</th><th>פרטים</th><th>סטטוס</th></tr></thead><tbody>
        ${leads.map((l) => `<tr><td>${D.fmt(l.createdAt)}</td><td>${esc(l.name)}</td><td dir="ltr" style="text-align:right">${esc(l.phone)}</td><td>${l.date ? D.fmt(l.date) : '—'}</td><td class="small">${esc(l.notes || '')}</td>
          <td><select class="input" data-lead="${l.id}">${[['new', 'חדשה'], ['contacted', 'נוצר קשר'], ['closed', 'נסגרה']].map(([v, t]) => `<option value="${v}" ${l.status === v ? 'selected' : ''}>${t}</option>`).join('')}</select></td></tr>`).join('')}
      </tbody></table>` : '<div class="panel"><p class="muted">עדיין אין פניות. באתר הלקוחות, כפתור "לתיאום שיחה" במסלול 3 שולח פנייה לכאן.</p></div>'}`);
    el.addEventListener('change', async (e) => { const s = e.target.closest('[data-lead]'); if (s) { db().leads.find((l) => l.id === s.dataset.lead).status = s.value; await Store.save(); toast('עודכן'); } });
  };

  // =====================================================================
  // SETTINGS
  // =====================================================================
  views.settings = () => {
    const s = db().settings;
    const el = view(`
      <div class="page-head"><div><h1>הגדרות</h1></div></div>
      <form class="panel" id="sf" style="max-width:560px">
        <div class="field"><label>זמן השכרה מינימלי (ימים)</label><input name="minDays" type="number" min="1" value="${s.minDays}"></div>
        <div class="field"><label>סיסמת מפעיל</label><input name="adminPassword" value="${esc(s.adminPassword)}"></div>
        <button class="btn">שמירה</button>
      </form>
      <div class="panel" style="max-width:560px;margin-top:20px">
        <h3>נתוני הדמו</h3>
        <p class="muted small">כל הנתונים נשמרים בדפדפן הזה בלבד (אין עדיין שרת). איפוס מחזיר את הקטלוג, החבילות וההזמנות לדוגמה.</p>
        <button class="btn danger" data-reset>איפוס נתוני הדמו</button>
      </div>`);
    el.querySelector('#sf').onsubmit = async (e) => {
      e.preventDefault();
      s.minDays = Math.max(1, +e.target.minDays.value || 3);
      s.adminPassword = e.target.adminPassword.value || 'plum';
      await Store.save(); toast('ההגדרות נשמרו');
    };
    el.querySelector('[data-reset]').onclick = async () => { if (confirm('לאפס את כל נתוני הדמו?')) { await Store.reset(); toast('הנתונים אופסו'); rerender(); } };
  };

  gate();
})();
