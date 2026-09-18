# 조준 입력 해석. docs/PLAN.md §10.1~§10.2
#
# 화면 좌표만 다루므로 Vector2 를 써도 된다 — §2.1 의 금지는 core/ 와
# tools_shared/ 에만 적용된다. 시뮬레이션 상태는 여기 들어오지 않는다.
class_name AimInput
extends RefCounted

# §10.2 의 기준값. 전부 dp 다(§10.0).
const DEAD_DP := 26.0          # 돔 표면에서 이만큼 안쪽은 취소 영역
const TAP_MOVE_DP := 8.0       # 발사로 치기 위한 최소 이동
const TAP_HOLD_MS := 250       # 또는 최소 누름 시간

var active := false
var far := false               # 취소 영역 밖인가 (= 각도가 정해졌는가)
var angle := 0.0               # 월드각 θ, 0.5° 양자화 후 ±ARC 로 잘림

var _from := Vector2.ZERO
var _moved := 0.0
var _t0 := 0


func begin(pos: Vector2) -> void:
	active = true
	far = false
	_from = pos
	_moved = 0.0
	_t0 = Time.get_ticks_msec()


# 손가락 위치를 받아 θ 를 갱신한다. center 는 돔 중심의 화면 좌표,
# dome_px 는 그려지는 표면 반경(화면 px). 반환값은 far.
func update(pos: Vector2, center: Vector2, dome_px: float, level: Dictionary) -> bool:
	if not active:
		return false
	_moved = maxf(_moved, pos.distance_to(_from))
	var d := pos - center
	far = d.length() >= Dp.px(DEAD_DP) + dome_px
	if far:
		angle = _clamp_arc(quantize(rad_to_deg(atan2(d.y, d.x))), level)
	return far


# 손을 뗄 때 발사인가. 툭 친 것은 발사하지 않는다(§10.2).
func should_launch() -> bool:
	if not (active and far):
		return false
	return _moved >= Dp.px(TAP_MOVE_DP) or Time.get_ticks_msec() - _t0 >= TAP_HOLD_MS


func finish() -> void:
	active = false
	far = false


# 0.5° 단위 반올림 (§4). 같은 각도를 다시 재현할 수 있어야 퍼즐이 된다.
static func quantize(deg: float) -> float:
	return roundf(deg * 2.0) / 2.0


# 우주선이 걸어 다닐 수 있는 범위로 자른다 (§5.9).
static func _clamp_arc(deg: float, level: Dictionary) -> float:
	var c := Sim.pad_angle(level)
	var d: float = fposmod(deg - c + 180.0, 360.0) - 180.0
	return c + clampf(d, -SwConsts.ARC, SwConsts.ARC)


# 표시 각도 (§4). 0° = 위쪽, 시계 방향 증가.
static func ui_angle(world_deg: float) -> float:
	return fposmod(world_deg + 90.0, 360.0)
