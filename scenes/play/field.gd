# 필드 그리기. docs/PLAN.md §12.2 의 순서를 따른다.
#
# 요소마다 노드를 만들지 않고 여기 _draw() 한 곳에서 그린다.
# 그리기 순서를 명시적으로 통제해야 하고, 노드 수가 늘면 저사양 기기에서
# 비용이 커진다(§15.3).
class_name Field
extends Node2D

const ARC := SwConsts.ARC
const DOME_DRAW_R := 18.0        # 그려지는 표면 반경. PAD_R(22) 보다 작다 (§12.3)

# §11 맵 경계
const BRACKET := 28.0
const HATCH_STEP := 26.0
const HATCH_LEN := 15.0

# §12.3 별 배경: 1000유닛²당 약 0.2개, 카메라 이동의 30%만 따라 움직인다
const STAR_DENSITY := 0.2 / 1000.0
const STAR_PARALLAX := 0.3
# 시차 때문에 별은 화면 기준 맵보다 넓은 범위에 있어야 한다.
# 별이 보이려면 P ∈ [1.3·cam − view/2, 1.3·cam + view/2] 이므로 맵의 1.3배가 필요하다.
const STAR_SPREAD := 1.4

var session: Session = null
var view_scale := 1.0
var cam_center := Vector2.ZERO    # 별 시차 계산용. play.gd 가 매 프레임 갱신
var reduce_motion := false        # §12.4

var _t := 0.0
var _preview: Dictionary = {}
var _stars := PackedFloat64Array()      # x, y, 크기
var _rock_shapes: Array = []            # 소행성별 PackedVector2Array
var _level_id := ""


func _process(delta: float) -> void:
	_t += delta
	# 예측선은 프레임당 1회만 계산한다 (§18).
	if session != null and session.state == Session.AIMING and session.aim_far:
		_preview = session.preview()
	else:
		_preview = {}
	queue_redraw()


# 단계가 바뀔 때 play.gd 가 부른다. 장식은 시드 난수로 한 번만 만든다 (§5.8).
func rebuild() -> void:
	if session == null or session.level.is_empty():
		return
	var lv := session.level
	_level_id = lv["id"]
	var w: float = lv["w"]
	var h: float = lv["h"]

	var r := Mulberry32.new(_level_id.hash())
	_stars = PackedFloat64Array()
	var sw := w * STAR_SPREAD
	var sh := h * STAR_SPREAD
	var count := int(sw * sh * STAR_DENSITY)
	var ox := (sw - w) * 0.5
	var oy := (sh - h) * 0.5
	for i in count:
		_stars.append(r.next() * sw - ox)
		_stars.append(r.next() * sh - oy)
		_stars.append(r.range_f(1.0, 1.5))

	# §12.3 소행성: seed 로 만든 9~12꼭짓점 불규칙 다각형, 반경 r×0.75~1.15
	_rock_shapes = []
	for a in lv.get("rocks", []):
		var rr := Mulberry32.new(int(a["seed"]))
		var n := 9 + int(rr.next() * 4.0)
		var pts := PackedVector2Array()
		for k in n:
			var ang: float = TAU * float(k) / float(n)
			var rad: float = a["r"] * rr.range_f(0.75, 1.15)
			pts.append(Vector2(cos(ang), sin(ang)) * rad)
		_rock_shapes.append(pts)


func _draw() -> void:
	if session == null or session.level.is_empty():
		return
	if session.level["id"] != _level_id:
		rebuild()
	var lv := session.level
	var st := session.sim_time()

	_draw_stars()                       # §12.2 그리기 순서
	_draw_bounds(lv)
	_draw_gravity(lv, st)
	_draw_ufo_ranges(lv)
	_draw_trail(session.prev_trail, 0.20)
	_draw_trail(session.trail, 0.75)
	_draw_rocks(lv)
	_draw_planets(lv, st)
	_draw_holes(lv)
	_draw_ufos(lv)
	_draw_goal(lv)
	_draw_bullets()
	_draw_pad(lv)
	_draw_preview()
	_draw_ship()


# 카메라 이동의 30%만 따라 움직인다. 필드는 카메라 변환 아래에 있으므로
# 나머지 70%를 더해 주면 그만큼 덜 움직인 것처럼 보인다.
func _draw_stars() -> void:
	if _stars.is_empty():
		return
	var off := cam_center * (1.0 - STAR_PARALLAX)
	var col := Color(Palette.LINE, 0.30)
	var i := 0
	while i < _stars.size():
		var p := Vector2(_stars[i], _stars[i + 1]) + off
		draw_rect(Rect2(p, Vector2(_stars[i + 2], _stars[i + 2])), col)
		i += 3


