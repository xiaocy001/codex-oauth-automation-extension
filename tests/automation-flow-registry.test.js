const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadFlowRegistry() {
  const stepSource = fs.readFileSync('data/step-definitions.js', 'utf8');
  const flowSource = fs.readFileSync('data/automation-flow-registry.js', 'utf8');
  const globalScope = {};

  return new Function(
    'self',
    `${stepSource}\n${flowSource}; return self.MultiPageAutomationFlowRegistry;`
  )(globalScope);
}

test('automation flow registry exposes normal and Plus OAuth flows', () => {
  const api = loadFlowRegistry();
  const flows = api.getFlows();

  assert.deepStrictEqual(flows.map((flow) => flow.id), ['oauth-normal', 'oauth-plus']);
  assert.equal(api.getDefaultFlowId(), 'oauth-normal');
  assert.equal(api.getFlow('oauth-normal').title, 'OAuth 注册授权');
  assert.equal(api.getFlow('oauth-plus').title, 'OAuth + Plus 订阅');
});

test('automation flow registry maps flow steps to executor keys without business settings', () => {
  const api = loadFlowRegistry();
  const normalSteps = api.getSteps('oauth-normal');
  const plusSteps = api.getSteps('oauth-plus');

  assert.equal(normalSteps.length, 10);
  assert.equal(plusSteps.length, 13);
  assert.deepStrictEqual(
    normalSteps.map((step) => step.executorKey),
    normalSteps.map((step) => step.key)
  );
  assert.equal(normalSteps.every((step) => step.skippable === true), true);
  assert.equal(api.getStep('oauth-plus', 6).key, 'plus-checkout-create');
  assert.equal(api.getStep('missing-flow', 1).key, 'open-chatgpt');
});

test('background and sidepanel load automation framework modules before bootstrap', () => {
  const background = fs.readFileSync('background.js', 'utf8');
  assert.match(background, /data\/automation-flow-registry\.js/);
  assert.match(background, /content\/automation-actions\.js/);

  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');
  const registryIndex = html.indexOf('<script src="../data/automation-flow-registry.js"></script>');
  const sidepanelIndex = html.indexOf('<script src="sidepanel.js"></script>');
  assert.notEqual(registryIndex, -1);
  assert.notEqual(sidepanelIndex, -1);
  assert.ok(registryIndex < sidepanelIndex);
});
