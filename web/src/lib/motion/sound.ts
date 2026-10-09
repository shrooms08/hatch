// The double chirp (design/sfx/hatch-sfx/chirp-double.mp3, served from /sfx). The web app has no sound
// setting of its own, so this only stays quiet while a scene is being settled for reduced motion.
let muted = 0;

/** Runs `fn` with sounds off (fast-forwarding a scene must not chirp). */
export function silently(fn: () => void) {
  muted++;
  try {
    fn();
  } finally {
    muted--;
  }
}

export function playChirpDouble(volume = 0.4) {
  if (muted || typeof Audio === 'undefined') return;
  try {
    const a = new Audio('/sfx/chirp-double.mp3');
    a.volume = volume;
    void a.play().catch((): undefined => undefined); // autoplay may be blocked without a user gesture: stay silent
  } catch {
    /* no audio */
  }
}
