import type { LetterBox } from "$lib/analysis/types";

/**
 * Where each of `count` dots sits across its band, as a share of the band
 * width: the golden-ratio sequence folded into the middle 60%, so equal values
 * stay apart and the same data always lands in the same place.
 */
export function dotOffsets(count: number): number[] {
  return Array.from({ length: count }, (_, index) => 0.2 + 0.6 * ((index * 0.618) % 1));
}
export interface LetterSegment {
  depth: number;
  from: number;
  to: number;
  share: number;
}

/**
 * The letter-value boxes cut into pieces that do not overlap: the fourths as
 * one piece, then for each deeper box the two strips it adds past the box
 * inside it. `share` is the fraction of the Group's cases the piece holds
 * per unit of thickness, 1 for the fourths and halving at each depth.
 */
export function letterSegments(boxes: LetterBox[]): LetterSegment[] {
  const sorted = [...boxes].sort((a, b) => a.depth - b.depth);
  return sorted.flatMap((box, index) => {
    const share = Math.pow(0.5, box.depth - 2);
    const inner = sorted[index - 1];
    if (!inner) return [{ depth: box.depth, from: box.lower, to: box.upper, share }];
    return [
      { depth: box.depth, from: box.lower, to: inner.lower, share },
      { depth: box.depth, from: inner.upper, to: box.upper, share }
    ];
  });
}
