const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const html = fs.readFileSync(require('node:path').join(__dirname, '../payment-check.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const id = 'PD-' + 'a'.repeat(32);
function setup(fetch, origin = 'https://ru.adminwg.dad', options = {}) {
  const els = {};
  for (const key of ['run', 'output', 'copy', 'status']) {
    els[key] = {disabled:false, value:'', textContent:'', listeners:{},
      addEventListener(type, fn) {this.listeners[type] = fn;}, focus(){}, select(){}};
  }
  const context = {document:{getElementById: id => els[id]}, location:{origin},
    performance, AbortController, fetch, setTimeout:options.setTimeout || setTimeout, clearTimeout, Date, SyntaxError,
    navigator:{clipboard:{writeText:options.copy || (async () => {})}}};
  vm.runInNewContext(script, context);
  return els;
}
function response(status, body) {return {status, ok:status===200, json:async()=>body};}

test('CSP authorizes exactly the shipped script; image includes page', () => {
  const hash = crypto.createHash('sha256').update(script).digest('base64');
  assert.ok(html.includes("'sha256-" + hash + "'"));
  const docker = fs.readFileSync(require('node:path').join(__dirname,'../Dockerfile'), 'utf8');
  assert.ok(docker.includes('payment-check.html'));
});
test('no automatic request; click sends no identity/token/URL and displays report', async () => {
  let calls = 0;
  const els = setup(async (url, opts) => {
    calls++;
    assert.equal(url, '/api/diag');
    assert.equal(opts.body, '{"kind":"payment"}');
    assert.equal(opts.credentials, 'omit');
    return response(200, {report_id:id, messages:['СБП отсутствует.'], facts:{checked_at:'2026-10-27T12:00:00+00:00'}});
  });
  assert.equal(calls,0);
  await els.run.listeners.click();
  assert.equal(calls,1);
  assert.ok(els.output.value.includes(id));
  assert.ok(els.output.value.includes('СБП отсутствует.'));
  assert.equal(els.run.disabled,false);
});
for (const status of [400,404,429,500]) {
  test('HTTP '+status+' remains distinct from a successful server report',async () => {
    const els = setup(async()=>response(status, {}));
    await els.run.listeners.click();
    assert.ok(els.output.value.includes('HTTP '+status));
    assert.ok(!els.output.value.includes('Номер отчёта:'));
    assert.equal(els.copy.disabled,false);
  });
}
test('network rejection does not pretend to have server logs or diagnose ISP',async()=>{
  const els = setup(async()=>{throw new TypeError('PRIVATE_URL');});
  await els.run.listeners.click();
  assert.ok(els.output.value.includes('Причина по этому результату не установлена'));
  assert.ok(els.output.value.includes('Номер серверного отчёта не получен'));
  assert.ok(!els.output.value.includes('PRIVATE_URL'));
});
test('unexpected JSON is an incomplete check, not success',async()=>{
  const els = setup(async()=>response(200, {ok:true}));
  await els.run.listeners.click();
  assert.ok(els.output.value.includes('Проверка не завершена'));
});
test('other deployment uses fixed RU endpoint and ignores query string',async()=>{
  const els = setup(async(url)=>{
    assert.equal(url,'https://ru.adminwg.dad/api/diag');
    return response(429,{});
  },'https://momika808.github.io');
  await els.run.listeners.click();
});
test('double click coalesces and report can be copied',async()=>{
  let release, calls=0;
  const els=setup(()=>{calls++;return new Promise(resolve=>{release=resolve;});});
  const running=els.run.listeners.click();
  await els.run.listeners.click();
  assert.equal(calls,1);
  release(response(200,{report_id:id,messages:['done']}));
  await running;
  await els.copy.listeners.click();
  assert.equal(els.status.textContent,'Отчёт скопирован.');
});

test('timeout leaves a copyable report and re-enables the button',async()=>{
  const els=setup((url,opts)=>new Promise((_,reject)=>{
    opts.signal.addEventListener('abort',()=>reject(new Error('aborted')));
  }), 'https://ru.adminwg.dad', {setTimeout:fn=>setTimeout(fn,1)});
  await els.run.listeners.click();
  assert.ok(els.output.value.includes('12 секунд'));
  assert.equal(els.copy.disabled,false);
  assert.equal(els.run.disabled,false);
});
test('clipboard refusal leaves manual copying available',async()=>{
  const els=setup(async()=>response(429,{}), 'https://ru.adminwg.dad', {
    copy: async()=>{throw new Error('denied');}
  });
  await els.run.listeners.click();
  await els.copy.listeners.click();
  assert.ok(els.status.textContent.includes('вручную'));
});
