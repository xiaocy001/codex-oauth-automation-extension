const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadActions() {
  const source = fs.readFileSync('content/automation-actions.js', 'utf8');
  const globalScope = {};
  return new Function('self', `${source}; return self.MultiPageAutomationContentActions;`)(globalScope);
}

test('content automation actions dispatch wait, fill, click, and sleep operations', async () => {
  const api = loadActions();
  const calls = [];
  const input = { tagName: 'INPUT' };
  const button = { tagName: 'BUTTON' };

  const actions = api.createContentActions({
    waitForElement: async (selector, timeoutMs) => {
      calls.push(['waitForElement', selector, timeoutMs]);
      return selector === '#submit' ? button : input;
    },
    waitForElementByText: async (selector, pattern, timeoutMs) => {
      calls.push(['waitForElementByText', selector, pattern.source, timeoutMs]);
      return button;
    },
    fillInput: (element, value) => calls.push(['fillInput', element.tagName, value]),
    fillSelect: (element, value) => calls.push(['fillSelect', element.tagName, value]),
    simulateClick: (element) => calls.push(['click', element.tagName]),
    sleep: async (ms) => calls.push(['sleep', ms]),
  });

  await actions.executeAction({ type: 'fillInput', selector: '#email', value: 'a@example.com', timeoutMs: 123 });
  await actions.executeAction({ type: 'fillSelect', selector: '#country', value: 'DE' });
  await actions.executeAction({ type: 'click', selector: '#submit' });
  await actions.executeAction({ type: 'waitText', selector: 'button', textPattern: 'Continue', timeoutMs: 456 });
  await actions.executeAction({ type: 'sleep', ms: 50 });

  assert.deepStrictEqual(calls, [
    ['waitForElement', '#email', 123],
    ['fillInput', 'INPUT', 'a@example.com'],
    ['waitForElement', '#country', 10000],
    ['fillSelect', 'INPUT', 'DE'],
    ['waitForElement', '#submit', 10000],
    ['click', 'BUTTON'],
    ['waitForElementByText', 'button', 'Continue', 456],
    ['sleep', 50],
  ]);
});

test('content automation actions reject unknown action types', async () => {
  const api = loadActions();
  const actions = api.createContentActions({});

  await assert.rejects(
    () => actions.executeAction({ type: 'unknown' }),
    /未知自动化动作：unknown/
  );
});
