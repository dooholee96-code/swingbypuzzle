# 필드 그리기. docs/PLAN.md §12.2 의 순서를 따른다.
#
# 요소마다 노드를 만들지 않고 여기 _draw() 한 곳에서 그린다.
# 그리기 순서를 명시적으로 통제해야 하고, 노드 수가 늘면 저사양 기기에서
# 비용이 커진다(§15.3).
#
# M2 는 단순 도형까지다. 벡터 디테일(정n각형 회전, 고리, 나선, 비행접시,
# 불규칙 소행성, 폭발 파편)은 M5 에서 채운다.
class_name Field
extends Node2D

const ARC := SwConsts.ARC
const DOME_DRAW_R := 18.0        # 그려지는 표면 반경. PAD_R(22) 보다 작다 (§12.3)

var session: Session = null
var view_scale := 1.0            # 유닛 → 화면 px (카메라 zoom 과 같다)

var _t := 0.0
var _preview: Dictionary = {}


func _process(delta: float) -> void:
	_t += delta
	# 예측선은 프레임당 1회만 계산한다 (§18). _draw() 안에서 돌리면
	# 한 프레임에 두 번 그려질 때 두 번 계산된다.
	if session != null and session.state == Session.AIMING and session.aim_far:
		_preview = session.preview()
	else:
		_preview = {}
	queue_redraw()                # 프레임당 1회 (§15.3)


func _draw() -> void:
	if session == null or session.level.is_empty():
		return
	var lv := session.level
	var st := session.sim_time()

	_draw_bounds(lv)
	_draw_gravity(lv, st)
	_draw_trail(session.prev_trail, 0.20)
	_draw_trail(session.trail, 0.75)
	_draw_rocks(lv)
	_draw_planets(lv, st)
	_draw_holes(lv)
	_draw_goal(lv)
	_draw_pad(lv)
	_draw_preview()
	_draw_ship()


# §11 맵 경계. 옅은 사각형 + 모서리 꺾쇠 + 바깥쪽 사선 해칭으로 "벽"임을 보인다.
const BRACKET := 28.0
const HATCH_STEP := 26.0
const HATCH_LEN := 15.0


func _draw_bounds(lv: Dictionary) -> void:
	var w: float = lv["w"]
	var h: float = lv["h"]
	DrawLib.line(self, PackedVector2Array([
		Vector2(0, 0), Vector2(w, 0), Vector2(w, h), Vector2(0, h)]),
		Palette.LINE, view_scale, 0.28, true)

	for c in [[Vector2(0, 0), 1.0, 1.0], [Vector2(w, 0), -1.0, 1.0],
			  [Vector2(w, h), -1.0, -1.0], [Vector2(0, h), 1.0, -1.0]]:
		var p: Vector2 = c[0]
		var sx: float = c[1]
		var sy: float = c[2]
		DrawLib.line(self, PackedVector2Array([
			p + Vector2(BRACKET * sx, 0), p, p + Vector2(0, BRACKET * sy)]),
			Palette.LINE, view_scale, 0.6)

	# 바깥쪽 사선. 각 변을 따라 짧은 빗금을 긋는다.
	var x := HATCH_STEP
	while x < w:
		DrawLib.line(self, PackedVector2Array([
			Vector2(x, 0), Vector2(x - HATCH_LEN, -HATCH_LEN)]),
			Palette.LINE, view_scale, 0.16, false)
		DrawLib.line(self, PackedVector2Array([
			Vector2(x, h), Vector2(x - HATCH_LEN, h + HATCH_LEN)]),
			Palette.LINE, view_scale, 0.16, false)
		x += HATCH_STEP
	var y := HATCH_STEP
	while y < h:
		DrawLib.line(self, PackedVector2Array([
			Vector2(0, y), Vector2(-HATCH_LEN, y - HATCH_LEN)]),
			Palette.LINE, view_scale, 0.16, false)
		DrawLib.line(self, PackedVector2Array([
			Vector2(w, y), Vector2(w + HATCH_LEN, y - HATCH_LEN)]),
			Palette.LINE, view_scale, 0.16, false)
		y += HATCH_STEP


