// 장식용 시드 난수. docs/PLAN.md §5.8
//
// **시뮬레이션 결과에 쓰지 않는다.** 소행성 모양, 별 배경처럼 매 실행 같아야
// 하는 장식에만 쓴다. 부록 A 와 같은 mulberry32 다.

export function mulberry32(seed: number): () => number {
  let a = seed;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
