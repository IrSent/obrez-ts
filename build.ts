import { $, MD5 } from 'bun';
import { mkdir, rm, cp, readdir, stat } from 'fs/promises';
import tailwind from 'bun-plugin-tailwind';

// Parse --version flag using Bun.argv (strips bun's own flags)
const versionIdx = Bun.argv.indexOf('--version');
const version = versionIdx >= 0
  ? Bun.argv[versionIdx + 1]?.replace(/^v/, '') || null
  : null;

/**
 * Build the app.
 * Without --version: builds into dist/ (dev mode, full cleanup).
 * With --version: builds into dist/<version>/ (deploy mode, no cleanup of other versions).
 */
async function build() {
  const outDir = version ? `dist/${version}` : 'dist';

  try {
    if (!version) {
      // Dev mode: clean entire dist folder
      console.log('Cleaning dist folder...');
      await rm('dist', { recursive: true, force: true });
    } else {
      // Deploy mode: clean only this version folder
      console.log(`Cleaning ${outDir}/...`);
      await rm(outDir, { recursive: true, force: true });
    }

    // Create dist folder
    console.log('Creating dist folder...');
    await mkdir(outDir, { recursive: true });

    // Copy public assets
    console.log('Copying public assets...');
    await $`cp -r public/* ${outDir}/`;

    // Cache-bust: copy settings-early and settings-ui with MD5 hash in filename.
    // GitHub Pages caches for 600s — new filename = new URL = fresh content.
    // Copied to dist/ root (for ../ resolution from version dirs) and outDir (dev mode).
    const earlyHash = MD5.hash(await Bun.file('public/settings-early.js').arrayBuffer(), 'hex').slice(0, 8);
    const uiHash = MD5.hash(await Bun.file('public/settings-ui.js').arrayBuffer(), 'hex').slice(0, 8);
    const earlyName = `settings-early.${earlyHash}.js`;
    const uiName = `settings-ui.${uiHash}.js`;
    await $`cp public/settings-early.js dist/${earlyName}`;
    await $`cp public/settings-ui.js dist/${uiName}`;
    if (version) {
      // Also copy into version dir for dev mode
      await $`cp public/settings-early.js ${outDir}/${earlyName}`;
      await $`cp public/settings-ui.js ${outDir}/${uiName}`;
    }
    console.log(`  ${earlyName}, ${uiName} → dist/`);

    // Copy Phase Vocoder processor from node_modules — always fresh
    console.log('Copying Phase Vocoder processor...');
    await $`cp node_modules/@soundtouchjs/phase-vocoder-worklet/.dist/phase-vocoder-processor.js ${outDir}/`.quiet();

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
      outdir: outDir,
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

    // Inject settings scripts:
    // - early (error intercept) in <head> — runs before anything else
    // - ui (buttons, modal) in <body> — runs when DOM is ready
    const indexPath = `${outDir}/index.html`;
    const builtIndex = Bun.file(indexPath);
    const html = await builtIndex.text();
    const withSettings = html
      .replace(
        '<head>',
        `<head><script src="../settings-early.${earlyHash}.js"></script>`,
      )
      .replace(
        '</body>',
        `<script>document.addEventListener('DOMContentLoaded',function(){
          var s=document.createElement('script');s.src='../settings-ui.${uiHash}.js';document.head.appendChild(s);
        });</script></body>`,
      );
    await Bun.write(builtIndex, withSettings);

    console.log(`Build completed successfully! → ${outDir}`);
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
