import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../conversion-api.js', import.meta.url), 'utf8');
const base = 'https://example.test';
function harness(messages, resultType = 'audio/wav') {
  const calls = [];
  let closed = false;
  class EventSource {
    constructor() { setTimeout(() => messages.forEach(m => this.onmessage?.({data:JSON.stringify(m)})), 0); }
    close() { closed = true; }
  }
  const fetch = async (url, options={}) => {
    calls.push({url:String(url), options});
    if (String(url).endsWith('/config')) return Response.json({api_prefix:'/gradio_api', dependencies:[{api_name:'convert', id:7}]});
    if (String(url).endsWith('/upload')) return Response.json(['/tmp/uploaded.wav']);
    if (String(url).endsWith('/queue/join')) return Response.json({event_id:'job-1'});
    if (String(url).endsWith('/cancel')) return Response.json({success:true});
    return new Response(new Uint8Array(2048), {headers:{'Content-Type':resultType}});
  };
  const context = {window:{}, fetch, EventSource, crypto:globalThis.crypto, FormData, Blob, URL, DOMException, setTimeout, clearTimeout};
  vm.runInNewContext(source, context);
  return {api:context.window.EchoConversion,calls,closed:()=>closed};
}

test('sends the selected recording and settings, then downloads only successful audio', async()=>{
  const h=harness([{msg:'progress',event_id:'job-1',progress_data:[{progress:0.6,desc:'converting'}]},
    {msg:'process_completed',event_id:'job-1',success:true,output:{data:[{url:base+'/result.wav'}]}}]);
  const progress=[];
  const output=await h.api.run(base,new Blob(['voice']),2,85,{onProgress:(p,s)=>progress.push([p,s])});
  const payload=JSON.parse(h.calls.find(c=>c.url.endsWith('/queue/join')).options.body);
  assert.equal(payload.data[0].path,'/tmp/uploaded.wav');
  assert.deepEqual(payload.data.slice(1),[2,true,85]);
  assert.equal(payload.fn_index,7);
  assert.ok(progress.some(([p])=>p===0.6));
  assert.equal(output.size,2048);
  assert.ok(h.closed());
});
test('failed model output is an error, never an audio result',async()=>{
  const h=harness([{msg:'process_completed',event_id:'job-1',success:false,output:{error:'model unavailable'}}]);
  await assert.rejects(h.api.run(base,new Blob(['voice']),0,70),/model unavailable/);
  assert.ok(h.closed());
});
test('rejects HTML returned instead of audio',async()=>{
  const h=harness([{msg:'process_completed',event_id:'job-1',success:true,output:{data:[{url:base+'/result.wav'}]}}],'text/html');
  await assert.rejects(h.api.run(base,new Blob(['voice']),0,70),/不是有效音频/);
});
test('aborting a queued request closes the stream and sends cancellation',async()=>{
  const h=harness([]), controller=new AbortController();
  const pending=h.api.run(base,new Blob(['voice']),0,70,{signal:controller.signal});
  setTimeout(()=>controller.abort(),20);
  await assert.rejects(pending,{name:'AbortError'});
  assert.ok(h.closed());
  assert.ok(h.calls.some(c=>c.url.endsWith('/cancel')));
});
