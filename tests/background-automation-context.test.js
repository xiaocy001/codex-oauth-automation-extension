const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadAutomationContext() {
  const source = fs.readFileSync('background/automation-context.js', 'utf8');
  const globalScope = {};
  return new Function('self', `${source}; return self.MultiPageBackgroundAutomationContext;`)(globalScope);
}

test('automation context sends framework DOM actions without business knowledge', async () => {
  const api = loadAutomationContext();
  const sent = [];
  const context = api.createAutomationContext({
    addLog: async (message, level) => sent.push(['log', message, level]),
    getState: async () => ({ currentFlowId: 'oauth-normal' }),
    setState: async (updates) => sent.push(['setState', updates]),
    sendToContentScript: async (source, message, options) => {
      sent.push(['send', source, message, options]);
      return { ok: true };
    },
    setStepStatus: async (step, status) => sent.push(['status', step, status]),
    throwIfStopped: () => sent.push(['stop-check']),
  });

  const result = await context.dom.execute('signup-page', { type: 'click', selector: '#next' }, { timeoutMs: 123 });
  await context.runtime.setStepStatus(2, 'running');
  await context.runtime.addLog('hello', 'info');

  assert.deepStrictEqual(result, { ok: true });
  assert.deepStrictEqual(sent, [
    ['stop-check'],
    ['send', 'signup-page', {
      type: 'AUTOMATION_ACTION',
      source: 'background',
      payload: { type: 'click', selector: '#next' },
    }, { timeoutMs: 123 }],
    ['status', 2, 'running'],
    ['log', 'hello', 'info'],
  ]);
});

test('background imports automation context before step executors are created', () => {
  const background = fs.readFileSync('background.js', 'utf8');
  const contextIndex = background.indexOf("'background/automation-context.js'");
  const stepIndex = background.indexOf("'background/steps/open-chatgpt.js'");

  assert.notEqual(contextIndex, -1);
  assert.notEqual(stepIndex, -1);
  assert.ok(contextIndex < stepIndex);
});
