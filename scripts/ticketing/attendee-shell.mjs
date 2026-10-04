import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
export async function buildAttendeeShell(dist) {
  const app = join(dist, 'app'), names = await readdir(app);
  let resources = ['/app/', '/app/index.html', '/assets/firebase-public-config.js',
    ...names.filter(n => n.endsWith('.js') && !n.includes('service_worker') && !n.includes('messaging') && !n.includes('ticket-shell')).map(n => `/app/${n}`),
    '/app/assets/AssetManifest.bin', '/app/assets/AssetManifest.bin.json', '/app/assets/FontManifest.json', '/app/assets/fonts/MaterialIcons-Regular.otf',
    '/app/assets/assets/fonts/Montserrat-Medium.ttf', '/app/assets/assets/fonts/SourceCodePro-SemiBold.ttf'];
  const exists = await Promise.all(resources.map(path => stat(join(dist, path === '/app/' ? 'app/index.html' : path.slice(1))).then(() => true, () => false)));
  resources = resources.filter((_, index) => exists[index]);
  const release = createHash('sha256').update(await readFile(join(app, 'main.dart.js'))).update(await readFile(join(dist, 'assets/firebase-public-config.js'))).digest('hex').slice(0, 20);
  const worker = `const CACHE='pluto-attendee-shell-${release}';
const FILES=${JSON.stringify(resources)};
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(FILES);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('pluto-attendee-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);if(req.method!=='GET')return;
 const shell=url.origin===self.location.origin&&(FILES.includes(url.pathname)||url.pathname.startsWith('/app/assets/')||url.pathname.startsWith('/app/canvaskit/'));
 const publicSdk=url.origin==='https://www.gstatic.com'&&(url.pathname.startsWith('/firebasejs/')||url.pathname.startsWith('/flutter-canvaskit/'));
 if(!shell&&!publicSdk&&!(req.mode==='navigate'&&url.origin===self.location.origin&&url.pathname.startsWith('/app/')))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(req);if(response.ok&&(shell||publicSdk))await cache.put(req,response.clone());return response;}catch(error){const saved=await cache.match(req);if(saved)return saved;if(req.mode==='navigate')return (await cache.match('/app/index.html'))||Promise.reject(error);throw error;}})());
});`;
  await writeFile(join(app, 'ticket-shell-sw.js'), worker);
}
