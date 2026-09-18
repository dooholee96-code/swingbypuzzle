# 광고 제공자 인터페이스. docs/PLAN.md §14.2
#
# GDScript 에는 인터페이스가 없으므로, 기본 구현이 모두 "실패"를 돌려주는
# 베이스 클래스로 둔다. 광고를 불러오지 못해도 게임은 완전히 동작해야 한다(§14.1).
class_name AdProvider
extends RefCounted

# RewardPlacement (§14.2)
const HINT_PREVIEW := "hint_preview"
const HINT_DIRECTION := "hint_direction"
const SKIP := "skip"

# show_rewarded 결과
const REWARDED := "rewarded"
const DISMISSED := "dismissed"
const FAILED := "failed"

# show_interstitial 결과
const SHOWN := "shown"

# 호출 측은 반드시 이 시간 안에 결과를 못 받으면 FAILED 로 처리한다 (§14.2).
const TIMEOUT_SEC := 10.0


func init_ads() -> void:            # 동의 절차 포함 (§14.5)
	pass


func is_rewarded_ready() -> bool:
	return false


func show_rewarded(_placement: String) -> String:
	return FAILED


func is_interstitial_ready() -> bool:
	return false


func show_interstitial() -> String:
	return FAILED


func can_open_privacy_options() -> bool:
	return false


func open_privacy_options() -> void:
	pass
