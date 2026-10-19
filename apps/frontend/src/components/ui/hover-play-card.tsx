import { PauseIcon, PlayIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HoverPlayCardProps = {
  src: string;
  poster?: string;
  /** Names the video for the play button: "Play the pitch". */
  label?: string;
  className?: string;
  loop?: boolean;
  /** Hover previews play muted, which browsers allow without a click. */
  mutedOnHover?: boolean;
};

/**
 * A video that previews while the pointer is over it and plays with sound
 * when its button is pressed, the preview included. Once pressed it keeps
 * playing when the pointer leaves, until it is paused or ends. Nothing loads
 * until the first hover or press.
 */
export default function HoverPlayCard({
  src,
  poster,
  label = "video",
  className,
  loop = false,
  mutedOnHover = true,
}: HoverPlayCardProps) {
  const video = useRef<HTMLVideoElement>(null);
  // The mute state a hover preview put aside, to give back when it stops.
  const mutedBefore = useRef<boolean | null>(null);
  const [hovering, setHovering] = useState(false);
  const [playing, setPlaying] = useState(false);
  // Whether the reader pressed play, so the video is theirs and not a preview.
  const [started, setStarted] = useState(false);
  const listening = playing && started;

  function preview() {
    setHovering(true);
    const el = video.current;
    if (!el || started) return;
    mutedBefore.current ??= el.muted;
    if (mutedOnHover) el.muted = true;
    // A blocked preview just leaves the poster showing.
    el.play().catch(() => {});
  }

  function endPreview() {
    setHovering(false);
    const el = video.current;
    if (!el || started) return;
    el.pause();
    if (mutedBefore.current !== null) el.muted = mutedBefore.current;
  }

  function toggle() {
    const el = video.current;
    if (!el) return;
    if (listening) {
      el.pause();
      return;
    }
    setStarted(true);
    el.muted = false;
    mutedBefore.current = false;
    el.play().catch(() => setStarted(false));
  }

  return (
    <div
      className={cn("group relative overflow-hidden rounded-xl bg-[#14140f]", className)}
      onMouseEnter={preview}
      onMouseLeave={endPreview}
    >
      <video
        ref={video}
        src={src}
        poster={poster}
        loop={loop}
        playsInline
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setStarted(false);
        }}
        className="size-full object-cover"
      />

      <AnimatePresence>
        {(hovering || !playing) && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 grid place-items-center"
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={(event) => {
                event.stopPropagation();
                toggle();
              }}
              aria-label={listening ? `Pause ${label}` : `Play ${label}`}
              className="pointer-events-auto size-16 bg-black/35 text-white backdrop-blur-sm hover:bg-black/55 hover:text-white [&_svg]:size-7"
            >
              {listening ? (
                <PauseIcon className="fill-current" />
              ) : (
                <PlayIcon className="translate-x-0.5 fill-current" />
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 font-mono text-[11px] text-white/85">
        {!playing ? "Paused" : started ? "Playing" : "Preview, muted"}
      </span>
    </div>
  );
}
