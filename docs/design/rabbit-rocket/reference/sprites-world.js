// 천체 스프라이트 — 반경(유닛)을 받아 그 크기로 찍는다.
(function (root) {
  const S = root.SB;
  const { grid, set, fillCircle, outline } = S;
  const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  const PLANET_SETS = [['P','p','X'], ['M','m','l'], ['Y','y','T'], ['B','b','U'], ['c','R','r'], ['V','x','X']];
  const PLANET_NAMES = ['딸기', '민트', '레몬', '하늘', '복숭아', '라벤더'];

  function sphere(g, cx, cy, r, [hi, base, sh]) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x + .5 - cx, dy = y + .5 - cy; if (dx * dx + dy * dy > r * r) continue;
      const lit = (dx + dy) / (r * 1.414), hd = Math.hypot(dx + r * .4, dy + r * .4) / r, chk = (x + y) & 1;
      let c = base;
      if (lit > 0.45 || (lit > 0.3 && chk)) c = sh;
      if (hd < 0.2 || (hd < 0.28 && chk)) c = hi;
      set(g, x, y, c);
    }
  }
  const box = (r, pad = 2) => { const n = Math.ceil(r) * 2 + pad * 2; const g = grid(n, n); g.ax = n / 2; g.ay = n / 2; return g; };

  function planet(r, kind = 0, opt = {}, seed) {
    if (typeof opt !== 'object' || opt === null) opt = { ring: !!opt };
    const g = box(r, opt.ring ? Math.ceil(r * .5) + 2 : 2), cx = g.ax, cy = g.ay;
    const pal = PLANET_SETS[kind % PLANET_SETS.length];
    sphere(g, cx, cy, r, pal);
    const rand = rng(kind * 97 + Math.round(r));
    if (r >= 10) for (let i = 0; i < 3; i++) {       // 줄무늬 혹은 크레이터
      const yy = Math.round(cy - r * .5 + i * r * .45);
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if ((x + .5 - cx) ** 2 + (yy + .5 - cy) ** 2 < r * r * .8 && ((x + i) % 5) < 3) set(g, x, yy, pal[2]);
    }
    if (opt.ring) for (let x = 0; x < g.w; x++) for (let y = 0; y < g.h; y++) {
      const dx = (x + .5 - cx) / (r * 1.5), dy = (y + .5 - cy) / (r * .34);
      const d = dx * dx + dy * dy, front = y + .5 > cy || (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 > r * r;
      if (d <= 1 && d >= .55 && front) set(g, x, y, d > .8 ? 'C' : 'W');
    }
    outline(g);
    if (opt.face !== false && r >= 6) {             // 표정 (작은 점 두 개 + 볼)
      const e = Math.max(1, Math.round(r * .12)), ey = Math.round(cy), ex = Math.round(r * .32);
      for (let i = 0; i < e; i++) for (let j = 0; j < e + 1; j++) {
        set(g, Math.round(cx - ex) + i - 1, ey - j, 'K'); set(g, Math.round(cx + ex) + i - 1, ey - j, 'K'); }
      set(g, Math.round(cx - ex) - 3, ey + 2, 'P'); set(g, Math.round(cx + ex) + 2, ey + 2, 'P');
      set(g, Math.round(cx) - 1, ey + 2, 'K'); set(g, Math.round(cx), ey + 3, 'K'); set(g, Math.round(cx) + 1, ey + 2, 'K');
    }
    void rand; return g;
  }

  // 출발지 달: 회색-크림 구 + 크레이터 + 작은 깃발
  function moon(r = 14) {
    const g = box(r, 4), cx = g.ax, cy = g.ay;
    sphere(g, cx, cy, r, ['W', 'C', 'S']);
    const rand = rng(7);
    for (let i = 0; i < 6; i++) {
      const a = rand() * 6.28, d = rand() * r * .65, cr = 1 + rand() * r * .16;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      fillCircle(g, x, y, cr, 'S'); fillCircle(g, x - .6, y - .6, Math.max(.6, cr - 1), 'c');
    }
    outline(g);
    const fx = Math.round(cx + r * .2), fy = Math.round(cy - r) - 1;   // 깃발
    for (let y = 0; y < 5; y++) set(g, fx, fy - y, 'K');
    ['PPP', 'PW.', 'P..'].forEach((row, j) => [...row].forEach((c, i) => { if (c !== '.') set(g, fx + 1 + i, fy - 4 + j, c); }));
    return g;
  }

  // 소행성: 울퉁불퉁 다각형 돌
  function asteroid(r, seed = 1) {
    const g = box(r, 2), cx = g.ax, cy = g.ay, rand = rng(seed * 31 + 5), n = 9, rad = [];
    for (let i = 0; i < n; i++) rad.push(r * (.78 + rand() * .22));
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const dx = x + .5 - cx, dy = y + .5 - cy, a = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
      const t = a / (Math.PI * 2) * n, i = Math.floor(t), f = t - i;
      const rr = rad[i] * (1 - f) + rad[(i + 1) % n] * f;
      if (dx * dx + dy * dy <= rr * rr) {
        const lit = (dx + dy) / (r * 1.414);
        set(g, x, y, lit > .35 || (lit > .2 && (x + y) & 1) ? 't' : lit < -.4 ? 'c' : 'T');
      }
    }
    for (let i = 0; i < Math.max(1, Math.round(r / 4)); i++) {
      const x = cx + (rand() - .5) * r, y = cy + (rand() - .5) * r; set(g, Math.round(x), Math.round(y), 't'); set(g, Math.round(x) + 1, Math.round(y), 't'); }
    outline(g); return g;
  }

  // 블랙홀: 남색 소용돌이 + 사건의 지평선
  function blackhole(r, frame = 0) {
    const g = box(r * 1.6, 1), cx = g.ax, cy = g.ay, R = r * 1.6;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const dx = x + .5 - cx, dy = y + .5 - cy, d = Math.hypot(dx, dy); if (d > R) continue;
      const a = Math.atan2(dy, dx) + d * .35 - frame * .8;
      const arm = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2) < .7;
      if (d <= r * .6) set(g, x, y, 'K');
      else if (d <= r * .75) set(g, x, y, 'u');
      else if (arm) set(g, x, y, d < r * 1.1 ? 'v' : d < r * 1.35 ? 'U' : ((x + y) & 1 ? 'u' : '.'));
    }
    return g;
  }

  // 목적지: 토끼굴 포털 — 풀 언덕 위 동그란 굴, 안쪽이 반짝인다
  function portal(r = 10, frame = 0) {
    const g = box(r, 4), cx = g.ax, cy = g.ay;
    fillCircle(g, cx, cy, r, 'l');
    fillCircle(g, cx, cy, r - 1, 'L');
    fillCircle(g, cx, cy, r * .72, 't');
    fillCircle(g, cx, cy, r * .58, 'K');
    for (let i = 0; i < 12; i++) {                  // 풀잎 테두리
      const a = i / 12 * Math.PI * 2 + (i & 1) * .2;
      set(g, Math.round(cx + Math.cos(a) * (r + 1)), Math.round(cy + Math.sin(a) * (r + 1)), i & 1 ? 'L' : 'l'); }
    const sp = [[-.25, -.2], [.2, .1], [-.05, .3], [.28, -.28]];
    sp.forEach(([sx, sy], i) => { if ((i + frame) % 2) return;
      const x = Math.round(cx + sx * r), y = Math.round(cy + sy * r);
      set(g, x, y, 'W'); set(g, x - 1, y, 'Y'); set(g, x + 1, y, 'Y'); set(g, x, y - 1, 'Y'); set(g, x, y + 1, 'Y'); });
    outline(g);
    return g;
  }

  // 배경 별 타일 (64×64, 반복)
  function starTile(seed = 3, w = 64, h = 64) {
    const g = grid(w, h), rand = rng(seed);
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(rand() * w), y = Math.floor(rand() * h), k = rand();
      if (k < .7) set(g, x, y, k < .35 ? 'S' : 'V');
      else if (k < .92) { set(g, x, y, 'W'); }
      else { set(g, x, y, 'W'); set(g, x - 1, y, 'Y'); set(g, x + 1, y, 'Y'); set(g, x, y - 1, 'Y'); set(g, x, y + 1, 'Y'); }
    }
    return g;
  }
  const SKY = { top: '#4428BC', mid: '#6888FC', base: '#9878F8' };  // NES 03 / 22 / 23

  // 장면용 별칭: 회전 소행성(16프레임), 블랙홀
  function rock(r, seed = 1, frame = 0) { const g = asteroid(r, seed); if (!frame) return g; return S.rotate(g, frame * Math.PI / 8, g.ax, g.ay); }
  const hole = (r, frame = 0) => blackhole(r, frame);
  Object.assign(S, { rock, hole, PLANET_SETS, PLANET_NAMES, sphere, planet, moon, asteroid, blackhole, portal, starTile, SKY, rng });

})(typeof window !== 'undefined' ? window : globalThis);
