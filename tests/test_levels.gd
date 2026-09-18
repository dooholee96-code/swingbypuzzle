# 레벨 회귀. docs/PLAN.md §16.5
#
# 기준값은 부록 A(검증 완료 참조 구현)로 확인된 값이고
# §6.2의 실측 표에 기록돼 있다. **테스트 기준값을 코드에 맞춰 고치지 않는다(§0.4).**
extends GdUnitTestSuite

var _loader := LevelLoader.new()

# §16.5의 회귀 표
const CASES := [
	{ "id": "1-1", "angle": -66.0,  "step": 0,   "want": "win" },
	{ "id": "1-4", "angle": -134.0, "step": 0,   "want": "win" },
	{ "id": "2-1", "angle": -75.5,  "step": 0,   "want": "win" },
	{ "id": "3-1", "angle": -30.0,  "step": 0,   "want": "win" },
	{ "id": "4-1", "angle": -44.0,  "step": 800, "want": "win" },
	# 4-1은 t=0에 쏘면 공전 행성에 충돌한다. 기다렸다 쏘는 것이 의도다(§6.2).
	{ "id": "4-1", "angle": -44.0,  "step": 0,   "want": "planet" },
	{ "id": "5-1", "angle": -12.0,  "step": 0,   "want": "win" },
]

# §6.2 실측 표. 주 구간의 폭(°)과 그 구간을 재는 발사 스텝.
const WINDOWS := [
	{ "id": "1-1", "step": 0,   "width": 7.00,  "from": -69.25,  "to": -62.5 },
	{ "id": "1-4", "step": 0,   "width": 11.25, "from": -139.25, "to": -128.25 },
	{ "id": "2-1", "step": 0,   "width": 9.75,  "from": -80.25,  "to": -70.75 },
	{ "id": "3-1", "step": 0,   "width": 7.00,  "from": -33.25,  "to": -26.5 },
	{ "id": "4-1", "step": 800, "width": 9.00,  "from": -48.25,  "to": -39.5 },
	{ "id": "5-1", "step": 0,   "width": 7.25,  "from": -15.5,   "to": -8.5 },
]
const WIDTH_TOLERANCE := 0.5


func _level(id: String) -> Dictionary:
	var lv := _loader.load_level(id)
	assert_array(_loader.errors) \
		.override_failure_message("%s 스키마 오류: %s" % [id, str(_loader.errors)]).is_empty()
	return lv


func test_기준_정답_각도가_표대로_나온다() -> void:
	var sim := Sim.new()
	for c in CASES:
		var level := _level(c["id"])
		var got := sim.simulate(level, c["angle"], c["step"])
		assert_str(got).override_failure_message(
			"%s 각도 %s launch_step %d → %s (기대 %s)" % [
				c["id"], c["angle"], c["step"], got, c["want"]]
		).is_equal(c["want"])


func test_성공_구간_폭이_실측값과_맞는다() -> void:
	for w in WINDOWS:
		var level := _level(w["id"])
		var result := Scan.angles(level, w["step"])
		var runs: Array = result["runs"]

		# 주 구간 = 폭 1° 이상인 구간. 그보다 좁은 것은 §8.5 규칙 2가 허용하는 우연이다.
		var main: Array = []
		for r in runs:
			if Scan.width_of(r) >= 1.0:
				main.append(r)

		assert_int(main.size()).override_failure_message(
			"%s 주 구간이 %d개입니다 (1개여야 함): %s" % [w["id"], main.size(), str(main)]
		).is_equal(1)

		var width := Scan.width_of(main[0])
		assert_float(width).override_failure_message(
			"%s 성공 폭 %.2f° (기대 %.2f° ±%.1f)" % [w["id"], width, w["width"], WIDTH_TOLERANCE]
		).is_between(w["width"] - WIDTH_TOLERANCE, w["width"] + WIDTH_TOLERANCE)

		assert_float(main[0][0]).override_failure_message(
			"%s 구간 시작 %s (기대 %s)" % [w["id"], main[0][0], w["from"]]).is_equal(w["from"])
		assert_float(main[0][1]).override_failure_message(
			"%s 구간 끝 %s (기대 %s)" % [w["id"], main[0][1], w["to"]]).is_equal(w["to"])


func test_등록된_모든_단계의_정답이_win이다() -> void:
	# 빠른 검사다. 전수 스캔은 validate가 담당한다(§16.3).
	var sim := Sim.new()
	for id in Chapters.all_ids():
		var level := _level(id)
		var sol: Dictionary = level["meta"]["solution"]
		var got := sim.simulate(level, sol["angle"], sol["launch_step"])
		assert_str(got).override_failure_message(
			"%s meta.solution이 %s로 끝납니다" % [id, got]).is_equal("win")


func test_등록된_모든_단계가_스키마를_통과한다() -> void:
	var all := _loader.load_all()
	assert_array(_loader.errors) \
		.override_failure_message("스키마 오류: %s" % str(_loader.errors)).is_empty()
	assert_int(all.size()).is_equal(Chapters.all_ids().size())


# §8.5 규칙 8(출발점이 중력 범위 밖)은 여기가 아니라 검증기(§16.3 validate, M7)의 몫이다.
# M1 검증에서 4-1이 이 규칙을 위반하는 것을 확인했다 — §6.2의 주석 참조.
# 규칙을 어떻게 다듬을지 정한 뒤 M7에서 validate에 넣는다.