func _draw_gravity(lv: Dictionary, t: float) -> void:
	for b in Sim.gravs_of(lv):
		var p := _body_xy(b, t)
		var is_hole: bool = b.has("rH")
		var col: Color = Palette.HOLE if is_hole else Palette.GRAVITY
		var period: float = 1.2 if is_hole else 2.4
		var inner: float = b["rH"] if is_hole else b["r"]
		DrawLib.dashed_circle(self, p, b["R"], col, view_scale, 0.35)
		for k in 3:                              # 안으로 수축하는 원 (§12.3)
			var u: float = fposmod(_t / period + float(k) / 3.0, 1.0)
			var r: float = b["R"] + (inner - b["R"]) * u
			DrawLib.circle(self, p, r, col, view_scale, sin(u * PI) * 0.40)


func _draw_trail(tr: PackedFloat64Array, alpha: float) -> void:
	if tr.size() < 4:
		return
	var pts := PackedVector2Array()
	for i in range(0, tr.size(), 2):
		pts.append(Vector2(tr[i], tr[i + 1]))
	DrawLib.line(self, pts, Palette.LINE, view_scale, alpha)


func _draw_rocks(lv: Dictionary) -> void:
	for a in lv.get("rocks", []):
		DrawLib.circle(self, Vector2(a["x"], a["y"]), a["r"],
			Palette.LINE, view_scale, 0.85)


func _draw_planets(lv: Dictionary, t: float) -> void:
	for p in lv.get("planets", []):
		DrawLib.ngon(self, _body_xy(p, t), p["r"], int(p["sides"]),
			_t * 0.105, Palette.LINE, view_scale)      # 초당 6° 회전


func _draw_holes(lv: Dictionary) -> void:
	for h in lv.get("holes", []):
		var c := Vector2(h["x"], h["y"])
		draw_circle(c, h["rH"], Palette.BG)            # 지평선만 검정 채움
		DrawLib.circle(self, c, h["rH"], Palette.HOLE, view_scale)


func _draw_goal(lv: Dictionary) -> void:
	var g: Dictionary = lv["goal"]
	var c := Vector2(g["x"], g["y"])
	var r: float = g["r"]
	for dir in [1.0, -1.0]:                            # 반대로 도는 두 겹 마름모
		var a: float = _t * 0.7 * dir
		var pts := PackedVector2Array()
		for i in 4:
			var q: float = a + TAU * float(i) / 4.0
			pts.append(c + Vector2(cos(q), sin(q)) * r * 0.62)
		DrawLib.line(self, pts, Palette.GOAL, view_scale, 0.95, true)
	var u: float = fposmod(_t / 1.5, 1.0)              # 바깥으로 퍼지는 원
	DrawLib.circle(self, c, r * (0.6 + u * 0.75), Palette.GOAL, view_scale, (1.0 - u) * 0.55)


# 발사대 행성 (§5.9, §12.3). 표면 눈금이 곧 각도 눈금이다.
func _draw_pad(lv: Dictionary) -> void:
	var flying: bool = session.state == Session.FLYING or session.state == Session.ENDING
	var s: Dictionary = lv["start"]
	var c := Vector2(s["x"], s["y"])
	var pad := deg_to_rad(Sim.pad_angle(lv))
	var arc := deg_to_rad(ARC)
	var aiming: bool = session.state == Session.AIMING

	DrawLib.arc(self, c, DOME_DRAW_R, pad - arc, pad + arc, Palette.LINE, view_scale,
		0.35 if flying else 0.85)
	DrawLib.arc(self, c, DOME_DRAW_R, pad + arc, pad - arc + TAU, Palette.LINE, view_scale,
		0.12 if flying else 0.22)
	if flying:
		return                                         # 비행 중에는 눈금을 빼서 궤적을 가리지 않는다

	for d in range(-90, 91, 5):                        # 5° · 15° 눈금
		var a: float = pad + deg_to_rad(float(d))
		var major: bool = d % 15 == 0
		var out: float = DOME_DRAW_R + (6.0 if major else 3.0)
		var dir := Vector2(cos(a), sin(a))
		DrawLib.line(self, PackedVector2Array([c + dir * DOME_DRAW_R, c + dir * out]),
			Palette.GRAVITY, view_scale,
			(0.75 if aiming else 0.34) * (1.0 if major else 0.45))

	for a in [pad - arc, pad + arc]:                   # 걸을 수 있는 끝
		var dir := Vector2(cos(a), sin(a))
		DrawLib.line(self, PackedVector2Array([
			c + dir * (DOME_DRAW_R - 4.0), c + dir * (DOME_DRAW_R + 9.0)]),
			Palette.GRAVITY, view_scale, 0.8 if aiming else 0.4)


