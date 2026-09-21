(() => {
  const DB_NAME = 'echo-studio';
  const STORE = 'voices';
  const selectedKey = 'echo-selected-voice';
  let db;
  let activeAudio;

  const openDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, {keyPath: 'id'});
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onerror = () => reject(request.error);
  });
  const transaction = (mode, action) => new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const all = () => transaction('readonly', store => store.getAll());
  const get = id => transaction('readonly', store => store.get(id));
  const put = voice => transaction('readwrite', store => store.put(voice));
  const remove = id => transaction('readwrite', store => store.delete(id));
  const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

  const nav = document.querySelector('nav');
  const tab = document.createElement('button');
  tab.dataset.view = 'voices';
  tab.textContent = '我的音色';
  nav.append(tab);

  const section = document.createElement('section');
  section.id = 'voices';
  section.className = 'view voice-library';
  section.hidden = true;
  section.innerHTML = `<div class="heading"><div><span class="eyebrow">MY VOICE LIBRARY</span><h1>我的音色</h1><p>保存多段个人声音，在每次制作时选择一个音色。</p></div><span class="pill" id="voice-count">0 个音色</span></div><div class="library-toolbar"><label class="voice-upload" for="voice-files"><strong>添加音色</strong><span>可一次选择多个音频文件</span><input id="voice-files" type="file" accept="audio/*" multiple></label><p>建议每个音色使用 15～30 秒干净录音，并用容易辨认的名称区分。</p></div><div id="voice-list" class="voice-list"></div><p id="library-empty" class="library-empty">还没有保存音色。添加录音后，它会保存在当前浏览器中。</p>`;
  document.querySelector('main').append(section);

  function showLibrary() {
    document.querySelectorAll('.view').forEach(view => view.hidden = view.id !== 'voices');
    document.querySelectorAll('nav button').forEach(button => button.classList.toggle('active', button === tab));
    render();
  }
  tab.onclick = showLibrary;

  async function durationOf(blob) {
    const context = new AudioContext();
    try { return (await context.decodeAudioData(await blob.arrayBuffer())).duration; }
    finally { await context.close(); }
  }

  async function saveFiles(files) {
    const errors = [];
    for (const file of files) {
      try {
        if (file.size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB');
        const duration = await durationOf(file);
        if (duration < 8) throw new Error('录音不足 8 秒');
        await put({id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), blob: file, type: file.type, duration, createdAt: Date.now()});
      } catch (error) { errors.push(`${file.name}：${error.message || '无法读取'}`); }
    }
    await render();
    if (errors.length) alert(errors.join('\n'));
  }

  async function selectVoice(voice) {
    localStorage.setItem(selectedKey, voice.id);
    window.dispatchEvent(new CustomEvent('echo-voice-selected', {detail: voice}));
    document.querySelector('[data-view="studio"]').click();
  }

  async function render() {
    if (!db) return;
    const voices = (await all()).sort((a, b) => b.createdAt - a.createdAt);
    const selected = localStorage.getItem(selectedKey);
    const list = document.querySelector('#voice-list');
    list.replaceChildren();
    document.querySelector('#voice-count').textContent = `${voices.length} 个音色`;
    document.querySelector('#library-empty').hidden = voices.length > 0;
    for (const voice of voices) {
      const card = document.createElement('article');
      card.className = 'voice-card' + (voice.id === selected ? ' selected' : '');
      const safeName = escapeHtml(voice.name);
      card.innerHTML = `<button class="voice-play" title="试听音色" aria-label="试听 ${safeName}">▶</button><div><input class="voice-name" value="${safeName}" aria-label="音色名称"><small>${voice.duration.toFixed(1)} 秒 · 保存在当前浏览器</small></div><button class="voice-select">${voice.id === selected ? '当前使用' : '选择'}</button><button class="voice-delete" title="删除音色" aria-label="删除 ${safeName}">×</button>`;
      const name = card.querySelector('.voice-name');
      name.onchange = async () => { voice.name = name.value.trim() || '未命名音色'; await put(voice); render(); };
      card.querySelector('.voice-play').onclick = event => {
        if (activeAudio) { activeAudio.pause(); activeAudio = null; document.querySelectorAll('.voice-play').forEach(button => button.textContent = '▶'); }
        else { const objectUrl = URL.createObjectURL(voice.blob); activeAudio = new Audio(objectUrl); activeAudio.play(); event.currentTarget.textContent = 'Ⅱ'; activeAudio.onended = () => { URL.revokeObjectURL(objectUrl); activeAudio = null; event.currentTarget.textContent = '▶'; }; }
      };
      card.querySelector('.voice-select').onclick = () => selectVoice(voice);
      card.querySelector('.voice-delete').onclick = async () => { await remove(voice.id); if (voice.id === localStorage.getItem(selectedKey)) localStorage.removeItem(selectedKey); render(); };
      list.append(card);
    }
  }

  document.querySelector('#voice-files').onchange = event => { saveFiles([...event.target.files]); event.target.value = ''; };
  window.echoVoiceLibrary = {all, get, put, selectVoice};
  openDb().then(async () => {
    await render();
    const selected = localStorage.getItem(selectedKey);
    if (selected) { const voice = await get(selected); if (voice) window.dispatchEvent(new CustomEvent('echo-voice-selected', {detail: voice})); }
  }).catch(() => { document.querySelector('#library-empty').textContent = '当前浏览器无法保存音色，请检查隐私或存储设置。'; });
})();
