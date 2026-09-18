# 진동. docs/PLAN.md §15.2
#
# 자동 로드(Haptics). 짧게 두 번 같은 패턴을 만들려면 타이머가 필요해
# 정적 클래스가 아니라 노드로 둔다.
#
# iOS 는 vibrate_handheld 의 동작이 제한적이다. M12 에서 실기기로 확인한다.
extends Node

const LAUNCH_MS := 20        # 발사: 가벼운 충격
const OVER_MS := 60          # 게임오버: 강한 충격
const WIN_MS := 24           # 도착: 짧게 2회

var enabled := true          # 설정에서 끌 수 있다 (§13.6). M6 에서 저장과 연결한다.


func launch() -> void:
	_buzz(LAUNCH_MS)


func game_over() -> void:
	_buzz(OVER_MS)


func arrived() -> void:
	_buzz(WIN_MS)
	await get_tree().create_timer(0.09).timeout
	_buzz(WIN_MS)


func _buzz(ms: int) -> void:
	if not enabled:
		return
	if OS.has_feature("mobile"):
		Input.vibrate_handheld(ms)
