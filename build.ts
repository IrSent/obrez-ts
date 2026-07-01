import { $ } from 'bun';
import { mkdir, rm } from 'fs/promises';
import tailwind from 'bun-plugin-tailwind';

async function build() {
  try {
    // Clean dist folder
    console.log('Cleaning dist folder...');
    await rm('dist', { recursive: true, force: true });

    // Create dist folder
    console.log('Creating dist folder...');
    await mkdir('dist', { recursive: true });

    // Copy public assets
    console.log('Copying public assets...');
    await $`cp -r public/* dist/`;

    // Copy Phase Vocoder processor from node_modules — always fresh
    console.log('Copying Phase Vocoder processor...');
    await $`cp node_modules/@soundtouchjs/phase-vocoder-worklet/.dist/phase-vocoder-processor.js dist/`.quiet();

    // Get base version and build number
    const baseVersion = JSON.parse((await $`cat package.json`.text())).version;
    const buildNum = (await $`git rev-list HEAD --count`.text()).trim();

    // Build with Bun and Tailwind
    console.log('Building with Bun and Tailwind...');
    await Bun.build({
      entrypoints: [
        './src/index.html',
        './src/json-import.worker.ts',
        './src/json-export.worker.ts',
        './src/censor-worker.ts',
      ],
      outdir: './dist',
      target: 'browser',
      plugins: [tailwind],
      sourcemap: 'external',
      minify: false,
      splitting: false,
      define: {
        '__BASE_VERSION__': JSON.stringify(baseVersion),
        '__BUILD_NUM__': JSON.stringify(buildNum),
      },
    });

    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
