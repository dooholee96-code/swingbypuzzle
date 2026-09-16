const S = require('./sim.js');
const LEVELS = require('./levels.js');
const which = process.argv[2] !== undefined ? [parseInt(process.argv[2]) - 1] : LEVELS.map((_, i) => i);
for (const i of which) {
  const L = LEVELS[i];
  const orbiting = (L.planets || []).find(p => p.orbit);
  const launches = orbiting
    ? Array.from({ length: 12 }, (_, k) => Math.round(k * Math.abs(orbiting.orbit.period) / 12 / S.DT))
    : [0];
  for (const ls of launches) {
    const counts = {}, wins = [];
    for (let a = -180; a < 180; a += 0.25) {
      const r = S.simulate(L, a, ls);
      counts[r] = (counts[r] || 0) + 1;
      if (r === 'win') wins.push(a);
    }
    const runs = [];
    for (const a of wins) {
      const last = runs[runs.length - 1];
      if (last && Math.abs(a - last[1] - 0.25) < 1e-6) last[1] = a; else runs.push([a, a]);
    }
    const txt = runs.map(([s, e]) => `${s}..${e} (${(e - s + 0.25).toFixed(2)}°)`).join(' ');
    console.log(`L${i + 1} ${L.name}  t=${(ls * S.DT).toFixed(2)}  성공: ${txt || '없음'}  ${JSON.stringify(counts)}`);
  }
}
