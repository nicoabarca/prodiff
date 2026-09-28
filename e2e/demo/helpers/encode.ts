import { spawnSync } from "node:child_process";

function ffmpeg(args: string[]): void {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdio: "inherit"
  });
  if (result.status !== 0) throw new Error(`[demo] ffmpeg failed: ${args.join(" ")}`);
}

/** A web-ready MP4 (H.264, streamable) and WebM (VP9) of the raw recording, `width` wide at
 * a constant 30 fps. */
export function encodeVideo(raw: string, outBase: string, width: number): void {
  const scale = `fps=30,scale=${width}:-2:flags=lanczos`;
  ffmpeg([
    "-i",
    raw,
    "-vf",
    scale,
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    `${outBase}.mp4`
  ]);
  ffmpeg([
    "-i",
    raw,
    "-vf",
    scale,
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "36",
    "-b:v",
    "0",
    "-row-mt",
    "1",
    "-deadline",
    "good",
    "-cpu-used",
    "4",
    "-an",
    `${outBase}.webm`
  ]);
}

/** A GIF of the raw recording, `width` wide at `fps`, with a palette built from its own frames. */
export function encodeGif(raw: string, out: string, width: number, fps: number): void {
  const base = `fps=${fps},scale=${width}:-1:flags=lanczos`;
  ffmpeg([
    "-i",
    raw,
    "-filter_complex",
    `[0:v]${base},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    out
  ]);
}

/**
 * Seconds of the recording, sampled twice a second, that are almost entirely black.
 * ScreenCaptureKit hands over black frames when macOS stops compositing the window.
 */
export function blackSeconds(raw: string): number {
  const { stderr } = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      raw,
      "-vf",
      "fps=2,blackframe=amount=98:threshold=20",
      "-f",
      "null",
      "-"
    ],
    { encoding: "utf8" }
  );
  return (stderr.match(/Parsed_blackframe/g)?.length ?? 0) / 2;
}
