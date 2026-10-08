// COPY of web/src/lib/buddyArt.ts, which is the single source of truth for the buddy's art (the
// website's ChickenOrb draws from it). Edit it there, then copy here: tests/art.test.ts fails if the two
// differ. 11x11 grids and the disc they sit on.
//
// Cells: '.' empty dot, S shell, Y yolk, E ember (comb), N night (eye, crack).

export const GRID = 11;

export const CHICKEN = ['......EE...', '.....SSSS..', '.....SNSSY.', 'S....SSSSYY', 'SS..SSSSS..', 'SSSSSSSSS..', 'SSSSSSSSS..', '.SSSSSSSS..', '..SSSSSS...', '....Y.Y....', '...YY.YY...'];
export const EGG = ['....SSS....', '...SSSSS...', '..SSSSSSS..', '..SSSSSSS..', '.SSSYYYSSS.', '.SSYYYYYSS.', '.SSYYYYYSS.', '.SSSYYYSSS.', '..SSSSSSS..', '...SSSSS...', '...........'];

/** Idle moments: the eye closes; the beak tips down (a peck). */
export const CHICKEN_BLINK = ['......EE...', '.....SSSS..', '.....SSSSY.', 'S....SSSSYY', 'SS..SSSSS..', 'SSSSSSSSS..', 'SSSSSSSSS..', '.SSSSSSSS..', '..SSSSSS...', '....Y.Y....', '...YY.YY...'];
export const CHICKEN_PECK = ['......EE...', '.....SSSS..', '.....SNSS..', 'S....SSSSYY', 'SS..SSSSSY.', 'SSSSSSSSS..', 'SSSSSSSSS..', '.SSSSSSSS..', '..SSSSSS...', '....Y.Y....', '...YY.YY...'];

/** The egg with a zigzag crack across its middle (launched / hatched). */
export const EGG_CRACK = ['....SSS....', '...SSSSS...', '..SSSSSSS..', '..SSSSSSS..', '.SNSNYNSNS.', '.SSNYNYNSS.', '.SSYYYYYSS.', '.SSSYYYSSS.', '..SSSSSSS..', '...SSSSS...', '...........'];

export const CELL_COLOR: Record<string, string> = { '.': 'rgba(246,238,220,0.07)', S: '#F6EEDC', Y: '#F2A93B', E: '#E8572A', N: '#120E0B' };

/** Disc: grid spans 56% of the diameter; a dot is 74% of its pitch. */
export const ART = {
  gridRatio: 0.56,
  dotRatio: 0.74,
  background: 'radial-gradient(circle at 35% 28%, #2C241E 0%, #120E0B 72%)',
  border: '#4A3E34',
  shadow: '0 14px 36px rgba(0,0,0,0.55)',
  ring: 'rgba(242,169,59,0.10)',
  /** Ring width in px for a disc of `size` px. */
  ringWidth: (size: number) => Math.max(2, Math.round(size / 24)),
} as const;
