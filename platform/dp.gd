# 화면 단위 환산. docs/PLAN.md §10.0
#
# §10 의 px 기준값(26, 8, 44 …)은 CSS 픽셀 ≈ 안드로이드 dp 기준이다.
# Godot 의 InputEventScreenTouch.position 은 실제 기기 픽셀이라
# 그대로 비교하면 고DPI 기기에서 기준이 몇 배로 좁아진다.
class_name Dp
extends RefCounted

static var _cached := 0.0


# 1 dp 가 몇 기기 픽셀인가.
static func scale() -> float:
	if _cached > 0.0:
		return _cached
	var s := DisplayServer.screen_get_scale()
	if s <= 0.0:
		var dpi := DisplayServer.screen_get_dpi()
		s = dpi / 160.0 if dpi > 0 else 1.0
	_cached = s if s > 0.0 else 1.0
	return _cached


# dp 값을 기기 픽셀로. §10 의 모든 px 기준값은 이걸 거쳐 쓴다.
static func px(v: float) -> float:
	return v * scale()
