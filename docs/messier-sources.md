# 메시에 도감의 출처 (§22.7, M19)

도감에 적는 것은 **사실**(종류·별자리·거리)과 **통용 이름**뿐이다. 설명 문장은 그 사실을 어휘로
조립한 한 줄("나선 은하 · 안드로메다자리 · 254만 광년")이라 남의 글을 옮기지 않았다.
사진·그림은 쓰지 않는다 — 전부 `src/render/sprites/messier.ts` 의 생성기 픽셀 그림이다.

## 참고한 자료

- NASA — *Explore the Night Sky: Hubble's Messier Catalog* (science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog). 종류·별자리·거리. 미국 정부 저작물로 공개.
- ESA/Hubble — Messier objects (esahubble.org). 거리 보조.
- SEDS — *The Messier Catalog* (messier.seds.org). 종류·별자리 대조, 통용 이름.

위키백과 본문은 옮기지 않았다(CC BY-SA 라 옮기면 표기 의무가 생긴다).

## 데이터 규칙

- `src/tools-shared/messier.ts` 의 표: 번호 · 종류 · 별자리(IAU 세 글자) · 거리(광년).
- 거리는 자료마다 다르고 측정 오차가 크다. **유효숫자 두세 자리로 반올림**했고, 화면에는
  `distText` 가 다시 두세 자리로 줄여 보인다(6,500 광년 / 3.8만 광년 / 254만 광년).
- 종류 분류: 성단은 구상·산개, 성운은 발광(H II)·반사·행성상·초신성 잔해, 은하는 나선(막대 포함)·
  타원·렌즈형·불규칙. M24 는 별구름, M40 은 이중성, M73 은 성군. M102 는 NGC 5866 으로 둔다.
- 통용 이름(한국어 원문, 영·일·중 번역)은 `src/i18n/messier.ts`. 이름이 없는 천체는 "M번호".
  영어·일본어·중국어 이름은 Claude 가 썼다 — 원어민 검수 목록(CLAUDE.md 열린 일 6번)에 든다.
