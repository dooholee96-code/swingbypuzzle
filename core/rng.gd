# 장식용 시드 난수. docs/PLAN.md §5.8
#
# **시뮬레이션 결과에 쓰지 않는다.** 소행성 모양, 별 배경처럼 매 실행
# 같아야 하는 장식에만 쓴다. Godot 의 RandomNumberGenerator 전역 상태에
# 기대면 실행마다 모양이 달라진다.
#
# 부록 A 와 같은 mulberry32 다. GDScript 정수는 64비트이므로 32비트 연산을
# 마스크로 흉내 낸다.
class_name Mulberry32
extends RefCounted

const M := 0xFFFFFFFF

var _s: int


func _init(seed_value: int = 1) -> void:
	_s = seed_value & M


# 0.0 이상 1.0 미만
func next() -> float:
	_s = (_s + 0x6D2B79F5) & M
	var a := _s
	var t := _imul(a ^ (a >> 15), 1 | a)
	t = ((t + _imul(t ^ (t >> 7), 61 | t)) & M) ^ t
	return float((t ^ (t >> 14)) & M) / 4294967296.0


func range_f(lo: float, hi: float) -> float:
	return lo + (hi - lo) * next()


# 32비트 곱셈 (JS 의 Math.imul).
#
# a * b 를 그대로 하면 최대 64비트가 되어 GDScript 의 int64 에서 부호 오버플로가
# 난다. 16비트씩 쪼개 48비트 안에서 끝낸다. 결과는 JS 와 같다(테스트로 확인).
#   a*b mod 2^32 = (a_lo*b + ((a_hi*b) mod 2^16) * 2^16) mod 2^32
static func _imul(a: int, b: int) -> int:
	var lo := a & 0xFFFF
	var hi := (a >> 16) & 0xFFFF
	return (lo * b + (((hi * b) & 0xFFFF) << 16)) & M