# §11 맵 경계. 옅은 사각형 + 모서리 꺾쇠 + 바깥쪽 사선 해칭으로 "벽"임을 보인다.
func _draw_bounds(lv: Dictionary) -> void:
	var w: float = lv["w"]
	var h: float = lv["h"]
	DrawLib.line(self, PackedVector2Array([
		Vector2(0, 0), Vector2(w, 0), Vector2(w, h), Vector2(0, h)]),
		Palette.LINE, view_scale, 0.28, true)

	for c in [[Vector2(0, 0), 1.0, 1.0], [Vector2(w, 0), -1.0, 1.0],
			  [Vector2(w, h), -1.0, -1.0], [Vector2(0, h), 1.0, -1.0]]:
		var p: Vector2 = c[0]
		DrawLib.line(self, PackedVector2Array([
			p + Vector2(BRACKET * c[1], 0), p, p + Vector2(0, BRACKET * c[2])]),
			Palette.LINE, view_scale, 0.6)

	var x := HATCH_STEP
	while x < w:
		DrawLib.line(self, PackedVector2Array([
			Vector2(x, 0), Vector2(x - HATCH_LEN, -HATCH_LEN)]), Palette.LINE, view_scale, 0.16)
		DrawLib.line(self, PackedVector2Array([
			Vector2(x, h), Vector2(x - HATCH_LEN, h + HATCH_LEN)]), Palette.LINE, view_scale, 0.16)
		x += HATCH_STEP
	var y := HATCH_STEP
	while y < h:
		DrawLib.line(self, PackedVector2Array([
			Vector2(0, y), Vector2(-HATCH_LEN, y - HATCH_LEN)]), Palette.LINE, view_scale, 0.16)
		DrawLib.line(self, PackedVector2Array([
			Vector2(w, y), Vector2(w + HATCH_LEN, y - HATCH_LEN)]), Palette.LINE, view_scale, 0.16)
		y += HATCH_STEP


func _draw_gravity(lv: Dictionary, t: float) -> void:
	for b in Sim.gravs_of(lv):
		var p := _body_xy(b, t)
		var is_hole: bool = b.has("rH")
		var col: Color = Palette.HOLE if is_hole else Palette.GRAVITY
		DrawLib.dashed_circle(self, p, b["R"], col, view_scale, 0.35)
		if reduce_motion:                    # §12.4: 규칙 정보(범위)는 남기고 움직임만 끈다
			continue
		var period: float = 1.2 if is_hole else 2.4
		var inner: float = b["rH"] if is_hole else b["r"]
		for k in 3:                          # 안으로 수축하는 원 (§12.3)
			var u: float = fposmod(_t / period + float(k) / 3.0, 1.0)
			DrawLib.circle(self, p, b["R"] + (inner - b["R"]) * u, col,
				view_scale, sin(u * PI) * 0.40)


# 붉은 점선 원 20%. 비행 중 우주선이 범위 안이면 60% 로 밝아지고 맥동한다 (§12.3).
func _draw_ufo_ranges(lv: Dictionary) -> void:
	var sp := session.ship_pos()
	var flying: bool = session.state == Session.FLYING
	for u in lv.get("ufos", []):
		var a := 0.2
		if flying and _dist(sp[0], sp[1], u["x"], u["y"]) < float(u["range"]):
			a = 0.6 if reduce_motion else 0.6 * (0.7 + 0.3 * sin(_t * 7.0))
		DrawLib.dashed_circle(self, Vector2(u["x"], u["y"]), u["range"],
			Palette.DANGER, view_scale, a)


func _draw_trail(tr: PackedFloat64Array, alpha: float) -> void:
	if tr.size() < 4:
		return
	var pts := PackedVector2Array()
	for i in range(0, tr.size(), 2):
		pts.append(Vector2(tr[i], tr[i + 1]))
	DrawLib.line(self, pts, Palette.LINE, view_scale, alpha)


func _draw_rocks(lv: Dictionary) -> void:
	var rocks: Array = lv.get("rocks", [])
	for i in rocks.size():
		if i >= _rock_shapes.size():
			break
		var a: Dictionary = rocks[i]
		var rot: float = _t * 0.18 + float(i)       # 느리게 회전
		var pts := PackedVector2Array()
		for v in _rock_shapes[i]:
			pts.append(Vector2(a["x"], a["y"]) + (v as Vector2).rotated(rot))
		DrawLib.line(self, pts, Palette.LINE, view_scale, 0.85, true)


func _draw_planets(lv: Dictionary, t: float) -> void:
	for p in lv.get("planets", []):
		var c := _body_xy(p, t)
		var r: float = p["r"]
		DrawLib.ngon(self, c, r, int(p["sides"]), _t * 0.105, Palette.LINE, view_scale)
		if p.get("ring", false):
			# 기울어진 타원 고리. 행성 뒤쪽 절반은 가려진 듯 생략한다 (§12.3).
			DrawLib.ellipse_arc(self, c, r * 1.85, r * 0.52, -0.42,
				0.0, PI, Palette.LINE, view_scale, 0.65)


