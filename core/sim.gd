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
const PAD_R := SwConsts.PAD_R
const ARC := SwConsts.ARC

# 스크래치 버퍼를 인스턴스 필드로 둬 루프 안 할당을 없앤다.
var _bp := PackedFloat64Array([0.0, 0.0])              # body_pos 결과
var _ac := PackedFloat64Array([0.0, 0.0])              # accel 결과
var _ship := PackedFloat64Array([0.0, 0.0, 0.0, 0.0])  # x, y, vx, vy
var _bullets := PackedFloat64Array()                   # 5개씩 [x, y, vx, vy, age]
var _next_fire := PackedFloat64Array()                 # 외계인별 다음 사격 시각 (§5.5)

# 마지막 simulate()의 비행 스텝 수. 검증기(§8.5)의 flight_time 계산에 쓴다.
var last_steps := 0

# 경로 기록. 켜면 simulate()가 매 스텝 우주선 위치를 last_path에 x,y 쌍으로 쌓는다.
# 검증기의 clearance 계산(§8.5)과 에디터 궤적 표시(§8.7)에 쓴다.
# 전수 스캔에서는 꺼 둔다.
var record_path := false
var last_path := PackedFloat64Array()

# 대화형 진행 상태 (begin / step_live). simulate() 도 이것을 쓴다.
var _lv: Dictionary = {}
var _lv_gravs: Array = []
var _lv_ufos: Array = []
var _lv_t := 0.0
var _lv_n := 0
var _lv_max := 0.0


static func dist(ax: float, ay: float, bx: float, by: float) -> float:
	var dx := ax - bx
	var dy := ay - by
	return sqrt(dx * dx + dy * dy)


func body_pos(b: Dictionary, t: float) -> void:
	if not b.has("orbit"):
		_bp[0] = b["x"]
		_bp[1] = b["y"]
		return
	var o: Dictionary = b["orbit"]
	var a: float = o["phase"] + 2.0 * PI * t / o["period"]
	_bp[0] = o["cx"] + o["rad"] * cos(a)
	_bp[1] = o["cy"] + o["rad"] * sin(a)


func accel(gravs: Array, x: float, y: float, t: float) -> void:
	var ax := 0.0
	var ay := 0.0
	for b in gravs:
		body_pos(b, t)
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
func step_ship(level: Dictionary, gravs: Array, t: float) -> String:
	accel(gravs, _ship[0], _ship[1], t)
	_ship[2] += _ac[0] * DT
	_ship[3] += _ac[1] * DT
	_ship[0] += _ship[2] * DT
	_ship[1] += _ship[3] * DT
	var tt: float = t + DT
	var sx: float = _ship[0]
	var sy: float = _ship[1]
	for p in level.get("planets", []):
		body_pos(p, tt)
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


func fire_ufos(ufos: Array, ft: float) -> void:
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
func step_bullets(level: Dictionary) -> String:
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


# ── 발사대 행성 (§5.9) ──────────────────────────────────────────────────
#
# θ 는 우주선이 돔 표면에 서 있는 위치이자 이륙 방향이다. 두 가지를 겸한다.
# 발사 좌표는 돔 중심에서 θ 방향으로 PAD_R 만큼 떨어진 점이다.

# 돔 중심 방향 = 출발점 → 목적지. 걸을 수 있는 범위는 이 방향 ±ARC.
static func pad_angle(level: Dictionary) -> float:
	var s: Dictionary = level["start"]
	var g: Dictionary = level["goal"]
	return atan2(g["y"] - s["y"], g["x"] - s["x"]) * 180.0 / PI


# θ 가 걸을 수 있는 범위 안인가. 검증기 규칙(§8.5)이 이걸 본다.
static func in_arc(level: Dictionary, theta_deg: float) -> bool:
	var d: float = fposmod(theta_deg - pad_angle(level) + 180.0, 360.0) - 180.0
	return absf(d) <= ARC


# θ 에서의 발사 좌표 [x, y]
static func launch_pos(level: Dictionary, theta_deg: float) -> PackedFloat64Array:
	var a: float = theta_deg * PI / 180.0
	var s: Dictionary = level["start"]
	return PackedFloat64Array([s["x"] + PAD_R * cos(a), s["y"] + PAD_R * sin(a)])


# 중력원 배열. 호출자가 한 번 만들어 전수 스캔 내내 재사용하면 더 빠르다.
static func gravs_of(level: Dictionary) -> Array:
	var g: Array = []
	g.append_array(level.get("planets", []))
	g.append_array(level.get("holes", []))
	return g


# ── 비행 진행 ───────────────────────────────────────────────────────────
#
# 게임(한 프레임에 몇 스텝씩)과 검증기(끝까지 한 번에)가 **같은 스테퍼**를 쓴다.
# 스테핑을 두 벌 두면 검증기가 통과시킨 단계가 게임에서 다르게 날아갈 수 있다(§0.3).
#
# 시각 t 는 launch_step * DT 에서 시작해 **누산**한다. level_step * DT 로 다시
# 계산하면 배정밀도 결과가 미세하게 갈린다. 부록 A 와 같은 방식을 유지한다.

