/* plum box — data store (shared by the customer site and the operator console).
 * The demo has no server: everything lives in the browser's IndexedDB, and
 * open tabs stay in sync through BroadcastChannel. */
(function () {
  const DB_NAME = 'plumbox-demo';
  const KV = 'kv';
  const KEY = 'db';
  const SEED_VERSION = 4;

  // ---------- date helpers (all dates are local YYYY-MM-DD strings) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const D = {
    iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
    parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
    today() { return D.iso(new Date()); },
    add(s, n) { const d = D.parse(s); d.setDate(d.getDate() + n); return D.iso(d); },
    diff(a, b) { return Math.round((D.parse(b) - D.parse(a)) / 86400000); }, // b - a in days
    span(a, b) { return D.diff(a, b) + 1; }, // inclusive day count
    range(a, b) { const out = []; for (let s = a; s <= b; s = D.add(s, 1)) out.push(s); return out; },
    fmt(s, opts) { return D.parse(s).toLocaleDateString('he-IL', opts || { day: 'numeric', month: 'short' }); },
    fmtLong(s) { return D.parse(s).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'long' }); },
  };

  const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
  const money = (n) => `₪${Math.round(n).toLocaleString('he-IL')}`;

  // ---------- seed data (catalog built from the plum box deck) ----------
  function seed() {
    const img = (n) => `assets/img/items/${n}.jpg`;
    const categories = [
      { id: 'c_vases', name: 'אגרטלים', group: 'type' },
      { id: 'c_pillows', name: 'כריות וטקסטיל', group: 'type' },
      { id: 'c_art', name: 'תמונות', group: 'type' },
      { id: 'c_furniture', name: 'הדומים, שולחנות צד ותאורה', group: 'type' },
      { id: 'c_plants', name: 'עציצים וצמחים', group: 'type' },
      { id: 'c_green', name: 'ירוק', group: 'color', swatch: '#8fa58a' },
      { id: 'c_blue', name: 'כחול', group: 'color', swatch: '#5d86a8' },
      { id: 'c_colorful', name: 'צבעוני', group: 'color', swatch: 'conic-gradient(#f06b4f,#f4c23d,#5bb0a0,#7a6fd0,#f06b4f)' },
      { id: 'c_neutral', name: 'נטרלי', group: 'color', swatch: '#e6dccb' },
      { id: 'c_white', name: 'לבן', group: 'color', swatch: '#ffffff' },
      { id: 'c_glass', name: 'זכוכית', group: 'material' },
      { id: 'c_ceramic', name: 'קרמיקה וחרס', group: 'material' },
      { id: 'c_velvet', name: 'קטיפה', group: 'material' },
      { id: 'c_wood', name: 'עץ', group: 'material' },
    ];
    let order = 0;
    const P = (id, name, image, cats, stock, rent, buy, attrs, desc, extra) => ({
      id, name, images: [img(image)], categoryIds: cats, stock, rentPrice: Math.round(rent * 1.45 / 5) * 5, rentDays: 3,
      buyPrice: buy, attributes: attrs, description: desc || '', isNew: false, order: order++,
      createdAt: '2026-09-01', ...(extra || {}),
    });
    const products = [
      // vases
      P('p_vase_green', 'אגרטל זכוכית ירוקה', 'vase-green-glass', ['c_vases', 'c_green', 'c_glass'], 3, 45, 220,
        [['חומר', 'זכוכית'], ['קוטר', '20 ס״מ (צוואר 10)'], ['גובה', '20 ס״מ']], 'אגרטל זכוכית מעושנת בגוון ירוק בקבוק, צורה מעוגלת ורכה. נראה מצוין לבד או עם ענף בודד.'),
      P('p_vase_speckled', 'אגרטל זכוכית נגיעות', 'vase-speckled-glass', ['c_vases', 'c_green', 'c_neutral', 'c_glass'], 2, 55, 280,
        [['חומר', 'זכוכית'], ['קוטר', '30 ס״מ'], ['גובה', '30 ס״מ']], 'אגרטל כדורי עם כתמי ירוק, לבן וחום. נוכחות חזקה על שולחן אוכל או קונסולה.'),
      P('p_vase_cream', 'אגרטל חרס שמנת', 'vase-cream-clay', ['c_vases', 'c_neutral', 'c_white', 'c_ceramic'], 3, 40, 190,
        [['חומר', 'חרס'], ['גובה', '35 ס״מ']], 'אגרטל חרס מחורץ בגוון שמנת. מגיע עם ענף יבש.'),
      P('p_vase_navy', 'אגרטל נקודות כחול', 'vase-navy-dots', ['c_vases', 'c_blue', 'c_ceramic'], 2, 50, 240,
        [['חומר', 'קרמיקה מצוירת ביד'], ['גובה', '28 ס״מ']], 'קרמיקה כחולה כהה עם עיגולי חול גדולים.', { isNew: true, createdAt: '2026-10-10' }),
      P('p_vase_ribbed', 'אגרטל זכוכית מדורג', 'vase-green-ribbed', ['c_vases', 'c_green', 'c_glass'], 2, 45, 210,
        [['חומר', 'זכוכית'], ['גובה', '24 ס״מ']], 'זכוכית ירוקה בשכבות, שוברת אור יפה מול חלון.', { isNew: true, createdAt: '2026-10-12' }),
      P('p_vase_white_round', 'אגרטל כדור לבן', 'vase-white-round', ['c_vases', 'c_white', 'c_neutral', 'c_ceramic'], 3, 35, 160,
        [['חומר', 'קרמיקה מבריקה'], ['קוטר', '22 ס״מ']], 'אגרטל כדורי מינימליסטי.'),
      P('p_vase_dried', 'אגרטל עם פרחים יבשים', 'vase-dried-flowers', ['c_vases', 'c_neutral', 'c_white', 'c_ceramic'], 2, 60, 290,
        [['חומר', 'קרמיקה + פרחים מיובשים'], ['גובה כולל', '45 ס״מ']], 'מגיע מסודר עם זר יבש, מוכן לצילום.'),
      P('p_vase_eucalyptus', 'אגרטל ירוק עם אקליפטוס', 'vase-green-eucalyptus', ['c_vases', 'c_green', 'c_colorful', 'c_ceramic'], 2, 45, 200,
        [['חומר', 'קרמיקה'], ['גובה כולל', '40 ס״מ']], 'כולל ענף אקליפטוס מלאכותי.'),
      P('p_vases_yellow_aqua', 'זוג אגרטלים צהוב ותכלת', 'vases-yellow-aqua', ['c_vases', 'c_colorful', 'c_glass'], 2, 50, 230,
        [['חומר', 'זכוכית צבעונית'], ['כמות', 'זוג']], 'זוג אגרטלי זכוכית שקופים בצבעי פסטל.'),
      // pillows & textile
      P('p_pillow_beige', 'כרית קטיפה בז׳', 'pillow-beige-velvet', ['c_pillows', 'c_neutral', 'c_velvet'], 4, 30, 120,
        [['בד', 'קטיפה'], ['מידה', '45×45 ס״מ']], 'כרית קטיפה חלקה, בסיס לכל סט כריות.'),
      P('p_pillow_leaves', 'כרית עלים ירוקה', 'pillow-leaves-green', ['c_pillows', 'c_green'], 3, 30, 130,
        [['בד', 'רקום, סרט קטיפה מסביב'], ['מידה', '50×30 ס״מ']]),
      P('p_pillow_drops', 'כרית טיפות ג׳קארד', 'pillow-drops-jacquard', ['c_pillows', 'c_green', 'c_neutral'], 3, 30, 130,
        [['בד', 'ג׳קארד'], ['מידה', '50×30 ס״מ']]),
      P('p_pillow_abstract', 'כרית ירוקה מופשטת', 'pillow-abstract-green', ['c_pillows', 'c_green'], 3, 30, 130,
        [['בד', 'כותנה'], ['מידה', '45×45 ס״מ']]),
      P('p_pillow_stripes', 'כרית קטיפה ירוקה פסים', 'pillow-green-stripes', ['c_pillows', 'c_green', 'c_velvet'], 3, 30, 130,
        [['בד', 'קטיפה'], ['מידה', '55×30 ס״מ']]),
      P('p_pillow_diamonds', 'כרית ריבועים ג׳קארד', 'pillow-diamonds-jacquard', ['c_pillows', 'c_neutral'], 3, 30, 130,
        [['בד', 'ג׳קארד'], ['מידה', '45×45 ס״מ']]),
      P('p_pillow_pink', 'כרית גלים ורודה', 'pillow-pink-waves', ['c_pillows', 'c_colorful'], 2, 30, 130,
        [['בד', 'בוקלה רקום'], ['מידה', '45×45 ס״מ']]),
      P('p_pillow_love', 'כרית LOVE', 'pillow-love', ['c_pillows', 'c_colorful', 'c_white'], 2, 30, 130,
        [['בד', 'רקמה'], ['מידה', '45×45 ס״מ']]),
      P('p_pillow_geo', 'כרית גאומטרית צבעונית', 'pillow-geometric', ['c_pillows', 'c_colorful'], 2, 35, 150,
        [['בד', 'קטיפה מודפסת'], ['מידה', '45×45 ס״מ']]),
      P('p_pillow_ikat', 'כרית איקאט כחולה', 'pillow-ikat-blue', ['c_pillows', 'c_blue'], 3, 30, 130,
        [['בד', 'כותנה'], ['מידה', '45×45 ס״מ']], '', { isNew: true, createdAt: '2026-10-14' }),
      P('p_throw_green', 'שמיכת נוי ירוקה', 'throw-green', ['c_pillows', 'c_green'], 2, 40, 180,
        [['בד', 'כותנה ארוגה עם פרנזים'], ['מידה', '130×170 ס״מ']]),
      P('p_throw_checks', 'שמיכת נוי משבצות', 'throw-checks', ['c_pillows', 'c_colorful'], 2, 40, 180,
        [['בד', 'צמר רך'], ['מידה', '130×170 ס״מ']]),
      P('p_throw_blue', 'שמיכת נוי כחולה', 'throw-blue', ['c_pillows', 'c_blue'], 2, 40, 180,
        [['בד', 'כותנה'], ['מידה', '130×170 ס״מ']], '', { isNew: true, createdAt: '2026-10-14' }),
      P('p_bedspread', 'כיסוי מיטה טלאים', 'bedspread-patchwork', ['c_pillows', 'c_colorful'], 1, 70, 420,
        [['בד', 'כותנה מרופדת'], ['מידה', '220×240 ס״מ (זוגי)']], 'כיסוי מיטה מתוך סט חדר השינה של האופציה הצבעונית.'),
      // art
      P('p_art_woman', 'תמונה: אישה יושבת', 'art-sitting-woman', ['c_art', 'c_green'], 2, 70, 350,
        [['מסגרת', 'עץ טבעי'], ['מידה', '40×40 ס״מ']]),
      P('p_art_stones', 'זוג תמונות: אבנים ונחל', 'art-stones-pair', ['c_art', 'c_neutral', 'c_green', 'c_wood'], 1, 90, 450,
        [['מסגרת', 'עץ'], ['מידות', '50×30 + 50×50 ס״מ']]),
      P('p_art_blocks', 'תמונה: צורות צבע', 'art-color-blocks', ['c_art', 'c_colorful'], 1, 70, 350, [['מסגרת', 'עץ טבעי'], ['מידה', '50×70 ס״מ']]),
      P('p_art_shapes', 'תמונה: צורות מופשטות', 'art-abstract-shapes', ['c_art', 'c_colorful', 'c_white'], 1, 70, 350, [['מסגרת', 'עץ טבעי'], ['מידה', '50×70 ס״מ']]),
      P('p_art_bananas', 'תמונה: בננות', 'art-bananas', ['c_art', 'c_colorful'], 1, 70, 350, [['מסגרת', 'עץ טבעי'], ['מידה', '50×70 ס״מ']]),
      P('p_art_flower', 'תמונה: פרח צבעוני', 'art-flower', ['c_art', 'c_colorful'], 1, 70, 350, [['מסגרת', 'עץ טבעי'], ['מידה', '50×50 ס״מ']]),
      P('p_art_ballet', 'תמונה: רקדנית', 'art-ballet', ['c_art', 'c_blue', 'c_neutral'], 1, 80, 400, [['מסגרת', 'עץ טבעי'], ['מידה', '70×50 ס״מ']], '', { isNew: true, createdAt: '2026-10-15' }),
      P('p_art_landscape', 'תמונה: נוף נטרלי', 'art-neutral-landscape', ['c_art', 'c_neutral'], 1, 80, 400, [['מסגרת', 'עץ טבעי'], ['מידה', '70×50 ס״מ']]),
      // furniture & lighting
      P('p_stool_sage', 'הדום מרווה', 'stool-sage', ['c_furniture', 'c_green'], 2, 80, 450, [['חומר', 'פלסטיק מבריק'], ['גובה', '45 ס״מ']], 'הדום/שולחן צד בצורת טבעות.'),
      P('p_table_u', 'שולחן צד U ירוק', 'side-table-u-green', ['c_furniture', 'c_green'], 2, 90, 520, [['חומר', 'מתכת צבועה'], ['מידות', '40×40×45 ס״מ']]),
      P('p_lamp_green', 'מנורת שולחן ירוקה', 'lamp-green-metal', ['c_furniture', 'c_green'], 2, 60, 320, [['חומר', 'מתכת'], ['גובה', '25 ס״מ'], ['רוחב בסיס', '20 ס״מ']]),
      P('p_stool_orange', 'הדום כתום', 'stool-orange', ['c_furniture', 'c_colorful'], 2, 80, 450, [['חומר', 'פוליאסטר לכה'], ['גובה', '42 ס״מ']]),
      P('p_table_burgundy', 'שולחן צד מתכת בורדו', 'side-table-burgundy', ['c_furniture', 'c_colorful'], 1, 90, 520, [['חומר', 'מתכת + זכוכית'], ['גובה', '55 ס״מ']]),
      P('p_candles', 'זוג פמוטים צבעוניים', 'candle-holder-a', ['c_furniture', 'c_colorful', 'c_ceramic'], 2, 35, 160, [['חומר', 'קרמיקה'], ['כמות', 'זוג']], 'זוג פמוטים מעוצבים, מגיע עם נרות.', { images: [img('candle-holder-a'), img('candle-holder-b')] }),
      P('p_stool_sky', 'הדום תכלת', 'stool-sky', ['c_furniture', 'c_blue'], 2, 80, 450, [['חומר', 'פלסטיק מבריק'], ['גובה', '45 ס״מ']], '', { isNew: true, createdAt: '2026-10-11' }),
      P('p_table_pink', 'שולחן צד ורוד', 'side-table-pink', ['c_furniture', 'c_colorful'], 1, 85, 480, [['חומר', 'מתכת'], ['גובה', '52 ס״מ']], '', { isNew: true, createdAt: '2026-10-16' }),
      P('p_stool_checked', 'הדום משובץ', 'stool-checked', ['c_furniture', 'c_neutral'], 1, 85, 480, [['חומר', 'ריפוד בוקלה'], ['גובה', '40 ס״מ']]),
      P('p_table_wood', 'שולחן צד עץ', 'side-table-wood', ['c_furniture', 'c_neutral', 'c_wood'], 2, 85, 480, [['חומר', 'עץ אגוז'], ['גובה', '50 ס״מ']]),
      // plants
      P('p_plant_fiddle', 'עציץ פיקוס כינור', 'plant-fiddle-leaf', ['c_plants', 'c_green'], 2, 60, 290, [['סוג', 'מלאכותי'], ['גובה', '110 ס״מ']], 'עציץ מלאכותי גבוה בכלי לבן.'),
      P('p_plants_jars', 'צמחים בכלי זכוכית', 'plants-glass-jars', ['c_plants', 'c_green', 'c_glass'], 2, 45, 180, [['סוג', 'אמיתי, במים'], ['כמות', '2 צמחים']], 'שני ייחורים בכלי זכוכית שקופים.'),
      P('p_plant_alocasia', 'עציץ אלוקסיה', 'plant-alocasia', ['c_plants', 'c_green', 'c_white'], 1, 55, 260, [['סוג', 'מלאכותי'], ['גובה', '60 ס״מ']]),
      P('p_plant_pilea', 'פילאה בכלי עץ', 'plant-pilea', ['c_plants', 'c_green', 'c_wood'], 2, 40, 170, [['סוג', 'מלאכותי'], ['גובה', '35 ס״מ']]),
      P('p_plant_green', 'צמח ירוק בגוש אדמה', 'plant-green-pot', ['c_plants', 'c_green'], 2, 35, 140, [['סוג', 'מלאכותי'], ['גובה', '30 ס״מ']]),
    ];

    const packages = [
      {
        id: 'k_green', name: 'האופציה הירוקה', order: 0, isNew: false, createdAt: '2026-09-01',
        tagline: 'סט סלון + חדר שינה בגווני ירוק, מרווה וזית',
        description: 'סט אבזור מלא שנבנה מראש בהרמוניה של ירוקים: כריות סלון וחדר שינה, שלוש תמונות, מנורת שולחן, שלישיית אגרטלים, הדום ושולחן צד, ועציצים. חוסך התלבטות ומבטיח תמונה הרמונית.',
        images: ['assets/img/pkg-green-1.jpg', 'assets/img/pkg-green-2.jpg'],
        rentPrice: 950, rentDays: 3,
        categoryIds: ['c_green'],
        items: [
          ['p_pillow_drops', 1], ['p_pillow_diamonds', 1], ['p_pillow_stripes', 1], ['p_pillow_abstract', 1],
          ['p_pillow_beige', 1], ['p_pillow_leaves', 1], ['p_throw_green', 1],
          ['p_art_woman', 1], ['p_art_stones', 1], ['p_lamp_green', 1],
          ['p_vase_green', 1], ['p_vase_speckled', 1], ['p_vase_cream', 1],
          ['p_stool_sage', 1], ['p_table_u', 1], ['p_plant_fiddle', 1], ['p_plants_jars', 1],
        ].map(([productId, qty]) => ({ productId, qty })),
      },
      {
        id: 'k_colorful', name: 'האופציה הצבעונית', order: 1, isNew: true, createdAt: '2026-10-05',
        tagline: 'פופ של צבע: תמונות, הדומים וכריות בגוונים עזים',
        description: 'סט סלון וסט חדר שינה צבעוניים, שולחן צד, זוג פמוטים, ארבע תמונות, זוג אגרטלים ואגרטל עם צמח מלאכותי. מתאים לחללים לבנים שצריכים אנרגיה.',
        images: ['assets/img/pkg-colorful-1.jpg', 'assets/img/pkg-colorful-2.jpg'],
        rentPrice: 950, rentDays: 3,
        categoryIds: ['c_colorful'],
        items: [
          ['p_art_blocks', 1], ['p_art_shapes', 1], ['p_art_bananas', 1], ['p_art_flower', 1],
          ['p_bedspread', 1], ['p_pillow_pink', 1], ['p_pillow_love', 1], ['p_pillow_geo', 1], ['p_throw_checks', 1],
          ['p_table_burgundy', 1], ['p_stool_orange', 1], ['p_candles', 1],
          ['p_vase_eucalyptus', 1], ['p_vases_yellow_aqua', 1],
        ].map(([productId, qty]) => ({ productId, qty })),
      },
    ];

    const banners = [
      { id: 'b1', kicker: 'חדש בקטלוג', title: 'האופציה הצבעונית', text: 'סט סלון וחדר שינה מלא, מוכן לשליפה מהארגז. 950 ₪ לשלושה ימי צילום.', image: 'assets/img/banner-colorful.jpg', link: { kind: 'package', id: 'k_colorful' }, cta: 'לצפייה בחבילה' },
      { id: 'b2', kicker: 'החבילה הנמכרת ביותר', title: 'האופציה הירוקה', text: '17 פריטים בהרמוניה אחת: כריות, תמונות, אגרטלים, הדום ועציצים.', image: 'assets/img/banner-green.jpg', link: { kind: 'package', id: 'k_green' }, cta: 'לפרטי החבילה' },
      { id: 'b3', kicker: 'הגיעו השבוע', title: 'פריטים חדשים בכחול', text: 'אגרטל נקודות, הדום תכלת, כרית איקאט ועוד. מבצע פתיחה: 10% על הזמנה ראשונה.', image: 'assets/img/banner-new.jpg', link: { kind: 'filter', id: 'new' }, cta: 'לכל החדשים' },
    ];

    // A few existing orders, relative to today, so the calendar shows real constraints.
    const t = D.today();
    const customers = [
      { id: 'u_demo', name: 'נועה כהן', studio: 'סטודיו נועה כהן עיצוב פנים', email: 'demo@plumbox.co.il', phone: '050-1234567', password: '1234', createdAt: '2026-09-10' },
      { id: 'u_maya', name: 'מאיה לוי', studio: 'Maya Levi Interiors', email: 'maya@example.com', phone: '052-7654321', password: '1234', createdAt: '2026-09-20' },
    ];
    const bk = (id, customerId, startOff, len, lines, status) => ({
      id, customerId, start: D.add(t, startOff), end: D.add(t, startOff + len - 1), lines,
      status: status || 'confirmed', createdAt: D.add(t, -5), note: '',
    });
    const bookings = [
      bk('o_1001', 'u_maya', 3, 3, [{ kind: 'package', id: 'k_green', qty: 1 }]),
      bk('o_1002', 'u_demo', 9, 4, [{ kind: 'product', id: 'p_art_bananas', qty: 1 }, { kind: 'product', id: 'p_stool_orange', qty: 2 }, { kind: 'product', id: 'p_vase_navy', qty: 1 }]),
      bk('o_1003', 'u_maya', 14, 3, [{ kind: 'package', id: 'k_colorful', qty: 1 }]),
      bk('o_1004', 'u_demo', 1, 5, [{ kind: 'product', id: 'p_pillow_beige', qty: 3 }, { kind: 'product', id: 'p_vase_white_round', qty: 2 }]),
      { id: 'o_1005', customerId: null, kind: 'block', start: D.add(t, 20), end: D.add(t, 23), lines: [{ kind: 'product', id: 'p_plant_fiddle', qty: 2 }], status: 'confirmed', createdAt: t, note: 'צילום פנימי של plum box' },
    ];

    return {
      version: SEED_VERSION, rev: 1,
      settings: { brand: 'plum box', tagline: 'השכרת אקססוריז לימי צילום', minDays: 3, adminPassword: 'plum', currency: '₪', city: 'חיפה' },
      categories, products, packages, banners, customers, bookings, leads: [],
      nextOrder: 1006,
    };
  }

  // ---------- persistence ----------
  let db = null;
  let idbHandle = null;
  const listeners = new Set();
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('plumbox-demo') : null;

  function openIdb() {
    if (idbHandle) return Promise.resolve(idbHandle);
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(KV);
      r.onsuccess = () => { idbHandle = r.result; res(idbHandle); };
      r.onerror = () => rej(r.error);
    });
  }
  async function idbGet() {
    const h = await openIdb();
    return new Promise((res, rej) => {
      const q = h.transaction(KV).objectStore(KV).get(KEY);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  }
  async function idbPut(v) {
    const h = await openIdb();
    return new Promise((res, rej) => {
      const tx = h.transaction(KV, 'readwrite');
      tx.objectStore(KV).put(v, KEY);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  }

  const Store = {
    D, uid, money,
    get db() { return db; },
    async load() {
      try { db = await idbGet(); } catch (e) { console.warn('IndexedDB unavailable, using memory only', e); }
      if (!db || db.version !== SEED_VERSION) { db = seed(); await Store.save({ silent: true }); }
      return db;
    },
    async save(opts) {
      db.rev = (db.rev || 0) + 1;
      try { await idbPut(db); } catch (e) { console.warn('save failed', e); }
      if (!(opts && opts.silent)) {
        channel && channel.postMessage({ rev: db.rev });
        listeners.forEach((fn) => fn());
      }
    },
    async reset() { db = seed(); await Store.save(); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // lookups
    product(id) { return db.products.find((p) => p.id === id); },
    pkg(id) { return db.packages.find((k) => k.id === id); },
    category(id) { return db.categories.find((c) => c.id === id); },
    customer(id) { return db.customers.find((c) => c.id === id); },
    itemOf(kind, id) { return kind === 'package' ? Store.pkg(id) : Store.product(id); },
    packagesContaining(productId) { return db.packages.filter((k) => k.items.some((i) => i.productId === productId)); },
    sorted(list) { return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); },

    // pricing: the listed price covers rentDays; longer rentals are charged pro-rata per extra day.
    linePrice(item, qty, days) {
      if (!item) return 0;
      const base = item.rentPrice * qty;
      if (!days || days <= item.rentDays) return base;
      return Math.round(base * days / item.rentDays);
    },
  };

  if (channel) {
    channel.onmessage = async () => {
      try { db = await idbGet(); } catch (e) { return; }
      listeners.forEach((fn) => fn());
    };
  }

  window.Store = Store;
})();
