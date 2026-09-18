# 고정 스텝 누산기. docs/PLAN.md §5.8
#
# 시뮬레이션을 _physics_process 에 걸지 않는다(§19). 여기서 직접 돌려야
# 게임과 headless 도구가 같은 스테핑 코드를 쓴다.
class_name Clock
extends RefCounted

const DT := SwConsts.DT
const MAX_STEPS := 48          # 한 프레임 물리 스텝 상한 (§18)
const MAX_DELTA := 0.1         # 프레임이 길어도 이만큼만 받는다


var _acc := 0.0


# 앱이 백그라운드에 갔다 오면 누산기를 버린다(§5.8, §15.2).
func reset() -> void:
	_acc = 0.0


# 이번 프레임에 돌려야 할 스텝 수.
func steps(delta: float) -> int:
	_acc += minf(delta, MAX_DELTA)
	var n := 0
	while _acc >= DT and n < MAX_STEPS:
		_acc -= DT
		n += 1
	return n
