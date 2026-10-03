# 달토끼 당근 로켓 테마 — src/render 교체 가이드

swingbypuzzle 의 선 그래픽(폴리곤 + 발광) 렌더러를 8비트 스프라이트 렌더러로 바꾸는 방법. 물리, 판정, 레벨 데이터는 건드리지 않는다.

## 넣을 파일
- `src/render/sprites/sprites.js`, `sprites-world.js`: 스프라이트 생성기. 반경을 넣으면 그 크기의 픽셀 격자를 만든다. 1px = 월드 1유닛이므로 판정 반경과 그림 크기가 그대로 맞는다.
- `public/rabbit-rocket-atlas.png` + `.json`: 미리 구운 고정 스프라이트(로켓 7표정×16방향, 비행 불꽃 2프레임, UFO, 포털 r24, 블랙홀 r12, 달, 행성 r22, 소행성, 효과). `ax/ay` 는 프레임 왼쪽 위 기준 중심점.
- 레벨마다 반경이 다른 행성·소행성·블랙홀은 아틀라스를 쓰지 말고 `rebuild()` 에서 생성기로 한 번 만들어 `OffscreenCanvas` 에 캐시한다.

## 공통 규칙
- 캔버스: `ctx.imageSmoothingEnabled = false`, CSS `image-rendering: pixelated`.
- 카메라 배율 `cam.scale` 은 가능하면 정수로 반올림한다 (`Math.max(1, Math.floor(k))`). 소수 배율이면 픽셀이 뭉개진다. 남는 여백은 하늘색(`$22 #6888FC`)으로 채운다.
- 스프라이트를 찍을 때 좌표를 `Math.round` 한다.
- `palette.ts` 의 `C` 는 아래 NES 칸으로 바꾼다. 발광(`glow`), 투명도 페이드는 쓰지 않는다. 점멸이나 디더로 대신한다.
  - `bg` → `$22 #6888FC` (밤하늘), `line` → `$30 #FCFCFC`
  - `gravity` → `$31 #A4E4FC`, `hole` → `$33 #D8B8F8`, `danger` → `$26 #F87858`
  - `goal` → `$38 #F8D878`, `win` → `$2A #58D854`

## field.ts 메서드별 교체
| 메서드 | 지금 | 바꾸면 |
|---|---|---|
| `stars_` | 30% 투명 사각형 | 1px 별(`$30/$32/$38`) + 드물게 `fx/star2`. 시차 30% 유지 |
| `bounds` | 선 + 해칭 | 모서리 꺾쇠만 2px 점선(`$32`) |
| `gravity` | 점선 원 + 수축 링 | 점선 원 유지(1px, 4 on / 6 off). 수축 링은 3프레임 점멸 |
| `rocks` | 회전 다각형 | `rock(r, seed, frame)` · frame = floor(t·0.5)%16 |
| `planets` | n각형 회전 | `planet(r, sides % 6, ring)` · 회전 없음 |
| `holes` | 검정 원 + 나선 호 | `hole(rH, frame)` · frame = floor(t·8)%8 |
| `ufos` | 타원 선 | `ufo/0`, `ufo/1` 번갈아 (8프레임마다) |
| `goal` | 마름모 2겹 | `portal(r, frame)` 토끼굴 |
| `bullets` | 짧은 선 | `fx/bullet` 4×4 |
| `pad` | 돔 + 눈금 | 달 `moon(18)` + 눈금은 1px 점 |
| `preview` | 원형 점 | 2×2 노랑 점 `fx/dot`, `×` 는 `fx/xmark` |
| `ship` | 삼각형 | `rocket/{face}/{dir}` · dir = round(heading / 22.5°) mod 16 |

## 표정
`session.state` 와 결과로 고른다.
- `idle`: 단계 시작, 발사 전
- `aim`: 끄는 중 (`aiming`)
- `fly`: 비행 중. 불꽃 `rocket/fly_flame{0|1}` 를 4프레임마다 번갈아, 귀는 뒤로 젖힘
- `win`: 도착 연출
- `bump`: 충돌한 순간부터 떨림 동안
- `sad`: 떨림이 끝난 뒤, 결과 시트에서
- `sleep`: `result.drift` (30초 표류)

## 충돌 연출 (`burst` 를 `bump` 로 대체)
`ending` 동안 `u = s.endProgress()` (0→1, 기존 길이 그대로)를 쓴다.
1. 0 ≤ u < 0.6: 로켓을 충돌 지점에 고정하고 x 를 흔든다. 75ms 간격으로 +2, −2, +2, −1, +1, −1, 0. 표정 `bump`, 귀 젖힘.
2. 진행 방향 앞 12유닛에 `fx/dust0` → `fx/dust1`.
3. 머리 위 16유닛에 `fx/dizzy` 3개가 반경 13 × 4 타원으로 돈다.
4. u ≥ 0.9: 표정 `sad`. 그다음 결과 시트.
- 모션 줄이기가 켜져 있으면 흔들림과 별 회전을 빼고 `bump` 표정과 먼지만 보여 준다.
- 블랙홀(`result.hole`)은 떨림 대신 제자리에서 회전하며 1px씩 줄어든다.

## 도착 연출 (`arrival`)
지금처럼 포털 중심으로 빨려 들어가되 축소 대신 16방향 프레임을 빠르게 돌린다. 표정은 `win`. 포털 주위에 `fx/sparkle0/1` 6개.

## UI (styles.css)
- 글꼴: Galmuri11 / Galmuri14 (SIL OFL). `set.ossNote` 문구도 Oxanium 에서 Galmuri 로 바꾼다.
- 패널: `#FCE0A8` 바탕, 4px `#000` 테두리, `box-shadow: 6px 6px 0 #000`, 둥근 모서리 없음.
- 주 버튼 `#FCA044` + 아래 3px `#E45C10`, 보조 `#FCFCFC`, 힌트 `#F8D878`, 다음 단계 `#58D854`. 높이는 44px 이상.
- 시안은 `Rabbit Rocket 8bit.dc.html` 의 화면 목업을 참고한다.
