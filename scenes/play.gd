# 한 단계 플레이 화면. docs/PLAN.md §9, §10, §11
extends Node2D

# §11 배율 기준. 1~4장(최대 400×760)은 대부분의 폰에서 한 화면에 들어온다.
const REF_W := 400.0
const REF_H := 760.0
const HUD_RESERVE := 96.0           # 상단 HUD 와 안전 영역 몫 (dp)
const FOLLOW_SPEED := 6.0           # §11 추적 감쇠
const LOOK_AHEAD := 0.35            # 속도 × 이 값만큼 앞을 본다

@onready var camera: Camera2D = $Camera2D
@onready var field: Field = $Field
@onready var hud: CanvasLayer = $Hud

var session := Session.new()
var aim := AimInput.new()
var view_scale := 1.0


func _ready() -> void:
	var loader := LevelLoader.new()
	var lv := loader.load_level("1-1")
	if lv.is_empty():
		for e in loader.errors:
			push_error(e)
		return
	session.setup(lv)
	field.session = session
	hud.session = session
	hud.retry_pressed.connect(_on_retry)
	get_viewport().size_changed.connect(_layout)
	Lifecycle.paused.connect(_on_paused)
	Lifecycle.resumed.connect(_on_resumed)
	Haptics.enabled = bool(Save.settings()["haptics"])   # 설정과 연결 (§13.6)
	_layout()


# 백그라운드로 가면 시뮬레이션을 멈추고 누산기를 버린다 (§5.8, §15.2).
# 고정 스텝이라 돌아와서 그대로 이어가도 결과가 달라지지 않는다.
func _on_paused() -> void:
	session.pause_reset()
	if aim.active:
		aim.finish()
		session.cancel_aim()
	set_process(false)


func _on_resumed() -> void:
	session.pause_reset()
	set_process(true)


# 뒤로 버튼 (§15.2). 결과 화면이 떠 있으면 닫는 것으로 소비한다.
# 단계 선택 화면은 M6 에서 붙인다.
func handle_back() -> bool:
	if hud.result_visible():
		_on_retry()
		return true
	return false


func _process(delta: float) -> void:
	if session.level.is_empty():
		return
	session.advance(delta)
	_follow(delta)
	hud.refresh()
	if session.state == Session.ENDING and session.end_progress() >= 1.0:
		_finish()


# §11 배율과 클램프. 맵이 뷰포트보다 작은 축은 가운데 정렬한다.
func _layout() -> void:
	var vp := Vector2(get_viewport_rect().size)
	var avail_h: float = maxf(vp.y - Dp.px(HUD_RESERVE), 120.0)
	view_scale = minf(vp.x / REF_W, avail_h / REF_H)
	camera.zoom = Vector2(view_scale, view_scale)
	field.view_scale = view_scale

	var lv := session.level
	if lv.is_empty():
		return
	var view := vp / view_scale
	# limit_* 는 뷰의 가장자리에 걸린다. 작은 축은 범위를 뷰 크기와 같게 만들어
	# 카메라가 한 자리에 고정되도록 한다(= 가운데 정렬).
	var left: float = (lv["w"] - view.x) * 0.5 if lv["w"] <= view.x else 0.0
	var top: float = (lv["h"] - view.y) * 0.5 if lv["h"] <= view.y else 0.0
	camera.limit_left = int(floor(left))
	camera.limit_top = int(floor(top))
	camera.limit_right = int(ceil(left + view.x if lv["w"] <= view.x else lv["w"]))
	camera.limit_bottom = int(ceil(top + view.y if lv["h"] <= view.y else lv["h"]))
	if session.state != Session.FLYING:      # 비행 중 화면 회전에 카메라를 되돌리지 않는다
		_snap_to_start()


func _snap_to_start() -> void:
	var s: Dictionary = session.level["start"]
	camera.position = Vector2(s["x"], s["y"])
	camera.reset_smoothing()


func _follow(delta: float) -> void:
	if session.state != Session.FLYING:
		camera.position_smoothing_enabled = false
		return
	var st := session.sim.ship_state()
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = FOLLOW_SPEED
	camera.position = Vector2(st[0] + st[2] * LOOK_AHEAD, st[1] + st[3] * LOOK_AHEAD)


# ── 입력 (§10) ──────────────────────────────────────────────────────────
func _unhandled_input(event: InputEvent) -> void:
	if session.level.is_empty():
		return
	if session.state != Session.READY and session.state != Session.AIMING:
		return

	if event is InputEventScreenTouch:
		if event.index != 0:                       # 첫 번째 포인터만 (§10.0.1)
			return
		if event.pressed:
			aim.begin(event.position)
			session.begin_aim()
			_update_aim(event.position)
		else:
			_release()
		get_viewport().set_input_as_handled()
	elif event is InputEventScreenDrag and aim.active:
		if event.index != 0:
			return
		_update_aim(event.position)
		get_viewport().set_input_as_handled()


func _update_aim(pos: Vector2) -> void:
	var s: Dictionary = session.level["start"]
	var center := _to_screen(Vector2(s["x"], s["y"]))
	var dome_px: float = Field.DOME_DRAW_R * view_scale
	session.aim_far = aim.update(pos, center, dome_px, session.level)
	if session.aim_far:
		session.set_angle(aim.angle)


func _release() -> void:
	if aim.should_launch():
		session.launch()
		Haptics.launch()
	else:
		session.cancel_aim()
	aim.finish()


# 연출이 끝나는 순간 한 번만. 기록을 남기고 결과를 띄운다.
func _finish() -> void:
	if hud.result_visible():
		return
	Save.record_attempt(session.level["id"], session.outcome, session.flight_seconds())
	if session.outcome == "win":
		Haptics.arrived()
	else:
		Haptics.game_over()
	hud.show_result()


func _to_screen(world: Vector2) -> Vector2:
	return (world - camera.get_screen_center_position()) * view_scale \
		+ Vector2(get_viewport_rect().size) * 0.5


func _on_retry() -> void:
	session.reset()
	aim.finish()
	hud.hide_result()
	_snap_to_start()
