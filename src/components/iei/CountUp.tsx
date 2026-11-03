'use client';

import { useEffect, useRef } from 'react';

/**
 * A figure that counts up once, on arrival.
 *
 * It renders its FINAL value on the server and in the first client render, so the page is complete and correct with script off, before
 * hydration, and for anyone who asked their system for reduced motion. After mount, and only if motion is allowed and the figure is on screen, it
 * counts from zero to the value in about 800 ms and lands on exactly the same text the server wrote. The animation writes to the node
 * directly, never through React state, so a count-up is sixty text writes and no re-renders.
 *
 * It animates a whole number. A figure with a decimal, a unit or a year is not counted up (a year that counts up from 0 reads as a
 * defect), and the caller leaves it as text.
 */
export function CountUp({ value, locale = 'en-IN', ms = 800 }: { value: number; locale?: string; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const format = (n: number): string => new Intl.NumberFormat(locale).format(Math.round(n));
  useEffect(() => {
    const el = ref.current;
    if (el === null || !Number.isFinite(value) || value < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let started = false;
    const run = (): void => {
      if (started) return;
      started = true;
      const t0 = performance.now();
      const step = (now: number): void => {
        const t = Math.min(1, (now - t0) / ms);
        // Ease-out: most of the distance early, the last digits slowly, so the eye can read the number it lands on.
        el.textContent = format(value * (1 - Math.pow(1 - t, 3)));
        if (t < 1) frame = requestAnimationFrame(step);
        else el.textContent = format(value);
      };
      el.textContent = format(0);
      frame = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      if (el !== null) el.textContent = format(value);
    };
    // `format` is a pure function of the locale, so the effect is keyed on what it displays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, locale, ms]);
  return (
    <span ref={ref} className="iei-count">
      {format(value)}
    </span>
  );
}
