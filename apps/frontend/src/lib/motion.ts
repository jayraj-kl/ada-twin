import type { Transition } from "motion/react";

// Every duration, easing and spring the app animates with. Reduced motion is
// handled once, by <MotionConfig reducedMotion="user"> at the root.
export const motionTokens = {
  duration: { instant: 0.08, fast: 0.18, normal: 0.35, slow: 0.6 },
  easing: {
    smooth: [0.22, 1, 0.36, 1],
    sharp: [0.4, 0, 0.2, 1],
  },
  distance: { sm: 8, md: 16, lg: 24 },
  scale: { press: 0.96, pop: 1.03 },
} as const;

export const springs = {
  snappy: { type: "spring", stiffness: 300, damping: 30 },
  gentle: { type: "spring", stiffness: 120, damping: 14 },
  bouncy: { type: "spring", stiffness: 400, damping: 12 },
  instant: { type: "spring", stiffness: 600, damping: 35 },
} satisfies Record<string, Transition>;

/** A child of a staggered list: rises into place. */
export const riseIn = {
  hidden: { opacity: 0, y: motionTokens.distance.md },
  shown: { opacity: 1, y: 0, transition: springs.snappy },
};

export const stagger = (gap = 0.05) => ({
  hidden: {},
  shown: { transition: { staggerChildren: gap } },
});
