// 에디터 저장 엔드포인트. docs/PLAN.md §8.7
//
// **개발 서버에만 붙는다.** configureServer 만 구현하므로 `vite build` 에는
// 전혀 관여하지 않고, 배포된 사이트에는 이 코드도 이 경로도 존재하지 않는다.
//
// 쓰기 경로는 src/levels/data/ 와 candidates/ 로 제한한다. 경로를 정규화한 뒤
// 접두사를 검사하고 '..' 를 허용하지 않는다.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import type { Connect, Plugin, ViteDevServer } from 'vite';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const ALLOWED = ['src/levels/data', 'candidates'];

/** 저장소 안의, 허용된 폴더 아래의 .json 경로만 통과시킨다. */
export function safePath(rel: string): string | null {
  if (typeof rel !== 'string' || !rel.endsWith('.json')) return null;
  if (rel.includes('\0')) return null;
  const abs = resolve(ROOT, normalize(rel));
  const inside = relative(ROOT, abs);
  if (inside.startsWith('..') || inside.startsWith(sep)) return null;
  const ok = ALLOWED.some((d) => inside === d || inside.startsWith(d + sep));
  return ok ? abs : null;
}

function body(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((ok, no) => {
    let s = '';
    req.on('data', (c: Buffer) => {
      s += c;
      if (s.length > 1_000_000) no(new Error('too large'));
    });
    req.on('end', () => ok(s));
    req.on('error', no);
  });
}

export function editorPlugin(): Plugin {
  return {
    name: 'swingby-editor',
    apply: 'serve',              // 빌드에는 붙지 않는다
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__editor', async (req, res, next) => {
        const send = (code: number, obj: unknown): void => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(obj));
        };
        const url = (req.url ?? '').split('?')[0];

        try {
          if (req.method === 'POST' && url === '/save') {
            const { path, json } = JSON.parse(await body(req)) as { path: string; json: unknown };
            const abs = safePath(path);
            if (!abs) return send(400, { error: `쓸 수 없는 경로입니다: ${path}` });
            mkdirSync(dirname(abs), { recursive: true });
            writeFileSync(abs, JSON.stringify(json, null, 2) + '\n');
            return send(200, { ok: true, path });
          }

          if (req.method === 'GET' && url === '/candidates') {
            const dir = join(ROOT, 'candidates');
            const out: { path: string; json: unknown }[] = [];
            let groups: string[] = [];
            try { groups = readdirSync(dir); } catch { /* 아직 없다 */ }
            for (const g of groups) {
              let files: string[] = [];
              try { files = readdirSync(join(dir, g)); } catch { continue; }
              for (const f of files.filter((n) => n.endsWith('.json'))) {
                try {
                  out.push({
                    path: `candidates/${g}/${f}`,
                    json: JSON.parse(readFileSync(join(dir, g, f), 'utf8')),
                  });
                } catch { /* 깨진 후보는 건너뛴다 */ }
              }
            }
            return send(200, { candidates: out });
          }
        } catch (e) {
          return send(500, { error: String(e) });
        }
        next();
      });
    },
  };
}
