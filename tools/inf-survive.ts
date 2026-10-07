// 인피니티 체감 난이도 측정 (§22.4.4). 앞길을 보며 피하는 단순 자동 조종 — 패시브 없이 기본 수단만.
// npm run survive -- --speed=130 --turns=4 --max=7 --recharge=10 --seeds=60 --react=0.25
import { Sim } from '../src/core/simulate.js';
import { INF_SPEED, INF_TURN, InfinityWorld, MAX_TURNS, START_TURNS } from '../src/tools-shared/infinity.js';
import { threatOf } from '../src/tools-shared/perks.js';
import { DT } from '../src/core/constants.js';

const arg = (k: string, d: number): number => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? Number(m.split('=')[1]) : d; };
const SPEED = arg('speed', INF_SPEED), TURNS = arg('turns', START_TURNS), MAXT = arg('max', MAX_TURNS);
const RECH = arg('recharge', 10), SHIELD = arg('shield', 1), LOOK = arg('look', 1.0), TMAX = arg('turn', INF_TURN);
const REACT = arg('react', 0.25);   // 사람 반응: 위험을 본 뒤 이만큼 뒤에 꺾는다
const SEEDS = arg('seeds', 60), LIMIT = arg('limit', 180), THREAT = arg('threat', 1);

const q = (arr: number[], p: number) => [...arr].sort((x, y) => x - y)[Math.floor(p * (arr.length - 1))]!;
const res: number[] = []; const cause: Record<string, number> = {};
for (let seed = 1; seed <= SEEDS; seed++) {
  const w = new InfinityWorld(seed * 7919);
  w.level.speed = SPEED;
  const sim = new Sim(); sim.endless = true;
  sim.mods = { ...sim.mods, shield: SHIELD, turnMax: TMAX };
  sim.begin(w.level, -90 + ((seed * 37) % 61 - 30), 0);
  let turns = TURNS, acc = 0, r = '', pendingAt = -1, pendingDir = 0, lastCheck = -99;
  while (!r && sim.flightStep < 240 * LIMIT) {
    const t = sim.flightStep * DT;
    if (pendingAt >= 0 && t >= pendingAt) { sim.queueTurn(pendingDir); pendingAt = -1; turns--; }
    else if (pendingAt < 0 && turns > 0 && !sim.docked && t - lastCheck >= 0.1) {
      lastCheck = t;
      const pr = sim.predictRelease(w.level, sim.ship, sim.time, LOOK);
      if (pr.outcome && pr.outcome !== 'drift') {
        const s = sim.ship, head = Math.atan2(s.vy, s.vx) * 180 / Math.PI;
        let bestDir = NaN, bestLen = pr.points.length;
        for (const d of [-TMAX, TMAX, -TMAX / 2, TMAX / 2]) {
          const sp = { ...s }; const a = (head + d) * Math.PI / 180, v = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
          sp.vx = Math.cos(a) * v; sp.vy = Math.sin(a) * v;
          const p2 = sim.predictRelease(w.level, sp, sim.time, LOOK + 0.5);
          const len = p2.outcome ? p2.points.length : 1e9;
          if (len > bestLen) { bestLen = len; bestDir = head + d; }
        }
        if (!Number.isNaN(bestDir)) { pendingAt = t + REACT; pendingDir = bestDir; }
      }
    }
    if (sim.docked && sim.dockedSteps % 240 === 0) sim.queueRelease();   // 링에서 1초 뒤 나간다
    r = sim.step();
    if (THREAT) w.setThreat(threatOf((sim.flightStep - sim.dockedSteps) * DT));
    if (w.sync(sim.ship.x, sim.ship.y)) sim.refreshBodies();
    turns += w.eat(sim.ship.x, sim.ship.y, 26); if (turns > MAXT) turns = MAXT;
    if (RECH > 0) { if (turns >= MAXT) acc = 0; else if (++acc >= RECH * 240) { acc = 0; turns++; } }
  }
  const secs = (sim.flightStep - sim.dockedSteps) * DT;
  res.push(secs); cause[r || 'alive'] = (cause[r || 'alive'] ?? 0) + 1;
}
const under = (s: number) => (res.filter((x) => x < s).length / res.length * 100).toFixed(0);
console.log(`speed ${SPEED} turns ${TURNS}/${MAXT} rech ${RECH} shield ${SHIELD} turn ${TMAX} look ${LOOK} react ${REACT}`);
console.log(`  p10 ${q(res, .1).toFixed(1)}  p25 ${q(res, .25).toFixed(1)}  median ${q(res, .5).toFixed(1)}  p75 ${q(res, .75).toFixed(1)}  p90 ${q(res, .9).toFixed(1)}  <20s ${under(20)}%  <40s ${under(40)}%`, JSON.stringify(cause));