# 발사 준비. 이후 step_live() 를 반복 호출한다.
func begin(level: Dictionary, angle_deg: float, launch_step: int, gravs: Array = []) -> void:
	_lv = level
	_lv_gravs = gravs_of(level) if gravs.is_empty() else gravs
	_lv_ufos = level.get("ufos", [])

	_next_fire.resize(_lv_ufos.size())
	for i in _lv_ufos.size():
		_next_fire[i] = _lv_ufos[i]["delay"]
	_bullets.resize(0)
	last_path.resize(0)

	var a: float = angle_deg * PI / 180.0
	var start: Dictionary = level["start"]
	_ship[0] = start["x"] + PAD_R * cos(a)      # 돔 표면에서 이륙한다 (§5.9)
	_ship[1] = start["y"] + PAD_R * sin(a)
	_ship[2] = cos(a) * level["speed"]
	_ship[3] = sin(a) * level["speed"]

	_lv_t = launch_step * DT
	_lv_n = 0
	_lv_max = MAX_FLIGHT / DT                   # 배정밀도에서 정확히 7200.0
	last_steps = 0


# 한 스텝. "" = 계속, 그 외 = 결과. 시간이 다하면 "drift".
func step_live() -> String:
	if _lv_n >= _lv_max:
		last_steps = _lv_n
		return "drift"
	var r: String = step_ship(_lv, _lv_gravs, _lv_t)
	_lv_t += DT
	_lv_n += 1
	if record_path:
		last_path.append(_ship[0])
		last_path.append(_ship[1])
	if r != "":
		last_steps = _lv_n
		return r
	fire_ufos(_lv_ufos, _lv_n * DT)
	var rb: String = step_bullets(_lv)
	if rb != "":
		last_steps = _lv_n
		return rb
	if _lv_n >= _lv_max:
		last_steps = _lv_n
		return "drift"
	return ""


# 비행 시계(스텝). 30초 제한과 외계인 사격 타이밍의 기준이다(§5.2).
func flight_step() -> int:
	return _lv_n


# 진행 중인 비행의 현재 시각. 공전 행성을 **시뮬레이션과 같은 자리에** 그리려면
# level_step * DT 로 다시 계산하지 말고 이 누산값을 써야 한다.
func live_time() -> float:
	return _lv_t


# 전체 비행 시뮬레이션. 결과 문자열을 반환한다(§5.4의 결과 종류).
func simulate(level: Dictionary, angle_deg: float, launch_step: int, gravs: Array = []) -> String:
	begin(level, angle_deg, launch_step, gravs)
	var r := ""
	while r == "":
		r = step_live()
	return r


# ── 예측선 (§5.7) ────────────────────────────────────────────────────────
#
# 현재 level_step에서 발사했다고 가정하고 step_ship만 preview/DT 스텝 돌린다.
# 총알은 무시한다. 실제 비행과 **같은 함수**를 쓰는 것이 이 게임의 신뢰 기반이다.
#
# 반환: { "points": PackedFloat64Array(x,y 쌍), "outcome": String }
#   outcome이 ""가 아니면 마지막 점에서 그 결과로 끝난 것이다(× 표시 지점).
func predict(level: Dictionary, angle_deg: float, launch_step: int, gravs: Array = []) -> Dictionary:
	if gravs.is_empty():
		gravs = gravs_of(level)

	var a: float = angle_deg * PI / 180.0
	var start: Dictionary = level["start"]
	_ship[0] = start["x"] + PAD_R * cos(a)      # 돔 표면에서 이륙한다 (§5.9)
	_ship[1] = start["y"] + PAD_R * sin(a)
	_ship[2] = cos(a) * level["speed"]
	_ship[3] = sin(a) * level["speed"]

	var points := PackedFloat64Array()
	var t: float = launch_step * DT
	var n := 0
	var max_n: int = int(float(level["preview"]) / DT)
	var outcome := ""
	while n < max_n:
		outcome = step_ship(level, gravs, t)
		t += DT
		n += 1
		points.append(_ship[0])
		points.append(_ship[1])
		if outcome != "":
			break
	return { "points": points, "outcome": outcome }


# ── 테스트·검증용 편의 함수 ──────────────────────────────────────────────
#
# 값을 새로 할당해 반환하므로 전수 스캔 루프 안에서는 쓰지 않는다.
# 루프에서는 위의 in-place 버전(accel/body_pos)을 쓴다.

func accel_at(gravs: Array, x: float, y: float, t: float) -> PackedFloat64Array:
	accel(gravs, x, y, t)
	return PackedFloat64Array([_ac[0], _ac[1]])


func body_pos_at(b: Dictionary, t: float) -> PackedFloat64Array:
	body_pos(b, t)
	return PackedFloat64Array([_bp[0], _bp[1]])


# 살아 있는 총알. 5개씩 [x, y, vx, vy, age]. 화면이 읽기만 한다.
# PackedFloat64Array 는 기록 시 복사(CoW)라 읽기만 하면 사본이 생기지 않는다.
func bullets() -> PackedFloat64Array:
	return _bullets


# 우주선 현재 상태 복사본 [x, y, vx, vy]
func ship_state() -> PackedFloat64Array:
	return PackedFloat64Array([_ship[0], _ship[1], _ship[2], _ship[3]])
