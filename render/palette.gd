# 팔레트. docs/PLAN.md §12.1
#
# 1979년 아케이드 벡터 화면. 검은 배경에 발광하는 선으로만 그린다.
# 채우기는 쓰지 않는다. 예외는 블랙홀 지평선(검정 채움)뿐.
class_name Palette
extends RefCounted

const BG       := Color(0, 0, 0)
const LINE     := Color("e6edf5")          # 기본 선: 행성, 소행성, 우주선, UI
const LINE_DIM := Color("e6edf5", 0.30)    # 맵 경계, 별, 비활성 요소
const GRAVITY  := Color("4fc3f7")          # 행성 중력 범위
const HOLE     := Color("b388ff")          # 블랙홀
const DANGER   := Color("ff5252")          # 외계인, 총알, 사격 범위, 실패
const GOAL     := Color("ffd54f")          # 목적지

# §12.1 선 굵기(유닛). 화면에서 최소 dp(1).
const WIDTH      := 1.5
const GLOW_WIDTH := 4.0
const GLOW_ALPHA := 0.18
