// The egg icon used in the Hatch web app header (Phosphor "egg-bold", MIT), as an inline SVG.
export const EGG_PATH =
  'M190 57.34C171.06 29 147.88 12 128 12S84.94 29 66 57.34C46.94 86 36 120.46 36 152a92 92 0 0 0 184 0c0-31.54-10.94-66-30-94.66M128 220a68.07 68.07 0 0 1-68-68c0-61.12 46.19-116 68-116s68 54.88 68 116a68.07 68.07 0 0 1-68 68';

export function eggSvg(size = 24, color = 'currentColor'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256" aria-hidden="true"><path fill="${color}" d="${EGG_PATH}"/></svg>`;
}
