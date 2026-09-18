# 장식용 난수. docs/PLAN.md §5.8
#
# 부록 A 와 같은 mulberry32 여야 한다. 값이 달라지면 소행성 모양과 별 배치가
# 참조 구현·데모와 어긋난다. 기준값은 Node 로 실제 실행해 얻은 것이다.
extends GdUnitTestSuite

# mulberry32(1) 의 처음 여섯 값
const SEED1 := [
	0.6270739406, 0.0027357212, 0.5274470400,
	0.9810509675, 0.9683778982, 0.2811035030,
]


func test_부록A의_mulberry32와_같은_값을_낸다() -> void:
	var r := Mulberry32.new(1)
	for i in SEED1.size():
		assert_float(r.next()).override_failure_message(
			"seed 1 의 %d번째 값이 다릅니다" % i).is_equal_approx(SEED1[i], 1e-9)


func test_같은_시드는_같은_수열을_낸다() -> void:
	var a := Mulberry32.new(42)
	var b := Mulberry32.new(42)
	for i in 20:
		assert_float(b.next()).is_equal(a.next())


func test_결과가_0이상_1미만이다() -> void:
	var r := Mulberry32.new(12345)
	for i in 500:
		var v := r.next()
		assert_float(v).is_between(0.0, 1.0)
		assert_bool(v < 1.0).is_true()


func test_range_f가_범위_안이다() -> void:
	var r := Mulberry32.new(7)
	for i in 200:
		assert_float(r.range_f(0.75, 1.15)).is_between(0.75, 1.15)
