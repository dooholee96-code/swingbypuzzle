# 결정론과 예측선 일치. docs/PLAN.md §16.5, §5.7, §5.8
extends GdUnitTestSuite

var _loader := LevelLoader.new()


func _level(id: String) -> Dictionary:
	var lv := _loader.load_level(id)
	assert_array(_loader.errors).is_empty()
	return lv


func test_같은_조건으로_두_번_돌리면_결과와_스텝_수가_같다() -> void:
	for id in ["1-1", "4-1", "5-1"]:
		var level := _level(id)
		var angle: float = level["meta"]["solution"]["angle"]
		var step: int = level["meta"]["solution"]["launch_step"]

		var sim := Sim.new()
		var first := sim.simulate(level, angle, step)
		var first_steps := sim.last_steps
		var second := sim.simulate(level, angle, step)

		assert_str(second).override_failure_message("%s 결과가 달라졌습니다" % id).is_equal(first)
		assert_int(sim.last_steps).override_failure_message("%s 스텝 수가 달라졌습니다" % id).is_equal(first_steps)


func test_같은_레벨_객체를_공유해도_결과가_같다() -> void:
	# §5.5: 부록 A는 외계인에 _next를 얹지만, 우리는 상태에 둔다.
	# 레벨이 불변이어야 WorkerThreadPool 병렬 스캔에서 공유할 수 있다.
	var level := _level("5-1")   # 외계인 2기가 있는 단계
	var sim := Sim.new()
	var baseline := sim.simulate(level, -12.0, 0)

	# 사이에 다른 각도를 잔뜩 끼워 넣어도 원래 각도의 결과가 변하지 않아야 한다.
	for a in [-90.0, 0.0, 45.0, 170.0]:
		sim.simulate(level, a, 0)
	assert_str(sim.simulate(level, -12.0, 0)).is_equal(baseline)

	# 다른 Sim 인스턴스가 같은 레벨을 써도 마찬가지다.
	var other := Sim.new()
	assert_str(other.simulate(level, -12.0, 0)).is_equal(baseline)


func test_예측선이_실제_비행_경로_앞부분과_정확히_일치한다() -> void:
	# "보이는 대로 날아간다"가 이 게임의 신뢰 기반이다(§5.7).
	for id in ["1-1", "4-1", "5-1"]:
		var level := _level(id)
		var angle: float = level["meta"]["solution"]["angle"]
		var step: int = level["meta"]["solution"]["launch_step"]

		var sim := Sim.new()
		sim.record_path = true
		sim.simulate(level, angle, step)
		var actual := sim.last_path

		var pred: Dictionary = sim.predict(level, angle, step)
		var points: PackedFloat64Array = pred["points"]

		var n: int = mini(points.size(), actual.size())
		assert_int(n).override_failure_message("%s 비교할 점이 없습니다" % id).is_greater(0)
		for i in n:
			assert_float(points[i]) \
				.override_failure_message("%s 예측선 %d번째 좌표가 실제와 다릅니다" % [id, i]) \
				.is_equal(actual[i])


func test_예측선_길이가_단계의_preview_초에_맞는다() -> void:
	var level := _level("1-1")
	var sim := Sim.new()
	var pred: Dictionary = sim.predict(level, -66.0, 0)
	var points: PackedFloat64Array = pred["points"]

	var expected_steps := int(float(level["preview"]) / SwConsts.DT)
	# 충돌로 일찍 끝나지 않았다면 preview/DT 스텝만큼 나온다.
	if pred["outcome"] == "":
		assert_int(points.size() / 2).is_equal(expected_steps)
	else:
		assert_int(points.size() / 2).is_less_equal(expected_steps)
