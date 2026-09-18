# 장 구성과 단계 순서. docs/PLAN.md §7.1, §13.2
#
# 여기 등록된 단계만 게임에 나온다.
# **검증기(§8.5)를 통과하지 않은 단계를 등록하지 않는다(§19).**
class_name Chapters
extends RefCounted

# 장 이름은 §7.3의 커리큘럼 제목이다. 탭에 "1장 행성" 형태로 표시된다(§13.2).
const LIST := [
	{ "chapter": 1, "name": "행성",      "levels": ["1-1", "1-4"] },
	{ "chapter": 2, "name": "블랙홀",    "levels": ["2-1"] },
	{ "chapter": 3, "name": "외계인",    "levels": ["3-1"] },
	{ "chapter": 4, "name": "공전 행성", "levels": ["4-1"] },
	{ "chapter": 5, "name": "넓은 항로", "levels": ["5-1"] },
]


# 등록된 전 단계 ID를 장·칸 순서로 반환한다.
static func all_ids() -> PackedStringArray:
	var ids := PackedStringArray()
	for ch in LIST:
		for id in ch["levels"]:
			ids.append(id)
	return ids


# 한 장의 단계 ID. 없는 장이면 빈 배열.
static func ids_of(chapter: int) -> PackedStringArray:
	for ch in LIST:
		if ch["chapter"] == chapter:
			return PackedStringArray(ch["levels"])
	return PackedStringArray()


static func name_of(chapter: int) -> String:
	for ch in LIST:
		if ch["chapter"] == chapter:
			return ch["name"]
	return ""


# 탭 표기 "1장 행성" (§13.2)
static func label_of(chapter: int) -> String:
	var n := name_of(chapter)
	return "" if n.is_empty() else "%d장 %s" % [chapter, n]
