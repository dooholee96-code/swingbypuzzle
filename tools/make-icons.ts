// 앱 아이콘을 스프라이트 생성기로 만든다. docs/PLAN.md §15.5
//
//   npx tsx tools/make-icons.ts
//
// 밤하늘($22)에 별을 깔고, 불꽃을 단 당근 로켓을 위로 띄운다. 그림은 게임 화면과
// 같은 코드에서 나오므로 화풍이 어긋나지 않는다. PNG 는 의존성 없이 직접 쓴다.

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

import { NES, PIX } from '../src/render/palette.js';
import type { Grid } from '../src/render/sprites/pixel.js';
import { rocketDir } from '../src/render/sprites/rocket.js';
import { starTile } from '../src/render/sprites/world.js';
import { ROOT } from './gen-run.js';

const hex = (h: string): [number, number, number] =>
  [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** n×n 아이콘. 로켓이 가운데 60% 안에 들어가므로 maskable 의 안전 영역(80%)을 지킨다 */
function icon(n: number): Uint8Array {
  const px = new Uint8Array(n * n * 4);
  const paint = (x: number, y: number, c: string): void => {
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    const [r, g, b] = hex(c), i = (y * n + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  };
  const blit = (g: Grid, k: number, ox: number, oy: number): void => {
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const c = g.d[y * g.w + x]!;
      if (c === '.') continue;
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) paint(ox + x * k + dx, oy + y * k + dy, PIX[c]!);
    }
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) paint(x, y, NES['22']);
  if (n >= 64) {
    const k = Math.max(1, Math.floor(n / 128));
    const tile = starTile(5, 64, 64);
    for (let ty = 0; ty < n; ty += 64 * k) for (let tx = 0; tx < n; tx += 64 * k) blit(tile, k, tx, ty);
  }
  // 45° 는 최근접 회전이라 계단이 거칠다. 90° 는 픽셀이 그대로 옮겨진다 — 위로 솟는 로켓
  const rocket = rocketDir('fly', -Math.PI / 2, { flame: 0, ears: 'back' });
  const k = Math.max(1, Math.floor(n * 0.6 / rocket.w));
  blit(rocket, k, Math.round(n / 2 - rocket.ax * k), Math.round(n / 2 - rocket.ay * k));
  return px;
}

// ── PNG (RGBA, 필터 없음) ──
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(n: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((n * 4 + 1) * n);
  for (let y = 0; y < n; y++) {
    raw[y * (n * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * n * 4, n * 4).copy(raw, y * (n * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array()),
  ]);
}

for (const [n, path] of [
  [32, 'public/favicon.png'], [192, 'public/icon-192.png'], [512, 'public/icon-512.png'], [1024, 'store/icon-1024.png'],
] as const) {
  const buf = png(n, icon(n));
  writeFileSync(join(ROOT, path), buf);
  console.log(`  ${path}  ${n}×${n}  ${(buf.length / 1024).toFixed(1)}KB`);
}
