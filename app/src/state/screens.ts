// Screen addresses in the URL hash (Requirement 18.1). Pure: no I/O.

export type Screen = 'map' | 'route' | 'report' | 'about' | 'credits';

export const SCREENS: ReadonlyArray<Screen> = ['map', 'route', 'report', 'about', 'credits'];

/** The hash for a screen. The Map_Screen is the bare "#/". */
export function hashOf(screen: Screen): string {
  return screen === 'map' ? '#/' : `#/${screen}`;
}

/** The screen a hash names. A trailing slash or query is ignored; anything unknown gives 'map'. */
export function screenFromHash(hash: string): Screen {
  if (typeof hash !== 'string') return 'map';
  const name = hash.replace(/^#\/?/, '').split(/[?/]/)[0] ?? '';
  return (SCREENS as ReadonlyArray<string>).includes(name) && name !== 'map' ? (name as Screen) : 'map';
}