func _draw_holes(lv: Dictionary) -> void:
	for h in lv.get("holes", []):
		var c := Vector2(h["x"], h["y"])
		var rh: float = h["rH"]
		draw_circle(c, rh, Palette.BG)              # 지평선만 검정 채움
		DrawLib.circle(self, c, rh, Palette.HOLE, view_scale)
		for k in 3:                                 # 회전하는 나선 호 3개
			var a0: float = (0.0 if reduce_motion else _t * 1.6) + float(k) * 2.094
			DrawLib.arc(self, c, rh + 9.0 + float(k) * 7.0, a0, a0 + 1.7,
				Palette.HOLE, view_scale, 0.5)


# 고전 비행접시 실루엣, 너비 26유닛 (§12.3). 판정 반경 13 과 같다.
func _draw_ufos(lv: Dictionary) -> void:
	for u in lv.get("ufos", []):
		var c := Vector2(u["x"], u["y"])
		DrawLib.ellipse_arc(self, c, 13.0, 4.4, 0.0, 0.0, TAU,
			Palette.DANGER, view_scale)
		DrawLib.ellipse_arc(self, c + Vector2(0, -2.0), 6.0, 5.6, 0.0, PI, TAU,
			Palette.DANGER, view_scale)
		DrawLib.line(self, PackedVector2Array([
			c + Vector2(-13, 0), c + Vector2(13, 0)]), Palette.DANGER, view_scale, 0.5)
		if not reduce_motion and _just_fired(c):    # 사격 순간 짧은 섬광
			DrawLib.circle(self, c, 20.0, Palette.DANGER, view_scale, 0.8)


# 총알은 외계인 위치에서 생겨나므로, 아주 가까운 총알이 있으면 방금 쏜 것이다.
# 코어에 발사 신호를 더하면 전수 스캔 루프에도 비용이 붙는다(§8.9). 그래서 읽기로만 판단한다.
func _just_fired(c: Vector2) -> bool:
	var b := session.sim.bullets()
	var i := 0
	while i < b.size():
		if _dist(b[i], b[i + 1], c.x, c.y) < 18.0:
			return true
		i += 5
	return false


func _draw_goal(lv: Dictionary) -> void:
	var g: Dictionary = lv["goal"]
	var c := Vector2(g["x"], g["y"])
	var r: float = g["r"]
	for dir in [1.0, -1.0]:                         # 반대로 도는 두 겹 마름모
		var a: float = (0.0 if reduce_motion else _t * 0.7 * dir)
		var pts := PackedVector2Array()
		for i in 4:
			pts.append(c + Vector2(cos(a + TAU * float(i) / 4.0),
				sin(a + TAU * float(i) / 4.0)) * r * 0.62)
		DrawLib.line(self, pts, Palette.GOAL, view_scale, 0.95, true)
	if reduce_motion:
		DrawLib.circle(self, c, r, Palette.GOAL, view_scale, 0.35)
		return
	var u: float = fposmod(_t / 1.5, 1.0)           # 바깥으로 퍼지는 원
	DrawLib.circle(self, c, r * (0.6 + u * 0.75), Palette.GOAL, view_scale, (1.0 - u) * 0.55)


# 진행 방향 4유닛 짧은 선 (§12.3)
func _draw_bullets() -> void:
	var b := session.sim.bullets()
	var i := 0
	while i < b.size():
		var p := Vector2(b[i], b[i + 1])
		var v := Vector2(b[i + 2], b[i + 3])
		if v.length_squared() > 0.0001:
			DrawLib.line(self, PackedVector2Array([p, p - v.normalized() * 4.0]),
				Palette.DANGER, view_scale)
		i += 5


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
		return                                      # 비행 중에는 눈금을 빼서 궤적을 가리지 않는다

	for d in range(-90, 91, 5):                     # 5° · 15° 눈금
		var a: float = pad + deg_to_rad(float(d))
		var major: bool = d % 15 == 0
		var dir := Vector2(cos(a), sin(a))
		DrawLib.line(self, PackedVector2Array([
			c + dir * DOME_DRAW_R, c + dir * (DOME_DRAW_R + (6.0 if major else 3.0))]),
			Palette.GRAVITY, view_scale,
			(0.75 if aiming else 0.34) * (1.0 if major else 0.45))

	for a in [pad - arc, pad + arc]:                # 걸을 수 있는 끝
		var dir := Vector2(cos(a), sin(a))
		DrawLib.line(self, PackedVector2Array([
			c + dir * (DOME_DRAW_R - 4.0), c + dir * (DOME_DRAW_R + 9.0)]),
			Palette.GRAVITY, view_scale, 0.8 if aiming else 0.4)


