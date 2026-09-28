import type { Rect } from "@xyflow/svelte";

export type ImageFormat = "png" | "jpeg" | "svg";

/** Pixel dimensions the user typed, or null to size the image to the graph. */
export type ImageSize = { width: number; height: number } | null;

/**
 * Where the graph sits in the image: the image's size in CSS pixels, the
 * viewport transform that places the graph inside it, and the device pixel
 * ratio a raster format renders at.
 */
export interface Frame {
  width: number;
  height: number;
  x: number;
  y: number;
  zoom: number;
  pixelRatio: number;
}

/** Blank space around the graph, in image pixels. */
export const PADDING = 24;
/** The longest side a browser canvas reliably renders, in device pixels. */
export const MAX_SIDE = 16384;
const MAX_AREA = 100_000_000;
const AUTO_PIXEL_RATIO = 2;

/**
 * An automatic size renders the graph at zoom 1 and doubles its pixels for a
 * sharp image, dropping below that when the result would outgrow a canvas. A
 * typed size fits the graph inside it, centred, at exactly those pixels.
 */
export function frame(bounds: Rect, size: ImageSize): Frame {
  if (size === null) {
    const width = Math.ceil(bounds.width + 2 * PADDING);
    const height = Math.ceil(bounds.height + 2 * PADDING);
    const pixelRatio = Math.min(
      AUTO_PIXEL_RATIO,
      MAX_SIDE / Math.max(width, height),
      Math.sqrt(MAX_AREA / (width * height))
    );
    return {
      width,
      height,
      x: PADDING - bounds.x,
      y: PADDING - bounds.y,
      zoom: 1,
      pixelRatio
    };
  }

  const { width, height } = size;
  const zoom = Math.min(
    Math.max(width - 2 * PADDING, 1) / Math.max(bounds.width, 1),
    Math.max(height - 2 * PADDING, 1) / Math.max(bounds.height, 1)
  );
  return {
    width,
    height,
    x: (width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: (height - bounds.height * zoom) / 2 - bounds.y * zoom,
    zoom,
    pixelRatio: 1
  };
}

/** A typed dimension the image can take: a whole number of pixels up to the canvas limit. */
export function validSide(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_SIDE;
}
