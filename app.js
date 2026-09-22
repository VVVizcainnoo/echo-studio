const $ = selector => document.querySelector(selector);
let ready = false, busy = false, token = 0, blob = null, url = null, refUrl = null, mode = 'original', rendered = null, selectedVoiceWav = null;
let voiceProfile = {brightness: .45, energy: .55};
let activeRequest = null;
let selectionVersion = 0;
const duration = 22, sourceClip = 'assets/go-beyond-clip.mp3', player = new Audio(), preferences = {runs: 1, vibrato: 1, breath: 0};

document.querySelectorAll('[data-view="brief"], [data-view="flow"], #brief, #flow').forEach(element => element.remove());

$('#song-title').textContent = 'Go Beyond';
$('#song-title').nextElementSibling.textContent = '已上传片段 · 待生成音色';
$('.heading h1').textContent = '用你的音色，演唱选定片段';
$('.heading p').textContent = '试听歌曲选段，录下声音，准备生成属于你的版本。';
$('#preview-track').previousElementSibling.querySelector('strong').textContent = 'Go Beyond';
$('#preview-track').previousElementSibling.querySelector('small').textContent = '副歌选段 · 约 3～4 句人声';
const clipStep = $('#preview-track').closest('.step');
clipStep.querySelector('.section-title h2').lastChild.textContent = ' 待生成片段';
clipStep.querySelector('.section-title > span').textContent = '22 秒 · 原声音频';
$('.lyrics').textContent = '已从上传歌曲的 00:52–01:14 截取连续人声片段。';
$('#generate').textContent = '生成我的音色版本';
$('#time').textContent = '00:00 / 00:22';
$('#result-note').textContent = '试听待生成片段，再录制你的声音。';
$('.notice').textContent = '音色保存在当前浏览器；点击生成后，所选音色会临时发送到合成服务，服务缓存最多保留约 1 小时。请只使用本人或已获授权的声音。';
document.querySelectorAll('.preference').forEach(element => {
  element.hidden = false;
  const status = document.createElement('small');
  status.textContent = '暂未支持';
  element.append(status);
  element.querySelectorAll('button').forEach(button => {
    button.dataset.unavailable = 'true';
    button.disabled = true;
    button.classList.remove('active');
    button.title = '当前模型保留原片段唱法，暂不支持单独调整';
  });
});
$('#sample').hidden = true;
$('.heading .pill').textContent = '个人音色 · 云端合成';
$('.agent .section-title > span').textContent = '制作进度';
$('#cancel').textContent = '停止等待';
$('#preview-track').title = '试听歌曲片段';
$('#preview-track').setAttribute('aria-label', '试听歌曲片段');

function view(id) { document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== id); document.querySelectorAll('nav button').forEach(el => el.classList.toggle('active', el.dataset.view === id)); }
document.querySelectorAll('nav button').forEach(button => button.onclick = () => view(button.dataset.view));
$('.brand').onclick = () => view('studio');
for (let i = 0; i < 72; i++) { const bar = document.createElement('i'); bar.style.height = (12 + Math.abs(Math.sin(i * 1.43) * Math.cos(i * .19)) * 49) + 'px'; $('#wave').append(bar); }

