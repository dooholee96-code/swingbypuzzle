# 물리 기본 성질. docs/PLAN.md §16.5
extends GdUnitTestSuite

const EPS := 1e-12


func test_중력_범위_밖에서는_가속도가_0이다() -> void:
	var sim := Sim.new()
	var planet := { "x": 0.0, "y": 0.0, "r": 24.0, "g": 800.0, "R": 170.0, "sides": 11 }
	var gravs := [planet]

	# r == R 경계도 "밖"이다(§5.3: r ≥ R 이면 0).
	var at_edge := sim.accel_at(gravs, 170.0, 0.0, 0.0)
	assert_float(at_edge[0]).is_equal_approx(0.0, EPS)
	assert_float(at_edge[1]).is_equal_approx(0.0, EPS)

	var outside := sim.accel_at(gravs, 300.0, 0.0, 0.0)
	assert_float(outside[0]).is_equal_approx(0.0, EPS)
	assert_float(outside[1]).is_equal_approx(0.0, EPS)


func test_반경_절반에서_세기가_g의_4분의_1이다() -> void:
	# §5.3: 크기 = g × (1 − r/R)². r = R/2 이면 g × 0.25.
	var sim := Sim.new()
	var planet := { "x": 0.0, "y": 0.0, "r": 24.0, "g": 800.0, "R": 170.0, "sides": 11 }
	var a := sim.accel_at([planet], 85.0, 0.0, 0.0)

	var magnitude := sqrt(a[0] * a[0] + a[1] * a[1])
	assert_float(magnitude).is_equal_approx(800.0 * 0.25, 1e-9)
	# 방향은 우주선 → 중력원 중심이므로 −x 쪽이다.
	assert_float(a[0]).is_less(0.0)
	assert_float(a[1]).is_equal_approx(0.0, EPS)


func test_공전_행성은_한_주기_뒤_같은_자리로_돌아온다() -> void:
	var sim := Sim.new()
	var planet := {
		"x": 0.0, "y": 0.0, "r": 22.0, "g": 700.0, "R": 110.0, "sides": 7,
		"orbit": { "cx": 190.0, "cy": 240.0, "rad": 70.0, "period": 8.0, "phase": 0.0 },
	}
	var at0 := sim.body_pos_at(planet, 0.0)
	var at_period := sim.body_pos_at(planet, 8.0)

	assert_float(at_period[0]).is_equal_approx(at0[0], 1e-9)
	assert_float(at_period[1]).is_equal_approx(at0[1], 1e-9)


func test_고정_행성은_시각과_무관하게_같은_자리다() -> void:
	var sim := Sim.new()
	var planet := { "x": 275.0, "y": 340.0, "r": 24.0, "g": 800.0, "R": 170.0, "sides": 11 }
	var at0 := sim.body_pos_at(planet, 0.0)
	var at5 := sim.body_pos_at(planet, 5.0)

	assert_float(at0[0]).is_equal_approx(275.0, EPS)
	assert_float(at0[1]).is_equal_approx(340.0, EPS)
	assert_float(at5[0]).is_equal_approx(275.0, EPS)
	assert_float(at5[1]).is_equal_approx(340.0, EPS)


func test_여러_중력원의_가속도는_단순_합산이다() -> void:
	var sim := Sim.new()
	var a := { "x": 0.0, "y": 0.0, "r": 24.0, "g": 800.0, "R": 170.0, "sides": 11 }
	var b := { "x": 0.0, "y": 200.0, "r": 24.0, "g": 800.0, "R": 170.0, "sides": 11 }

	var only_a := sim.accel_at([a], 50.0, 100.0, 0.0)
	var only_b := sim.accel_at([b], 50.0, 100.0, 0.0)
	var both := sim.accel_at([a, b], 50.0, 100.0, 0.0)

	assert_float(both[0]).is_equal_approx(only_a[0] + only_b[0], 1e-9)
	assert_float(both[1]).is_equal_approx(only_a[1] + only_b[1], 1e-9)
