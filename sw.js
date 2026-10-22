// 서비스 워커: 홈 화면에 추가한 앱이 오프라인에서도 열리도록 화면 파일을 보관합니다.
// - 항상 네트워크를 먼저 쓰고(새 배포가 바로 반영), 연결이 안 될 때만 보관본을 씁니다.
// - Supabase·CDN 등 다른 주소와 promo/(큰 영상)는 건드리지 않습니다.
// 보관할 파일 목록을 바꾸면 CACHE 이름의 숫자를 올립니다.

const CACHE = 'when-did-i-v2';
const SHELL = [
  './',
  'index.html',
  'style.css',
  'date-utils.js',
  'icon.js',
  'storage.js',
  'sync.js',
  'script.js',
  'group.js',
  'chat.js',
  'favicon.svg',
  'manifest.webmanifest',
  'icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/promo/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      })
  );
});
