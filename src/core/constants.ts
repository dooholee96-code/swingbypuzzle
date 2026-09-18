// 물리 상수. docs/PLAN.md §5.1
//
// 부록 A(검증 완료 참조 구현)의 값이다. 바꾸면 §6.2 회귀 테스트가 깨진다(§0.4).

export const DT = 1 / 240;
export const SHIP_R = 5;
export const MAX_FLIGHT = 30;

// 발사대 행성 (§5.9). 우주선은 이 반경 표면에 서 있다가 법선 방향으로 이륙한다.
// 24 이상으로 키우면 1-4의 성공 폭이 11.25°에서 6.50°로 무너진다. 바꾸지 않는다.
export const PAD_R = 22;

// 우주선이 걸어 다닐 수 있는 범위. 돔 중심 방향(출발점 → 목적지) ±ARC.
export const ARC = 90;

// 기준 뷰포트 (§11). 카메라 배율의 기준이자, 난이도 점수 G 항이
// "맵이 화면을 넘는가"를 판단하는 기준이다 (§8.6).
export const REF_W = 400;
export const REF_H = 760;
