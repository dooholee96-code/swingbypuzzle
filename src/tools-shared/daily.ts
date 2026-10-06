// 오늘의 우주 (§22.3). 날짜 하나가 시드 하나 — 그날은 모두가 같은 우주를 탄다.
//
// 서버가 없어도 "친구와 같은 판" 경쟁이 생긴다. 날짜는 **기기의 현지 날짜**다 —
// 한국 사용자가 아침 9시에 판이 바뀌는 UTC 기준보다 자연스럽다. 시간대가 다른
// 두 사람은 하루 경계에서 다른 판을 탈 수 있는데, 그 정도는 받아들인다.
//
// DOM·브라우저 API 를 import 하지 않는다 (§0.3). 날짜는 호출자가 넘긴다.

/** 'YYYY-MM-DD' (현지 날짜). 저장 데이터의 키이자 공유 문구의 날짜다 */
export function dayKey(d: Date): string {
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return `${y}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}

/** 날짜 키 → 판 시드. 같은 날은 어디서나 같은 수 (FNV-1a) */
export function dailySeed(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

/** 공유 문구의 짧은 날짜 "10/6" */
export function shortDate(key: string): string {
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
}
