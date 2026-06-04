import { serve } from 'bun';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const server = serve({
  hostname: '0.0.0.0',
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);

    // API: Transcription endpoint - forwards to Python transcribe server
    if (url.pathname === '/api/transcribe' && req.method === 'POST') {
      return handleTranscriptionRequest(req);
    }

    // Serve static files from dist directory
    if (url.pathname === '/' || url.pathname.endsWith('.html')) {
      return new Response(Bun.file(join(__dirname, 'dist', 'index.html')), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Serve JS files
    if (url.pathname.endsWith('.js')) {
      return new Response(Bun.file(join(__dirname, 'dist', url.pathname)), {
        headers: { 'Content-Type': 'application/javascript' },
      });
    }

    // Serve CSS files
    if (url.pathname.endsWith('.css')) {
      return new Response(Bun.file(join(__dirname, 'dist', url.pathname)), {
        headers: { 'Content-Type': 'text/css' },
      });
    }

    // Serve assets from public directory
    if (url.pathname.startsWith('/assets/')) {
      const ext = url.pathname.split('.').pop() || '';
      const contentTypes: Record<string, string> = {
        svg: 'image/svg+xml',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        ico: 'image/x-icon',
        gif: 'image/gif',
        webp: 'image/webp',
      };
      return new Response(Bun.file(join(__dirname, 'public', url.pathname)), {
        headers: { 'Content-Type': contentTypes[ext] || 'application/octet-stream' },
      });
    }

    // Serve other static assets from dist
    return new Response(Bun.file(join(__dirname, 'dist', url.pathname)), {
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  },
});

async function handleTranscriptionRequest(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: 'No audio file provided' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Forward the audio file to the Python transcribe server
    const pythonServerUrl = 'http://192.168.3.250:8686/transcribe';

    const pythonFormData = new FormData();
    pythonFormData.append(
      'file',
      new Blob([await audioFile.arrayBuffer()], { type: audioFile.type }),
      audioFile.name
    );

    const pythonResponse = await fetch(pythonServerUrl, {
      method: 'POST',
      body: pythonFormData,
    });

    if (!pythonResponse.ok) {
      const errorData = await pythonResponse.json();
      return new Response(
        JSON.stringify({
          error: 'Python transcription server error',
          details: errorData,
        }),
        {
          status: pythonResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const pythonData = await pythonResponse.json();

    return new Response(JSON.stringify(pythonData), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

console.log(`Server running at http://${server.hostname}:${server.port}`);