function stop() { player.pause(); player.currentTime = 0; $('#play').textContent = '▶'; $('#preview-track').textContent = '▶'; $('#time').textContent = '00:00 / 00:22'; }
function log(message) { const item = document.createElement('li'); item.textContent = message; $('#logs').append(item); }
function invalidate() {
  stop(); blob = null; rendered = null;
  if (url) { URL.revokeObjectURL(url); url = null; }
  ['play', 'original', 'processed', 'download', 'retry'].forEach(id => $('#' + id).disabled = true);
  $('#feedback').disabled = true; $('#result-tag').textContent = ready ? '可以生成' : '等待录音'; $('#progress').style.width = '0';
  $('#logs').replaceChildren(); log(ready ? '声音已准备，可以开始生成' : '等待你的声音');
  $('#result-note').textContent = '先试听待生成片段，再录制你的声音。';
}
function setQuality(seconds) {
  $('#quality-fill').style.width = Math.min(100, seconds / 15 * 100) + '%';
  if (seconds < 8) $('#quality-copy').textContent = `已录 ${seconds.toFixed(1)} 秒 · 还需要至少 ${(8 - seconds).toFixed(1)} 秒`;
  else if (seconds < 15) $('#quality-copy').textContent = `已录 ${seconds.toFixed(1)} 秒 · 可用，继续到 15 秒会更稳定`;
  else $('#quality-copy').textContent = `已录 ${seconds.toFixed(1)} 秒 · 时长很好`;
}
function profileAudio(buffer) {
  const samples = buffer.getChannelData(0), stride = Math.max(1, Math.floor(samples.length / 60000));
  let sum = 0, crossings = 0, previous = samples[0] || 0, count = 0;
  for (let i = 0; i < samples.length; i += stride) { const value = samples[i]; sum += value * value; if ((value >= 0) !== (previous >= 0)) crossings++; previous = value; count++; }
  return {energy: Math.max(.25, Math.min(.9, Math.sqrt(sum / count) * 5)), brightness: Math.max(.2, Math.min(.85, crossings / count * 18))};
}
async function acceptAudio(source, label) {
  if (busy) return false;
  const version = ++selectionVersion;
  ready = false; selectedVoiceWav = null; invalidate();
  const context = new AudioContext();
  try {
    const data = await context.decodeAudioData(await source.arrayBuffer());
    if (data.duration < 8) throw new Error('short');
    if (version !== selectionVersion) return false;
    voiceProfile = profileAudio(data); selectedVoiceWav = audioBufferToWav(data); setQuality(data.duration);
    if (refUrl) URL.revokeObjectURL(refUrl); refUrl = URL.createObjectURL(source);
    $('#reference').src = refUrl; $('#reference').hidden = false; $('#voice-state').textContent = '声音已就绪';
    $('#file-info').textContent = `${label} · ${data.duration.toFixed(1)} 秒 · 生成时临时发送`; ready = true; invalidate(); return true;
  } finally { await context.close(); }
}
function audioBufferToWav(audioBuffer) {
  const channels = audioBuffer.numberOfChannels, length = audioBuffer.length, bytes = new ArrayBuffer(44 + length * channels * 2), view = new DataView(bytes);
  const write = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + length * channels * 2, true); write(8, 'WAVE'); write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, audioBuffer.sampleRate, true); view.setUint32(28, audioBuffer.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, length * channels * 2, true);
  let offset = 44;
  for (let i = 0; i < length; i++) for (let channel = 0; channel < channels; channel++) { const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i])); view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true); offset += 2; }
  return new Blob([bytes], {type: 'audio/wav'});
}
window.acceptReferenceRecording = async (recording, seconds) => {
  try { await acceptAudio(recording, '麦克风录音'); return true; }
  catch { setQuality(seconds); $('#voice-state').textContent = '录音太短'; $('#file-info').textContent = '请至少录制 8 秒，让音色特征更完整。'; ready = false; invalidate(); return false; }
};
window.addEventListener('echo-voice-selected', async event => {
  if (busy) return;
  const voice = event.detail;
  try {
    if (!await acceptAudio(voice.blob, voice.name)) return;
    $('#consent').checked = false;
    $('#voice-state').textContent = voice.name;
    $('#file-info').textContent = `已选择“${voice.name}” · ${voice.duration.toFixed(1)} 秒 · 来自我的音色`;
  } catch {
    $('#validation').textContent = '这个音色无法读取，请在“我的音色”中重新添加。';
  }
});
$('#voice').onchange = async event => {
  invalidate(); ready = false; $('#consent').checked = false; $('#reference').hidden = true; $('#voice-state').textContent = '检查中';
  const file = event.target.files[0]; if (!file) { $('#voice-state').textContent = '待录制'; return; }
  if (file.size > 20 * 1024 * 1024 || (!file.type.startsWith('audio/') && !/\.(wav|mp3|m4a|ogg|flac|aac|webm)$/i.test(file.name))) { $('#file-info').textContent = '请选择不超过 20 MB 的有效音频。'; $('#voice-state').textContent = '文件不适用'; return; }
  try { await acceptAudio(file, file.name); }
  catch (error) { $('#file-info').textContent = error.message === 'short' ? '录音不足 8 秒，请换一段更长的声音。' : '无法读取该音频，请换成 WAV、MP3 或 M4A。'; $('#voice-state').textContent = error.message === 'short' ? '录音太短' : '读取失败'; }
};
$('#sample').onclick = () => {
  ready = true; voiceProfile = {brightness: .48, energy: .58}; $('#voice').value = ''; $('#reference').hidden = true; $('#reference').pause(); $('#consent').checked = false;
  $('#voice-state').textContent = '示例音色'; $('#file-info').textContent = '正在使用虚构的示例音色，不含真人录音。'; setQuality(15); invalidate();
};
document.querySelectorAll('.choice').forEach(group => group.querySelectorAll('button').forEach(button => button.onclick = () => {
  preferences[group.dataset.control] = Number(button.dataset.value); group.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button)); invalidate();
}));
$('#mix').oninput = () => { $('#mix-value').textContent = $('#mix').value + '%'; invalidate(); };
$('#pitch').oninput = () => { $('#pitch-value').textContent = $('#pitch').value + ' 半音'; invalidate(); };

