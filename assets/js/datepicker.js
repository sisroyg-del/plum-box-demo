/* plum box — hotel-style date range picker.
 * Two months side by side, click pickup then return, hover previews the range.
 * Days the caller marks unavailable can't be inside a selected range, and the
 * range must be at least `minDays` long (inclusive). */
(function () {
  const { D } = Store;
  const WEEK = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  class RangePicker {
    constructor(el, opts) {
      this.el = el;
      this.o = Object.assign({ months: 2, minDays: 3, isAvailable: () => true, dayNote: null, onChange: () => {}, start: null, end: null, horizon: 365 }, opts);
      this.start = this.o.start; this.end = this.o.end; this.hover = null;
      const base = D.parse(this.start || D.today());
      this.view = new Date(base.getFullYear(), base.getMonth(), 1);
      this.msg = '';
      el.classList.add('rp');
      el.addEventListener('click', (e) => this.onClick(e));
      el.addEventListener('mouseover', (e) => { const d = e.target.closest('[data-day]'); if (d && this.start && !this.end) { this.hover = d.dataset.day; this.paint(); } });
      el.addEventListener('mouseleave', () => { if (this.hover) { this.hover = null; this.paint(); } });
      this.render();
    }
    set(start, end) { this.start = start; this.end = end; this.msg = ''; this.render(); }
    refresh() { this.render(); }
    avail(iso) { return iso >= D.today() && iso <= D.add(D.today(), this.o.horizon) && this.o.isAvailable(iso); }
    // A range is valid when every day in it is available and it meets the minimum length.
    validRange(a, b) {
      if (D.span(a, b) < this.o.minDays) return 'short';
      for (const d of D.range(a, b)) if (!this.avail(d)) return 'blocked';
      return 'ok';
    }
    canStart(iso) {
      if (!this.avail(iso)) return false;
      for (let i = 1; i < this.o.minDays; i++) if (!this.avail(D.add(iso, i))) return false;
      return true;
    }
    onClick(e) {
      const nav = e.target.closest('[data-nav]');
      if (nav) { this.view.setMonth(this.view.getMonth() + Number(nav.dataset.nav)); this.render(); return; }
      const cell = e.target.closest('[data-day]');
      if (!cell || cell.classList.contains('past')) return;
      const iso = cell.dataset.day;
      if (!this.start || this.end || iso < this.start) {
        if (!this.canStart(iso)) {
          this.msg = this.avail(iso) ? `לא ניתן להתחיל כאן: אין ${this.o.minDays} ימים פנויים ברצף` : 'התאריך לא זמין';
          this.render(); return;
        }
        this.start = iso; this.end = null; this.msg = 'עכשיו בחרו תאריך החזרה';
      } else {
        const v = this.validRange(this.start, iso);
        if (v === 'short') { this.msg = `זמן השכרה מינימלי: ${this.o.minDays} ימים`; this.render(); return; }
        if (v === 'blocked') { this.msg = 'יש בטווח ימים שבהם הפריטים תפוסים'; this.render(); return; }
        this.end = iso; this.msg = '';
        this.o.onChange(this.start, this.end);
      }
      this.render();
    }
    month(first) {
      const y = first.getFullYear(), m = first.getMonth();
      const title = first.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
      const lead = first.getDay();
      const days = new Date(y, m + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<span class="rp-blank"></span>';
      for (let d = 1; d <= days; d++) {
        const iso = D.iso(new Date(y, m, d));
        const note = this.o.dayNote ? this.o.dayNote(iso) : '';
        cells += `<button type="button" class="rp-day" data-day="${iso}"><span>${d}</span>${note ? `<small>${note}</small>` : ''}</button>`;
      }
      return `<div class="rp-month"><div class="rp-title">${title}</div><div class="rp-grid">${WEEK.map((w) => `<span class="rp-wd">${w}</span>`).join('')}${cells}</div></div>`;
    }
    render() {
      const months = [];
      for (let i = 0; i < this.o.months; i++) months.push(this.month(new Date(this.view.getFullYear(), this.view.getMonth() + i, 1)));
      const atStart = this.view <= new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      this.el.innerHTML = `
        <div class="rp-head">
          <button type="button" class="rp-nav" data-nav="-1" ${atStart ? 'disabled' : ''} aria-label="חודש קודם">›</button>
          <div class="rp-summary">
            <div><label>איסוף</label><b>${this.start ? D.fmtLong(this.start) : '—'}</b></div>
            <div><label>החזרה</label><b>${this.end ? D.fmtLong(this.end) : '—'}</b></div>
            <div><label>ימים</label><b>${this.start && this.end ? D.span(this.start, this.end) : '—'}</b></div>
          </div>
          <button type="button" class="rp-nav" data-nav="1" aria-label="חודש הבא">‹</button>
        </div>
        <div class="rp-months">${months.join('')}</div>
        <div class="rp-foot"><span class="rp-legend"><i class="lg-free"></i>פנוי <i class="lg-busy"></i>תפוס</span><span class="rp-msg">${this.msg}</span></div>`;
      this.paint();
    }
    paint() {
      const today = D.today();
      const endPrev = this.end || (this.hover && this.hover >= this.start ? this.hover : null);
      this.el.querySelectorAll('[data-day]').forEach((c) => {
        const iso = c.dataset.day;
        const past = iso < today;
        c.className = 'rp-day';
        if (past) c.classList.add('past');
        else if (!this.avail(iso)) c.classList.add('busy');
        if (iso === today) c.classList.add('today');
        if (this.start && iso === this.start) c.classList.add('sel', 'sel-start');
        if (this.end && iso === this.end) c.classList.add('sel', 'sel-end');
        if (this.start && endPrev && iso > this.start && iso < endPrev) c.classList.add('in');
        if (!this.end && this.hover && iso === this.hover && iso > this.start) {
          c.classList.add('hover-end');
          if (this.validRange(this.start, iso) !== 'ok') c.classList.add('invalid');
        }
      });
    }
  }

  window.RangePicker = RangePicker;
})();
