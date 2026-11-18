import { createHash } from 'node:crypto'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        assetFileNames: asset => asset.names.includes('eng.traineddata.gz')
          ? 'assets/eng.traineddata.gz'
          : 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [{
    name: 'offline-app-shell',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const assets = Object.keys(bundle).filter(name => name.endsWith('.js') || name.endsWith('.css') || name.endsWith('.traineddata.gz'))
        const cache = 'zodziu-' + createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 16)
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const ROOT = self.registration.scope;
const PREFIX = 'zodziu:' + ROOT + ':';
const CACHE = PREFIX + ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(['index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', ...assets])};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(file => new URL(file, ROOT)))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(PREFIX) && key !== CACHE)
    .map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(ROOT)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE)
      .then(cache => cache.match(new URL('index.html', ROOT), { ignoreVary: true }))));
  } else if (FILES.some(file => new URL(file, ROOT).href === request.url)) {
    event.respondWith(caches.open(CACHE)
      .then(cache => cache.match(request.url, { ignoreVary: true }))
      .then(response => response || fetch(request)));
  }
});
` })
      },
    },
  }],
})
