// 서비스 워커. docs/PLAN.md §15.1
//
// 재방문 시 네트워크 없이 실행되게 한다. 캐시 전략은 **앱 셸 precache +
// 버전이 바뀌면 통째 교체**다. 부분 갱신을 하지 않는다 — 물리 코드와 레벨
// 데이터의 버전이 섞이면 §16.5 가 지키는 것이 무너진다.
//
// 빌드마다 CACHE 이름이 바뀌고(자산 파일명에 해시가 붙는다), 새 워커가
// activate 되면 옛 캐시를 통째로 지운다.

const CACHE = 'swingby-__BUILD__';

self.addEventListener('install', (e) => {
  // 셸만 미리 받는다. 나머지는 첫 방문에 채워진다.
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(['./', './index.html']).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;     // 광고·폰트는 건드리지 않는다

  // HTML 은 네트워크 우선 — 새 판이 나오면 바로 받는다
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(CACHE);
        c.put('./index.html', res.clone());
        return res;
      } catch {
        return (await caches.match('./index.html')) ?? Response.error();
      }
    })());
    return;
  }

  // 해시가 붙은 자산은 캐시 우선
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch {
      return Response.error();
    }
  })());
});
