const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {runInNewContext} = require('node:vm');

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const referralKey = 'northlink.referral';
const token = 'aB0_-'.repeat(4) + 'aB0_';

function tab(hash, storage = new Map()) {
  const location = {hash, pathname: '/', search: ''};
  const visited = [];
  const context = {
    REFERRAL_KEY: referralKey,
    location,
    sessionStorage: {getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v)},
    history: {replaceState: (_, __, url) => visited.push(url)},
    document: {getElementById: id => ({scrollIntoView() { assert.equal(id, 'get'); }})},
  };
  const source = html.slice(html.indexOf('    function ssave('), html.indexOf('    /* ── OIDC:'));
  const actions = runInNewContext(source + '\n({request: () => sessionRequest({Authorization:"Bearer example"}, sload(REFERRAL_KEY)), link: () => telegramLink(sload(REFERRAL_KEY))});',
    {...context, window: {addEventListener() {}}});
  return {visited, storage, ...actions};
}

test('referral remains in the same tab across OIDC callback and is sent with the authenticated session', () => {
  const first = tab('#ref=' + token);
  assert.deepEqual(first.visited, ['/#get']);
  const afterLogin = tab('#code=callback&state=expected', first.storage);
  assert.deepEqual(afterLogin.visited, []);
  const request = afterLogin.request();
  assert.equal(request.headers.Authorization, 'Bearer example');
  assert.equal(request.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.body), {referral: token});
  assert.equal(afterLogin.link(), 'https://t.me/northlink_bot?start=r_' + token);
});

test('invalid invitation leaves the normal request empty', () => {
  const current = tab('#ref=bad');
  assert.deepEqual(current.visited, []);
  assert.equal(current.request().body, undefined);
  assert.equal(current.link(), 'https://t.me/northlink_bot');
});
