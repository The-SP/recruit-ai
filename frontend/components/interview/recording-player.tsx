"use client";

import { Pause, Play } from "lucide-react";
import { useState } from "react";

import { AudioProgress } from "@/components/interview/audio-progress";
import { useAudioPlayback } from "@/components/interview/use-audio-playback";
import { Button } from "@/components/ui/button";

/**
 * Listen-back control for the answer the candidate just recorded, in place of
 * the browser's native player, which ignores the theme and looks different in
 * every browser.
 */
export function RecordingPlayer({ src }: { src: string }) {
  // State via a callback ref, so the playback hook sees the element appear.
  const [element, setElement] = useState<HTMLAudioElement | null>(null);
  const { isPlaying, current, duration, toggle, seek } = useAudioPlayback(element);

  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2">
      <audio ref={setElement} src={src} preload="metadata" />
      <Button
        type="button"
        size="icon"
        variant="secondary"
        onClick={toggle}
        aria-label={isPlaying ? "Pause your answer" : "Play your answer"}
        className="h-9 w-9 rounded-full shrink-0 cursor-pointer"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </Button>
      <AudioProgress
        current={current}
        duration={duration}
        onSeek={seek}
        className="flex-1 text-muted-foreground"
      />
    </div>
  );
}