func _draw_preview() -> void:
	if _preview.is_empty():
		return
	var pr := _preview
	var pts: PackedFloat64Array = pr["points"]
	if pts.size() < 2:
		return
	# 0.05초 간격 점. 바깥으로 흐르게 위상을 민다 (§12.3).
	var spacing := 12                                  # 12스텝 = 0.05초
	var phase: int = int(fposmod(_t * 34.0, float(spacing)))
	var n: int = pts.size() / 2
	var size: float = maxf(Dp.px(1.2) / view_scale, 1.4)
	var i := phase
	while i < n:
		var a: float = 0.9 * (1.0 - float(i) / float(n) * 0.75)
		draw_circle(Vector2(pts[i * 2], pts[i * 2 + 1]), size, Color(Palette.GOAL, a))
		i += spacing
	if pr["outcome"] != "":                            # 충돌 예측 지점에 ×
		var e := Vector2(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1])
		var d := 5.0
		DrawLib.line(self, PackedVector2Array([e + Vector2(-d, -d), e + Vector2(d, d)]),
			Palette.DANGER, view_scale)
		DrawLib.line(self, PackedVector2Array([e + Vector2(-d, d), e + Vector2(d, -d)]),
			Palette.DANGER, view_scale)


func _draw_ship() -> void:
	var p := session.ship_pos()
	var c := Vector2(p[0], p[1])
	var a := session.ship_heading()
	var k := 1.0
	if session.state == Session.ENDING:
		k = 1.0 - session.end_progress() if session.outcome == "win" else 0.0
	if k <= 0.02:
		if session.state == Session.ENDING and session.outcome != "win":
			_draw_burst(c)
		return
	# 길이 14 · 폭 10, 뒷변이 안쪽으로 파인 아스테로이드식 삼각형 (§12.3)
	var pts := PackedVector2Array()
	for v in [Vector2(9, 0), Vector2(-6, -5), Vector2(-3, 0), Vector2(-6, 5)]:
		pts.append(c + (v * k).rotated(a))
	DrawLib.line(self, pts, Palette.LINE, view_scale, 1.0, true)


func _draw_burst(c: Vector2) -> void:
	var u := session.end_progress()
	var rng := RandomNumberGenerator.new()
	rng.seed = 1234                                    # 장식용 고정 시드 (§5.8)
	for i in 10:
		var a := rng.randf() * TAU
		var d := u * (18.0 + rng.randf() * 26.0)
		var len := 5.0 + rng.randf() * 7.0
		var p := c + Vector2(cos(a), sin(a)) * d
		var a2 := a + u * 3.0
		DrawLib.line(self, PackedVector2Array([p, p + Vector2(cos(a2), sin(a2)) * len]),
			Palette.LINE, view_scale, 1.0 - u)


func _body_xy(b: Dictionary, t: float) -> Vector2:
	if not b.has("orbit"):
		return Vector2(b["x"], b["y"])
	var o: Dictionary = b["orbit"]
	var a: float = o["phase"] + 2.0 * PI * t / o["period"]
	return Vector2(o["cx"] + o["rad"] * cos(a), o["cy"] + o["rad"] * sin(a))
