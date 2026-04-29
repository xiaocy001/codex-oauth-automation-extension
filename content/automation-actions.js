(function attachAutomationContentActions(root, factory) {
  root.MultiPageAutomationContentActions = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createAutomationContentActionsModule() {
  const DEFAULT_TIMEOUT_MS = 10000;

  function toTextPattern(value) {
    if (value instanceof RegExp) {
      return value;
    }
    return new RegExp(String(value || ''), 'i');
  }

  function createContentActions(deps = {}) {
    const {
      fillInput,
      fillSelect,
      simulateClick,
      sleep,
      waitForElement,
      waitForElementByText,
    } = deps;

    async function getElement(action) {
      if (typeof waitForElement !== 'function') {
        throw new Error('自动化动作缺少 waitForElement 能力。');
      }
      return waitForElement(action.selector, action.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    }

    async function executeAction(action = {}) {
      const type = String(action.type || '').trim();

      switch (type) {
        case 'waitElement':
          return {
            ok: true,
            found: Boolean(await getElement(action)),
          };
        case 'waitText': {
          if (typeof waitForElementByText !== 'function') {
            throw new Error('自动化动作缺少 waitForElementByText 能力。');
          }
          const element = await waitForElementByText(
            action.selector,
            toTextPattern(action.textPattern),
            action.timeoutMs ?? DEFAULT_TIMEOUT_MS
          );
          return { ok: true, found: Boolean(element) };
        }
        case 'fillInput':
          if (typeof fillInput !== 'function') {
            throw new Error('自动化动作缺少 fillInput 能力。');
          }
          fillInput(await getElement(action), action.value ?? '');
          return { ok: true };
        case 'fillSelect':
          if (typeof fillSelect !== 'function') {
            throw new Error('自动化动作缺少 fillSelect 能力。');
          }
          fillSelect(await getElement(action), action.value ?? '');
          return { ok: true };
        case 'click':
          if (typeof simulateClick !== 'function') {
            throw new Error('自动化动作缺少 click 能力。');
          }
          simulateClick(await getElement(action));
          return { ok: true };
        case 'sleep':
          if (typeof sleep !== 'function') {
            throw new Error('自动化动作缺少 sleep 能力。');
          }
          await sleep(Math.max(0, Number(action.ms) || 0));
          return { ok: true };
        default:
          throw new Error(`未知自动化动作：${type || 'unknown'}`);
      }
    }

    return { executeAction };
  }

  return { createContentActions };
});
