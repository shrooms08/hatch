// Crack button (lab specimen 7) for the launch form's submit. A real <button type="submit">: hover lifts it
// and wobbles the egg; while the launch is pending it stays pressed; ONLY after the launch confirms
// (phase "success") does the crack draw, the button split, the chick peek and the label seal as "Hatched!".
// A failure sends phase back to "idle": the button resets with no crack. Styles: styles/motion.css.
import { useEffect, useRef, useState } from 'react';
import { CHICK, cells, css } from '@/lib/motion/engine';
import { prefersReducedMotion } from '@/lib/motion/runner';
import { cn } from '@/lib/utils';

export type CrackPhase = 'idle' | 'pending' | 'success';

// The lab's zigzag split line: 12 segments alternating 40% / 60% of the height.
const ZZ = Array.from({ length: 13 }, (_, i) => [(i / 12) * 100, i % 2 ? 40 : 60] as const);
const TOP = `polygon(0 0,100% 0,${ZZ.slice().reverse().map((p) => `${p[0]}% ${p[1]}%`).join(',')})`;
const BOT = `polygon(${ZZ.map((p) => `${p[0]}% ${p[1]}%`).join(',')},100% 100%,0 100%)`;
const CRACK_PATH = `M${ZZ.map((p) => `${p[0]} ${p[1]}`).join(' L')}`;
const SPARK_COLS = ['#F2A93B', '#E8572A', '#F6EEDC'];

const Egg = () => (
  <svg className="crack-egg" viewBox="0 0 20 26" aria-hidden>
    <path d="M10 1C5 1 1 9 1 15.5 1 21 5 25 10 25s9-4 9-9.5C19 9 15 1 10 1z" fill="currentColor" />
  </svg>
);

type Spark = { id: number; dx: number; dy: number; rot: number; color: string; round: boolean };

export function CrackButton({
  phase,
  label,
  showEgg = true,
  disabled,
  onSequenceDone,
  className,
}: {
  phase: CrackPhase;
  label: string;
  showEgg?: boolean;
  disabled?: boolean;
  /** Called once the "Hatched!" seal has shown (after a confirmed launch). */
  onSequenceDone?: () => void;
  className?: string;
}) {
  const [stage, setStage] = useState<'idle' | 'press' | 'cracking' | 'split' | 'done'>('idle');
  const [sparks, setSparks] = useState<Spark[]>([]);
  const timers = useRef<number[]>([]);
  const chick = useRef<HTMLCanvasElement>(null);
  const done = useRef(onSequenceDone);
  done.current = onSequenceDone;

  // The chick that peeks out: drawn once (lab: 92x92 canvas, 12 px pitch).
  useEffect(() => {
    const cx = chick.current?.getContext('2d');
    if (!cx) return;
    cells(CHICK).forEach((c) => {
      cx.fillStyle = css(c.c);
      cx.beginPath();
      cx.arc(46 + c.x * 12, 46 + c.y * 12, 4.6, 0, Math.PI * 2);
      cx.fill();
    });
  }, []);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    clear();
    const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    if (phase === 'idle') {
      setStage('idle'); // includes a failed launch: back to normal, no crack
      setSparks([]);
    } else if (phase === 'pending') {
      setStage('press');
    } else if (prefersReducedMotion()) {
      setStage('done'); // settled frame, no motion
      later(700, () => done.current?.());
    } else {
      // Lab timings: crack at 90 ms, split + sparks at 330 ms, sealed at 1050 ms.
      setStage('press');
      later(90, () => setStage('cracking'));
      later(330, () => {
        setStage('split');
        setSparks(
          Array.from({ length: 18 }, (_, k) => {
            const a = (k / 18) * Math.PI * 2 + Math.random() * 0.3;
            const d = 70 + Math.random() * 60;
            return { id: Date.now() + k, dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.75, rot: Math.random() * 540 - 270, color: SPARK_COLS[k % 3], round: k % 2 === 1 };
          })
        );
      });
      later(1050, () => {
        setStage('done');
        setSparks([]);
      });
      later(1600, () => done.current?.());
    }
    return clear;
  }, [phase]);

  const text = stage === 'done' ? 'Hatched!' : label;
  const half = (which: 'top' | 'bot') => (
    <span aria-hidden className={cn('crack-half', which)} style={{ clipPath: which === 'top' ? TOP : BOT }}>
      {showEgg && <Egg />}
      <span>{text}</span>
    </span>
  );
  return (
    <button
      type="submit"
      disabled={disabled || phase !== 'idle'}
      aria-busy={phase === 'pending' || undefined}
      className={cn(
        'crack-btn',
        phase === 'pending' && 'is-pending',
        phase === 'success' && 'is-pending',
        stage === 'press' && 'is-press',
        (stage === 'cracking' || stage === 'split') && 'is-cracking',
        stage === 'split' && 'is-split',
        stage === 'done' && 'is-done',
        className
      )}
    >
      <span className="sr-only">{text}</span>
      {half('top')}
      {half('bot')}
      <canvas ref={chick} className="crack-chick" width={92} height={92} aria-hidden />
      <svg className="crack-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d={CRACK_PATH} vectorEffect="non-scaling-stroke" />
      </svg>
      {sparks.map((s) => (
        <span
          key={s.id}
          aria-hidden
          className="crack-spark"
          style={{ background: s.color, borderRadius: s.round ? '50%' : '1px', ['--dx' as string]: `${s.dx}px`, ['--dy' as string]: `${s.dy}px`, ['--rot' as string]: `${s.rot}deg` }}
        />
      ))}
    </button>
  );
}
