# 부트스트랩과 화면 전환, 뒤로 버튼 라우팅. docs/PLAN.md §9.1, §15.2
#
# Title → LevelSelect → Play → Result 흐름은 M6 에서 붙인다. M3 는 Play 로 바로 간다.
#
# 뒤로 버튼(§15.2): 힌트 시트·결과 화면 닫기 → 플레이에서 단계 선택
# → 단계 선택에서 타이틀 → 타이틀에서 종료 확인.
# 지금은 Play 뿐이므로 "결과 닫기 → 종료 확인"까지만 동작한다.
extends Node

const PLAY := preload("res://scenes/play.tscn")

var _quit_dialog: ConfirmationDialog = null


func _ready() -> void:
	# 씬 교체는 add_child / queue_free 로 직접 한다 (§9.1).
	# change_scene_to_file 은 전환 중 상태를 들고 있을 수 없다.
	add_child(PLAY.instantiate())
	Lifecycle.back_requested.connect(_on_back)


func _on_back() -> void:
	if _quit_dialog != null and _quit_dialog.visible:
		_quit_dialog.hide()
		return
	# 화면이 뒤로 갈 곳을 스스로 처리했으면 거기서 끝난다.
	for child in get_children():
		if child.has_method("handle_back") and child.handle_back():
			return
	_confirm_quit()


func _confirm_quit() -> void:
	if _quit_dialog == null:
		_quit_dialog = ConfirmationDialog.new()
		_quit_dialog.dialog_text = "게임을 종료할까요?"      # §15.2
		_quit_dialog.ok_button_text = "종료"
		_quit_dialog.cancel_button_text = "계속하기"
		_quit_dialog.confirmed.connect(_quit)
		add_child(_quit_dialog)
	_quit_dialog.popup_centered()


func _quit() -> void:
	Save.flush()                       # 나가기 전에 확실히 기록한다 (§15.2)
	get_tree().quit()
