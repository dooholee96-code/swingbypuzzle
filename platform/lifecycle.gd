# 앱 생명주기와 뒤로 버튼. docs/PLAN.md §15.2
#
# 자동 로드(Lifecycle)다. class_name 을 붙이면 자동 로드 이름과 충돌한다.
#
# 안드로이드에서는 PAUSED 와 FOCUS_OUT 이 함께 오고 데스크톱에서는 FOCUS_OUT 만
# 온다. 둘을 같은 뜻으로 보되 중복 발신은 막는다.
extends Node

signal paused
signal resumed
signal back_requested        # 안드로이드 뒤로 버튼

var is_paused := false


func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_APPLICATION_FOCUS_OUT:
			_set_paused(true)
		NOTIFICATION_APPLICATION_RESUMED, NOTIFICATION_APPLICATION_FOCUS_IN:
			_set_paused(false)
		NOTIFICATION_WM_GO_BACK_REQUEST:
			# project.godot 의 quit_on_go_back 이 false 여야 여기까지 온다.
			back_requested.emit()


func _set_paused(v: bool) -> void:
	if is_paused == v:
		return
	is_paused = v
	if v:
		paused.emit()
	else:
		resumed.emit()
