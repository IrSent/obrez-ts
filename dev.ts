import { $, MD5 } from 'bun';
import { mkdir, rm } from 'fs/promises';
import { watch } from 'fs';
import tailwind from 'bun-plugin-tailwind';
import { serve, type ServerWebSocket } from 'bun';
import { join } from 'path';

const DIST_DIR = join(import.meta.dir, 'dist');
const PUBLIC_DIR = join(import.meta.dir, 'public');
const SRC_DIR = join(import.meta.dir, 'src');

// Храним активные вебсокет-соединения для Live Reload
const clients = new Set<ServerWebSocket<unknown>>();

async function build() {
  try {
    await rm(DIST_DIR, { recursive: true, force: true });
    await mkdir(DIST_DIR, { recursive: true });

    // Копируем статику
    await $`cp -r ${PUBLIC_DIR}/* ${DIST_DIR}/`.quiet();

    // Copy Phase Vocoder processor from node_modules — always fresh on rebuild
    // so package updates are picked up without touching public/
    await $`cp node_modules/@soundtouchjs/phase-vocoder-worklet/.dist/phase-vocoder-processor.js ${DIST_DIR}/`.quiet();

    // Cache-bust: copy settings-early and settings-ui with MD5 hash in filename
    const earlyHash = MD5.hash(await Bun.file('public/settings-early.js').arrayBuffer(), 'hex').slice(0, 8);
    const uiHash = MD5.hash(await Bun.file('public/settings-ui.js').arrayBuffer(), 'hex').slice(0, 8);
    const earlyName = `settings-early.${earlyHash}.js`;
    const uiName = `settings-ui.${uiHash}.js`;
    await $`cp public/settings-early.js ${DIST_DIR}/${earlyName}`.quiet();
    await $`cp public/settings-ui.js ${DIST_DIR}/${uiName}`.quiet();

    const buildNum = (await $`git rev-list HEAD --count`.text()).trim();
    const baseVersion = JSON.parse((await $`cat package.json`.text())).version;

    const result = await Bun.build({
      entrypoints: [
        './src/index.html',
        './src/json-import.worker.ts',
        './src/json-export.worker.ts',
        './src/censor-worker.ts',
      ],
      outdir: './dist',
      target: 'browser',
      plugins: [tailwind],
      sourcemap: 'inline',
      minify: false,
      splitting: false,
      define: { '__BASE_VERSION__': JSON.stringify(baseVersion), '__BUILD_NUM__': JSON.stringify(buildNum) },
    });

    if (!result.success) {
      console.error('❌ Build failed:', result.logs);
      return false;
    }

    // Inject settings scripts into index.html
    const indexPath = join(DIST_DIR, 'index.html');
    const builtIndex = Bun.file(indexPath);
    const html = await builtIndex.text();
    const withSettings = html
      .replace('<head>', `<head><script src="./${earlyName}"></script>`)
      .replace(
        '</body>',
        `<script>document.addEventListener('DOMContentLoaded',function(){
          var s=document.createElement('script');s.src='./${uiName}';document.head.appendChild(s);
        });</script></body>`,
      );
    await Bun.write(builtIndex, withSettings);

    console.log('✅ Dev build ready');
    return true;
  } catch (err) {
    console.error('❌ Build error:', err);
    return false;
  }
}

// Первый запуск сборки
await build();

// Запуск сервера с поддержкой WebSocket и раздачи файлов
const server = serve({
  hostname: '0.0.0.0',
  port: 3000,
  tls: {
    cert: Bun.file(`${process.env.HOME}/localhost+2.pem`),
    key: Bun.file(`${process.env.HOME}/localhost+2-key.pem`),
  },

  async fetch(req, server) {
    const url = new URL(req.url);

    // Маршрут для Live Reload подписки
    if (url.pathname === '/_livereload') {
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined;
    }

    // Маршрутизация путей (SPA/Index)
    let filePath = join(DIST_DIR, url.pathname);
    if (url.pathname === '/' || url.pathname.endsWith('.html')) {
      filePath = join(DIST_DIR, 'index.html');
    }

    const file = Bun.file(filePath);
    if (await file.exists()) {
      // Внедряем скрипт перезагрузки в HTML на лету
      if (filePath.endsWith('index.html')) {
        let html = await file.text();
        const injectScript = `
          <script>
            const ws = new WebSocket('wss://' + location.host + '/_livereload');
            ws.onmessage = (e) => { if (e.data === 'reload') location.reload(); };
            ws.onclose = () => console.log('LiveReload disconnected');
          </script>
        `;
        html = html.replace('</body>', `${injectScript}</body>`);
        return new Response(html, { headers: { 'Content-Type': 'text/html' } });
      }

      // Автоматическая отдача остальных типов файлов с правильными MIME-типами
      return new Response(file);
    }

    return new Response('Not Found', { status: 404 });
  },

  // WebSocket обработчики
  websocket: {
    open(ws) { clients.add(ws); },
    close(ws) { clients.delete(ws); },
    message() {}
  }
});

//console.log(`🚀 Dev server running at https://${server.hostname}:${server.port}`);
console.log(`🚀 Dev server running at ${server.url}`);

// Дебаунс отслеживания изменений в src/ и public/
let rebuildTimeout: Timer | null = null;
const watchHandler = (event: string, filename: string | null) => {
  if (!filename) return;

  if (rebuildTimeout) clearTimeout(rebuildTimeout);

  rebuildTimeout = setTimeout(async () => {
    console.log(`\n🔄 File changed: ${filename}. Rebuilding...`);
    const success = await build();
    if (success) {
      console.log('⚡ Sending reload command to browser...');
      for (const client of clients) {
        client.send('reload');
      }
    }
  }, 200);
};

watch(SRC_DIR, { recursive: true }, watchHandler);
watch(PUBLIC_DIR, { recursive: true }, watchHandler);
