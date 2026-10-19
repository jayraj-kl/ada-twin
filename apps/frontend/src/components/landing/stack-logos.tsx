import firebase from "@/assets/logos/firebase.svg";
import gemini from "@/assets/logos/gemini.svg";
import googleCloud from "@/assets/logos/google-cloud.svg";
import worldLabs from "@/assets/logos/world-labs.svg";
import { cn } from "@/lib/utils";

// What AdaTwin is built on, as marks. Each is drawn as a mask over the text
// colour, so every logo takes the page's ink in either theme. Heights are set
// by eye so the four read at one weight.
const LOGOS = [
  { name: "Gemini", src: gemini, ratio: 344 / 127, height: "h-7" },
  {
    name: "Google Cloud",
    src: googleCloud,
    ratio: 256 / 256,
    height: "h-7",
    word: true,
  },
  { name: "Firebase", src: firebase, ratio: 749 / 205, height: "h-7" },
  { name: "World Labs", src: worldLabs, ratio: 1029 / 225, height: "h-7" },
] as const;

function Mark({
  src,
  ratio,
  className,
}: {
  src: string;
  ratio: number;
  className: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("block shrink-0 bg-current", className)}
      style={{
        aspectRatio: ratio,
        // Quoted, since Vite inlines a small SVG as a data URI.
        maskImage: `url("${src}")`,
        WebkitMaskImage: `url("${src}")`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

/** One platform's mark, by name, at the height the row sets for it unless a class says otherwise. */
export function StackMark({
  name,
  className,
}: {
  name: (typeof LOGOS)[number]["name"];
  className?: string;
}) {
  const logo = LOGOS.find((one) => one.name === name)!;
  return (
    <>
      <Mark
        src={logo.src}
        ratio={logo.ratio}
        className={className ?? logo.height}
      />
      <span className="sr-only">{logo.name}</span>
    </>
  );
}

/** The platforms AdaTwin runs on, in one row of single-colour marks. */
export function StackLogos({ className }: { className?: string }) {
  return (
    <ul
      className={cn("flex flex-wrap items-center gap-x-12 gap-y-6", className)}
    >
      {LOGOS.map((logo) => (
        <li key={logo.name} className="flex items-center gap-2">
          <Mark src={logo.src} ratio={logo.ratio} className={logo.height} />
          {"word" in logo ? (
            <span className="text-lg font-semibold tracking-[-0.01em]">
              {logo.name}
            </span>
          ) : (
            <span className="sr-only">{logo.name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
