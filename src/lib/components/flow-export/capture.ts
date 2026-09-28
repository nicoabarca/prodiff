import { toJpeg, toPng, toSvg } from "html-to-image";
import type { Frame, ImageFormat } from "./frame";

const RENDER = { png: toPng, jpeg: toJpeg, svg: toSvg } satisfies Record<ImageFormat, unknown>;

/**
 * Renders a Svelte Flow viewport element to image bytes, placed by `placed`
 * rather than by the transform the user has panned and zoomed to.
 */
export async function capture(
  viewport: HTMLElement,
  format: ImageFormat,
  placed: Frame,
  backgroundColor: string
): Promise<Uint8Array> {
  const url = await RENDER[format](viewport, {
    backgroundColor,
    width: placed.width,
    height: placed.height,
    pixelRatio: placed.pixelRatio,
    quality: 0.95,
    style: {
      width: `${placed.width}px`,
      height: `${placed.height}px`,
      transform: `translate(${placed.x}px, ${placed.y}px) scale(${placed.zoom})`
    }
  });
  const response = await fetch(url);
  return new Uint8Array(await response.arrayBuffer());
}
