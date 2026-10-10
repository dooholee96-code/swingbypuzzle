# itch.io 올리기 (PLAN §15.6)

웹 빌드를 그대로 쓴다. 다른 점은 둘 — **힌트를 광고 없이 준다**(itch 는 자기 도메인의
iframe 에서 돌려 우리 광고가 뜨지 않는다), **서비스 워커를 쓰지 않는다**.

## 0. 계정

사업용 구글 계정(shiroleestudio@gmail.com)으로 itch.io 에 가입한다. 표시 이름은 `Shirolee Studio`.
결제·세금 정보는 기부를 받기로 하면 그때 넣는다. 계정 정보는 저장소에 적지 않는다(§0.8).

## 1. 파일 만들기

```
npm run build:itch      →  build/itch/swingby-itch.zip  (약 165KB)
```

zip 맨 위에 `index.html` 이 있다. 새 버전은 같은 명령으로 다시 만들어 itch 에서 파일을 바꿔 올린다.

## 2. itch.io 에서 (Dashboard → Create new project)

| 항목 | 값 |
|---|---|
| Title | `Swingby: Moon Rabbit` (스토어에 "Swingby" 가 많아 부제를 붙인다 — CLAUDE.md 11번) |
| Project URL | `swingby-moon-rabbit` 같은 것 |
| Short description | `A one-finger gravity puzzle. Slingshot a carrot rocket around planets.` |
| Classification | Games |
| Kind of project | **HTML** |
| Release status | Released (먼저 보여 주고 반응을 보려면 In development) |
| Pricing | **No payments** 또는 **$0 or donate**(제안 금액 $2) — 아래 "수익" 참고 |
| Uploads | `swingby-itch.zip` 올리고 **"This file will be played in the browser"** 체크 |
| Viewport dimensions | **480 × 854** (세로) |
| Frame options | **Mobile friendly** ✓ → Orientation **Portrait**, **Fullscreen button** ✓, Automatically start ✗ |
| Genre | Puzzle |
| Tags (최대 10) | `puzzle` `physics` `gravity` `space` `pixel-art` `cute` `casual` `mobile` `touch` `retro` |
| Cover image | `cover-630x500.png` |
| Screenshots | `shot-1-aim` ~ `shot-7-catalog` (순서: 조준 → 분사 → 궤도 → 인피니티 → 레벨업 → 보스 → 도감. 타이틀은 표지가 대신한다) |
| Visibility | 처음엔 **Draft** 로 저장해 직접 해 보고 → **Public** |

판 번호는 설정 화면의 "버전" 에 보인다(`package.json`, itch 올릴 때 0.2.0). 다시 올릴 때 올린다.

확인한 것(2026-10, 다른 출처의 iframe 에서 실제로 눌러 봄): 타이틀·설정(버전·광고 제거 줄 없음)·힌트 무료·
서비스 워커 0·저장 동작·인피니티 결과의 **이어하기가 광고 없이** 바로 이어짐·레벨업 "다시 뽑기" 무료.

폰에서는 itch 가 언제나 전체 화면으로 띄운다. 위의 480×854 는 PC 에서 페이지 안에 넣을 때 크기다.

## 3. 소개 문구

### English (기본)

> **Swingby: Moon Rabbit** — a one-finger gravity puzzle.
>
> A moon rabbit rides a carrot rocket from planet to planet. You get one launch:
> drag to aim, let go, and let gravity bend your path into the burrow.
>
> - **56 hand-checked stages in 7 chapters** — planets, black holes, alien patrols,
>   moving planets, wide maps, **boosts** (tap or swipe mid-flight to veer) and **orbit stations**
>   (get caught in orbit, tap to fly off). Three stars per stage.
> - Every stage is verified solvable with room for human error — no pixel-perfect luck.
> - **Infinity mode**: survive in endless space. Level up and pick perks, fight a mothership
>   every two minutes, and share your time on the **daily universe** everyone flies.
> - **Messier catalog**: 110 real deep-sky objects hidden across the stages and Infinity.
>   Brush past one to collect it.
> - Pixel art, works on phone and desktop, English / 한국어 / 日本語 / 简体中文.
>
> Free to play. No ads on itch — hints, continues and card rerolls are simply free here.

### 한국어

> **스윙바이: 달토끼** — 한 손가락 중력 퍼즐.
>
> 당근 로켓을 탄 달토끼가 행성 사이를 날아요. 기회는 한 번 — 끌어서 조준하고, 놓으면
> 중력이 길을 꺾어 토끼굴로 데려가요.
>
> - **7장 56단계** — 행성, 블랙홀, 외계인, 움직이는 행성, 넓은 맵, **분사**(날다가 탭하거나 끌면 꺾여요),
>   **궤도 행성**(붙잡혀 돌다가 탭하면 출발). 단계마다 별 셋
> - 모든 단계가 "풀린다"와 "사람이 해낼 여유가 있다"까지 검증되어 있어요
> - **인피니티**: 끝없는 우주에서 오래 버티기. 레벨이 오르면 능력을 고르고, 2분마다 모선과 싸우고,
>   **오늘의 우주**는 모두가 같은 우주라 기록을 겨룰 수 있어요
> - **메시에 도감**: 실제 심우주 천체 110개가 단계와 인피니티에 숨어 있어요. 스치면 모아요
> - 픽셀 아트, 폰·PC 모두, 한국어·English·日本語·简体中文
>
> 무료예요. itch 에는 광고가 없어서 힌트·이어하기·카드 다시 뽑기도 그냥 드려요

## 4. 수익 (선택)

- **$0 or donate**: 무료로 하되 기부 버튼을 둔다. itch 몫은 기본 10%, 0~100% 로 바꿀 수 있다.
- 받으려면 itch 설정에서 **결제 방식**(PayPal "Direct to you" 또는 itch 가 모아서 지급)과
  **세금 정보(tax interview, 한국 개인은 W-8BEN)** 를 넣는다. 계정 정보는 저장소에 적지 않는다(§0.8).
- 이 빌드에는 광고가 없다. 광고 수익은 우리 웹(H5)·앱(AdMob)에서 낸다.
