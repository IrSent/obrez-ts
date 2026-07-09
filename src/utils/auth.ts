/**
 * Check if the free 5-hour topup is available.
 * Available if never topped up, or 30+ days since last free topup.
 */
export function canFreeTopup(lastFreeTopup: string | null | undefined): boolean {
  if (!lastFreeTopup) return true;
  const daysSince = Math.floor(
    (Date.now() - new Date(lastFreeTopup).getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSince >= 30;
}

/**
 * Days remaining until the free topup is available.
 */
export function daysUntilFreeTopup(lastFreeTopup: string | null | undefined): number | null {
  if (!lastFreeTopup) return null;
  const daysSince = Math.floor(
    (Date.now() - new Date(lastFreeTopup).getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, 30 - daysSince);
}

/**
 * Format seconds into a human-readable duration.
 */
export function formatSeconds(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