function setMode(next, preview = false) {
  stop(); mode = next;
  if (next === 'original') { player.src = sourceClip; }
  else if (url) { player.src = url; }
  $('#original').classList.toggle('active', next === 'original'); $('#processed').classList.toggle('active', next === 'processed');
  if (preview) player.play().then(() => $('#preview-track').textContent = 'Ⅱ').catch(() => {});
}
$('#preview-track').onclick = () => { if (!player.paused && mode === 'original') return stop(); setMode('original', true); };
const waiting = document.createElement('div');
waiting.className = 'generation-wait'; waiting.hidden = true;
waiting.innerHTML = '<span class="generation-spinner" aria-hidden="true"></span><div><strong role="status" aria-live="polite"></strong><p>免费算力资源有限，排队和生成可能需要几分钟；首次启动会更久。请保持页面打开。</p><small></small></div>';
$('#generate').insertAdjacentElement('afterend', waiting);
let waitTimer;
function lock(value) {
  busy = value; window.echoIsGenerating = value;
  document.querySelectorAll('.inputs button,.inputs input,.voice-select').forEach(element => element.disabled = value || element.dataset.unavailable === 'true');
  $('#cancel').hidden = !value; $('#retry').disabled = value;
  waiting.hidden = !value; clearInterval(waitTimer);
  if (value) {
    const started = Date.now();
    waiting.querySelector('strong').textContent = '正在连接生成服务';
    const tick = () => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      waiting.querySelector('small').textContent = `已等待 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
    };
    tick(); waitTimer = setInterval(tick, 1000);
  }
}
async function requestConversion(form, run, signal) {
  const apiBase = (window.ECHO_API_BASE || '').replace(/\/$/, '');
  if (!apiBase) {
    if (location.hostname.endsWith('github.io')) throw new Error('合成服务尚未配置。');
    const response = await fetch('/api/convert', {method: 'POST', body: form, signal});
    if (!response.ok) throw new Error((await response.json().catch(()=>({}))).message || '生成失败');
    return response.blob();
  }
  return window.EchoConversion.run(apiBase, form.get('reference'), Number(form.get('pitch')), Number(form.get('mix')), {
    signal,
    onProgress(value, message) {
      if (run !== token) return;
      $('#progress').style.width = Math.round(Math.max(0, Math.min(1, value)) * 100) + '%';
      $('#result-tag').textContent = message;
      waiting.querySelector('strong').textContent = message;
      if ($('#logs').lastElementChild?.textContent !== message) log(message);
    }
  });
}
async function generate() {
  if (busy) return; $('#validation').textContent = '';
  if (!ready || !selectedVoiceWav) { $('#validation').textContent = '请先录制或从“我的音色”选择一个声音。'; return; }
  if (!$('#consent').checked) { $('#validation').textContent = '请确认这是你本人的声音。'; return; }
  invalidate(); lock(true); const run = ++token;
  activeRequest = new AbortController();
  const controller = activeRequest;
  $('#logs').replaceChildren(); $('#result-tag').textContent = '连接服务中';
  log('免费算力正在制作，首次生成需要准备模型，请保留此页面。');
  try {
    const form = new FormData();
    form.append('reference', selectedVoiceWav, 'reference.wav');
    form.append('pitch', $('#pitch').value);
    form.append('mix', $('#mix').value);
    form.append('runs', preferences.runs);
    form.append('vibrato', preferences.vibrato);
    form.append('breath', preferences.breath);
    form.append('consent', 'true');
    const audio = await requestConversion(form, run, controller.signal);
    if (run !== token) return;
    blob = audio; if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(blob); rendered = {pitch: Number($('#pitch').value), ...preferences}; setMode('processed');
    log('歌声音色转换完成'); $('#progress').style.width = '100%';
    ['play','original','processed','download','retry'].forEach(id => $('#' + id).disabled = false); $('#feedback').disabled = false; $('#thanks').textContent = ''; $('#result-tag').textContent = '预览已完成';
    $('#result-note').textContent = '已使用所选音色完成歌声转换，可与原始片段对比试听。';
  } catch (error) { if (run !== token) return; $('#result-tag').textContent = '生成未完成'; $('#validation').textContent = error.name === 'AbortError' ? '等待时间过长，请稍后重试。' : error.message; log('生成未完成，可以重试。'); }
  finally { if (run === token) { lock(false); activeRequest = null; } }
}
$('#generate').onclick = generate; $('#retry').onclick = generate; $('#cancel').onclick = () => { token++; activeRequest?.abort(); activeRequest = null; lock(false); invalidate(); log('已停止等待，服务可能仍在完成当前计算。'); };
$('#original').onclick = () => setMode('original'); $('#processed').onclick = () => setMode('processed');
$('#play').onclick = async () => { if (player.paused) { try { await player.play(); $('#play').textContent = 'Ⅱ'; } catch { $('#result-note').textContent = '播放失败，请重新生成或下载试听。'; } } else stop(); };
player.ontimeupdate = () => $('#time').textContent = '00:' + Math.floor(player.currentTime).toString().padStart(2, '0') + ' / 00:22'; player.onended = stop;
$('#download').onclick = () => { const link = document.createElement('a'); link.href = url; link.download = 'Echo-Go-Beyond-我的版本.wav'; link.click(); };
document.querySelectorAll('[data-feedback]').forEach(button => button.onclick = () => $('#thanks').textContent = '已记录：' + button.dataset.feedback + '（本次会话）');
