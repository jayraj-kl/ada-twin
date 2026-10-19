import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import HoverPlayCard from "@/components/ui/hover-play-card";

const VIDEO = "/media/adatwin-pitch.mp4";
const POSTER = "/media/pitch-poster.jpg";

/** The 60-second pitch in a dialog. The video loads only once the dialog opens. */
export function PitchVideo({ trigger }: { trigger: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-4xl gap-0 p-2 sm:p-3" aria-describedby={undefined}>
        <DialogTitle className="sr-only">The AdaTwin pitch, 60 seconds</DialogTitle>
        <video
          src={VIDEO}
          poster={POSTER}
          controls
          autoPlay
          playsInline
          preload="none"
          className="aspect-video w-full rounded-[20px] bg-[#14140f]"
        />
      </DialogContent>
    </Dialog>
  );
}

/** The pitch in place: it previews, muted, under the pointer, and its button plays it with sound. */
export function PitchCard() {
  return (
    <HoverPlayCard
      src={VIDEO}
      poster={POSTER}
      label="the 60-second pitch"
      className="aspect-video w-full rounded-[20px] ring-1 ring-white/15"
    />
  );
}
