/** A seeded random stream: the same seed always replays the same run. */
export interface Random {
  /** Uniform in [0, 1). */
  next(): number;
  exponential(mean: number): number;
  /** Positive, with the given mean and spread (`variation` = stddev / mean). */
  spread(mean: number, variation: number): number;
  /** Wear-out failure time: unlikely soon after service, likelier with age. */
  wearOut(mean: number): number;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  // mulberry32
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () =>
    Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());

  return {
    next,
    exponential: (mean) => -mean * Math.log(1 - next()),
    spread(mean, variation) {
      if (variation <= 0) return mean;
      // Log-normal with the requested mean and coefficient of variation.
      const sigma2 = Math.log(1 + variation * variation);
      return mean * Math.exp(Math.sqrt(sigma2) * normal() - sigma2 / 2);
    },
    // Weibull with shape 2; its mean is scale * Γ(1.5) = scale * √π / 2.
    wearOut: (mean) =>
      ((2 * mean) / Math.sqrt(Math.PI)) * Math.sqrt(-Math.log(1 - next())),
  };
}
