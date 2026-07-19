/**
 * CD-player button style: light border top/left, dark border bottom/right → raised edge.
 * Subtle drop shadow for depth.  active: inverted borders → pressed look.
 */
export const cdBtn =
  'border border-t-zinc-300 border-l-zinc-300 border-b-zinc-950 border-r-zinc-950 ' +
  'shadow-[0_1px_2px_rgba(0,0,0,0.5)] ' +
  'active:border-t-zinc-950 active:border-l-zinc-950 active:border-b-zinc-300 active:border-r-zinc-300 ' +
  'active:shadow-none ' +
  'transition-all duration-75 select-none';

/**
 * CD-player recessed input/display: dark top/left, light bottom/right → inset look.
 */
export const cdInset =
  'border border-t-zinc-950 border-l-zinc-950 border-b-zinc-500 border-r-zinc-500 ' +
  'shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] ' +
  'transition-all duration-75';

/**
 * Shield-shaped (pentagon) button — clip-path to a shield, with a 1px border
 * underneath for the raised 3D edge.  Tall enough for a comfortable tap
 * (min-w-[44px] min-h-[44px] per Apple HIG).
 *
 * The border is achieved by stacking two shield-shaped divs — outer one is the
 * border color, inner one is the button background.
 */
export const shieldBtn =
  'relative min-w-[44px] min-h-[44px] ' +
  'transition-colors select-none';
