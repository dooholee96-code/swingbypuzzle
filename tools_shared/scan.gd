# 각도 전수 스캔. docs/PLAN.md §8.4 2단계, §16.1
#
# M7에서 중력 범위 방문 비트마스크와 목적지 격자 평가를 여기에 추가한다.
# 지금은 부록 C(검증 스크립트)와 같은 일만 한다.
class_name Scan
extends RefCounted

const STEP := 0.25
const FROM := -180.0
const TO := 180.0


# 반환: {
#   "counts": { 결과문자열: 개수 },
#   "runs":   [ [시작각, 끝각], ... ]   연속 성공 구간
# }
static func angles(level: Dictionary, launch_step: int) -> Dictionary:
	var sim := Sim.new()
	var gravs := Sim.gravs_of(level)
	var counts := {}
	var wins := PackedFloat64Array()

	var a := FROM
	while a < TO:
		var r := sim.simulate(level, a, launch_step, gravs)
		counts[r] = int(counts.get(r, 0)) + 1
		if r == "win":
			wins.append(a)
		a += STEP

	return { "counts": counts, "runs": runs_of(wins) }


# 연속한 성공 각도를 구간으로 묶는다. 부록 C와 같은 판정.
static func runs_of(wins: PackedFloat64Array) -> Array:
	var runs: Array = []
	for a in wins:
		if not runs.is_empty() and absf(a - runs[-1][1] - STEP) < 1e-6:
			runs[-1][1] = a
		else:
			runs.append([a, a])
	return runs


# 구간 폭(끝 - 시작 + STEP). §6.2의 "폭"과 같은 정의.
static func width_of(run: Array) -> float:
	return run[1] - run[0] + STEP


# 가장 넓은 구간의 폭. 성공 구간이 없으면 0.0
static func main_window(runs: Array) -> float:
	var best := 0.0
	for r in runs:
		var w := width_of(r)
		if w > best:
			best = w
	return best
