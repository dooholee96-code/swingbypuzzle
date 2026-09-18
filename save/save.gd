# 저장 데이터. docs/PLAN.md §15.2, §17 M6
#
# 자동 로드(Save). class_name 을 붙이면 자동 로드 이름과 충돌한다.
#
# 앱 시작 시 한 번 읽어 메모리에 두고, 변경 시 500ms 디바운스로 기록한다.
# pause 시 즉시 기록한다. 읽기·파싱에 실패하면 기본값으로 시작하고
# 손상된 파일은 .bak 으로 옮긴다.
extends Node

const PATH := "user://swingby.save.v1.json"
const BAK := "user://swingby.save.v1.bak"
const VERSION := 1
const DEBOUNCE := 0.5

var data: Dictionary = {}

var _dirty := false
var _timer := 0.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	load_now()
	Lifecycle.paused.connect(flush)


func _process(delta: float) -> void:
	if not _dirty:
		return
	_timer -= delta
	if _timer <= 0.0:
		flush()


func defaults() -> Dictionary:
	return {
		"version": VERSION,
		"levels": {},
		"seen_intros": [],
		"settings": {
			"sfx": true, "haptics": true,
			"glow": "normal",          # "normal" | "low"
			"reduce_motion": false,
		},
		"ads": {
			"free_hint_used": false,
			"clears_since_interstitial": 0,
			"last_interstitial_at": null,
			"last_rewarded_at": null,
		},
	}


func level_defaults() -> Dictionary:
	return {
		"cleared": false, "skipped": false,
		"attempts": 0, "fails": 0, "best_time": null,
		"hints": { "preview": false, "direction": false },
	}


func load_now() -> void:
	data = defaults()
	if not FileAccess.file_exists(PATH):
		return
	var f := FileAccess.open(PATH, FileAccess.READ)
	if f == null:
		push_warning("저장 파일을 열 수 없습니다. 기본값으로 시작합니다.")
		return
	var text := f.get_as_text()
	f = null
	var parsed = JSON.parse_string(text)
	if not parsed is Dictionary or int(parsed.get("version", 0)) != VERSION:
		push_warning("저장 파일이 손상되었거나 판이 다릅니다. %s 로 옮기고 기본값으로 시작합니다." % BAK)
		DirAccess.copy_absolute(PATH, BAK)
		return
	data = _merge(defaults(), parsed)


# 저장된 값이 기본 구조에 없는 키를 잃지 않도록 한 겹씩 덮어쓴다.
# 판 올림(마이그레이션)도 여기서 처리한다.
func _merge(base: Dictionary, over: Dictionary) -> Dictionary:
	var out := base.duplicate(true)
	for k in over:
		if out.has(k) and out[k] is Dictionary and over[k] is Dictionary:
			out[k] = _merge(out[k], over[k])
		else:
			out[k] = over[k]
	return out


# 변경을 알린다. 실제 기록은 디바운스 뒤에.
func touch() -> void:
	_dirty = true
	_timer = DEBOUNCE


func flush() -> void:
	if not _dirty:
		return
	_dirty = false
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	if f == null:
		push_warning("저장에 실패했습니다: %s" % PATH)
		return
	f.store_string(JSON.stringify(data, "  "))


# ── 편의 접근 ───────────────────────────────────────────────────────────
func level(id: String) -> Dictionary:
	if not data["levels"].has(id):
		data["levels"][id] = level_defaults()
	return data["levels"][id]


func settings() -> Dictionary:
	return data["settings"]


func record_attempt(id: String, outcome: String, seconds: float) -> void:
	var l := level(id)
	l["attempts"] = int(l["attempts"]) + 1
	if outcome == "win":
		l["cleared"] = true
		var best = l["best_time"]
		if best == null or seconds < float(best):
			l["best_time"] = seconds
	else:
		l["fails"] = int(l["fails"]) + 1
	touch()
