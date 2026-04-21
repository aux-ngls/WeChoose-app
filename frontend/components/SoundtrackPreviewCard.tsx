"use client";

import { useEffect, useRef, useState } from "react";
import { Disc3, Pause, Play, X } from "lucide-react";
import type { ProfileShowcaseSoundtrack } from "@/lib/social";

interface SoundtrackPreviewCardProps {
  soundtrack: ProfileShowcaseSoundtrack;
  onRemove?: () => void;
}

export default function SoundtrackPreviewCard({
  soundtrack,
  onRemove,
}: SoundtrackPreviewCardProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const audio = new Audio(soundtrack.preview_url || "");
    audio.preload = "none";

    const handleEnded = () => setIsPlaying(false);
    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("play", handlePlay);
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.currentTime = 0;
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("play", handlePlay);
      audioRef.current = null;
    };
  }, [soundtrack.preview_url]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !soundtrack.preview_url) {
      return;
    }

    try {
      if (audio.paused) {
        audio.currentTime = 0;
        await audio.play();
      } else {
        audio.pause();
      }
    } catch {
      setIsPlaying(false);
    }
  };

  return (
    <div className="mt-3 overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.04]">
      <div className="flex items-start gap-3 p-3">
        <div className="h-16 w-12 shrink-0 overflow-hidden rounded-[16px] border border-white/10 bg-white/[0.04]">
          {soundtrack.artwork_url ? (
            <img
              src={soundtrack.artwork_url}
              alt={soundtrack.track_name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-500">
              <Disc3 className="h-4 w-4" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-white">{soundtrack.track_name}</div>
          <div className="mt-1 truncate text-xs text-gray-400">{soundtrack.artist_name}</div>
          {soundtrack.collection_name ? (
            <div className="mt-1 truncate text-[11px] uppercase tracking-[0.14em] text-emerald-200/80">
              {soundtrack.collection_name}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void togglePlayback()}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-gradient-to-r from-rose-500/85 to-amber-400/85 px-4 py-2 text-sm font-bold text-white shadow-[0_12px_28px_rgba(0,0,0,0.28)] transition hover:opacity-95"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
            {isPlaying ? "Pause" : "Ecouter l'extrait"}
          </button>
        </div>

        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full bg-black/50 p-2 text-white"
            aria-label="Retirer cette musique"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
