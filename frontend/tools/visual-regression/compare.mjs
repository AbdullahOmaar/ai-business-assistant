/**
 * Visual-regression comparison (3A-650 part E).
 *
 * Compares two capture runs (see capture.mjs) PNG by PNG with a small
 * built-in PNG decoder — no extra dependencies. A pixel counts as
 * changed when any channel differs by more than --threshold; a surface
 * fails when its changed-pixel ratio exceeds --max-ratio.
 *
 * Usage:
 *   node tools/visual-regression/compare.mjs <baseline-dir> <current-dir>
 *     [--threshold 16] [--max-ratio 0.001]
 *
 * Exit code 0 = all surfaces within tolerance, 1 = a surface exceeded
 * it (or is missing / resized), 2 = usage or decode error.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width = 0; let height = 0; let bitDepth = 0; let colorType = 0; let interlace = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace})`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const row = Buffer.from(raw.subarray(rowStart + 1, rowStart + 1 + stride));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 0xff;
      else if (filter === 2) row[x] = (row[x] + up) & 0xff;
      else if (filter === 3) row[x] = (row[x] + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft);
        row[x] = (row[x] + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xff;
      } else if (filter !== 0) throw new Error('unknown PNG filter ' + filter);
    }
    for (let x = 0; x < width; x++) {
      const src = x * channels; const dst = (y * width + x) * 4;
      pixels[dst] = row[src]; pixels[dst + 1] = row[src + 1]; pixels[dst + 2] = row[src + 2];
      pixels[dst + 3] = channels === 4 ? row[src + 3] : 255;
    }
    previous = row;
  }
  return { width, height, pixels };
}

const args = process.argv.slice(2);
const [baselineDir, currentDir] = args;
if (!baselineDir || !currentDir) {
  console.error('usage: compare.mjs <baseline-dir> <current-dir> [--threshold N] [--max-ratio R]');
  process.exit(2);
}
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const threshold = option('--threshold', 16);
const maxRatio = option('--max-ratio', 0.001);

const manifestPath = join(baselineDir, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error('baseline manifest not found:', manifestPath);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
let failed = false;
for (const surface of manifest.surfaces) {
  const baselineFile = join(baselineDir, surface.file);
  const currentFile = join(currentDir, surface.file);
  if (!existsSync(currentFile)) {
    console.log(`MISSING  ${surface.file} (not in current run)`);
    failed = true;
    continue;
  }
  const baseline = decodePng(readFileSync(baselineFile));
  const current = decodePng(readFileSync(currentFile));
  if (baseline.width !== current.width || baseline.height !== current.height) {
    console.log(`RESIZED  ${surface.file} ${baseline.width}x${baseline.height} -> ${current.width}x${current.height}`);
    failed = true;
    continue;
  }
  let changed = 0;
  const total = baseline.width * baseline.height;
  for (let i = 0; i < baseline.pixels.length; i += 4) {
    if (Math.abs(baseline.pixels[i] - current.pixels[i]) > threshold
      || Math.abs(baseline.pixels[i + 1] - current.pixels[i + 1]) > threshold
      || Math.abs(baseline.pixels[i + 2] - current.pixels[i + 2]) > threshold) {
      changed += 1;
    }
  }
  const ratio = changed / total;
  const status = ratio <= maxRatio ? 'OK      ' : 'CHANGED ';
  if (ratio > maxRatio) failed = true;
  console.log(`${status} ${surface.file} changed=${(ratio * 100).toFixed(3)}% (${changed}/${total})`);
}
process.exit(failed ? 1 : 0);
