# 단계 JSON 불러오기와 스키마 검사. docs/PLAN.md §6.1
#
# 모르는 키를 만나면 오류로 처리한다. 오타가 조용히 무시되면
# 검증기를 통과한 단계가 게임에서 다르게 동작할 수 있다.
#
# M1 기준으로 Dictionary를 그대로 반환한다. core/sim.gd가 Dictionary를
# 받도록 검증(M0)돼 있어서, 지금 자료구조를 바꾸면 재검증 없이 회귀 위험만 진다.
# 타입 있는 객체 래핑은 성능 확정 후에 한다.
class_name LevelLoader
extends RefCounted

const DIR := "res://levels/data"

# 키 이름은 §6.1을 따른다. rH·R·g·r·w·h·bs는 물리 기호라 부록 B 그대로 둔다.
const REQUIRED := {
	"level":  ["id", "name", "w", "h", "speed", "preview", "start", "goal", "meta"],
	"start":  ["x", "y"],
	"goal":   ["x", "y", "r"],
	"planet": ["x", "y", "r", "g", "R", "sides"],
	"hole":   ["x", "y", "rH", "g", "R"],
	"rock":   ["x", "y", "r", "seed"],
	"ufo":    ["x", "y", "range", "interval", "delay", "bs"],
	"orbit":  ["cx", "cy", "rad", "period", "phase"],
	"meta":   ["chapter", "slot", "role", "solution", "source", "updated"],
	"solution": ["angle", "launch_step"],
}
const OPTIONAL := {
	"level":  ["planets", "holes", "rocks", "ufos", "hint"],
	"start":  [], "goal": [], "orbit": [], "solution": [],
	"planet": ["ring", "role", "orbit"],
	"hole":   ["role"],
	"rock":   [], "ufo": [],
	"meta":   ["intro", "metrics"],
}
const ROLES := ["required", "optional", "gate"]
const SOURCES := ["verified", "generated", "editor"]
const INTROS := ["planet", "rock", "hole", "ufo", "orbit", "wide"]

var errors: PackedStringArray = PackedStringArray()


# 단계 하나를 읽는다. 실패하면 빈 Dictionary를 반환하고 errors에 이유를 남긴다.
func load_level(id: String) -> Dictionary:
	errors = PackedStringArray()
	var path := "%s/%s.json" % [DIR, id]
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		errors.append("%s: 파일을 열 수 없습니다" % path)
		return {}
	var parsed = JSON.parse_string(f.get_as_text())
	if not parsed is Dictionary:
		errors.append("%s: JSON이 객체가 아닙니다" % path)
		return {}

	var level: Dictionary = parsed
	_check(level, "level", id)
	if level.get("id", "") != id:
		errors.append("%s: id가 파일 이름과 다릅니다 (%s)" % [id, level.get("id", "<없음>")])
	_check_dict(level, "start", "start", id)
	_check_dict(level, "goal", "goal", id)
	_check_list(level, "planets", "planet", id)
	_check_list(level, "holes", "hole", id)
	_check_list(level, "rocks", "rock", id)
	_check_list(level, "ufos", "ufo", id)
	_check_meta(level, id)

	for p in level.get("planets", []):
		if p is Dictionary and p.has("orbit"):
			_check(p["orbit"], "orbit", "%s planets[].orbit" % id)

	# §8.5 규칙 8은 검증기가 본다. 여기서는 스키마만 본다.
	return {} if not errors.is_empty() else level


# 등록된 전 단계를 읽는다. 반환: { 단계ID: Level }
func load_all() -> Dictionary:
	var all := {}
	var problems := PackedStringArray()
	for id in Chapters.all_ids():
		var lv := load_level(id)
		if lv.is_empty():
			problems.append_array(errors)
		else:
			all[id] = lv
	errors = problems
	return all


func _check(d: Dictionary, kind: String, where: String) -> void:
	var req: Array = REQUIRED[kind]
	var opt: Array = OPTIONAL[kind]
	for k in req:
		if not d.has(k):
			errors.append("%s: %s에 필수 키 '%s'가 없습니다" % [where, kind, k])
	for k in d.keys():
		if not (k in req or k in opt):
			errors.append("%s: %s에 모르는 키 '%s'가 있습니다" % [where, kind, k])


func _check_dict(parent: Dictionary, key: String, kind: String, where: String) -> void:
	if not parent.has(key):
		return
	if not parent[key] is Dictionary:
		errors.append("%s: '%s'가 객체가 아닙니다" % [where, key])
		return
	_check(parent[key], kind, "%s %s" % [where, key])


func _check_list(parent: Dictionary, key: String, kind: String, where: String) -> void:
	if not parent.has(key):
		return
	if not parent[key] is Array:
		errors.append("%s: '%s'가 배열이 아닙니다" % [where, key])
		return
	var i := 0
	for item in parent[key]:
		if not item is Dictionary:
			errors.append("%s: %s[%d]가 객체가 아닙니다" % [where, key, i])
		else:
			_check(item, kind, "%s %s[%d]" % [where, key, i])
			if item.has("role") and not item["role"] in ROLES:
				errors.append("%s: %s[%d].role이 %s 중 하나가 아닙니다" % [where, key, i, str(ROLES)])
		i += 1


func _check_meta(level: Dictionary, id: String) -> void:
	if not level.has("meta") or not level["meta"] is Dictionary:
		return
	var meta: Dictionary = level["meta"]
	_check(meta, "meta", "%s meta" % id)
	if meta.has("solution"):
		if meta["solution"] is Dictionary:
			_check(meta["solution"], "solution", "%s meta.solution" % id)
		else:
			errors.append("%s: meta.solution이 객체가 아닙니다" % id)
	if meta.has("source") and not meta["source"] in SOURCES:
		errors.append("%s: meta.source가 %s 중 하나가 아닙니다" % [id, str(SOURCES)])
	if meta.has("intro") and not meta["intro"] in INTROS:
		errors.append("%s: meta.intro가 %s 중 하나가 아닙니다" % [id, str(INTROS)])
