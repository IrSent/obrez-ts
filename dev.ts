import { $ } from 'bun';
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

    const buildNum = (await $`git rev-list HEAD --count`.text()).trim();

    const result = await Bun.build({
      entrypoints: ['./src/index.html'],
      outdir: './dist',
      target: 'browser',
      plugins: [tailwind],
      sourcemap: 'inline',
      minify: false,
      splitting: false,
      define: { '__BUILD_NUM__': JSON.stringify(buildNum) },
    });

    if (!result.success) {
      console.error('❌ Build failed:', result.logs);
      return false;
    }

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
