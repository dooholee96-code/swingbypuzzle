# 개발용 가짜 광고. docs/PLAN.md §14.2
#
# 실행 인자로 예외 흐름을 재현한다.
#   --ads=fail      항상 실패
#   --ads=dismiss   항상 중간에 닫힘
#   --ads=slow      5초 지연
#
# 화면에 "테스트 광고" 오버레이를 띄우는 것은 M9 에서 붙인다.
# M3 는 인터페이스와 흐름만 둔다.
class_name AdMockProvider
extends AdProvider

const NORMAL_DELAY := 2.0
const SLOW_DELAY := 5.0

var mode := ""               # "" | "fail" | "dismiss" | "slow"


func _init() -> void:
	for a in OS.get_cmdline_args():
		if a.begins_with("--ads="):
			mode = a.substr(6)


func init_ads() -> void:
	print("[광고] Mock 제공자로 시작합니다. mode=%s" % ("기본" if mode == "" else mode))


func is_rewarded_ready() -> bool:
	return mode != "fail"


func is_interstitial_ready() -> bool:
	return mode != "fail"


func show_rewarded(placement: String) -> String:
	if mode == "fail":
		return FAILED
	await _wait()
	print("[광고] 보상형 %s → %s" % [placement, "닫힘" if mode == "dismiss" else "보상"])
	return DISMISSED if mode == "dismiss" else REWARDED


func show_interstitial() -> String:
	if mode == "fail":
		return FAILED
	await _wait()
	return SHOWN


func _wait() -> void:
	var tree := Engine.get_main_loop() as SceneTree
	if tree == null:
		return
	await tree.create_timer(SLOW_DELAY if mode == "slow" else NORMAL_DELAY).timeout
