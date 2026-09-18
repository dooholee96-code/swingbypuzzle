# 미니맵. docs/PLAN.md §12.5, §10.4
#
# 맵이 뷰포트보다 큰 단계에서만 나타난다. v4.1 에서 빈 곳 드래그 화면 이동을
# 없앴으므로(§10.3) 큰 맵을 살펴보는 **유일한** 수단이다.
#
# mouse_filter 를 STOP 으로 두면 이 영역의 터치를 여기서 소비하므로,
# §10.1 규칙 1(미니맵 영역이 먼저)이 자동으로 지켜진다.
class_name Minimap
extends Control

signal camera_requested(world: Vector2)

const MAX_W := 96.0            # dp (§12.5)
const MAX_H := 150.0
const BLINK_MS := 300

var session: Session = null

var _k := 1.0                  # 월드 유닛 → 미니맵 px
var _view := Rect2()           # 화면이 보는 월드 영역


# play.gd 가 매 프레임 호출한다. rect 는 현재 화면이 보는 월드 영역.
func refresh(world_view: Rect2) -> void:
	_view = world_view
	if session == null or session.level.is_empty():
		hide()
		return
	var lv := session.level
	var w: float = lv["w"]
	var h: float = lv["h"]
	# 맵이 화면에 다 들어오면 숨긴다 (§12.5)
	if world_view.size.x >= w - 0.5 and world_view.size.y >= h - 0.5:
		hide()
		return
	show()
	_k = minf(Dp.px(MAX_W) / w, Dp.px(MAX_H) / h)
	# 오른쪽 위에 붙인 채로 크기만 바꾼다. anchor_left == anchor_right 이므로
	# size 를 직접 넣으면 왼쪽으로 자라 위치가 밀린다.
	var sz := Vector2(w, h) * _k
	offset_right = -Dp.px(14.0)
	offset_left = offset_right - sz.x
	offset_top = Dp.px(68.0)
	offset_bottom = offset_top + sz.y
	queue_redraw()


func _draw() -> void:
	if session == null or session.level.is_empty():
		return
	var lv := session.level
	var t := session.sim_time()

	draw_rect(Rect2(Vector2.ZERO, size), Color(0, 0, 0, 0.62))
	draw_rect(Rect2(Vector2.ZERO, size), Palette.LINE_DIM, false, 1.0)

	for a in lv.get("rocks", []):                       # 소행성은 작은 회색 점
		draw_circle(_p(a["x"], a["y"]), 1.2, Color(Palette.LINE, 0.35))

	for b in Sim.gravs_of(lv):                          # 중력원: 점 + 범위 옅은 원
		var c := _body(b, t)
		var col: Color = Palette.HOLE if b.has("rH") else Palette.GRAVITY
		draw_arc(c, b["R"] * _k, 0.0, TAU, 32, Color(col, 0.30), 1.0, true)
		draw_circle(c, 2.0, col)

	for u in lv.get("ufos", []):
		draw_circle(_p(u["x"], u["y"]), 2.0, Palette.DANGER)

	var g: Dictionary = lv["goal"]
	draw_circle(_p(g["x"], g["y"]), 2.5, Palette.GOAL)

	# 우주선은 흰 점. 비행 중에는 깜빡인다 (§12.5)
	var flying: bool = session.state == Session.FLYING
	if not flying or (Time.get_ticks_msec() / BLINK_MS) % 2 == 0:
		var sp := session.ship_pos()
		draw_circle(_p(sp[0], sp[1]), 2.0, Palette.LINE)

	# 현재 뷰포트 윤곽
	draw_rect(Rect2(_view.position * _k, _view.size * _k),
		Color(Palette.LINE, 0.8), false, 1.0)


func _p(x: float, y: float) -> Vector2:
	return Vector2(x, y) * _k


func _body(b: Dictionary, t: float) -> Vector2:
	if not b.has("orbit"):
		return _p(b["x"], b["y"])
	var o: Dictionary = b["orbit"]
	var a: float = o["phase"] + 2.0 * PI * t / o["period"]
	return _p(o["cx"] + o["rad"] * cos(a), o["cy"] + o["rad"] * sin(a))


# §10.4: 누른 점과 드래그 중인 점에 해당하는 월드 위치로 카메라 중심을 즉시 옮긴다.
func _gui_input(event: InputEvent) -> void:
	var pos := Vector2.ZERO
	if event is InputEventScreenTouch and event.pressed:
		pos = event.position
	elif event is InputEventScreenDrag:
		pos = event.position
	else:
		return
	if _k <= 0.0:
		return
	camera_requested.emit(pos / _k)
	accept_event()
