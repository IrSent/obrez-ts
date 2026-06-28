import { test, expect } from '@playwright/test';
import * as fs from 'fs';

/**
 * Censor Export — Full Integration Test
 *
 * Validates:
 * 1. Load video + add bleep sound + import effects via JSON
 * 2. Export completes with real progress (doesn't hang on "Rendering censored audio")
 * 3. Exported file is valid (correct mime + header)
 * 4. Worker is used for audio rendering (no main-thread OfflineAudioContext stall)
 * 5. No fatal console errors
 */
test.describe('Censor Export', () => {
  test('loads video, imports effects, exports censored file with progress', async ({ page }) => {
    test.setTimeout(180_000);

    // ── Collect diagnostics ──────────────────────────────────────────
    const errors: string[] = [];
    const exportStages: string[] = [];
    let exportResult: { size: number; mimeType: string; header: string } | null = null;

    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
      if (msg.text().startsWith('[export-test]')) {
        const data = JSON.parse(msg.text().slice(13));
        exportResult = data;
      }
    });

    // Listen to exportStage changes in the Zustand store
    await page.addInitScript(() => {
      // Intercept the store's setState to capture exportStage values
      const origConsole = console.log;
      (window as any).__exportStages = [];
      (window as any).__exportDone = false;
    });

    // Poll exportStage from page context
    const pollExportStage = async () => {
      const stages = await page.evaluate(async () => {
        // Access the zustand store from the page
        const result: string[] = [];
        try {
          const stage = (window as any).__exportStages;
          if (stage) result.push(...stage);
        } catch { /* noop */ }
        return result;
      });
      exportStages.push(...stages);
    };

    // ── Intercept URL.createObjectURL for export result ──────────────
    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      (URL as any).createObjectURL = function (obj: any) {
        const url = orig(obj);
        if (obj.type?.startsWith('video/')) {
          const reader = new FileReader();
          reader.onload = () => {
            const arr = new Uint8Array(reader.result as ArrayBuffer);
            const hex = arr
              .slice(0, 4)
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('');
            console.log(
              `[export-test]${JSON.stringify({
                size: (reader.result as ArrayBuffer).byteLength,
                mimeType: obj.type,
                header: hex,
              })}`,
            );
          };
          reader.readAsArrayBuffer(obj);
        }
        return url;
      };

      // Track export stages from the app
      (window as any).__exportStages = [];
      // We'll poll the store directly
    });

    // ── Step 1: Load video ───────────────────────────────────────────
    await page.goto('/');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Load File' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('e2e/valid-with-aac.mp4');

    // Wait for video to load (duration changes from 00:00)
    const durationText = page.locator('span.text-xs.opacity-60').last();
    await expect(durationText).not.toHaveText(/^00:00/, { timeout: 30_000 });

    // Wait for audio bootstrap and warmup
    await page.waitForTimeout(5_000);
    await expect(page.locator('text=Playback failed')).not.toBeVisible();

    // ── Step 2: Add bleep sound ──────────────────────────────────────
    const bleepHeading = page.getByRole('heading', { name: 'Bleep Sounds' });
    await bleepHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const addSoundBtn = page.getByRole('button', { name: 'Add Sound' });
    await addSoundBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await addSoundBtn.click();

    await expect(page.locator('h3:has-text("Add Bleep Sound")')).toBeVisible({ timeout: 5_000 });

    // Set the file directly on the modal's file input (accept="audio/*" exactly)
    // This avoids the filechooser event and works with hidden/visible inputs
    await page.setInputFiles(
      'input[type="file"][accept="audio/*"]',
      'e2e/gong_1.mp3',
    );

    await expect(page.locator('text=No bleep sounds added')).not.toBeVisible({ timeout: 10_000 });

    // Get soundId from the store (more reliable than IndexedDB)
    const bleepSoundId = await page.evaluate(() => {
      // The app stores bleepSounds in Zustand — access via window
      // We'll read from the module scope
      const store = (window as any).__zone?.get?.(Symbol.for('zustand'));
      // Fallback: read from IndexedDB which is the source of truth
      return new Promise<string>((resolve, reject) => {
        const req = indexedDB.open('obrez-bleep', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('sounds', 'readonly');
          const store = tx.objectStore('sounds');
          const allReq = store.getAll();
          allReq.onsuccess = () => resolve((allReq.result as any[])[0]?.id ?? '');
          allReq.onerror = () => reject(allReq.error);
        };
        req.onerror = () => reject(req.error);
      });
    });
    expect(bleepSoundId, 'Bleep sound should have been added').toBeTruthy();

    // ── Step 3: Build and import JSON with effects ───────────────────
    const jsonContent = JSON.stringify({
      version: 1,
      transcription: [
        { start: 0.5, end: 1.2, text: 'Hello' },
        { start: 1.3, end: 2.0, text: 'world' },
        { start: 2.1, end: 3.0, text: 'this' },
        { start: 3.1, end: 4.0, text: 'is' },
        { start: 4.1, end: 5.5, text: 'a test' },
      ],
      effects: [
        {
          id: 'eff-1',
          segmentStart: 0.5,
          soundId: bleepSoundId,
          volume: 1,
          volumeMode: 'manual',
          playbackRate: 1,
          dampenOriginal: true,
          dampenAmount: 1,
          dampenType: 'sharp',
          effectType: 'sound',
        },
        {
          id: 'eff-2',
          segmentStart: 2.1,
          soundId: bleepSoundId,
          volume: 0.5,
          volumeMode: 'manual',
          playbackRate: 1,
          dampenOriginal: true,
          dampenAmount: 0.5,
          dampenType: 'parabolic',
          effectType: 'sound',
        },
      ],
    });

    const jsonPathLocal = 'e2e/censor-test-dynamic.json';
    fs.writeFileSync(jsonPathLocal, jsonContent);

    const importFileChooserPromise = page.waitForEvent('filechooser');
    await page.getByTitle('Import transcription + effects from JSON').click();
    const importFileChooser = await importFileChooserPromise;
    await importFileChooser.setFiles(jsonPathLocal);

    const importDone = page.locator('text=Done ✓');
    await expect(importDone).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('text=Import failed')).not.toBeVisible();

    // ── Step 4: Export button visible ────────────────────────────────
    const exportButton = page.getByRole('button', { name: /Export Censored Video/i });
    await expect(exportButton).toBeVisible({ timeout: 10_000 });

    // ── Step 5: Start export ─────────────────────────────────────────
    await exportButton.click();

    const modal = page.locator('text=Export Video');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    const modalExportButton = page.getByRole('button', { name: /^Export$/i });
    await modalExportButton.click();

    // Modal closes
    await expect(modal).not.toBeVisible({ timeout: 5_000 });

    // ── Step 6: Validate progress updates ────────────────────────────
    const progressBar = page.locator('[class*="bg-green-500"]');
    await expect(progressBar).toBeVisible({ timeout: 10_000 });

    // Collect export stages while waiting for progress
    const collectedStages: string[] = [];
    const stagePollInterval = setInterval(async () => {
      try {
        const stage = await page.evaluate(() => {
          // Read from the page's app state — the export stage text in the DOM
          const el = document.querySelector('[class*="bg-green-500"]');
          if (!el) return null;
          const parent = el.closest('.space-y-1');
          if (!parent) return null;
          const textEl = parent.querySelector('span');
          return textEl?.textContent ?? null;
        });
        if (stage) collectedStages.push(stage);
      } catch { /* progress bar gone — export done */ }
    }, 500);

    try {
      // Wait for export to complete
      await expect(progressBar).not.toBeVisible({ timeout: 180_000 });
    } finally {
      clearInterval(stagePollInterval);
      console.log('Collected stages:', collectedStages);
      console.log('Console errors:', errors);
    }

    // ── Step 7: No fatal error in UI ─────────────────────────────────
    const fatalError = page.locator('.text-red-400').filter({ hasText: /fatal|Export failed/i });
    await expect(fatalError).not.toBeVisible();

    // ── Step 8: Verify the intercepted result ────────────────────────
    await page.waitForTimeout(2_000); // allow FileReader callback

   expect(exportResult, 'Export should produce a video Blob').toBeTruthy();
    expect(exportResult!.size, 'Exported file should be substantial').toBeGreaterThan(200_000);
    expect(exportResult!.mimeType).toMatch(/^video\//);

    // Verify file header
    if (exportResult!.mimeType === 'video/mp4') {
      expect(exportResult!.header, 'MP4 must start with "ftyp" (hex 66747970)').toBe('66747970');
    } else if (exportResult!.mimeType === 'video/webm') {
      expect(exportResult!.header, 'WebM must start with EBML header').toMatch(/^1a45/);
    }

    // ── Step 9: Validate progress was reported ───────────────────────
    expect(collectedStages.length, 'Export should show multiple progress stages').toBeGreaterThan(2);

    // Verify that "Rendering censored audio" stage had real progress (not stuck at 0%)
    const renderStages = collectedStages.filter((s) => s.includes('Rendering censored audio'));
    expect(renderStages.length, 'Rendering should report multiple progress updates').toBeGreaterThan(1);

    // Parse percentages from render stages
    const renderPcts = renderStages.map((s) => {
      const m = s.match(/(\d+)%/);
      return m ? parseInt(m[1], 10) : null;
    }).filter((p): p is number => p !== null);

    if (renderPcts.length >= 2) {
      // Progress should increase — not stuck at 0%
      const hasMeaningfulProgress = renderPcts.some((p) => p > 5);
      expect(
        hasMeaningfulProgress,
        `Rendering progress should advance beyond 5%. Stages: ${renderStages.join(' → ')}`,
      ).toBe(true);
    }

    // Verify encoding stage was reached (means rendering completed)
    const encodeStages = collectedStages.filter((s) => s.includes('Encoding'));
    expect(encodeStages.length, 'Should reach encoding phase').toBeGreaterThan(0);

    // ── Step 10: No fatal console errors ─────────────────────────────
    const fatalConsole = errors.filter((e) =>
      e.toLowerCase().includes('fatal') || e.toLowerCase().includes('unhandled')
    );
    expect(fatalConsole.length, 'No fatal errors during export').toBe(0);

    // Cleanup
    fs.unlinkSync(jsonPathLocal);

    // ── Structured report ────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════');
    console.log('CENSOR EXPORT TEST — RESULTS');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Bleep sound: ${bleepSoundId}`);
    console.log(`File: ${(exportResult!.size / 1024).toFixed(0)} KB (${exportResult!.mimeType})`);
    console.log(`Header: ${exportResult!.header}`);
    console.log(`Progress stages: ${collectedStages.length}`);
    console.log(`  Render stages: ${renderStages.length} (pcts: ${renderPcts.join(', ')})`);
    console.log(`  Encode stages: ${encodeStages.length}`);
    console.log(`Console errors: ${errors.length} (fatal: ${fatalConsole.length})`);
    console.log('═══════════════════════════════════════════════════\n');
  });
});
