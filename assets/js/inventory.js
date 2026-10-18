/* plum box — module 3: the inventory calendar.
 * Single source of truth for availability. Every booking (customer order or
 * operator block) holds physical units for every day from start to end
 * inclusive. Packages are expanded into the products they contain, so booking
 * a package removes its items from stock and vice versa. */
(function () {
  const { D } = Store;
  let cache = { rev: -1, usage: null };

  // Turn order lines ({kind, id, qty}) into product quantities.
  function expand(lines) {
    const need = new Map();
    for (const l of lines) {
      if (l.kind === 'package') {
        const k = Store.pkg(l.id);
        if (!k) continue;
        for (const it of k.items) need.set(it.productId, (need.get(it.productId) || 0) + it.qty * l.qty);
      } else {
        need.set(l.id, (need.get(l.id) || 0) + l.qty);
      }
    }
    return need;
  }

  const active = (b) => b.status === 'confirmed';

  // A booking stores its expanded allocation at the time it was made, so later
  // edits to a package don't silently change what an existing order holds.
  function allocationOf(b) {
    if (b.allocations) return new Map(Object.entries(b.allocations));
    return expand(b.lines);
  }

  // usage[productId][iso] = units held that day
  function usage() {
    const db = Store.db;
    if (cache.rev === db.rev && cache.usage) return cache.usage;
    const u = {};
    for (const b of db.bookings) {
      if (!active(b)) continue;
      for (const [pid, qty] of allocationOf(b)) {
        const row = (u[pid] = u[pid] || {});
        for (const day of D.range(b.start, b.end)) row[day] = (row[day] || 0) + qty;
      }
    }
    cache = { rev: db.rev, usage: u };
    return u;
  }

  function heldOn(productId, iso) { return (usage()[productId] || {})[iso] || 0; }
  function freeOn(productId, iso) {
    const p = Store.product(productId);
    return p ? p.stock - heldOn(productId, iso) : 0;
  }
  function freeInRange(productId, start, end) {
    let min = Infinity;
    for (const day of D.range(start, end)) min = Math.min(min, freeOn(productId, day));
    return min === Infinity ? 0 : min;
  }

  // How many of a single line (product or package) can still be booked for the range.
  function maxQty(kind, id, start, end) {
    if (kind === 'product') return Math.max(0, start ? freeInRange(id, start, end || start) : (Store.product(id)?.stock || 0));
    const k = Store.pkg(id);
    if (!k || !k.items.length) return 0;
    return Math.max(0, Math.min(...k.items.map((it) => {
      const free = start ? freeInRange(it.productId, start, end || start) : (Store.product(it.productId)?.stock || 0);
      return Math.floor(free / it.qty);
    })));
  }

  // Can every line be fulfilled on a single day?
  function dayOk(lines, iso) {
    for (const [pid, qty] of expand(lines)) if (freeOn(pid, iso) < qty) return false;
    return true;
  }

  // Full check for a date range. Returns the products that fall short and on which days.
  function check(lines, start, end) {
    const problems = [];
    for (const [pid, qty] of expand(lines)) {
      const p = Store.product(pid);
      if (!p) { problems.push({ productId: pid, name: 'פריט שנמחק', need: qty, free: 0, days: [] }); continue; }
      const days = D.range(start, end).filter((d) => freeOn(pid, d) < qty);
      if (days.length) problems.push({ productId: pid, name: p.name, need: qty, free: freeInRange(pid, start, end), days });
    }
    return { ok: problems.length === 0, problems };
  }

  async function book({ customerId, lines, start, end, kind, note, total }) {
    const db = Store.db;
    const minDays = db.settings.minDays;
    if (kind !== 'block' && D.span(start, end) < minDays) throw new Error(`זמן השכרה מינימלי הוא ${minDays} ימים`);
    if (!lines.length) throw new Error('לא נבחרו פריטים');
    const res = check(lines, start, end);
    if (!res.ok) {
      const err = new Error('חלק מהפריטים כבר לא זמינים בתאריכים שנבחרו');
      err.problems = res.problems;
      throw err;
    }
    const booking = {
      id: `o_${db.nextOrder++}`, customerId: customerId || null, kind: kind || 'order',
      start, end, lines: lines.map((l) => ({ kind: l.kind, id: l.id, qty: l.qty })),
      allocations: Object.fromEntries(expand(lines)), status: 'confirmed',
      total: total ?? null, note: note || '', createdAt: D.today(),
    };
    db.bookings.push(booking);
    await Store.save();
    return booking;
  }

  async function cancel(bookingId) {
    const b = Store.db.bookings.find((x) => x.id === bookingId);
    if (!b) return;
    b.status = 'cancelled';
    await Store.save();
  }

  // Which physical units (#1..#stock) each booking holds. Identical units are
  // interchangeable, so units are assigned greedily by start date (interval
  // colouring), which always fits whenever the per-day counts fit.
  function unitAssignments(productId) {
    const p = Store.product(productId);
    const list = Store.db.bookings
      .filter((b) => active(b) && allocationOf(b).get(productId))
      .sort((a, b) => a.start.localeCompare(b.start) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const freeFrom = []; // unit index -> first day it is free again
    const out = {};
    for (const b of list) {
      const qty = allocationOf(b).get(productId);
      const units = [];
      for (let u = 0; units.length < qty; u++) {
        if (!freeFrom[u] || freeFrom[u] <= b.start) { freeFrom[u] = D.add(b.end, 1); units.push(u + 1); }
      }
      out[b.id] = units.map((n) => ({ n, over: p ? n > p.stock : true }));
    }
    return out;
  }

  function bookingsOn(productId, iso) {
    return Store.db.bookings.filter((b) => active(b) && b.start <= iso && b.end >= iso && allocationOf(b).get(productId));
  }

  window.Inventory = { expand, allocationOf, heldOn, freeOn, freeInRange, maxQty, dayOk, check, book, cancel, unitAssignments, bookingsOn };
})();
