# 성능 관문. docs/PLAN.md §17 M0, §8.9
#
# 1-1 전수 스캔(1440각도) 1회 시간을 재고, 결과가 §6.2 실측값과
# 일치하는지 함께 확인한다. 속도와 정확성을 한 번에 본다.
#
#   godot --headless --path . --script res://tools/bench.gd
extends SceneTree

const LEVEL_PATH := "res://levels/data/1-1.json"

# §6.2 실측 표 (부록 C 재현 결과). 이 값을 코드에 맞춰 고치지 않는다(§0.4).
const EXPECT_RUN := [-69.25, -62.5]
const EXPECT_WIDTH := 7.00
const EXPECT_COUNTS := { "wall": 1219, "rock": 128, "planet": 65, "win": 28 }


func _initialize() -> void:
	var level := _load_level(LEVEL_PATH)
	if level.is_empty():
		push_error("레벨을 읽지 못했습니다: %s" % LEVEL_PATH)
		quit(1)
		return

	print("스윙바이 성능 관문 (§17 M0)")
	print("  단계: %s %s   각도 %d개 (%.2f° 간격)" % [
		level["id"], level["name"],
		int((Scan.TO - Scan.FROM) / Scan.STEP), Scan.STEP])
	print("")

	var t0 := Time.get_ticks_usec()
	var result := Scan.angles(level, 0)
	var elapsed := (Time.get_ticks_usec() - t0) / 1_000_000.0

	var ok := _report_correctness(result)
	print("")
	print("  전수 스캔 1회: %.3f초   (Node 참조 구현 기준선 약 0.2초)" % elapsed)
	print("")
	_report_gate(elapsed)

	quit(0 if ok else 1)


func _load_level(path: String) -> Dictionary:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	return parsed if parsed is Dictionary else {}


# §6.2와 일치하는지 확인한다. 성공 구간만 맞고 결과별 개수가 다르면
# 경계 근처 판정이 어긋난 것이다(부록 D.1 점검표).
func _report_correctness(result: Dictionary) -> bool:
	var runs: Array = result["runs"]
	var counts: Dictionary = result["counts"]
	var ok := true

	var main_runs: Array = []
	for r in runs:
		if Scan.width_of(r) >= 1.0:
			main_runs.append(r)

	print("  [정확성] §6.2 실측값과 대조")
	if main_runs.size() == 1 \
			and absf(main_runs[0][0] - EXPECT_RUN[0]) < 1e-9 \
			and absf(main_runs[0][1] - EXPECT_RUN[1]) < 1e-9:
		print("    주 구간   %.2f..%.2f (%.2f°)   기대 %.2f..%.2f (%.2f°)   일치" % [
			main_runs[0][0], main_runs[0][1], Scan.width_of(main_runs[0]),
			EXPECT_RUN[0], EXPECT_RUN[1], EXPECT_WIDTH])
	else:
		ok = false
		print("    주 구간   %s   기대 %.2f..%.2f   불일치" % [
			str(main_runs), EXPECT_RUN[0], EXPECT_RUN[1]])

	for key in EXPECT_COUNTS:
		var got := int(counts.get(key, 0))
		var want: int = EXPECT_COUNTS[key]
		if got == want:
			print("    %-8s %5d   기대 %5d   일치" % [key, got, want])
		else:
			ok = false
			print("    %-8s %5d   기대 %5d   불일치" % [key, got, want])

	for key in counts:
		if not EXPECT_COUNTS.has(key):
			ok = false
			print("    %-8s %5d   기대 없음   불일치" % [key, int(counts[key])])

	if not ok:
		print("")
		print("    이식이 어긋났습니다. §2.1(정밀도)과 §5.4(연산 순서)를 먼저 의심하고,")
		print("    docs/reference/check.js와 값을 단계별로 대조하세요(부록 C).")
	return ok


# §17 M0의 판단표
func _report_gate(elapsed: float) -> void:
	print("  [관문] §17 M0 판단")
	if elapsed <= 2.0:
		print("    ≤ 2초 — GDScript로 그대로 진행합니다.")
	elif elapsed <= 5.0:
		print("    2~5초 — 진행하되 다음을 확정합니다:")
		print("      · 에디터 실시간 검증은 1° 대략 스캔 우선 + 600ms 디바운스 (§8.7)")
		print("      · 레시피 seedCount 기본 500 유지 (§8.3)")
	else:
		print("    > 5초 — 멈추고 사용자와 상의해야 합니다.")
		print("      core/만 GDExtension(Rust/C++) 또는 C#으로 분리할지 결정 (§8.9)")
