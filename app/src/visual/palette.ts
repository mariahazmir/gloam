// The one place colour tokens are defined (.kiro/steering/design.md).
// map/style.ts, map/layers.ts and visual/tierStyles.ts import from here, and the
// shell copies the same tokens into CSS custom properties, so no other module
// holds a hex value. Pure: no I/O.

/** Accent colours. */
export const PALETTE = { pumpkin: '#ff7100', lantern: '#fd9702', glow: '#e102ff', dusk: '#ae03ff' } as const;

/** Night gradient, lighter end first. The base map uses both ends as flat colours. */
export const NIGHT = { top: '#4A1C7E', bottom: '#2E0F55' } as const;

/** Frosted-glass card: white at 13%, a 1.5px border of white at 28%. */
export const GLASS = {
  fill: 'rgba(255, 255, 255, 0.13)',
  border: 'rgba(255, 255, 255, 0.28)',
  borderWidth: '1.5px',
} as const;

/** Supporting tones from the design reference: wordmark amber, lit-line gold, soft text, fog violet and the bottom-sheet fill. */
export const TONES = {
  amber: '#ffb347',
  litLine: '#ffc65a',
  mist: '#F1E6FF',
  fog: '#d79cff',
  sheet: 'rgba(40, 12, 76, 0.62)',
  /** Extruded buildings: a light violet, drawn see-through on the map. */
  building: '#8a64b8',
} as const;

/** CSS custom properties set on the document root at start-up. */
export const CSS_VARS: Readonly<Record<string, string>> = {
  '--pumpkin': PALETTE.pumpkin,
  '--lantern': PALETTE.lantern,
  '--glow': PALETTE.glow,
  '--dusk': PALETTE.dusk,
  '--amber': TONES.amber,
  '--lit-line': TONES.litLine,
  '--mist': TONES.mist,
  '--fog': TONES.fog,
  '--sheet': TONES.sheet,
  '--night-top': NIGHT.top,
  '--night-bottom': NIGHT.bottom,
  '--glass-fill': GLASS.fill,
  '--glass-border': GLASS.border,
  '--glass-border-width': GLASS.borderWidth,
};
