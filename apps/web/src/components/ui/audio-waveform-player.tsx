"use client";

import { useEffect, useRef, useState, useCallback, useId } from "react";
import { Icon } from "@/components/ui/icon";

export interface AudioWaveformPlayerProps {
  src: string;
  speakerName?: string;
  voiceName?: string;
  title?: string;
  className?: string;
  onEnded?: () => void;
  onTimeChange?: (seconds: number) => void;
  seekRequest?: { seconds: number; nonce: number } | null;
  downloadName?: string;
  autoPlay?: boolean;
}

export function AudioWaveformPlayer({
  src,
  speakerName,
  voiceName,
  title,
  className = "",
  onEnded,
  onTimeChange,
  seekRequest,
  downloadName,
  autoPlay = false,
}: AudioWaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clipId = useId();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Synchronize playback rate
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Audio lifecycle bindings
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      setIsLoaded(true);
      if (autoPlay) {
        audio.play().catch(() => setIsPlaying(false));
      }
    };

    const handleTimeUpdate = () => {
      if (!isScrubbing) {
        setCurrentTime(audio.currentTime);
        onTimeChange?.(audio.currentTime);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.duration);
      onEnded?.();
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [autoPlay, isScrubbing, onEnded, onTimeChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !seekRequest) return;
    const target = Math.max(
      0,
      Math.min(
        seekRequest.seconds,
        Number.isFinite(audio.duration) ? audio.duration : seekRequest.seconds,
      ),
    );
    audio.currentTime = target;
    setCurrentTime(target);
    onTimeChange?.(target);
  }, [seekRequest, onTimeChange]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => setIsPlaying(false));
    }
  };

  const handleSeek = useCallback(
    (clientX: number) => {
      if (!containerRef.current || !audioRef.current || !duration) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const percentage = relativeX / rect.width;
      const newTime = percentage * duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration],
  );

  const handleKeyboardSeek = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const delta =
      event.key === "ArrowRight"
        ? 5
        : event.key === "ArrowLeft"
          ? -5
          : event.key === "Home"
            ? -duration
            : event.key === "End"
              ? duration
              : 0;
    if (!delta) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? duration
          : Math.max(0, Math.min(duration, audio.currentTime + delta));
    audio.currentTime = next;
    setCurrentTime(next);
    onTimeChange?.(next);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    handleSeek(e.clientX);

    const onMouseMove = (moveEvent: MouseEvent) => {
      handleSeek(moveEvent.clientX);
    };
    const onMouseUp = () => {
      setIsScrubbing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const cyclePlaybackRate = () => {
    const rates = [1.0, 1.25, 1.5, 0.75];
    const nextIndex = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIndex] ?? 1.0;
    setPlaybackRate(nextRate);
  };

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Generate organic hand-drawn sketch wave points
  // 32 sample points creating an organic continuous hand-drawn contour
  const wavePoints = [
    18, 12, 24, 8, 28, 14, 22, 6, 30, 16, 26, 10, 20, 14, 25, 8, 28, 16, 22, 12,
    26, 8, 18, 14, 28, 10, 24, 16, 20, 12, 18, 15,
  ];

  const totalPoints = wavePoints.length;
  const pathCommands = wavePoints
    .map((y, i) => {
      const x = (i / (totalPoints - 1)) * 300;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y}`;
    })
    .join(" ");

  return (
    <div
      className={`rounded-2xl border border-border bg-card/85 p-3.5 shadow-xs transition hover:border-border/80 ${className}`}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Header Info */}
      {(speakerName || voiceName || title) && (
        <div className="mb-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 truncate">
            {speakerName && (
              <span className="font-semibold text-foreground">
                {speakerName}
              </span>
            )}
            {voiceName && (
              <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                <Icon name="voice" className="size-2.5" />
                {voiceName}
              </span>
            )}
            {title && (
              <span className="truncate text-muted-foreground">{title}</span>
            )}
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      )}

      {/* Main Player Row */}
      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause audio" : "Play audio"}
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-xs transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {isPlaying ? (
            <svg
              className="size-4 fill-current"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg
              className="size-4 fill-current translate-x-0.5"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" />
            </svg>
          )}
        </button>

        {/* Hand-Drawn Sketch Waveform Area */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onKeyDown={handleKeyboardSeek}
          tabIndex={0}
          role="slider"
          aria-label="Audio progress"
          aria-valuemin={0}
          aria-valuemax={duration || 100}
          aria-valuenow={currentTime}
          className="group relative flex-1 cursor-pointer select-none py-1.5"
        >
          <svg
            viewBox="0 0 300 36"
            preserveAspectRatio="none"
            className="h-9 w-full overflow-visible"
          >
            <defs>
              <clipPath id={`played-clip-${clipId}`}>
                <rect
                  x="0"
                  y="0"
                  width={`${progressPercent * 3}`}
                  height="36"
                />
              </clipPath>
            </defs>

            {/* Unplayed Sketch Contour (Muted line) */}
            <path
              d={pathCommands}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/40"
            />

            {/* Subtle baseline */}
            <line
              x1="0"
              y1="18"
              x2="300"
              y2="18"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="2 3"
              className="text-border"
            />

            {/* Played Sketch Contour (Primary Pencil Ink) */}
            <path
              d={pathCommands}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              clipPath={`url(#played-clip-${clipId})`}
              className="text-primary"
            />

            {/* Hand-drawn Playhead Indicator */}
            {isLoaded && (
              <circle
                cx={progressPercent * 3}
                cy={
                  wavePoints[
                    Math.min(
                      wavePoints.length - 1,
                      Math.floor((progressPercent / 100) * wavePoints.length),
                    )
                  ] ?? 18
                }
                r="4.5"
                className="fill-primary stroke-card transition-all duration-75 group-hover:r-5.5"
                strokeWidth="2"
              />
            )}
          </svg>
        </div>

        {/* Speed Multiplier Pill */}
        <button
          type="button"
          onClick={cyclePlaybackRate}
          title="Playback speed"
          className="rounded-lg border border-border bg-muted/60 px-2 py-1 font-mono text-[10px] font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          {playbackRate}x
        </button>

        {/* Download File Action */}
        <a
          href={src}
          download={downloadName ?? `${speakerName || "speech-clip"}.mp3`}
          title="Download audio"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Icon name="upload" className="size-3.5 rotate-180" />
        </a>
      </div>
    </div>
  );
}
