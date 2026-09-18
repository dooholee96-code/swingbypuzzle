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
#   ./run.sh web [--release]          웹으로 내보내기 → build/web/
#   ./run.sh serve [포트]              내보내고 로컬 서버로 띄운다 (폰에서 접속)
#
# GODOT 환경변수로 실행 파일을 지정할 수 있다.
#   예: GODOT=~/bin/godot4 ./run.sh bench
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() { sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^#\( \|$\)//'; }

cmd="${1:-}"
[ $# -gt 0 ] && shift

case "$cmd" in
  bench|solve|validate|gen|fan|test|web|serve) ;;
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

if [ "$cmd" = "web" ] || [ "$cmd" = "serve" ]; then
  out="$ROOT/build/web"
  mkdir -p "$out"
  mode="--export-debug"          # 디버그 빌드여야 개발용 단계 이동이 열린다
  port=8080
  for a in "$@"; do
    case "$a" in
      --release) mode="--export-release" ;;
      [0-9]*)    port="$a" ;;
    esac
  done
  echo "웹으로 내보내는 중… ($mode)"
  if ! "$GODOT" --headless --path "$ROOT" "$mode" "Web" "$out/index.html"; then
    echo "" >&2
    echo "내보내기에 실패했습니다. 확인할 것:" >&2
    echo "  · export_presets.cfg 가 있는가 (cp export_presets.example.cfg export_presets.cfg)" >&2
    echo "  · 에디터 → 편집기 → 내보내기 템플릿 관리 에서 템플릿을 받았는가" >&2
    exit 1
  fi
  [ "$cmd" = "web" ] && { echo "완료: $out"; exit 0; }
  exec python3 "$ROOT/tools/serve.py" "$out" "$port"
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
