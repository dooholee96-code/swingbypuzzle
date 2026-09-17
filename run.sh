#!/usr/bin/env bash
# 스윙바이 CLI 래퍼. docs/PLAN.md §2.3
#
#   ./run.sh bench                    성능 관문 (§17 M0)
#   ./run.sh solve [단계ID]            전 각도 스캔 (§16.1)
#   ./run.sh validate [ID|장번호]       전체 검증 (§16.3) — 커밋 전 필수
#   ./run.sh gen --recipe … --slot …   후보 생성 (§16.4)
#   ./run.sh fan <단계> …               궤적 SVG (§16.2)
#   ./run.sh test                     gdUnit4 전체 실행 (§16.5)
#   ./run.sh check                    §2.1 정밀도 규칙 위반 검사
#
# GODOT 환경변수로 실행 파일을 지정할 수 있다.
#   예: GODOT=~/bin/godot4 ./run.sh bench
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() { sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^#\( \|$\)//'; }

cmd="${1:-}"
[ $# -gt 0 ] && shift

case "$cmd" in
  bench|solve|validate|gen|fan|test) ;;
  check)
    # core/·tools_shared/에 §2.1 금지 API가 있는지 본다. 주석은 제외한다.
    if grep -rnE '^[^#]*(Vector2|deg_to_rad|TAU|distance_to|\.length\(\))' \
         "$ROOT/core" "$ROOT/tools_shared"; then
      echo "" >&2
      echo "§2.1 정밀도 규칙 위반입니다. 위 줄을 고치세요." >&2
      exit 1
    fi
    echo "§2.1 정밀도 규칙: 위반 없음"
    exit 0
    ;;
  ""|-h|--help|help) usage; exit 0 ;;
  *) echo "알 수 없는 명령: $cmd" >&2; echo "" >&2; usage >&2; exit 1 ;;
esac

GODOT="${GODOT:-godot}"
if ! command -v "$GODOT" >/dev/null 2>&1; then
  echo "godot 실행 파일을 찾지 못했습니다: $GODOT" >&2
  echo "GODOT 환경변수로 경로를 지정하세요. 예: GODOT=/opt/godot/godot4 ./run.sh $cmd" >&2
  exit 127
fi

if [ "$cmd" = "test" ]; then
  if [ ! -x "$ROOT/addons/gdUnit4/runtest.sh" ]; then
    echo "gdUnit4가 설치되어 있지 않습니다: addons/gdUnit4/" >&2
    echo "설치: https://github.com/MikeSchulze/gdUnit4 의 addons/gdUnit4 를 addons/ 아래에 두고" >&2
    echo "      Godot 에디터 → 프로젝트 → 플러그인에서 활성화하세요. (docs/PLAN.md §16.5)" >&2
    exit 127
  fi
  exec "$ROOT/addons/gdUnit4/runtest.sh" -a "$ROOT/tests" "$@"
fi

exec "$GODOT" --headless --path "$ROOT" --script "res://tools/${cmd}.gd" -- "$@"
