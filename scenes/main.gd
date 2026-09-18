# 부트스트랩과 화면 전환. docs/PLAN.md §9.1
#
# Title → LevelSelect → Play → Result 흐름은 M6 에서 붙인다.
# M2 는 Play 로 바로 들어간다.
extends Node

const PLAY := preload("res://scenes/play.tscn")


func _ready() -> void:
	# 씬 교체는 add_child / queue_free 로 직접 한다 (§9.1).
	# change_scene_to_file 은 전환 중 상태를 들고 있을 수 없다.
	add_child(PLAY.instantiate())
