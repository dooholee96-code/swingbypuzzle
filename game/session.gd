# 한 단계 플레이 상태 머신. docs/PLAN.md §9.2
#
# 노드를 쓰지 않는 순수 로직이다. 화면은 이 상태를 읽어 그리기만 한다.
class_name Session
extends RefCounted

enum { READY, AIMING, FLYING, ENDING }

const DT := SwConsts.DT
const END_SECONDS := 0.8          # 폭발·도착 연출 길이 (§9.2)
const TRAIL_SECONDS := 2.5        # 궤적 표시 길이 (§12.3)
const TRAIL_EVERY := 8            # 1/30초마다 기록 (240Hz / 30)

var level: Dictionary = {}
var sim := Sim.new()

# 예측선 전용. sim 과 같은 인스턴스를 쓰면 predict() 가 비행 중인
# 우주선 상태를 덮어쓴다.
var _preview_sim := Sim.new()

var state := READY
var level_step := 0               # 발사 전에도 흐른다 (§5.2)
var angle := 0.0                  # 월드각 θ. 우주선이 서 있는 자리이자 이륙 방향
var outcome := ""
var attempts := 0
var first_try := true
var aim_far := false              # 취소 영역 밖인가. 예측선 표시 여부를 정한다 (§10.2)

var trail := PackedFloat64Array()       # x, y 쌍
var prev_trail := PackedFloat64Array()  # 직전 시도 (§12.3)

var _end_elapsed := 0.0
var _clock := Clock.new()


func setup(lv: Dictionary) -> void:
	level = lv
	angle = Sim.pad_angle(lv)         # 돔 중심에서 시작
	prev_trail = PackedFloat64Array()
	attempts = 0
	first_try = true
	reset()


# 단계 재시작. 두 시계 모두 0 으로 (§5.2).
func reset() -> void:
	level_step = 0
	outcome = ""
	state = READY
	if not trail.is_empty():
		prev_trail = trail
	trail = PackedFloat64Array()
	_end_elapsed = 0.0
	_clock.reset()


func pause_reset() -> void:
	_clock.reset()


# 우주선 위치 [x, y]. 발사 전에는 돔 표면, 비행 중에는 시뮬레이션 위치.
func ship_pos() -> PackedFloat64Array:
	if state == FLYING or state == ENDING:
		var s := sim.ship_state()
		return PackedFloat64Array([s[0], s[1]])
	return Sim.launch_pos(level, angle)


# 우주선이 향하는 방향(라디안). 비행 중에는 속도 방향 (§12.3).
func ship_heading() -> float:
	if state == FLYING or state == ENDING:
		var s := sim.ship_state()
		if s[2] != 0.0 or s[3] != 0.0:
			return atan2(s[3], s[2])
	return deg_to_rad(angle)


func flight_seconds() -> float:
	return sim.flight_step() * DT


func end_progress() -> float:
	return clampf(_end_elapsed / END_SECONDS, 0.0, 1.0)


func set_angle(theta: float) -> void:
	if state == READY or state == AIMING:
		angle = theta


func begin_aim() -> void:
	if state == READY:
		state = AIMING


func cancel_aim() -> void:
	aim_far = false
	if state == AIMING:
		state = READY


# 발사는 스텝 경계에서 일어난다. 손을 뗀 프레임의 level_step 이 launch_step (§5.2).
func launch() -> void:
	if state != READY and state != AIMING:
		return
	aim_far = false
	sim.record_path = false
	sim.begin(level, angle, level_step)
	state = FLYING
	attempts += 1
	first_try = false
	trail = PackedFloat64Array()


# 한 프레임. 고정 스텝 누산기가 스텝 수를 정한다 (§5.8).
func advance(delta: float) -> void:
	if state == ENDING:
		_end_elapsed += delta
		return
	var n := _clock.steps(delta)
	for i in n:
		_step()
		if state == ENDING:
			break


func _step() -> void:
	level_step += 1                   # 발사 전에도 흐른다 (§5.2)
	if state != FLYING:
		return
	var r := sim.step_live()
	if r != "":
		outcome = r
		state = ENDING
		_end_elapsed = 0.0
		return
	if sim.flight_step() % TRAIL_EVERY == 0:
		var s := sim.ship_state()
		trail.append(s[0])
		trail.append(s[1])
		var keep := int(TRAIL_SECONDS * 30.0) * 2
		if trail.size() > keep:
			trail = trail.slice(trail.size() - keep)


# 예측선 (§5.7). 조준 중 매 프레임 현재 level_step 기준으로 다시 구한다.
func preview() -> Dictionary:
	return _preview_sim.predict(level, angle, level_step)


# 화면이 공전 행성을 그릴 때 쓸 시각. 비행 중에는 시뮬레이션의 누산값을
# 그대로 쓴다 — level_step * DT 로 다시 계산하면 미세하게 어긋나 아슬아슬한
# 스침이 화면과 판정에서 다르게 보일 수 있다.
func sim_time() -> float:
	if state == FLYING or state == ENDING:
		return sim.live_time()
	return level_step * DT
