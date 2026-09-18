# 전 각도 스캔. docs/PLAN.md §16.1
#
#   ./run.sh solve            등록된 전 단계
#   ./run.sh solve 1-1        한 단계만
#
# 출력 예:
#   1-1 첫 스윙바이  t=0.00  성공: -69.25..-62.5 (7.00°)  {wall:1219, rock:128, planet:65, win:28}
#
# 공전 행성이 있는 단계는 주기를 12등분한 발사 시점마다 반복한다.
extends SceneTree

const ORBIT_DIVISIONS := 12


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var ids := PackedStringArray(args) if args.size() > 0 else Chapters.all_ids()

	var loader := LevelLoader.new()
	var failed := false
	for id in ids:
		var level := loader.load_level(id)
		if level.is_empty():
			for e in loader.errors:
				printerr("  %s" % e)
			failed = true
			continue
		_solve(level)
	quit(1 if failed else 0)


func _solve(level: Dictionary) -> void:
	for launch_step in _launch_steps(level):
		var result := Scan.angles(level, launch_step)
		print("%s %s  t=%.2f  성공: %s  %s" % [
			level["id"], level["name"],
			launch_step * SwConsts.DT,
			_format_runs(result["runs"]),
			_format_counts(result["counts"]),
		])


# 공전 행성이 있으면 주기를 12등분, 없으면 발사 시점 0만.
func _launch_steps(level: Dictionary) -> PackedInt64Array:
	var period := 0.0
	for p in level.get("planets", []):
		if p.has("orbit"):
			period = absf(p["orbit"]["period"])
			break
	if period == 0.0:
		return PackedInt64Array([0])

	var steps := PackedInt64Array()
	for k in ORBIT_DIVISIONS:
		steps.append(int(round(k * period / ORBIT_DIVISIONS / SwConsts.DT)))
	return steps


func _format_runs(runs: Array) -> String:
	if runs.is_empty():
		return "없음"
	var parts := PackedStringArray()
	for r in runs:
		parts.append("%s..%s (%.2f°)" % [r[0], r[1], Scan.width_of(r)])
	return " ".join(parts)


# §5.4의 판정 순서로 고정해서 낸다. Dictionary 삽입 순서에 기대면
# 엔진·버전에 따라 순서가 달라져 출력을 서로 대조하기 어렵다.
const OUTCOME_ORDER := ["planet", "hole", "rock", "ufo", "wall", "shot", "drift", "win"]

func _format_counts(counts: Dictionary) -> String:
	var parts := PackedStringArray()
	for k in OUTCOME_ORDER:
		if counts.has(k):
			parts.append("%s:%d" % [k, int(counts[k])])
	for k in counts:                      # 목록에 없는 결과가 생기면 뒤에 붙인다
		if not k in OUTCOME_ORDER:
			parts.append("%s:%d" % [k, int(counts[k])])
	return "{%s}" % ", ".join(parts)
