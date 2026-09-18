# 그리기 헬퍼. docs/PLAN.md §12.1
#
# 발광은 선을 두 번 그려 만든다. 굵고 옅은 선 위에 가는 원색 선.
# shadowBlur 에 해당하는 효과나 WorldEnvironment 글로우는 쓰지 않는다 —
# 저사양 안드로이드에서 후처리 비용이 크다(§15.3).
class_name DrawLib
extends RefCounted

# 설정의 발광 효과가 "낮음"이면 바깥 선을 생략한다(§13.6). M6 에서 설정과 연결한다.
static var glow := true


# 굵기는 **월드 유닛**으로 돌려준다. 필드는 카메라가 확대하는 월드 좌표에
# 그리므로, 여기서 화면 px 로 계산하면 배율이 두 번 곱해진다.
# scale 은 화면에서 최소 dp(1) 을 보장하기 위한 하한 계산에만 쓴다.
static func _w(scale: float, units: float) -> float:
	return maxf(Dp.px(1.0) / maxf(scale, 0.0001), units)


# 이어진 선. closed 면 마지막 점과 첫 점을 잇는다.
static func line(ci: CanvasItem, pts: PackedVector2Array, color: Color,
		scale: float, alpha := 1.0, closed := false) -> void:
	if pts.size() < 2:
		return
	var p := pts
	if closed:
		p = pts.duplicate()
		p.append(pts[0])
	if glow:
		ci.draw_polyline(p, Color(color, color.a * alpha * Palette.GLOW_ALPHA),
			_w(scale, Palette.GLOW_WIDTH), true)
	ci.draw_polyline(p, Color(color, color.a * alpha),
		_w(scale, Palette.WIDTH), true)


static func _arc_points(center: Vector2, radius: float, from: float, to: float,
		segments: int) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in segments + 1:
		var a: float = from + (to - from) * float(i) / float(segments)
		pts.append(center + Vector2(cos(a), sin(a)) * radius)
	return pts


static func arc(ci: CanvasItem, center: Vector2, radius: float, from: float, to: float,
		color: Color, scale: float, alpha := 1.0) -> void:
	var seg: int = clampi(int(radius * absf(to - from) / 6.0), 8, 96)
	line(ci, _arc_points(center, radius, from, to, seg), color, scale, alpha)


static func circle(ci: CanvasItem, center: Vector2, radius: float,
		color: Color, scale: float, alpha := 1.0) -> void:
	arc(ci, center, radius, 0.0, TAU, color, scale, alpha)


# 점선 원. §12.3 의 중력 범위 표시에 쓴다(대시 4 · 간격 6 유닛).
static func dashed_circle(ci: CanvasItem, center: Vector2, radius: float,
		color: Color, scale: float, alpha := 1.0,
		dash := 4.0, gap := 6.0) -> void:
	if radius <= 0.0:
		return
	var step: float = (dash + gap) / radius             # 라디안. 전부 월드 유닛이다.
	if step <= 0.0001:
		return
	var span: float = dash / radius
	var a := 0.0
	var col := Color(color, color.a * alpha)
	var w := _w(scale, Palette.WIDTH)
	while a < TAU:
		var seg := _arc_points(center, radius, a, minf(a + span, TAU), 3)
		ci.draw_polyline(seg, col, w, true)
		a += step


# 타원 호. 기울여 그릴 수 있다. §12.3 의 행성 고리와 외계인 실루엣.
static func ellipse_arc(ci: CanvasItem, center: Vector2, rx: float, ry: float,
		rot: float, from: float, to: float, color: Color, scale: float,
		alpha := 1.0) -> void:
	var seg: int = clampi(int(maxf(rx, ry) * absf(to - from) / 6.0), 8, 96)
	var pts := PackedVector2Array()
	var cr := cos(rot)
	var sr := sin(rot)
	for i in seg + 1:
		var a: float = from + (to - from) * float(i) / float(seg)
		var x: float = cos(a) * rx
		var y: float = sin(a) * ry
		pts.append(center + Vector2(x * cr - y * sr, x * sr + y * cr))
	line(ci, pts, color, scale, alpha)


# 정 n 각형 윤곽. §12.3 의 행성.
static func ngon(ci: CanvasItem, center: Vector2, radius: float, sides: int,
		rot: float, color: Color, scale: float, alpha := 1.0) -> void:
	if sides < 3:
		return circle(ci, center, radius, color, scale, alpha)
	var pts := PackedVector2Array()
	for i in sides:
		var a: float = rot + TAU * float(i) / float(sides)
		pts.append(center + Vector2(cos(a), sin(a)) * radius)
	line(ci, pts, color, scale, alpha, true)
