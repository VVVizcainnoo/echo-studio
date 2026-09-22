/* Gradio's public SSE queue; no account credentials are sent by the browser. */
(() => {
  async function run(base, file, pitch, mix, {signal, onProgress = () => {}} = {}) {
    base = base.replace(/\/$/, '');
    const request = async (path, options = {}) => {
      const response = await fetch(base + path, {...options, signal, credentials: 'omit'});
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || error.message || `合成服务暂不可用（${response.status}）`);
      }
      return response;
    };
    onProgress(0, '连接合成服务');
    const config = await (await request('/config')).json();
    const dependency = config.dependencies.find(item => item.api_name === 'convert');
    if (!dependency) throw new Error('合成服务正在更新，请稍后重试。');
    const prefix = config.api_prefix || '/gradio_api';
    const form = new FormData();
    form.append('files', file, 'reference.wav');
    onProgress(0, '上传所选音色');
    const files = await (await request(prefix + '/upload', {method:'POST', body:form})).json();
    const session = crypto.randomUUID().replaceAll('-', '');
    const data = [{path:files[0], orig_name:'reference.wav', meta:{_type:'gradio.FileData'}}, pitch, true, mix];
    const task = await (await request(prefix + '/queue/join', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({data, fn_index:dependency.id, session_hash:session})
    })).json();
    if (!task.event_id) throw new Error('当前排队人数较多，请稍后重试。');
    const output = await new Promise((resolve, reject) => {
      const stream = new EventSource(base + prefix + '/queue/data?session_hash=' + session);
      let finished = false;
      const finish = (error, value) => {
        if (finished) return;
        finished = true; stream.close(); clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        error ? reject(error) : resolve(value);
      };
      const abort = () => {
        // Gradio may finish an already-running CPU step; stop queue waiting here.
        fetch(base + prefix + '/cancel', {method:'POST', credentials:'omit',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({event_id:task.event_id, fn_index:dependency.id, session_hash:session})}).catch(()=>{});
        finish(new DOMException('停止等待', 'AbortError'));
      };
      const timeout = setTimeout(() => { abort(); }, 20 * 60 * 1000);
      signal?.addEventListener('abort', abort, {once:true});
      if (signal?.aborted) return abort();
      stream.onmessage = event => {
        try {
          const message = JSON.parse(event.data);
          if (message.event_id && message.event_id !== task.event_id) return;
          if (message.msg === 'estimation') {
            onProgress(0, message.rank > 0 ? `排队中，前面还有 ${message.rank} 个任务` : '等待开始制作');
          } else if (message.msg === 'process_starts') {
            onProgress(0.02, '开始处理音色');
          } else if (message.msg === 'progress') {
            const progress = message.progress_data?.at(-1);
            if (progress) onProgress(progress.progress ?? 0, progress.desc || '正在转换歌声');
          } else if (message.msg === 'process_completed') {
            if (!message.success) finish(new Error(message.output?.error || '生成失败，请稍后重试。'));
            else finish(null, message.output?.data?.[0]);
          } else if (message.msg === 'queue_full' || message.msg === 'unexpected_error') {
            finish(new Error(message.message || '合成服务繁忙，请稍后重试。'));
          }
        } catch (error) { finish(error); }
      };
      stream.onerror = () => finish(new Error('与合成服务的连接中断，请稍后重试。'));
    });
    const outputUrl = typeof output === 'string' ? output : output?.url;
    if (!outputUrl) throw new Error('服务未返回有效音频。');
    const resolved = new URL(outputUrl, base);
    if (resolved.origin !== new URL(base).origin) throw new Error('合成服务返回了意外的下载地址。');
    const result = await fetch(resolved, {signal, credentials:'omit'});
    if (!result.ok) throw new Error('音频下载失败，请重新生成。');
    const audio = await result.blob();
    if (audio.size < 1000 || !(audio.type.startsWith('audio/') || audio.type === 'application/octet-stream')) {
      throw new Error('合成服务返回的内容不是有效音频。');
    }
    return audio;
  }
  window.EchoConversion = {run};
})();
