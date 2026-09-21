import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');

test('loads the static app assets from the migrated project', async () => {
  const index = await read('index.html');

  assert.match(index, /<link rel="stylesheet" href="style\.css">/);
  assert.match(index, /<script src="recorder\.js" defer><\/script>/);
  assert.match(index, /<script src="app\.js"><\/script>/);
  assert.match(index, /id="studio"/);
  assert.match(index, /id="voice" type="file" accept="audio\/\*"/);
  assert.match(index, /id="consent" type="checkbox"/);
  assert.match(index, /沿着光/);
  assert.match(index, /id="preview-track"/);
  assert.match(index, /data-control="runs"/);
  assert.match(index, /data-control="vibrato"/);
  assert.match(index, /data-control="breath"/);
});

test('keeps microphone recording support enabled', async () => {
  const recorder = await read('recorder.js');
  const css = await read('recorder.css');

  assert.match(recorder, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(recorder, /new MediaRecorder\(stream/);
  assert.match(recorder, /建议 15 秒 · 最长 30 秒/);
  assert.match(recorder, /acceptReferenceRecording/);
  assert.match(recorder, /录音不足 8 秒/);
  assert.match(css, /\.record-panel/);
  assert.match(css, /\.mic-button/);
});

test('explains how reference audio is handled during generation', async () => {
  const app = await read('app.js');
  const index = await read('index.html');

  assert.match(app, /data\.duration < 8/);
  assert.match(app, /audioBufferToWav/);
  assert.match(app, /所选音色会临时发送到合成服务/);
  assert.match(app, /请只使用本人或已获授权的声音/);
  assert.match(index, /id="consent"/);
});

test('uses the extracted vocal clip as the source segment', async () => {
  const app = await read('app.js');
  const clip = await readFile(path.join(root, 'assets', 'go-beyond-clip.mp3'));

  assert.match(app, /assets\/go-beyond-clip\.mp3/);
  assert.match(app, /00:52–01:14/);
  assert.ok(clip.length > 800_000, 'the 22-second source clip should contain MP3 audio frames');
  assert.equal(clip[0], 0xff);
  assert.equal(clip[1] & 0xe0, 0xe0);
});

test('provides a persistent multi-voice library and selection flow', async () => {
  const library = await read('voice-library.js');
  const recorder = await read('recorder.js');

  assert.match(library, /indexedDB\.open/);
  assert.match(library, /multiple/);
  assert.match(library, /echo-voice-selected/);
  assert.match(library, /voice-delete/);
  assert.match(recorder, /已保存到我的音色/);
});

test('submits the selected voice to the real conversion API', async () => {
  const app = await read('app.js');
  const server = await read('server.py');

  assert.match(app, /fetch\('\/api\/convert'/);
  assert.match(app, /selectedVoiceWav/);
  assert.match(server, /Seed-VC SVC/);
  assert.match(server, /--f0-condition/);
  assert.match(server, /--semi-tone-shift/);
});

test('shows only end-user navigation and is ready for public hosting', async () => {
  const app = await read('app.js');
  const workflow = await read('.github/workflows/pages.yml');
  const modelScope = await read('modelscope/app.py');

  assert.match(app, /\[data-view="brief"\].*\[data-view="flow"\]/);
  assert.match(app, /@gradio\/client/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(modelScope, /api_name="convert"/);
  assert.match(modelScope, /modelscope\.cn\/models\/jaman21\/Seed-VC/);
});
