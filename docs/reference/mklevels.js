// 부록 B → levels/data/*.json 기계 변환. PLAN §0.7: 좌표를 손으로 쓰지 않는다.
const LEVELS = require('/home/user/swingbypuzzle/docs/reference/levels.js');
const fs = require('fs');

// §6.2 표 순서 = 부록 B 배열 순서. meta는 §7.3 커리큘럼 표에서 온다.
const META = [
  { id:'1-1', chapter:1, slot:1, role:'도입',      intro:'planet', angle:-66,   launch_step:0   },
  { id:'1-4', chapter:1, slot:4, role:'휴식·확장',  intro:null,     angle:-134,  launch_step:0   },
  { id:'2-1', chapter:2, slot:1, role:'도입',      intro:'hole',   angle:-75.5, launch_step:0   },
  { id:'3-1', chapter:3, slot:1, role:'도입',      intro:'ufo',    angle:-30,   launch_step:0   },
  { id:'4-1', chapter:4, slot:1, role:'도입',      intro:'orbit',  angle:-44,   launch_step:800 },
  { id:'5-1', chapter:5, slot:1, role:'도입',      intro:'wide',   angle:-12,   launch_step:0   },
];

// §6.1 스키마의 키 순서. 출력이 항상 같은 모양이 되도록 고정한다.
const ORDER = ['id','name','w','h','speed','preview','start','goal','planets','holes','rocks','ufos','hint','meta'];

for (let i = 0; i < LEVELS.length; i++) {
  const src = LEVELS[i], m = META[i];
  const out = {
    id: m.id, name: src.name,
    w: src.w, h: src.h, speed: src.speed, preview: src.preview,
    start: src.start, goal: src.goal,
  };
  for (const k of ['planets','holes','rocks','ufos']) if (src[k]) out[k] = src[k];
  if (src.hint) out.hint = src.hint;
  out.meta = {
    chapter: m.chapter, slot: m.slot, role: m.role,
    ...(m.intro ? { intro: m.intro } : {}),
    // §17 M1: meta.metrics는 M7에서 채운다. 지금은 solution만.
    solution: { angle: m.angle, launch_step: m.launch_step },
    source: 'verified',
    updated: '2026-09-18',
  };
  const ordered = {};
  for (const k of ORDER) if (k in out) ordered[k] = out[k];
  const path = `levels/data/${m.id}.json`;
  fs.writeFileSync(path, JSON.stringify(ordered, null, 2) + '\n');
  console.log(`${path}  ${src.name}  ${src.w}x${src.h}`);
}
