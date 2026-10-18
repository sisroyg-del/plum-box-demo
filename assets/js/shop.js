/* plum box — customer storefront */
(async function () {
  const { D, money } = Store;
  const { esc, $, $$, modal, toast } = UI;
  await Store.load();

  // ---------- session state (per browser) ----------
  const LS = { cart: 'plumbox-cart', user: 'plumbox-user' };
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const state = {
    cart: read(LS.cart, { lines: [], start: null, end: null }),
    userId: read(LS.user, null),
    filter: 'home', // home | all | packages | new | <categoryId>
    q: '',
  };
  if (state.cart.start && state.cart.start < D.today()) { state.cart.start = state.cart.end = null; }
  const saveCart = () => { write(LS.cart, state.cart); renderCartBadge(); renderDateChip(); };
  const user = () => (state.userId ? Store.customer(state.userId) : null);
  const days = () => (state.cart.start && state.cart.end ? D.span(state.cart.start, state.cart.end) : 0);
  const minDays = () => Store.db.settings.minDays;

  // ---------- helpers ----------
  const thumb = (item) => esc(item.images?.[0] || '');
  const priceLabel = (item) => `${money(item.rentPrice)} <span>/ ${item.rentDays} ימים</span>`;
  const cartQty = (kind, id) => state.cart.lines.filter((l) => l.kind === kind && l.id === id).reduce((s, l) => s + l.qty, 0);

  // Is this item bookable for the chosen dates, on top of what's already in the cart?
  function availability(kind, id) {
    const { start, end } = state.cart;
    if (!start || !end) return null;
    const others = state.cart.lines.filter((l) => !(l.kind === kind && l.id === id));
    const mine = cartQty(kind, id);
    const res = Inventory.check([...others, { kind, id, qty: mine + 1 }], start, end);
    if (res.ok) return { ok: true };
    // distinguish "taken by other orders" from "you already have the last one in your cart"
    const alone = Inventory.check([{ kind, id, qty: 1 }], start, end);
    return { ok: false, reason: alone.ok ? 'cart' : 'busy' };
  }

  // ---------- header ----------
  function renderCartBadge() {
    const n = state.cart.lines.reduce((s, l) => s + l.qty, 0);
    const b = $('#cartCount'); b.hidden = !n; b.textContent = n;
  }
  function renderDateChip() {
    const { start, end } = state.cart;
    $('#dateChipText').textContent = start && end ? `${D.fmt(start)} – ${D.fmt(end)} · ${days()} ימים` : 'מתי יום הצילום?';
    $('#dateChip').classList.toggle('set', !!(start && end));
  }

  // ---------- hero ----------
  let heroTimer, heroIdx = 0;
  function renderHero() {
    const bs = Store.db.banners;
    const el = $('#hero');
    if (!bs.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `
      ${bs.map((b, i) => `
        <div class="slide ${i === heroIdx ? 'on' : ''}" style="background-image:url('${esc(b.image)}')" aria-hidden="${i !== heroIdx}">
          <div class="slide-text">
            ${b.kicker ? `<span class="kicker">${esc(b.kicker)}</span>` : ''}
            <h1>${esc(b.title)}</h1>
            <p>${esc(b.text)}</p>
            ${b.link ? `<button class="btn" data-banner="${i}">${esc(b.cta || 'לפרטים')}</button>` : ''}
          </div>
        </div>`).join('')}
      <div class="dots">${bs.map((_, i) => `<button class="${i === heroIdx ? 'on' : ''}" data-dot="${i}" aria-label="שקופית ${i + 1}"></button>`).join('')}</div>
      <button class="hero-arrow prev" data-step="-1" aria-label="הקודם">›</button>
      <button class="hero-arrow next" data-step="1" aria-label="הבא">‹</button>`;
    restartHero();
  }
  function showSlide(i) {
    const n = Store.db.banners.length;
    heroIdx = (i + n) % n;
    $$('#hero .slide').forEach((s, j) => { s.classList.toggle('on', j === heroIdx); s.setAttribute('aria-hidden', j !== heroIdx); });
    $$('#hero .dots button').forEach((d, j) => d.classList.toggle('on', j === heroIdx));
  }
  function restartHero() { clearInterval(heroTimer); heroTimer = setInterval(() => showSlide(heroIdx + 1), 6500); }
  $('#hero').addEventListener('click', (e) => {
    const dot = e.target.closest('[data-dot]'); if (dot) { showSlide(+dot.dataset.dot); restartHero(); return; }
    const st = e.target.closest('[data-step]'); if (st) { showSlide(heroIdx + +st.dataset.step); restartHero(); return; }
    const b = e.target.closest('[data-banner]');
    if (b) {
      const link = Store.db.banners[+b.dataset.banner].link;
      if (link.kind === 'filter') setFilter(link.id, true);
      else openItem(link.kind, link.id);
    }
  });
  $('#hero').addEventListener('mouseenter', () => clearInterval(heroTimer));
  $('#hero').addEventListener('mouseleave', restartHero);

  // ---------- filters ----------
  function renderFilters() {
    const cats = Store.db.categories;
    const typeCats = cats.filter((c) => c.group === 'type');
    const colorCats = cats.filter((c) => c.group === 'color');
    const matCats = cats.filter((c) => c.group === 'material');
    const chip = (id, label, sw) => `<button class="chip ${state.filter === id ? 'on' : ''}" data-filter="${id}">${sw ? `<span class="sw" style="background:${sw}"></span>` : ''}${esc(label)}</button>`;
    $('#filters').innerHTML = `
      <div class="filters-inner">
        ${chip('home', 'ראשי')}${chip('packages', 'חבילות')}${chip('new', 'חדש')}
        <span class="sep"></span>
        ${typeCats.map((c) => chip(c.id, c.name)).join('')}
        <span class="sep"></span>
        ${colorCats.map((c) => chip(c.id, c.name, c.swatch)).join('')}
        ${matCats.length ? `<span class="sep"></span>${matCats.map((c) => chip(c.id, c.name)).join('')}` : ''}
      </div>`;
  }
  function setFilter(f, scroll) {
    state.filter = f; state.q = ''; $('#q').value = '';
    renderFilters(); renderCatalog();
    if (scroll) $('#filters').scrollIntoView({ behavior: 'smooth' });
  }
  $('#filters').addEventListener('click', (e) => { const c = e.target.closest('[data-filter]'); if (c) setFilter(c.dataset.filter, true); });
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.go, true)));
  let qTimer;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = e.target.value.trim(); if (state.q) state.filter = 'search'; else if (state.filter === 'search') state.filter = 'home'; renderFilters(); renderCatalog(); }, 150);
  });

  // ---------- cards ----------
  function availBadge(kind, id) {
    const a = availability(kind, id);
    if (!a) return '';
    if (a.ok) return '<span class="avail ok">זמין בתאריכים שלך</span>';
    return `<span class="avail no">${a.reason === 'cart' ? 'כל היחידות כבר בסל' : 'תפוס בתאריכים שלך'}</span>`;
  }
  function productCard(p) {
    const a = availability('product', p.id);
    return `
      <article class="card ${a && !a.ok ? 'dim' : ''}" data-open="product:${p.id}" tabindex="0">
        <div class="card-img"><img src="${thumb(p)}" alt="${esc(p.name)}" loading="lazy">
          ${p.isNew ? '<span class="tag dark card-new">חדש</span>' : ''}
          <button class="quick-add" data-add="product:${p.id}" ${a && !a.ok ? 'disabled' : ''} aria-label="הוספה לסל">+</button>
        </div>
        <div class="card-body">
          <h3>${esc(p.name)}</h3>
          <div class="price">${priceLabel(p)}</div>
          ${availBadge('product', p.id)}
        </div>
      </article>`;
  }
  function packageCard(k) {
    const a = availability('package', k.id);
    const worth = k.items.reduce((s, it) => s + (Store.product(it.productId)?.rentPrice || 0) * it.qty, 0);
    return `
      <article class="card pkg ${a && !a.ok ? 'dim' : ''}" data-open="package:${k.id}" tabindex="0">
        <div class="card-img"><img src="${thumb(k)}" alt="${esc(k.name)}" loading="lazy">
          <span class="tag dark card-new">${k.items.reduce((s, i) => s + i.qty, 0)} פריטים</span>
          ${k.isNew ? '<span class="tag card-new2">חדש</span>' : ''}
        </div>
        <div class="card-body">
          <h3>${esc(k.name)}</h3>
          <p class="muted small tagline">${esc(k.tagline || '')}</p>
          <div class="price">${priceLabel(k)} ${worth > k.rentPrice ? `<s class="muted small">${money(worth)}</s>` : ''}</div>
          ${availBadge('package', k.id)}
        </div>
      </article>`;
  }
  function row(title, cards, opts) {
    if (!cards.length) return '';
    const o = opts || {};
    return `
      <section class="row-sec">
        <div class="row-head"><h2>${esc(title)}</h2>${o.more ? `<button class="link" data-filter="${o.more}">הצג הכל ‹</button>` : ''}</div>
        <div class="row-wrap">
          <button class="row-arrow prev" data-scroll="1" aria-label="הקודם">›</button>
          <div class="row-track ${o.wide ? 'wide' : ''}">${cards.join('')}</div>
          <button class="row-arrow next" data-scroll="-1" aria-label="הבא">‹</button>
        </div>
      </section>`;
  }

  // ---------- catalog ----------
  function matches(item, q) {
    const cats = (item.categoryIds || []).map((id) => Store.category(id)?.name || '').join(' ');
    const attrs = (item.attributes || []).map((a) => a.join(' ')).join(' ');
    const hay = `${item.name} ${item.description || ''} ${item.tagline || ''} ${cats} ${attrs}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  }
  function renderCatalog() {
    const db = Store.db;
    const products = Store.sorted(db.products);
    const packages = Store.sorted(db.packages);
    const el = $('#catalog');
    const f = state.filter;
    if (f === 'home') {
      const typeCats = db.categories.filter((c) => c.group === 'type');
      const colorCats = db.categories.filter((c) => c.group === 'color');
      const newest = [...products.filter((p) => p.isNew), ...packages.filter((k) => k.isNew)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      el.innerHTML = [
        row('חבילות אבזור מוכנות', packages.map(packageCard), { wide: true, more: 'packages' }),
        row('חדש בקטלוג', newest.map((x) => (x.items ? packageCard(x) : productCard(x))), { more: 'new' }),
        ...typeCats.map((c) => row(c.name, products.filter((p) => p.categoryIds.includes(c.id)).map(productCard), { more: c.id })),
        `<section class="row-sec"><div class="row-head"><h2>בחירה לפי צבעוניות</h2></div>
          <div class="color-tiles">${colorCats.map((c) => {
            const items = products.filter((p) => p.categoryIds.includes(c.id));
            return `<button class="color-tile" data-filter="${c.id}">
              <div class="ct-imgs">${items.slice(0, 4).map((p) => `<img src="${thumb(p)}" alt="" loading="lazy">`).join('')}</div>
              <div class="ct-label"><span class="sw" style="background:${c.swatch}"></span>${esc(c.name)} <span class="muted small">${items.length} פריטים</span></div>
            </button>`;
          }).join('')}</div></section>`,
      ].join('');
      return;
    }
    let title, prods = [], pkgs = [];
    if (f === 'all') { title = 'כל הקטלוג'; prods = products; pkgs = packages; }
    else if (f === 'packages') { title = 'חבילות אבזור מוכנות'; pkgs = packages; }
    else if (f === 'new') { title = 'חדש בקטלוג'; prods = products.filter((p) => p.isNew); pkgs = packages.filter((k) => k.isNew); }
    else if (f === 'search') { title = `תוצאות עבור “${state.q}”`; prods = products.filter((p) => matches(p, state.q)); pkgs = packages.filter((k) => matches(k, state.q)); }
    else {
      const c = Store.category(f); title = c ? c.name : '';
      prods = products.filter((p) => p.categoryIds.includes(f));
      pkgs = packages.filter((k) => k.categoryIds.includes(f));
    }
    const count = prods.length + pkgs.length;
    el.innerHTML = `
      <section class="grid-sec">
        <div class="row-head"><h2>${esc(title)}</h2><span class="muted">${count} תוצאות${state.cart.start ? ` · זמינות לפי ${D.fmt(state.cart.start)}–${D.fmt(state.cart.end)}` : ''}</span></div>
        ${pkgs.length ? `<div class="grid wide">${pkgs.map(packageCard).join('')}</div>` : ''}
        ${prods.length ? `<div class="grid">${prods.map(productCard).join('')}</div>` : ''}
        ${!count ? '<div class="empty">לא נמצאו פריטים. נסו מילה אחרת או <button class="link" data-filter="all">הציגו את כל הקטלוג</button></div>' : ''}
      </section>`;
  }
  $('#catalog').addEventListener('click', (e) => {
    const sc = e.target.closest('[data-scroll]');
    if (sc) { const tr = sc.parentElement.querySelector('.row-track'); tr.scrollBy({ left: +sc.dataset.scroll * tr.clientWidth * 0.85, behavior: 'smooth' }); return; }
    const fl = e.target.closest('[data-filter]'); if (fl) { setFilter(fl.dataset.filter, true); return; }
    const add = e.target.closest('[data-add]');
    if (add) { e.stopPropagation(); const [kind, id] = add.dataset.add.split(':'); addToCart(kind, id, 1); return; }
    const op = e.target.closest('[data-open]'); if (op) { const [kind, id] = op.dataset.open.split(':'); openItem(kind, id); }
  });
  $('#catalog').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const op = e.target.closest('[data-open]'); if (op) { const [k, id] = op.dataset.open.split(':'); openItem(k, id); } } });

  // ---------- cart ----------
  function addToCart(kind, id, qty) {
    const item = Store.itemOf(kind, id);
    if (!item) return false;
    const { start, end } = state.cart;
    if (start && end) {
      const next = state.cart.lines.map((l) => ({ ...l }));
      const ex = next.find((l) => l.kind === kind && l.id === id);
      if (ex) ex.qty += qty; else next.push({ kind, id, qty });
      const res = Inventory.check(next, start, end);
      if (!res.ok) { toast(`לא ניתן להוסיף: ${res.problems[0].name} לא זמין בכמות הזו בתאריכים שבחרת`); return false; }
    }
    const ex = state.cart.lines.find((l) => l.kind === kind && l.id === id);
    if (ex) ex.qty += qty; else state.cart.lines.push({ kind, id, qty });
    saveCart(); renderCatalog();
    toast(`״${item.name}״ נוסף לסל${start ? '' : ' · בחרו תאריכים כדי לוודא זמינות'}`);
    return true;
  }
  function cartTotals() {
    const d = days();
    let total = 0;
    const lines = state.cart.lines.map((l) => {
      const item = Store.itemOf(l.kind, l.id);
      const price = Store.linePrice(item, l.qty, d || item?.rentDays);
      total += price;
      return { ...l, item, price };
    }).filter((l) => l.item);
    return { lines, total };
  }

  const drawer = $('#drawer');
  function openCart() {
    renderDrawer();
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add('open'));
    document.body.style.overflow = 'hidden';
  }
  function closeCart() {
    drawer.classList.remove('open');
    setTimeout(() => { drawer.hidden = true; }, 220);
    document.body.style.overflow = '';
  }
  function renderDrawer() {
    const { start, end } = state.cart;
    const { lines, total } = cartTotals();
    const check = start && end && lines.length ? Inventory.check(lines, start, end) : { ok: true, problems: [] };
    const bad = new Set(check.problems.map((p) => p.productId));
    const lineBad = (l) => [...Inventory.expand([l]).keys()].some((pid) => bad.has(pid));
    drawer.innerHTML = `
      <div class="drawer-back" data-close></div>
      <aside class="drawer-panel">
        <div class="drawer-head"><h2>הסל שלי</h2><button class="modal-close" data-close aria-label="סגירה">×</button></div>
        <button class="drawer-dates ${start ? 'set' : ''}" data-dates>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
          <div>${start && end ? `<b>${D.fmtLong(start)} – ${D.fmtLong(end)}</b><span>${days()} ימי השכרה · לחצו לשינוי</span>` : `<b>בחרו תאריכי איסוף והחזרה</b><span>מינימום ${minDays()} ימים</span>`}</div>
        </button>
        <div class="drawer-lines">
          ${lines.length ? lines.map((l, i) => `
            <div class="cline ${lineBad(l) ? 'bad' : ''}">
              <img src="${esc(l.item.images[0])}" alt="">
              <div class="cline-info">
                <b>${esc(l.item.name)}</b>
                <span class="muted small">${l.kind === 'package' ? `חבילה · ${l.item.items.length} סוגי פריטים` : `${money(l.item.rentPrice)} / ${l.item.rentDays} ימים`}</span>
                ${lineBad(l) ? '<span class="tag bad">לא זמין בתאריכים האלו</span>' : ''}
                <div class="stepper"><button data-dec="${i}" aria-label="פחות">−</button><span>${l.qty}</span><button data-inc="${i}" aria-label="עוד">+</button></div>
              </div>
              <div class="cline-side"><b>${money(l.price)}</b><button class="link small" data-rm="${i}">הסרה</button></div>
            </div>`).join('') : '<div class="empty small">הסל ריק. אפשר להתחיל מחבילה מוכנה או לבחור פריטים בודדים.</div>'}
        </div>
        ${!check.ok ? `<div class="alert">חלק מהפריטים תפוסים בתאריכים שבחרת: ${check.problems.map((p) => `${esc(p.name)} (פנויים ${Math.max(0, p.free)} מתוך ${p.need} נדרשים)`).join(', ')}. שנו תאריכים או הסירו את הפריט.</div>` : ''}
        <div class="drawer-foot">
          <div class="sum"><span>סה״כ${days() ? ` ל-${days()} ימים` : ''}</span><b>${money(total)}</b></div>
          <p class="muted small">המחיר כולל ${minDays()} ימי השכרה בסיסיים; כל יום נוסף מחושב באופן יחסי.</p>
          <button class="btn block" data-checkout ${!lines.length || !check.ok ? 'disabled' : ''}>${start ? 'להמשך הזמנה' : 'בחירת תאריכים והמשך'}</button>
        </div>
      </aside>`;
  }
  drawer.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-close]')) return closeCart();
    if (t.closest('[data-dates]')) return openDates();
    const lines = state.cart.lines;
    const inc = t.closest('[data-inc]');
    if (inc) {
      const l = lines[+inc.dataset.inc];
      if (state.cart.start) {
        const next = lines.map((x) => (x === l ? { ...x, qty: x.qty + 1 } : x));
        if (!Inventory.check(next, state.cart.start, state.cart.end).ok) return toast('אין יחידות נוספות פנויות בתאריכים האלו');
      } else if (Inventory.maxQty(l.kind, l.id) <= l.qty) return toast('זו כל הכמות שיש במלאי');
      l.qty++; saveCart(); renderDrawer(); renderCatalog(); return;
    }
    const dec = t.closest('[data-dec]');
    if (dec) { const l = lines[+dec.dataset.dec]; l.qty--; if (l.qty <= 0) lines.splice(+dec.dataset.dec, 1); saveCart(); renderDrawer(); renderCatalog(); return; }
    const rm = t.closest('[data-rm]');
    if (rm) { lines.splice(+rm.dataset.rm, 1); saveCart(); renderDrawer(); renderCatalog(); return; }
    if (t.closest('[data-checkout]')) {
      if (!state.cart.start) return openDates(() => checkout());
      checkout();
    }
  });
  $('#cartBtn').addEventListener('click', openCart);

  // ---------- global date picker (hotel style) ----------
  function openDates(after) {
    const lines = state.cart.lines;
    const m = modal(`
      <div class="modal-body">
        <h2>מתי יום הצילום?</h2>
        <p class="muted">בחרו יום איסוף ויום החזרה (מינימום ${minDays()} ימים).${lines.length ? ' ימים שבהם פריט מהסל תפוס מסומנים כלא זמינים.' : ' אחרי הבחירה נסמן בקטלוג מה זמין בתאריכים שלכם.'}</p>
        <div id="rpGlobal" style="margin-top:16px"></div>
        <div class="row" style="justify-content:space-between;margin-top:18px">
          <button class="btn ghost" data-clear>ניקוי תאריכים</button>
          <button class="btn" data-ok disabled>אישור</button>
        </div>
      </div>`, { size: 'mid' });
    let sel = { start: state.cart.start, end: state.cart.end };
    const okBtn = m.el.querySelector('[data-ok]');
    okBtn.disabled = !(sel.start && sel.end);
    const rp = new RangePicker(m.el.querySelector('#rpGlobal'), {
      minDays: minDays(), start: sel.start, end: sel.end,
      months: window.innerWidth < 700 ? 1 : 2,
      isAvailable: (iso) => !lines.length || Inventory.dayOk(lines, iso),
      onChange: (s, e) => { sel = { start: s, end: e }; okBtn.disabled = false; },
    });
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-day]') && rp.start && !rp.end) okBtn.disabled = true;
    });
    m.el.querySelector('[data-clear]').addEventListener('click', () => {
      state.cart.start = state.cart.end = null; saveCart(); renderCatalog(); if (!drawer.hidden) renderDrawer(); m.close();
    });
    okBtn.addEventListener('click', () => {
      state.cart.start = sel.start; state.cart.end = sel.end; saveCart(); renderCatalog();
      if (!drawer.hidden) renderDrawer();
      m.close();
      after && after();
    });
  }
  $('#dateChip').addEventListener('click', () => openDates());

  // ---------- item modal ----------
  function openItem(kind, id) {
    const item = Store.itemOf(kind, id);
    if (!item) return;
    const isPkg = kind === 'package';
    const cats = item.categoryIds.map((c) => Store.category(c)).filter(Boolean);
    const inPkgs = isPkg ? [] : Store.packagesContaining(id);
    const worth = isPkg ? item.items.reduce((s, it) => s + (Store.product(it.productId)?.rentPrice || 0) * it.qty, 0) : 0;
    // packages show their own photos first, then every included item's photo
    const gallery = isPkg ? [...item.images, ...item.items.map((it) => Store.product(it.productId)?.images[0]).filter(Boolean)] : item.images;
    const m = modal(`
      <div class="item">
        <div class="item-gallery">
          <div class="item-main"><img id="mainImg" src="${esc(gallery[0])}" alt="${esc(item.name)}"></div>
          ${gallery.length > 1 ? `<div class="item-thumbs">${gallery.map((g, i) => `<button class="${i === 0 ? 'on' : ''}" data-img="${esc(g)}"><img src="${esc(g)}" alt=""></button>`).join('')}</div>` : ''}
        </div>
        <div class="item-info">
          <div class="item-tags">${isPkg ? '<span class="tag dark">חבילה</span>' : ''}${item.isNew ? '<span class="tag">חדש</span>' : ''}${cats.map((c) => `<button class="tag-link" data-filter="${c.id}">${esc(c.name)}</button>`).join('')}</div>
          <h2>${esc(item.name)}</h2>
          ${item.tagline ? `<p class="muted">${esc(item.tagline)}</p>` : ''}
          <div class="item-price">
            <div><b>${money(item.rentPrice)}</b> <span class="muted">ל-${item.rentDays} ימי השכרה</span></div>
            ${isPkg && worth > item.rentPrice ? `<div class="small">שווי הפריטים בנפרד: <s>${money(worth)}</s> · <b class="save">חיסכון של ${money(worth - item.rentPrice)}</b></div>` : ''}
            ${!isPkg && item.buyPrice ? `<div class="small muted">אהבת? אפשר גם לרכוש: ${money(item.buyPrice)}</div>` : ''}
          </div>
          ${item.description ? `<p class="item-desc">${esc(item.description)}</p>` : ''}
          ${item.attributes?.length ? `<dl class="attrs">${item.attributes.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
          ${!isPkg ? `<p class="small muted">במלאי: ${item.stock} יחידות</p>` : ''}
          ${inPkgs.length ? `<p class="small">כלול גם ב: ${inPkgs.map((k) => `<button class="link" data-openpkg="${k.id}">${esc(k.name)}</button>`).join(' · ')}</p>` : ''}
        </div>
      </div>
      ${isPkg ? `
        <div class="pkg-items">
          <h3>מה בקופסה? <span class="muted small">${item.items.reduce((s, i) => s + i.qty, 0)} פריטים</span></h3>
          <div class="pkg-grid">${item.items.map((it) => { const p = Store.product(it.productId); return p ? `
            <button class="pkg-item" data-openprod="${p.id}"><img src="${esc(p.images[0])}" alt=""><span>${esc(p.name)}</span>${it.qty > 1 ? `<em>×${it.qty}</em>` : ''}</button>` : ''; }).join('')}</div>
        </div>` : ''}
      <div class="item-book">
        <div class="item-book-head">
          <h3>זמינות והזמנה</h3>
          <div class="row">
            <span class="muted small">כמות</span>
            <div class="stepper"><button data-q="-1">−</button><span id="qtyVal">1</span><button data-q="1">+</button></div>
          </div>
        </div>
        <div id="rpItem"></div>
        <div class="item-book-foot">
          <div id="bookSummary" class="small"></div>
          <button class="btn" id="addBtn">הוספה לסל</button>
        </div>
      </div>`);

    let qty = 1;
    let sel = { start: state.cart.start, end: state.cart.end };
    const linesWithMe = () => [...state.cart.lines.filter((l) => !(l.kind === kind && l.id === id)), { kind, id, qty: qty + cartQty(kind, id) }];
    const rp = new RangePicker(m.el.querySelector('#rpItem'), {
      minDays: minDays(), start: sel.start, end: sel.end, months: window.innerWidth < 700 ? 1 : 2,
      isAvailable: (iso) => Inventory.dayOk([{ kind, id, qty }], iso),
      onChange: (s, e) => { sel = { start: s, end: e }; summary(); },
    });
    function summary() {
      const el = m.el.querySelector('#bookSummary');
      const btn = m.el.querySelector('#addBtn');
      if (!sel.start || !sel.end) {
        el.innerHTML = `<span class="muted">בחרו תאריכים כדי לראות זמינות ומחיר. ימים מסומנים בקו תפוסים.</span>`;
        btn.disabled = !!(rp.start && !rp.end); return;
      }
      const d = D.span(sel.start, sel.end);
      const free = Inventory.maxQty(kind, id, sel.start, sel.end) - cartQty(kind, id);
      const ok = Inventory.check(linesWithMe(), sel.start, sel.end).ok;
      el.innerHTML = `<b>${D.fmt(sel.start)} – ${D.fmt(sel.end)}</b> · ${d} ימים · <b>${money(Store.linePrice(item, qty, d))}</b><br>
        ${ok ? `<span class="ok-text">✓ זמין${free === 1 ? ` · ${isPkg ? 'החבילה האחרונה' : 'היחידה האחרונה'} בתאריכים האלו` : free > 1 ? ` · ${free} ${isPkg ? 'חבילות' : 'יחידות'} פנויות` : ''}</span>` : `<span class="bad-text">לא זמין בכמות הזו${cartQty(kind, id) ? ' (כולל מה שכבר בסל)' : ''}</span>`}`;
      btn.disabled = !ok;
    }
    summary();
    m.el.addEventListener('click', (e) => {
      const t = e.target;
      const im = t.closest('[data-img]');
      if (im) { m.el.querySelector('#mainImg').src = im.dataset.img; $$('.item-thumbs button', m.el).forEach((b) => b.classList.toggle('on', b === im)); return; }
      const qb = t.closest('[data-q]');
      if (qb) {
        const max = Math.max(1, Inventory.maxQty(kind, id, sel.start, sel.end));
        qty = Math.min(max, Math.max(1, qty + +qb.dataset.q));
        m.el.querySelector('#qtyVal').textContent = qty;
        rp.refresh(); summary(); return;
      }
      const fl = t.closest('[data-filter]'); if (fl) { m.close(); setFilter(fl.dataset.filter, true); return; }
      const op = t.closest('[data-openprod]'); if (op) { openItem('product', op.dataset.openprod); return; }
      const ok = t.closest('[data-openpkg]'); if (ok) { m.close(); openItem('package', ok.dataset.openpkg); return; }
      if (t.closest('[data-day]')) setTimeout(summary);
      if (t.id === 'addBtn') {
        if (sel.start && sel.end) {
          const datesChanged = sel.start !== state.cart.start || sel.end !== state.cart.end;
          if (datesChanged && state.cart.lines.length && !Inventory.check(linesWithMe(), sel.start, sel.end).ok) {
            return toast('בתאריכים האלו חלק מהפריטים שכבר בסל תפוסים');
          }
          state.cart.start = sel.start; state.cart.end = sel.end;
        }
        if (addToCart(kind, id, qty)) { m.close(); openCart(); }
      }
    });
  }

  // ---------- auth ----------
  function openAuth(after, tab) {
    let mode = tab || 'login';
    const m = modal(`<div class="modal-body" id="authBody"></div>`, { size: 'narrow' });
    const body = m.el.querySelector('#authBody');
    function draw(err) {
      body.innerHTML = `
        <span class="brand"><span class="dot"></span>plum box</span>
        <h2 style="margin:14px 0 4px">${mode === 'login' ? 'כניסה ללקוחות קיימים' : 'הרשמה כלקוח/ה חדש/ה'}</h2>
        <p class="muted small">${mode === 'login' ? 'לדמו: demo@plumbox.co.il · סיסמה 1234' : 'פתיחת חשבון סטודיו לצורך הזמנות.'}</p>
        <form id="authForm" style="margin-top:16px">
          ${mode === 'register' ? `
            <div class="field"><label>שם מלא</label><input name="name" required></div>
            <div class="field"><label>שם הסטודיו</label><input name="studio"></div>
            <div class="field"><label>טלפון</label><input name="phone" type="tel" required></div>` : ''}
          <div class="field"><label>אימייל</label><input name="email" type="email" required value="${mode === 'login' ? 'demo@plumbox.co.il' : ''}"></div>
          <div class="field"><label>סיסמה</label><input name="password" type="password" required minlength="4" value="${mode === 'login' ? '1234' : ''}"></div>
          ${err ? `<div class="alert">${esc(err)}</div>` : ''}
          <button class="btn block" type="submit">${mode === 'login' ? 'כניסה' : 'יצירת חשבון'}</button>
        </form>
        <p class="small" style="text-align:center;margin-top:14px">${mode === 'login' ? 'עוד אין חשבון?' : 'כבר רשומים?'} <button class="link" id="swap">${mode === 'login' ? 'להרשמה' : 'לכניסה'}</button></p>`;
      body.querySelector('#swap').onclick = () => { mode = mode === 'login' ? 'register' : 'login'; draw(); };
      body.querySelector('#authForm').onsubmit = async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        const email = f.email.trim().toLowerCase();
        if (mode === 'login') {
          const u = Store.db.customers.find((c) => c.email.toLowerCase() === email && c.password === f.password);
          if (!u) return draw('אימייל או סיסמה שגויים');
          login(u);
        } else {
          if (Store.db.customers.some((c) => c.email.toLowerCase() === email)) return draw('כבר קיים חשבון עם האימייל הזה');
          const u = { id: Store.uid('u'), name: f.name.trim(), studio: f.studio.trim(), phone: f.phone.trim(), email, password: f.password, createdAt: D.today() };
          Store.db.customers.push(u); await Store.save();
          login(u);
        }
        m.close(); after && after();
      };
    }
    draw();
  }
  function login(u) { state.userId = u.id; write(LS.user, u.id); toast(`שלום ${u.name.split(' ')[0]}!`); renderAccountBtn(); }
  function renderAccountBtn() { $('#accountBtn').classList.toggle('logged', !!user()); $('#accountBtn').title = user() ? user().name : 'כניסה / הרשמה'; }
  $('#accountBtn').addEventListener('click', () => (user() ? openAccount() : openAuth()));

  function statusTag(b) {
    if (b.status === 'cancelled') return '<span class="tag bad">בוטלה</span>';
    if (b.end < D.today()) return '<span class="tag">הסתיימה</span>';
    if (b.start <= D.today()) return '<span class="tag warn">בהשכרה</span>';
    return '<span class="tag ok">מאושרת</span>';
  }
  function openAccount() {
    const u = user();
    const m = modal(`<div class="modal-body" id="accBody"></div>`, { size: 'mid' });
    const draw = () => {
      const orders = Store.db.bookings.filter((b) => b.customerId === u.id).sort((a, b) => b.start.localeCompare(a.start));
      m.el.querySelector('#accBody').innerHTML = `
        <h2>שלום ${esc(u.name)}</h2>
        <p class="muted">${esc(u.studio || '')} · ${esc(u.email)}</p>
        <h3 style="margin:22px 0 10px">ההזמנות שלי</h3>
        ${orders.length ? orders.map((b) => `
          <div class="order-card">
            <div class="row" style="justify-content:space-between"><b>הזמנה #${b.id.replace('o_', '')}</b>${statusTag(b)}</div>
            <div class="small muted">${D.fmtLong(b.start)} – ${D.fmtLong(b.end)} · ${D.span(b.start, b.end)} ימים</div>
            <div class="order-thumbs">${b.lines.map((l) => { const it = Store.itemOf(l.kind, l.id); return it ? `<span title="${esc(it.name)}"><img src="${esc(it.images[0])}" alt="">${l.qty > 1 ? `<em>×${l.qty}</em>` : ''}</span>` : ''; }).join('')}</div>
            <div class="row" style="justify-content:space-between">
              <span class="small">${b.lines.map((l) => esc(Store.itemOf(l.kind, l.id)?.name || '')).join(', ')}</span>
              ${b.status === 'confirmed' && b.start > D.today() ? `<button class="btn danger sm" data-cancel="${b.id}">ביטול הזמנה</button>` : ''}
            </div>
          </div>`).join('') : '<p class="muted">עדיין אין הזמנות.</p>'}
        <div class="row" style="justify-content:space-between;margin-top:20px"><span></span><button class="btn ghost sm" data-logout>יציאה מהחשבון</button></div>`;
    };
    draw();
    m.el.addEventListener('click', async (e) => {
      const c = e.target.closest('[data-cancel]');
      if (c && confirm('לבטל את ההזמנה? הפריטים ישוחררו בלוח הזמינות.')) { await Inventory.cancel(c.dataset.cancel); toast('ההזמנה בוטלה'); draw(); renderCatalog(); }
      if (e.target.closest('[data-logout]')) { state.userId = null; write(LS.user, null); renderAccountBtn(); m.close(); toast('יצאת מהחשבון'); }
    });
  }

  // ---------- checkout ----------
  function checkout() {
    if (!user()) return openAuth(() => checkout());
    const { start, end } = state.cart;
    const { lines, total } = cartTotals();
    const res = Inventory.check(lines, start, end);
    if (!res.ok) { renderDrawer(); return toast('חלק מהפריטים כבר לא זמינים, בדקו את הסל'); }
    const m = modal(`
      <div class="modal-body">
        <h2>סיכום הזמנה</h2>
        <p class="muted">${esc(user().name)} · ${esc(user().studio || user().email)}</p>
        <div class="co-dates"><div><label>איסוף</label><b>${D.fmtLong(start)}</b></div><div><label>החזרה</label><b>${D.fmtLong(end)}</b></div><div><label>ימים</label><b>${days()}</b></div></div>
        <table class="co-table">${lines.map((l) => `<tr><td>${esc(l.item.name)}${l.kind === 'package' ? ' <span class="tag">חבילה</span>' : ''}</td><td>×${l.qty}</td><td>${money(l.price)}</td></tr>`).join('')}
          <tr class="tot"><td>סה״כ</td><td></td><td>${money(total)}</td></tr></table>
        <div class="field"><label>הערות (כתובת לוקיישן, שעת איסוף…)</label><textarea id="coNote" placeholder="לדוגמה: איסוף מהסטודיו בחיפה ב-9:00"></textarea></div>
        <p class="small muted">בדמו אין תשלום. ההזמנה נרשמת בלוח הזמינות והפריטים ננעלים לתאריכים האלו.</p>
        <button class="btn block" id="confirmBtn">אישור הזמנה</button>
      </div>`, { size: 'mid' });
    m.el.querySelector('#confirmBtn').addEventListener('click', async () => {
      try {
        const b = await Inventory.book({ customerId: user().id, lines: state.cart.lines, start, end, total, note: m.el.querySelector('#coNote').value });
        state.cart = { lines: [], start: null, end: null }; saveCart();
        m.close(); closeCart(); renderCatalog();
        modal(`<div class="modal-body success">
          <div class="success-icon">✓</div>
          <h2>ההזמנה התקבלה!</h2>
          <p>הזמנה <b>#${b.id.replace('o_', '')}</b> · ${D.fmtLong(b.start)} – ${D.fmtLong(b.end)}</p>
          <p class="muted">הפריטים שוריינו עבורך. נשלח אישור ופרטי איסוף ב-SMS (בגרסה המלאה).</p>
          <button class="btn" onclick="this.closest('.modal-back').querySelector('.modal-close').click()">מעולה</button>
        </div>`, { size: 'narrow' });
      } catch (err) {
        toast(err.message);
        m.close(); renderDrawer();
      }
    });
  }

  // ---------- track 3: consultation lead ----------
  $('#consultBtn').addEventListener('click', () => {
    const u = user();
    const m = modal(`
      <div class="modal-body">
        <h2>ייעוץ וליווי אישי</h2>
        <p class="muted">מסלול הפרימיום: עזרה בבחירת הציוד, בהעמדה ובקומפוזיציה. נחזור אליך לתיאום.</p>
        <form id="leadForm" style="margin-top:14px">
          <div class="grid-2">
            <div class="field"><label>שם</label><input name="name" required value="${esc(u?.name || '')}"></div>
            <div class="field"><label>טלפון</label><input name="phone" required value="${esc(u?.phone || '')}"></div>
          </div>
          <div class="field"><label>תאריך צילום משוער</label><input name="date" type="date" min="${D.today()}"></div>
          <div class="field"><label>ספרי לנו על הפרויקט</label><textarea name="notes" placeholder="סוג החלל, סגנון, מה חסר…"></textarea></div>
          <button class="btn block">שליחת פנייה</button>
        </form>
      </div>`, { size: 'narrow' });
    m.el.querySelector('#leadForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      Store.db.leads.push({ id: Store.uid('l'), ...f, customerId: u?.id || null, createdAt: D.today(), status: 'new' });
      await Store.save(); m.close(); toast('הפנייה נשלחה, נחזור אליך בקרוב');
    };
  });

  // ---------- live updates from the operator console ----------
  Store.onChange(() => { renderHero(); renderFilters(); renderCatalog(); renderCartBadge(); if (!drawer.hidden) renderDrawer(); });

  renderHero(); renderFilters(); renderCatalog(); renderCartBadge(); renderDateChip(); renderAccountBtn();
})();
