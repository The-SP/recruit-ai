"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const BAR_COUNT = 32;
const MIN_SCALE = 0.08;

/**
 * Live level bars driven by the microphone itself, not a canned animation:
 * silence stays flat, so a candidate can see a dead or muted mic before they
 * play anything back.
 *
 * Heights are written straight to the DOM from a rAF loop; routing ~60 updates
 * a second through React state would re-render the parent for nothing. The
 * analyser is never connected to the speakers, so there is no echo.
 */
export function AudioLevelBars({
  stream,
  className,
}: {
  stream: MediaStream;
  className?: string;
}) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    // Safari can create the context suspended even right after a click.
    void ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    // Speech energy sits in the lower bins; spread those across half the bars
    // and mirror them, so the loudest band is in the middle.
    const bands = BAR_COUNT / 2;
    const binsPerBand = Math.max(1, Math.floor((data.length * 0.5) / bands));
    const mid = (BAR_COUNT - 1) / 2;

    let frame = 0;
    const draw = () => {
      analyser.getByteFrequencyData(data);
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        const band = Math.min(bands - 1, Math.floor(Math.abs(i - mid)));
        let sum = 0;
        for (let j = band * binsPerBand; j < (band + 1) * binsPerBand; j++) {
          sum += data[j];
        }
        const level = sum / binsPerBand / 255;
        const scale = Math.max(MIN_SCALE, Math.min(1, level * 1.5));
        bar.style.transform = `scaleY(${scale})`;
      });
      frame = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void ctx.close();
    };
  }, [stream]);

  return (
    <div aria-hidden className={cn("flex h-8 items-center justify-between gap-[3px]", className)}>
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="h-full w-1 rounded-full bg-primary transition-transform duration-75"
          style={{ transform: `scaleY(${MIN_SCALE})` }}
        />
      ))}
    </div>
  );
}
