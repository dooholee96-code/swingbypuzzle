# 결정론적 물리 코어. docs/PLAN.md §5, 부록 A를 1:1 이식했다.
#
# 규칙 (§2.1):
#   - Vector2 금지. Godot의 Vector2는 32비트라 부록 A의 검증값을 재현하지 못한다.
#     모든 상태는 PackedFloat64Array(64비트)다.
#   - deg_to_rad(), TAU, distance_to(), length() 금지.
#     값은 같더라도 연산 순서를 부록 A와 눈으로 대조할 수 있어야 한다.
#   - n * DT는 곱셈으로 유지한다. 누산(ft += DT)으로 바꾸면 오차가 쌓인다.
#
# 레벨은 Dictionary로 받는다. M1에서 core/level.gd의 타입 있는 객체로 감싸되,
# 산술 표현은 한 글자도 바꾸지 않는다(딕셔너리 조회를 필드 접근으로 바꾸는 것만 허용).
class_name Sim
extends RefCounted

const DT := SwConsts.DT
const SHIP_R := SwConsts.SHIP_R
const MAX_FLIGHT := SwConsts.MAX_FLIGHT

# 스크래치 버퍼를 인스턴스 필드로 둬 루프 안 할당을 없앤다.
var _bp := PackedFloat64Array([0.0, 0.0])              # body_pos 결과
var _ac := PackedFloat64Array([0.0, 0.0])              # accel 결과
var _ship := PackedFloat64Array([0.0, 0.0, 0.0, 0.0])  # x, y, vx, vy
var _bullets := PackedFloat64Array()                   # 5개씩 [x, y, vx, vy, age]
var _next_fire := PackedFloat64Array()                 # 외계인별 다음 사격 시각 (§5.5)

# 마지막 simulate()의 비행 스텝 수. 검증기(§8.5)의 flight_time 계산에 쓴다.
var last_steps := 0


static func dist(ax: float, ay: float, bx: float, by: float) -> float:
	var dx := ax - bx
	var dy := ay - by
	return sqrt(dx * dx + dy * dy)


func _body_pos(b: Dictionary, t: float) -> void:
	if not b.has("orbit"):
		_bp[0] = b["x"]
		_bp[1] = b["y"]
		return
	var o: Dictionary = b["orbit"]
	var a: float = o["phase"] + 2.0 * PI * t / o["period"]
	_bp[0] = o["cx"] + o["rad"] * cos(a)
	_bp[1] = o["cy"] + o["rad"] * sin(a)


func _accel(gravs: Array, x: float, y: float, t: float) -> void:
	var ax := 0.0
	var ay := 0.0
	for b in gravs:
		_body_pos(b, t)
		var dx: float = _bp[0] - x
		var dy: float = _bp[1] - y
		var r2: float = dx * dx + dy * dy
		var b_range: float = b["R"]
		var r2_max: float = b_range * b_range
		if r2 >= r2_max or r2 < 1.0:
			continue
		var r: float = sqrt(r2)
		var f: float = 1.0 - r / b_range
		var m: float = b["g"] * f * f
		ax += m * dx / r
		ay += m * dy / r
	_ac[0] = ax
	_ac[1] = ay


# 반환 "" = 계속, 그 외 = 결과 문자열. 판정 순서는 §5.4를 따른다.
func _step_ship(level: Dictionary, gravs: Array, t: float) -> String:
	_accel(gravs, _ship[0], _ship[1], t)
	_ship[2] += _ac[0] * DT
	_ship[3] += _ac[1] * DT
	_ship[0] += _ship[2] * DT
	_ship[1] += _ship[3] * DT
	var tt: float = t + DT
	var sx: float = _ship[0]
	var sy: float = _ship[1]
	for p in level.get("planets", []):
		_body_pos(p, tt)
		if dist(_bp[0], _bp[1], sx, sy) < p["r"] + SHIP_R:
			return "planet"
	for h in level.get("holes", []):
		if dist(h["x"], h["y"], sx, sy) < h["rH"] + 2.0:
			return "hole"
	for a in level.get("rocks", []):
		if dist(a["x"], a["y"], sx, sy) < a["r"] * 0.85 + SHIP_R:
			return "rock"
	for u in level.get("ufos", []):
		if dist(u["x"], u["y"], sx, sy) < 13.0 + SHIP_R:
			return "ufo"
	if sx < SHIP_R or sy < SHIP_R or sx > level["w"] - SHIP_R or sy > level["h"] - SHIP_R:
		return "wall"
	var goal: Dictionary = level["goal"]
	if dist(goal["x"], goal["y"], sx, sy) < goal["r"]:
		return "win"
	return ""


