(() => {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'recorder.css';
  document.head.append(stylesheet);
  const experienceStylesheet = document.createElement('link');
  experienceStylesheet.rel = 'stylesheet';
  experienceStylesheet.href = 'experience.css';
  document.head.append(experienceStylesheet);
  const libraryStylesheet = document.createElement('link');
  libraryStylesheet.rel = 'stylesheet';
  libraryStylesheet.href = 'voice-library.css';
  document.head.append(libraryStylesheet);
  const libraryScript = document.createElement('script');
  libraryScript.src = 'voice-library.js';
  document.body.append(libraryScript);
  const panel = document.createElement('div');
  panel.className = 'record-panel';
  // Lucide microphone icon (ISC license, lucide.dev).
  panel.innerHTML = `<button type="button" class="mic-button" aria-label="开始录音" title="开始录音" aria-pressed="false"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/></svg><span class="stop-icon" hidden></span></button><div class="record-copy"><strong>开始录制</strong><span class="record-status" role="status">建议 15 秒 · 最长 30 秒</span></div><span class="record-clock" aria-label="录音时长">00:00</span>`;
  document.querySelector('.upload').before(panel);
  const mic = panel.querySelector('button');
  const status = panel.querySelector('.record-status');
  const clock = panel.querySelector('.record-clock');
  let recorder, stream, timer, started, pending = false, failed = false, savedControls = [];
  function release() {
    clearInterval(timer);
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
  }
  function restore() {
    release();
    busy = false;
    pending = false;
    savedControls.forEach(([el, disabled]) => el.disabled = disabled);
    mic.disabled = false;
    mic.setAttribute('aria-pressed', 'false');
    mic.setAttribute('aria-label', '开始录音');
    mic.title = '开始录音 / 重新录制';
    mic.querySelector('svg').hidden = false;
    mic.querySelector('.stop-icon').hidden = true;
    panel.classList.remove('recording');
  }
  function finish() {
    if (recorder?.state === 'recording') {
      mic.disabled = true;
      clearInterval(timer);
      recorder.stop();
      stream?.getTracks().forEach(t => t.stop());
      status.textContent = '正在保存录音…';
    }
  }
  mic.onclick = async () => {
    if (recorder?.state === 'recording') return finish();
    if (pending || busy) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      status.textContent = '当前浏览器不支持录音，请使用 Chrome / Edge 或添加音频文件。';
      return;
    }
    pending = true;
    busy = true;
    failed = false;
    savedControls = [...document.querySelectorAll('.inputs button,.inputs input,#retry')].filter(el => el !== mic).map(el => [el, el.disabled]);
    savedControls.forEach(([el]) => el.disabled = true);
    mic.disabled = true;
    status.textContent = '等待麦克风权限…';
    stop();
    document.querySelector('#reference').pause();
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio: true});
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
      recorder = new MediaRecorder(stream, mime ? {mimeType: mime} : {});
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = () => {
        failed = true;
        status.textContent = '录音中断，请检查麦克风后重试。';
        restore();
      };
      recorder.onstop = () => {
        const seconds = Math.min(30, (Date.now() - started) / 1000);
        const recording = new Blob(chunks, {type: recorder.mimeType || 'audio/webm'});
        restore();
        if (failed) return;
        if (!recording.size || seconds < 0.5) {
          status.textContent = '录音过短，请重新录制。';
          return;
        }
        status.textContent = '正在检查录音…';
        document.querySelector('#voice').value = '';
        document.querySelector('#consent').checked = false;
        Promise.resolve(window.acceptReferenceRecording?.(recording, seconds)).then(async accepted => {
          status.textContent = accepted ? '录音完成 · 已保存到我的音色' : '录音不足 8 秒 · 请重新录制';
          if (accepted && window.echoVoiceLibrary) {
            const voice = {id: crypto.randomUUID(), name: `我的音色 ${new Date().toLocaleDateString('zh-CN')}`, blob: recording, type: recording.type, duration: seconds, createdAt: Date.now()};
            await window.echoVoiceLibrary.put(voice);
            await window.echoVoiceLibrary.selectVoice(voice);
          }
        });
      };
      recorder.start();
      started = Date.now();
      pending = false;
      mic.disabled = false;
      mic.setAttribute('aria-label', '停止录音');
      mic.title = '停止录音';
      mic.setAttribute('aria-pressed', 'true');
      mic.querySelector('svg').hidden = true;
      mic.querySelector('.stop-icon').hidden = false;
      panel.classList.add('recording');
      status.textContent = '正在录音 · 点击停止';
      clock.textContent = '00:00';
      timer = setInterval(() => {
        const seconds = Math.min(30, Math.floor((Date.now() - started) / 1000));
        clock.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
        if (seconds >= 30) finish();
      }, 200);
    } catch (error) {
      restore();
      status.textContent = error.name === 'NotAllowedError' ? '未获得麦克风权限，请在浏览器设置中允许后重试。' : error.name === 'NotFoundError' ? '未找到麦克风，请连接设备后重试。' : '无法使用麦克风，可能被其他应用占用；也可添加音频文件。';
    }
  };
  window.addEventListener('pagehide', () => { failed = true; release(); });
})();
