// 토끼 우주선 8비트 스프라이트 — 코어. 1 아트 픽셀 = 1 월드 유닛.
// 모든 색은 NES(2C02) 팔레트 칸에서만 고른다. 키는 한 글자.
(function (root) {
  const NES = {
    '00':'#7C7C7C','02':'#0000BC','03':'#4428BC','08':'#503000','0D':'#000000',
    '10':'#BCBCBC','14':'#D800CC','16':'#F83800','17':'#E45C10','18':'#AC7C00','1A':'#00A800',
    '21':'#3CBCFC','22':'#6888FC','23':'#9878F8','24':'#F878F8','25':'#F85898','26':'#F87858',
    '27':'#FCA044','28':'#F8B800','2A':'#58D854','2B':'#58F898',
    '30':'#FCFCFC','31':'#A4E4FC','32':'#B8B8F8','33':'#D8B8F8','35':'#F8A4C0','36':'#F0D0B0',
    '37':'#FCE0A8','38':'#F8D878','3B':'#B8F8D8',
  };
  // 글자 → NES 칸
  const KEY = {
    K:'0D', W:'30', w:'10', g:'00', P:'35', p:'25', O:'27', o:'17', Y:'38', y:'28',
    C:'37', c:'36', L:'2A', l:'1A', B:'31', b:'21', V:'33', v:'23', U:'22', u:'03',
    n:'02', M:'3B', m:'2B', R:'26', r:'16', T:'18', t:'08', X:'14', x:'24', S:'32',
  };
  const COL = {}; for (const k in KEY) COL[k] = NES[KEY[k]];

  // ── 격자 ──
  const grid = (w, h) => ({ w, h, d: new Array(w * h).fill('.') });
  const get = (g, x, y) => (x < 0 || y < 0 || x >= g.w || y >= g.h) ? '.' : g.d[y * g.w + x];
  const set = (g, x, y, c) => { if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.d[y * g.w + x] = c; };
  const fromRows = (rows) => { const g = grid(rows[0].length, rows.length);
    rows.forEach((r, y) => [...r].forEach((c, x) => set(g, x, y, c))); return g; };
  const blit = (dst, src, ox, oy, keepDot = true) => {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = src.d[y * src.w + x]; if (c !== '.' || !keepDot) set(dst, ox + x, oy + y, c); } };
  const fillCircle = (g, cx, cy, r, c) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r) set(g, x, y, c); };
  const outline = (g, c = 'K') => { const src = g.d.slice();
    const at = (x, y) => (x < 0 || y < 0 || x >= g.w || y >= g.h) ? '.' : src[y * g.w + x];
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++)
      if (at(x, y) === '.' && (at(x-1,y) !== '.' || at(x+1,y) !== '.' || at(x,y-1) !== '.' || at(x,y+1) !== '.')) set(g, x, y, c);
    return g; };
  const flipV = (g) => { const o = grid(g.w, g.h);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) set(o, x, g.h - 1 - y, get(g, x, y)); return o; };
  // 최근접 회전. 출력은 정사각형, 중심 = (ax, ay)
  const rotate = (g, a, ax, ay) => {
    const R = Math.ceil(Math.hypot(Math.max(ax, g.w - ax), Math.max(ay, g.h - ay))) + 1;
    const o = grid(R * 2, R * 2); o.ax = R; o.ay = R;
    const c = Math.cos(a), s = Math.sin(a);
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
      const dx = x + .5 - R, dy = y + .5 - R;
      const sx = Math.floor(ax + dx * c + dy * s), sy = Math.floor(ay - dx * s + dy * c);
      set(o, x, y, get(g, sx, sy)); }
    return o; };

  // ── 당근 로켓 (기수 +x). 26×21, 회전 중심 (12,10) ──
  const FACES = {
    idle:  ['.......', '.K...K.', 'P..p..P', '.......'],
    aim:   ['KK...KK', '.K...K.', '...p...', '.......'],
    fly:   ['.......', '.K...K.', 'P.....P', '..KKK..'],
    win:   ['.K...K.', 'K.K.K.K', 'P.....P', '..KKK..'],
    bump:  ['K.....K', '.K...K.', 'K.....K', '...K...'],
    sad:   ['.......', '.K...K.', '.BKKKB.', 'K.....K'],
    sleep: ['.......', 'KK...KK', '...p...', '.......'],
  };
  const FACE_LABEL = { idle:'대기', aim:'조준', fly:'비행', win:'도착', bump:'충돌', sad:'실패', sleep:'표류' };

  function rocket(face = 'idle', opt = {}) {
    const { flame = -1, ears = 'up' } = opt;
    const g = grid(26, 21), X = 1, Y = 1, cy = 9;
    const P_ = (x, y, c) => set(g, X + x, Y + y, c);
    // 몸통
    for (let x = 5; x <= 22; x++) {
      const h = x <= 11 ? 5 : Math.max(0, Math.round(5 - (x - 11) * 0.48));
      for (let y = cy - h; y <= cy + h; y++) {
        let c = 'O';
        if (y <= cy - h + 1 && x >= 6 && x <= 18) c = 'C';
        if (y >= cy + h - 1) c = 'o';
        if ((x === 15 || x === 18) && y > cy - h + 1 && y < cy + h - 1 && Math.abs(y - cy) <= 2 && y !== cy) c = 'o';
        P_(x, y, c);
      }
    }
    // 잎
    for (let i = 0; i < 4; i++) { P_(4 - i, cy - 2 - i, 'L'); P_(5 - i, cy - 2 - i, 'l');
      P_(4 - i, cy + 2 + i, 'L'); P_(5 - i, cy + 2 + i, 'l'); }
    P_(4, cy - 1, 'l'); P_(4, cy + 1, 'l'); P_(3, cy, 'L'); P_(4, cy, 'l');
    // 불꽃
    if (flame >= 0) {
      const f = flame % 2 === 0 ? ['..yY', 'yYWY', '..yY'] : ['.yyY', 'RYWY', '.yyY'];
      f.forEach((r, j) => [...r].forEach((c, i) => { if (c !== '.') P_(i - 1, cy - 1 + j, c); }));
    }
    // 창
    fillCircle(g, X + 10.5, Y + cy + .5, 5.3, 'K');
    fillCircle(g, X + 10.5, Y + cy + .5, 4.3, 'B');
    P_(8, cy - 3, 'W'); P_(7, cy - 2, 'W');
    // 머리
    fillCircle(g, X + 10.5, Y + cy + 2.2, 3.6, 'W');
    // 귀 (창 밖으로)
    const ear = (x0, inner) => { for (let y = 0; y <= cy - 2; y++) {
      const lean = ears === 'back' && y < 3 ? -(3 - y) : 0;
      P_(x0 + lean, y + 1, inner ? 'W' : 'P'); P_(x0 + 1 + lean, y + 1, inner ? 'P' : 'W'); } };
    ear(8, true); ear(11, false);
    outline(g);
    // 얼굴
    (FACES[face] || FACES.idle).forEach((r, j) => [...r].forEach((c, i) => {
      if (c !== '.') P_(7 + i, cy + j, c); }));
    g.ax = X + 12; g.ay = Y + cy + .5;
    return g;
  }
  // 16방향. 기수가 왼쪽을 향하면 위아래를 뒤집어 조종석이 늘 위에 오게 한다.
  function rocketDir(face, a, opt) {
    let g = rocket(face, opt);
    const left = Math.cos(a) < -1e-6;
    if (left) { const ay = g.ay; g = Object.assign(flipV(g), { ax: g.ax, ay: g.h - ay }); }
    return rotate(g, a, g.ax, g.ay);
  }

  // ── 작은 스프라이트 ──
  const SMALL = {
    bullet: ['.rr.', 'rYYr', 'rYYr', '.rr.'],
    star1: ['W'],
    star2: ['.Y.', 'YWY', '.Y.'],
    sparkle0: ['..Y..', '..Y..', 'YYWYY', '..Y..', '..Y..'],
    sparkle1: ['.....', '..Y..', '.YWY.', '..Y..', '.....'],
    dizzy: ['..K..', '.KYK.', 'KYYYK', '.KYK.', 'K.K.K'],
    dust0: ['.WW.', 'WwwW', 'WwwW', '.WW.'],
    dust1: ['.W..W.', 'W.ww.W', '.w..w.', 'W.ww.W', '.W..W.'],
    dot: ['YY', 'YY'],
    trail: ['W'],
    xmark: ['R...R', '.R.R.', '..R..', '.R.R.', 'R...R'],
    zz: ['KKK.', '..K.', '.K..', 'KKK.'],
  };
  const small = (n) => fromRows(SMALL[n]);

  // ── 외계인 비행접시 26×13 ──
  function ufo(frame = 0) {
    const g = grid(28, 15), cx = 14, cy = 9;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const dx = (x + .5 - cx) / 6.2, dy = (y + .5 - (cy - 1.5)) / 5.6;
      if (dx * dx + dy * dy <= 1 && y < cy) set(g, x, y, 'B');
    }
    fillCircle(g, cx, cy - 3, 2.6, 'm'); set(g, cx - 2, cy - 4, 'K'); set(g, cx + 1, cy - 4, 'K');
    set(g, cx - 4, cy - 6, 'W'); set(g, cx - 5, cy - 5, 'W');
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const dx = (x + .5 - cx) / 12.8, dy = (y + .5 - cy) / 3.4;
      if (dx * dx + dy * dy <= 1) set(g, x, y, y >= cy ? 'r' : 'R');
    }
    for (let i = 0; i < 6; i++) set(g, 4 + i * 4, cy, (i + frame) % 2 ? 'Y' : 'W');
    outline(g); g.ax = cx; g.ay = cy; return g;
  }

  // ── 그리기 ──
  function toCanvas(g, scale = 1, doc = root.document) {
    const cv = doc.createElement('canvas'); cv.width = g.w * scale; cv.height = g.h * scale;
    paint(cv.getContext('2d'), g, 0, 0, scale); return cv;
  }
  function paint(ctx, g, ox, oy, s = 1) {
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const c = g.d[y * g.w + x]; if (c === '.') continue;
      ctx.fillStyle = COL[c]; ctx.fillRect(ox + x * s, oy + y * s, s, s); }
  }

  root.SB = Object.assign(root.SB || {}, {
    NES, KEY, COL, grid, get, set, fromRows, blit, fillCircle, outline, flipV, rotate,
    FACES, FACE_LABEL, rocket, rocketDir, SMALL, small, ufo, toCanvas, paint,
  });
})(typeof window !== 'undefined' ? window : globalThis);