func _fire_ufos(ufos: Array, ft: float) -> void:
	for i in ufos.size():
		var u: Dictionary = ufos[i]
		while ft >= _next_fire[i]:
			var dx: float = _ship[0] - u["x"]
			var dy: float = _ship[1] - u["y"]
			var d: float = sqrt(dx * dx + dy * dy)
			if d < u["range"]:
				var bs: float = u["bs"]
				_bullets.append(u["x"])
				_bullets.append(u["y"])
				_bullets.append(dx / d * bs)
				_bullets.append(dy / d * bs)
				_bullets.append(0.0)
			_next_fire[i] += u["interval"]


# 부록 A와 같은 순서: 전부 이동 → 수명·범위로 거르기 → 살아남은 것만 피격 판정
func _step_bullets(level: Dictionary) -> String:
	var w: float = level["w"]
	var h: float = level["h"]
	var count: int = _bullets.size() / 5
	var kept: int = 0
	for i in count:
		var o: int = i * 5
		_bullets[o] += _bullets[o + 2] * DT
		_bullets[o + 1] += _bullets[o + 3] * DT
		_bullets[o + 4] += DT
		var bx: float = _bullets[o]
		var by: float = _bullets[o + 1]
		if _bullets[o + 4] < 5.0 and bx > -20.0 and by > -20.0 and bx < w + 20.0 and by < h + 20.0:
			if kept != i:
				var d: int = kept * 5
				for k in 5:
					_bullets[d + k] = _bullets[o + k]
			kept += 1
	_bullets.resize(kept * 5)
	for i in kept:
		var o: int = i * 5
		if dist(_bullets[o], _bullets[o + 1], _ship[0], _ship[1]) < 3.0 + SHIP_R:
			return "shot"
	return ""


# 중력원 배열. 호출자가 한 번 만들어 전수 스캔 내내 재사용하면 더 빠르다.
static func gravs_of(level: Dictionary) -> Array:
	var g: Array = []
	g.append_array(level.get("planets", []))
	g.append_array(level.get("holes", []))
	return g


# 전체 비행 시뮬레이션. 결과 문자열을 반환한다(§5.4의 결과 종류).
func simulate(level: Dictionary, angle_deg: float, launch_step: int, gravs: Array = []) -> String:
	if gravs.is_empty():
		gravs = gravs_of(level)
	var ufos: Array = level.get("ufos", [])

	_next_fire.resize(ufos.size())
	for i in ufos.size():
		_next_fire[i] = ufos[i]["delay"]
	_bullets.resize(0)

	var a: float = angle_deg * PI / 180.0
	var start: Dictionary = level["start"]
	_ship[0] = start["x"]
	_ship[1] = start["y"]
	_ship[2] = cos(a) * level["speed"]
	_ship[3] = sin(a) * level["speed"]

	var t: float = launch_step * DT
	var n: int = 0
	var max_n: float = MAX_FLIGHT / DT   # 배정밀도에서 정확히 7200.0
	while n < max_n:
		var r: String = _step_ship(level, gravs, t)
		t += DT
		n += 1
		if r != "":
			last_steps = n
			return r
		_fire_ufos(ufos, n * DT)
		var rb: String = _step_bullets(level)
		if rb != "":
			last_steps = n
			return rb
	last_steps = n
	return "drift"
