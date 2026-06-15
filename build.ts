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

    // Copy SoundTouch processor (AudioWorklet, must be served as separate file)
    console.log('Copying SoundTouch processor...');
    await $`cp public/soundtouch-processor.js dist/`;

    // Get git build number (commit count from HEAD)
    const buildNum = (await $`git rev-list HEAD --count`.text()).trim();

    // Build with Bun and Tailwind
    console.log('Building with Bun and Tailwind...');
    await Bun.build({
      entrypoints: ['./src/index.html'],
      outdir: './dist',
      target: 'browser',
      plugins: [tailwind],
      sourcemap: 'external',
      minify: false,
      splitting: false,
      define: {
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
