const assert = require('assert');

global.location = {
  href: 'https://example.com/app/start',
  pathname: '/app/start',
};

global.document = {
  readyState: 'complete',
  addEventListener() {},
};

global.window = {
  self: null,
  top: null,
  addEventListener() {},
};
window.self = window;
window.top = window;

require('../extension/modules/userscript_matcher.js');
require('../extension/modules/userscript_runtime.js');

const matcher = window.UserscriptMatcher;
const runtime = window.UserscriptRuntime;

function script(id, parsedMeta) {
  return {
    id,
    name: id,
    version: '1.0.0',
    enabled: true,
    parsedMeta,
  };
}

const ran = [];
const execute = payload => ran.push({
  id: payload.id,
  executionId: payload.executionId,
  reason: payload.runReason,
});

const scripts = [
  script('match-basic', { matches: ['https://example.com/app/*'], runAt: 'document-idle' }),
  script('include-regex', { includes: ['/\\/app\\/start$/'], runAt: 'document-idle' }),
  script('excluded', {
    matches: ['https://example.com/app/*'],
    excludeMatches: ['https://example.com/app/start', 'https://example.com/app/private/*'],
  }),
  script('noframes', { matches: ['https://example.com/app/*'], noframes: true }),
];

assert.strictEqual(matcher.shouldRun(scripts[0], 'https://example.com/app/start', { isTop: true }), true);
assert.strictEqual(matcher.shouldRun(scripts[2], 'https://example.com/app/private/page', { isTop: true }), false);
assert.strictEqual(matcher.shouldRun(scripts[3], 'https://example.com/app/start', { isTop: false }), false);

const firstCount = runtime.runMatchingScripts({
  scripts,
  url: 'https://example.com/app/start',
  reason: 'load',
  execute,
  shouldRun: matcher.shouldRun,
});
assert.strictEqual(firstCount, 3);
assert.deepStrictEqual(ran.map(item => item.id), ['match-basic', 'include-regex', 'noframes']);

const duplicateCount = runtime.runMatchingScripts({
  scripts,
  url: 'https://example.com/app/start',
  reason: 'load',
  execute,
  shouldRun: matcher.shouldRun,
});
assert.strictEqual(duplicateCount, 0);

const spaCount = runtime.runMatchingScripts({
  scripts,
  url: 'https://example.com/app/next',
  reason: 'spa',
  execute,
  shouldRun: matcher.shouldRun,
});
assert.strictEqual(spaCount, 3);
assert.strictEqual(ran.filter(item => item.reason === 'spa').length, 3);

console.log(`phase6 userscript runtime smoke passed: ${ran.length} executions`);
