#!/usr/bin/env python3
"""픽셀 글꼴을 화면에 나오는 글자만 남기고 자른다. docs/PLAN.md §13.7, §18

    npm run fonts        (필요한 것: pip install fonttools brotli)

원본 글꼴은 npm 에서 받아 .cache/fonts/ 에 둔다(저장소에 싣지 않는다).
결과는 src/ui/fonts/*.woff2 와 그 글꼴이 담은 글자 목록 glyphs.json.
문구를 고쳐 새 글자가 생기면 tests/fonts.test.ts 가 막는다 — 그때 이걸 다시 돌린다.

- Galmuri 2.40.3 (Lee Minseo, SIL OFL 1.1, 예약 글꼴 이름 없음) — 한국어·영어·일본어
- Fusion Pixel Font 12px 비례폭 간체 (TakWolf 외, SIL OFL 1.1) — 중국어.
  Galmuri 는 일본식 한자뿐이라 간체 전용 글자(关·设·选…)가 없다. Fusion 의 한글은 Galmuri 다.
"""
import glob, json, os, subprocess, sys, tarfile

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.cache', 'fonts')
OUT = os.path.join(ROOT, 'src', 'ui', 'fonts')
PKGS = {
    'galmuri': 'galmuri@2.40.3',
    'fusion': '@vp-tw/cjk-web-fonts-fusion-pixel-font@0.0.1',
}


def fetch(key: str) -> str:
    """npm 꾸러미를 받아 풀고 그 package/ 경로를 돌려준다."""
    dest = os.path.join(CACHE, key)
    pkg = os.path.join(dest, 'package')
    if os.path.isdir(pkg):
        return pkg
    os.makedirs(dest, exist_ok=True)
    name = subprocess.check_output(['npm', 'pack', PKGS[key], '--silent'], cwd=dest, text=True).strip().splitlines()[-1]
    with tarfile.open(os.path.join(dest, name)) as t:
        t.extractall(dest, filter='data')
    return pkg


def chars() -> dict:
    out = subprocess.check_output(['npx', 'tsx', 'tools/font-chars.ts'], cwd=ROOT, text=True)
    return json.loads(out)


def cut(src_fonts: list, text: str, dst: str, family: str) -> str:
    """src 글꼴(여럿이면 합친다)에서 text 의 글자만 남겨 woff2 로. 담긴 글자를 돌려준다."""
    parts = []
    for i, src in enumerate(src_fonts):
        f = TTFont(src)
        cmap = f.getBestCmap()
        keep = ''.join(c for c in text if ord(c) in cmap)
        if not keep:
            continue
        opts = subset.Options()
        opts.flavor = None
        opts.hinting = False
        opts.desubroutinize = True
        opts.name_IDs = ['*']
        opts.notdef_outline = True
        s = subset.Subsetter(opts)
        s.populate(text=keep)
        s.subset(f)
        tmp = os.path.join(CACHE, f'part-{os.getpid()}-{i}.otf')
        f.save(tmp)
        parts.append(tmp)
    if len(parts) == 1:
        font = TTFont(parts[0])
    else:
        font = Merger().merge(parts)
    font.flavor = 'woff2'
    # 글꼴 이름을 우리 쪽 이름으로. OFL 이 허락하는 수정이다(예약 글꼴 이름이 없다)
    for rec in font['name'].names:
        if rec.nameID in (1, 4, 16):
            rec.string = family
    font.save(dst)
    for p in parts:
        os.remove(p)
    have = font.getBestCmap()
    return ''.join(sorted(c for c in set(text) if ord(c) in have))


def main() -> int:
    g = os.path.join(fetch('galmuri'), 'dist')
    fz = os.path.join(fetch('fusion'), 'dist', '12px', 'proportional', 'zh_hans')
    ch = chars()
    kej = ''.join(sorted(set(ch['ko'] + ch['en'] + ch['ja'])))
    ke = ''.join(sorted(set(ch['ko'] + ch['en'])))
    os.makedirs(OUT, exist_ok=True)

    jobs = [
        ('galmuri11.woff2', [os.path.join(g, 'Galmuri11.ttf')], kej, 'Galmuri11 Swingby'),
        ('galmuri11-bold.woff2', [os.path.join(g, 'Galmuri11-Bold.ttf')], ke, 'Galmuri11 Bold Swingby'),
        ('galmuri14.woff2', [os.path.join(g, 'Galmuri14.ttf')], kej, 'Galmuri14 Swingby'),
        ('fusion-zh.woff2', sorted(glob.glob(os.path.join(fz, '*.woff2'))), ch['zh'], 'Fusion Pixel 12px SC Swingby'),
    ]
    glyphs = {}
    total = 0
    for name, srcs, text, family in jobs:
        dst = os.path.join(OUT, name)
        glyphs[name] = cut(srcs, text, dst, family)
        size = os.path.getsize(dst)
        total += size
        miss = ''.join(c for c in set(text) if c not in glyphs[name])
        print(f'  {name:22s} {size / 1024:6.1f}KB  글자 {len(glyphs[name])}  없음 {len(miss)} {"".join(sorted(miss))}')
    with open(os.path.join(OUT, 'glyphs.json'), 'w', encoding='utf-8') as f:
        json.dump(glyphs, f, ensure_ascii=False, indent=0, sort_keys=True)
        f.write('\n')
    print(f'  합계 {total / 1024:.1f}KB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
