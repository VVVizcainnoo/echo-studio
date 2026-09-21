import { readFile, writeFile } from 'node:fs/promises';

const [input, output, startArg, endArg] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node extract-mp3.mjs input output start end');
const start = Number(startArg);
const end = Number(endArg);
const source = await readFile(input);

let offset = 0;
if (source.subarray(0, 3).toString() === 'ID3') {
  const size = ((source[6] & 0x7f) << 21) | ((source[7] & 0x7f) << 14) | ((source[8] & 0x7f) << 7) | (source[9] & 0x7f);
  offset = 10 + size;
}

const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const rates = [44100, 48000, 32000];
const frames = [];
let elapsed = 0;
while (offset + 4 < source.length) {
  if (source[offset] !== 0xff || (source[offset + 1] & 0xe0) !== 0xe0) { offset++; continue; }
  const version = (source[offset + 1] >> 3) & 3;
  const layer = (source[offset + 1] >> 1) & 3;
  const bitrateIndex = (source[offset + 2] >> 4) & 15;
  const rateIndex = (source[offset + 2] >> 2) & 3;
  if (version !== 3 || layer !== 1 || !bitrates[bitrateIndex] || rateIndex === 3) { offset++; continue; }
  const sampleRate = rates[rateIndex];
  const frameSize = Math.floor(144000 * bitrates[bitrateIndex] / sampleRate) + ((source[offset + 2] >> 1) & 1);
  const frameDuration = 1152 / sampleRate;
  if (elapsed + frameDuration >= start && elapsed < end) frames.push(source.subarray(offset, offset + frameSize));
  elapsed += frameDuration;
  offset += frameSize;
  if (elapsed >= end) break;
}

if (!frames.length) throw new Error('No MPEG-1 Layer III frames found in requested range');
await writeFile(output, Buffer.concat(frames));
console.log(JSON.stringify({start, end, duration: end - start, frames: frames.length}));
