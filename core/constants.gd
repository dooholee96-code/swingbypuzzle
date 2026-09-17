# 물리 상수. docs/PLAN.md §5.1
#
# 이 값들은 부록 A(검증 완료 참조 구현)의 값이다.
# 바꾸면 §6.2 회귀 테스트가 깨진다. 임의로 수정하지 않는다(§0.4).
class_name SwConsts
extends RefCounted

const DT := 1.0 / 240.0
const SHIP_R := 5.0
const MAX_FLIGHT := 30.0
