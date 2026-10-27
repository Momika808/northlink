const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const html=fs.readFileSync(path.join(__dirname,'../ru-check.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const id='ND-'+'a'.repeat(32),domains=Array.from({length:9},(_,i)=>'service'+i+'.ru');
function setup(options={}){
 const els={};for(const id of ['run','stop','output','status','mode','copy'])els[id]={value:id==='mode'?'current':'',disabled:false,textContent:'',listeners:{},addEventListener(t,fn){this.listeners[t]=fn;},focus(){this.focused=true;},select(){this.selected=true;}};
 let running=0,max=0,post,calls=[];
 async function fetch(url,opts){
  calls.push({url,opts});
  if(url==='/api/diag'){
   assert.equal(opts.method,'POST');assert.equal(opts.credentials,'omit');
   const b=JSON.parse(opts.body);
   if(options.apiFailureAt===b.kind){
    if(options.networkError)throw new TypeError('PRIVATE_TOKEN');
    if(options.hangApi)return await new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(new Error('aborted'))));
    if(options.invalidJson)return {ok:true,json:async()=>{throw new SyntaxError('PRIVATE_BODY');}};
    return {ok:false,status:options.apiStatus||503};
   }
   if(b.kind==='targets')return {ok:true,json:async()=>options.catalog||{targets:domains,version:'0123456789abcdef',limit:500}};
   post=b;return {ok:true,json:async()=>({report_id:id})};
  }
  if(url==='https://ipwho.is/')return {ok:true,json:async()=>({success:options.geoSuccess!==false,country_code:'GE',ip:'PRIVATE_IP'})};
  assert.ok(domains.some(d=>url==='https://'+d+'/favicon.ico'));
  assert.equal(opts.mode,'no-cors');assert.equal(opts.credentials,'omit');
  running++;max=Math.max(max,running);
  try{
   if(options.hang)return await new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(new Error('aborted'))));
   await new Promise(resolve=>setTimeout(resolve,1));
   if(options.failDomain&&url.includes('service0.'))throw new Error('network');
   return {type:'opaque'};
  }finally{running--;}
 }
 const timer=options.fastTimeout?fn=>setTimeout(fn,1):setTimeout;
 const ctx={document:{getElementById:id=>els[id]},location:{origin:'https://ru.adminwg.dad'},fetch,performance,AbortController,Date,Set,Number,setTimeout:timer,clearTimeout,navigator:{clipboard:{writeText:async t=>{ctx.copied=t;}}}};
 vm.runInNewContext(script,ctx);
 return {els,ctx,get post(){return post;},get max(){return max;},calls};
}
test('CSP matches and general entry includes all three checks',()=>{
 const hash=crypto.createHash('sha256').update(script).digest('base64');assert.ok(html.includes("'sha256-"+hash+"'"));
 const hub=fs.readFileSync(path.join(__dirname,'../diagnostics.html'),'utf8');
 for(const p of ['ru-check.html','diag.html','payment-check.html'])assert.ok(hub.includes('href="'+p+'"'));
 const docker=fs.readFileSync(path.join(__dirname,'../Dockerfile'),'utf8');assert.ok(docker.includes('diagnostics.html ru-check.html'));
});
test('all targets come from VPN catalog; max six parallel; report has no IP',async()=>{
 const s=setup();assert.equal(s.calls.length,0);await s.els.run.listeners.click();
 assert.equal(s.max,6);assert.equal(s.post.results.length,domains.length);
 assert.deepEqual(s.post.results.map(x=>x.domain),domains);
 assert.ok(s.post.results.every(x=>x.state==='response'));
 assert.equal(s.post.country,'GE');assert.ok(!JSON.stringify(s.post).includes('PRIVATE_IP'));
 assert.ok(s.els.output.value.includes(id));assert.ok(s.els.output.value.includes('не подтверждает вход'));
 await s.els.copy.listeners.click();assert.equal(s.ctx.copied,s.els.output.value);
});
test('network error remains distinct and second run compares changes',async()=>{
 const opts={failDomain:true},s=setup(opts);await s.els.run.listeners.click();
 assert.equal(s.post.results[0].state,'network_error');
 opts.failDomain=false;s.els.mode.value='ru';await s.els.run.listeners.click();
 assert.equal(s.post.mode,'ru');assert.ok(s.els.output.value.includes('ответ появился у 1'));
});
test('missing geo information stays unknown',async()=>{
 const s=setup({geoSuccess:false});await s.els.run.listeners.click();assert.equal(s.post.country,'unknown');
});
test('catalog cannot inject arbitrary URL paths or private report data',async()=>{
 const s=setup({catalog:{targets:['bank.ru/secret'],version:'v',limit:500}});await s.els.run.listeners.click();
 assert.equal(s.post,undefined);assert.equal(s.calls.length,1);assert.ok(!s.els.output.value.includes('bank.ru/secret'));
});
test('stop cancels active probes and preserves a partial report',async()=>{
 const s=setup({hang:true});const run=s.els.run.listeners.click();
 await new Promise(resolve=>setImmediate(resolve));await s.els.stop.listeners.click();await run;
 assert.ok(s.post.results.length<=6);assert.ok(s.post.results.every(r=>r.state==='canceled'));
 assert.equal(s.els.run.disabled,false);assert.ok(s.els.output.value.includes('остановлено пользователем'));
});
test('timed-out probes do not claim service availability',async()=>{
 const s=setup({hang:true,fastTimeout:true});await s.els.run.listeners.click();
 assert.ok(s.post.results.every(r=>r.state==='timeout'));assert.ok(!s.els.output.value.includes('сетевой ответ получен'));
});

for(const status of [400,404,429,500,503]){
 test('HTTP '+status+' exposes the failed API stage',async()=>{
  const s=setup({apiFailureAt:'targets',apiStatus:status});await s.els.run.listeners.click();
  assert.ok(s.els.output.value.includes('Этап сбоя: Получение списка VPN-исключений'));
  assert.ok(s.els.output.value.includes(status===429?'Слишком много проверок':'HTTP '+status));
  assert.ok(s.els.output.value.includes('Завершённых сетевых проб: 0'));
  assert.ok(s.els.status.textContent.includes('не завершена'));
 });
}
test('network failure is distinct from HTTP errors and hides raw exception text',async()=>{
 const s=setup({apiFailureAt:'targets',networkError:true});await s.els.run.listeners.click();
 assert.ok(s.els.output.value.includes('Браузер не получил ответ API'));
 assert.ok(!s.els.output.value.includes('PRIVATE_TOKEN'));
});
test('API timeout is explicitly reported',async()=>{
 const s=setup({apiFailureAt:'targets',hangApi:true,fastTimeout:true});await s.els.run.listeners.click();
 assert.ok(s.els.output.value.includes('API не ответил за 10 секунд'));
});
test('invalid JSON is an explicit API response failure',async()=>{
 const s=setup({apiFailureAt:'targets',invalidJson:true});await s.els.run.listeners.click();
 assert.ok(s.els.output.value.includes('не удалось прочитать как JSON'));
 assert.ok(!s.els.output.value.includes('PRIVATE_BODY'));
});
test('failed report saving retains all completed probes',async()=>{
 const s=setup({apiFailureAt:'network',apiStatus:503});await s.els.run.listeners.click();
 assert.ok(s.els.output.value.includes('Этап сбоя: Сохранение отчёта на сервере'));
 assert.ok(s.els.output.value.includes('service8.ru: сетевой ответ получен'));
 assert.ok(s.els.output.value.includes('Завершённых сетевых проб: 9'));
 assert.ok(!s.els.output.value.includes('Номер отчёта: ND-'));
});