func _draw_preview() -> void:
	if _preview.is_empty():
		return
	var pts: PackedFloat64Array = _preview["points"]
	if pts.size() < 2:
		return
	# 0.05초 간격 점. 바깥으로 흐르게 위상을 민다 (§12.3).
	var spacing := 12
	var phase: int = 0 if reduce_motion else int(fposmod(_t * 34.0, float(spacing)))
	var n: int = pts.size() / 2
	var size: float = maxf(Dp.px(1.2) / view_scale, 1.4)
	var i := phase
	while i < n:
		draw_circle(Vector2(pts[i * 2], pts[i * 2 + 1]), size,
			Color(Palette.GOAL, 0.9 * (1.0 - float(i) / float(n) * 0.75)))
		i += spacing
	if _preview["outcome"] != "":                   # 충돌 예측 지점에 ×
		var e := Vector2(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1])
		DrawLib.line(self, PackedVector2Array([e + Vector2(-5, -5), e + Vector2(5, 5)]),
			Palette.DANGER, view_scale)
		DrawLib.line(self, PackedVector2Array([e + Vector2(-5, 5), e + Vector2(5, -5)]),
			Palette.DANGER, view_scale)


# 길이 14 · 폭 10, 뒷변이 안쪽으로 파인 아스테로이드식 삼각형 (§12.3)
const SHIP_HULL := [Vector2(9, 0), Vector2(-6, -5), Vector2(-3, 0), Vector2(-6, 5)]


func _draw_ship() -> void:
	var p := session.ship_pos()
	var c := Vector2(p[0], p[1])
	var a := session.ship_heading()

	if session.state == Session.ENDING:
		var u := session.end_progress()
		if session.outcome == "win":
			_draw_arrival(c, a, u)
		else:
			_draw_burst(c, a, u)
		return
	_hull(c, a, 1.0, 1.0)


func _hull(c: Vector2, a: float, k: float, alpha: float) -> void:
	var pts := PackedVector2Array()
	for v in SHIP_HULL:
		pts.append(c + ((v as Vector2) * k).rotated(a))
	DrawLib.line(self, pts, Palette.LINE, view_scale, alpha, true)


# §12.3 도착: 우주선이 목적지 중심으로 빨려 들어가며 작아지고, 목적지 원이 크게 한 번 퍼짐
func _draw_arrival(c: Vector2, a: float, u: float) -> void:
	var g: Dictionary = session.level["goal"]
	var target := Vector2(g["x"], g["y"])
	var e: float = u * u                            # 뒤로 갈수록 빠르게 빨려 든다
	_hull(c.lerp(target, e), a + u * 2.0, 1.0 - u, 1.0 - u * 0.5)
	DrawLib.circle(self, target, float(g["r"]) * (1.0 + u * 2.4),
		Palette.GOAL, view_scale, 1.0 - u)


# §12.3 폭발: 우주선을 이루던 선분과 파편 선 7개가 회전하며 흩어짐
func _draw_burst(c: Vector2, a: float, u: float) -> void:
	var n := SHIP_HULL.size()
	for i in n:
		var p0: Vector2 = (SHIP_HULL[i] as Vector2).rotated(a)
		var p1: Vector2 = (SHIP_HULL[(i + 1) % n] as Vector2).rotated(a)
		var mid := (p0 + p1) * 0.5
		var away := mid.normalized() if mid.length_squared() > 0.01 else Vector2.RIGHT
		var o := c + mid + away * u * 26.0
		var spin := u * 2.4
		DrawLib.line(self, PackedVector2Array([
			o + (p0 - mid).rotated(spin), o + (p1 - mid).rotated(spin)]),
			Palette.LINE, view_scale, 1.0 - u)

	var r := Mulberry32.new(_level_id.hash() ^ 0x5F5F)
	for i in 7:
		var ang := r.next() * TAU
		var d := u * r.range_f(16.0, 44.0)
		var len := r.range_f(4.0, 11.0)
		var p := c + Vector2(cos(ang), sin(ang)) * d
		var a2 := ang + u * 3.0
		DrawLib.line(self, PackedVector2Array([p, p + Vector2(cos(a2), sin(a2)) * len]),
			Palette.LINE, view_scale, (1.0 - u) * 0.8)


func _body_xy(b: Dictionary, t: float) -> Vector2:
	if not b.has("orbit"):
		return Vector2(b["x"], b["y"])
	var o: Dictionary = b["orbit"]
	var a: float = o["phase"] + 2.0 * PI * t / o["period"]
	return Vector2(o["cx"] + o["rad"] * cos(a), o["cy"] + o["rad"] * sin(a))


static func _dist(ax: float, ay: float, bx: float, by: float) -> float:
	var dx := ax - bx
	var dy := ay - by
	return sqrt(dx * dx + dy * dy)
