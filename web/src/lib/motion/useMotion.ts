// React glue: one MotionRunner per canvas, created after mount and destroyed on unmount.
import { useEffect, useRef } from 'react';
import type { Scene } from './engine';
import { MotionRunner, type Spec } from './runner';

export function useMotion<S extends Scene>(makeSpec: () => Spec<S>, opts: { loopHold?: number | null; onEnd?: () => void; autoplay?: 'play' | 'run' | false } = {}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runner = useRef<MotionRunner<S> | null>(null);
  const onEnd = useRef(opts.onEnd);
  onEnd.current = opts.onEnd;
  useEffect(() => {
    if (!canvas.current) return;
    const r = new MotionRunner(canvas.current, makeSpec(), { loopHold: opts.loopHold, onEnd: () => onEnd.current?.() });
    runner.current = r;
    if (opts.autoplay === 'play') r.play();
    else if (opts.autoplay === 'run') r.run();
    else r.refresh();
    return () => {
      r.destroy();
      runner.current = null;
    };
    // The spec and options are fixed for the component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { canvas, runner };
}
