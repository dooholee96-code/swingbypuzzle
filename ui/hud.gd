# 플레이 중 HUD 와 결과 표시. docs/PLAN.md §13.3, §13.4
#
# M2 는 최소한만 둔다. 타이틀·단계 선택·설정과 제대로 된 결과 화면은 M6 다.
# 문구는 §13 의 것을 그대로 쓴다 (§0.6).
extends CanvasLayer

signal retry_pressed

# §13.4 결과 화면 문구
const RESULT := {
	"win":    ["도착했어요", ""],
	"planet": ["행성에 충돌했어요", "조금 더 바깥쪽으로 스쳐 지나가 보세요"],
	"hole":   ["블랙홀에 빨려 들어갔어요", "블랙홀 중심에서 거리를 더 두세요"],
	"shot":   ["외계인 포격에 맞았어요", "붉은 원 안에 머무는 시간을 줄여 보세요"],
	"ufo":    ["외계인 우주선과 충돌했어요", "발사 각도를 조금 바꿔 보세요"],
	"rock":   ["소행성에 부딪혔어요", "발사 각도를 조금 바꿔 보세요"],
	"wall":   ["맵 경계에 부딪혔어요", "궤도가 덜 꺾였어요. 행성에 조금 더 가까이 지나가 보세요"],
	"drift":  ["30초 안에 도착하지 못했어요", "행성 주위를 맴돌지 않게 각도를 바꿔 보세요"],
}

var session: Session = null
var haptics := true

@onready var stage: Label = $Root/Top/Stage
@onready var retry: Button = $Root/Top/Retry
@onready var angle_label: Label = $Root/Angle
@onready var hint: Label = $Root/Hint
@onready var result: PanelContainer = $Root/Result
@onready var result_title: Label = $Root/Result/Box/Title
@onready var result_tip: Label = $Root/Result/Box/Tip


func _ready() -> void:
	retry.pressed.connect(func(): retry_pressed.emit())
	result.hide()
	result.gui_input.connect(_on_result_input)
	_apply_safe_area()
	get_viewport().size_changed.connect(_apply_safe_area)


# 노치·홈 인디케이터를 피한다 (§13). 데스크톱에서는 여백이 0 이다.
func _apply_safe_area() -> void:
	var safe := DisplayServer.get_display_safe_area()
	var win := DisplayServer.window_get_size()
	if win.x <= 0 or win.y <= 0 or safe.size.x <= 0:
		return
	var top := float(safe.position.y)
	var bottom := float(win.y - (safe.position.y + safe.size.y))
	var left := float(safe.position.x)
	var right := float(win.x - (safe.position.x + safe.size.x))
	var root: Control = $Root
	root.offset_left = left
	root.offset_top = top
	root.offset_right = -right
	root.offset_bottom = -bottom


func refresh() -> void:
	if session == null or session.level.is_empty():
		return
	stage.text = "%s %s" % [session.level["id"], session.level["name"]]
	# 조준 중 화면 하단에 표시 각도 (§13.3). 0° = 위쪽 (§4).
	angle_label.text = "각도 %.1f°" % AimInput.ui_angle(session.angle) \
		if session.state == Session.AIMING else ""
	# 첫 시도의 ready 상태에서만 레벨 hint (§13.3)
	hint.text = str(session.level.get("hint", "")) \
		if session.first_try and session.state == Session.READY else ""


func show_result() -> void:
	if result.visible:
		return
	var pair: Array = RESULT.get(session.outcome, ["비행이 끝났어요", ""])
	result_title.text = pair[0]
	result_title.add_theme_color_override("font_color",
		Palette.GOAL if session.outcome == "win" else Palette.DANGER)
	result_tip.text = "비행 시간 %.1f초 · 시도 %d회" % [session.flight_seconds(), session.attempts] \
		if session.outcome == "win" else pair[1]
	result.show()


func hide_result() -> void:
	result.hide()


# 실패 결과는 화면 아무 곳이나 탭해도 재시도 (§13.4)
func _on_result_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch and event.pressed:
		retry_pressed.emit()
