(function attachBackgroundAutomationContext(root, factory) {
  root.MultiPageBackgroundAutomationContext = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundAutomationContextModule() {
  function createAutomationContext(deps = {}) {
    const {
      addLog,
      getState,
      sendToContentScript,
      sendToContentScriptResilient,
      setState,
      setStepStatus,
      throwIfStopped,
    } = deps;

    async function sendAutomationAction(source, action, options = {}) {
      if (typeof throwIfStopped === 'function') {
        throwIfStopped();
      }
      const sender = typeof sendToContentScriptResilient === 'function'
        ? sendToContentScriptResilient
        : sendToContentScript;
      if (typeof sender !== 'function') {
        throw new Error('自动化框架缺少内容脚本通信能力。');
      }

      return sender(source, {
        type: 'AUTOMATION_ACTION',
        source: 'background',
        payload: action || {},
      }, options);
    }

    return {
      browser: {
        sendAutomationAction,
      },
      dom: {
        execute: sendAutomationAction,
      },
      runtime: {
        addLog,
        getState,
        setState,
        setStepStatus,
        throwIfStopped,
      },
    };
  }

  return { createAutomationContext };
});
