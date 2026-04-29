(function attachAutomationFlowRegistry(root, factory) {
  root.MultiPageAutomationFlowRegistry = factory(root.MultiPageStepDefinitions);
})(typeof self !== 'undefined' ? self : globalThis, function createAutomationFlowRegistry(stepDefinitionsApi) {
  const DEFAULT_FLOW_ID = 'oauth-normal';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getBaseSteps(options = {}) {
    return (stepDefinitionsApi?.getSteps?.(options) || [])
      .map((step) => ({
        ...step,
        executorKey: String(step.executorKey || step.key || '').trim(),
        skippable: step.skippable !== false,
      }))
      .sort((left, right) => {
        const leftOrder = Number.isFinite(left.order) ? left.order : left.id;
        const rightOrder = Number.isFinite(right.order) ? right.order : right.id;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return Number(left.id) - Number(right.id);
      });
  }

  const FLOW_DEFINITIONS = [
    {
      id: 'oauth-normal',
      title: 'OAuth 注册授权',
      description: '现有普通 OAuth 注册、登录和平台回调流程。',
      mode: 'normal',
      steps: getBaseSteps({ plusModeEnabled: false }),
    },
    {
      id: 'oauth-plus',
      title: 'OAuth + Plus 订阅',
      description: '现有 OAuth 注册后接入 Plus Checkout 与 PayPal 授权的流程。',
      mode: 'plus',
      steps: getBaseSteps({ plusModeEnabled: true }),
    },
  ];

  const flowsById = new Map(FLOW_DEFINITIONS.map((flow) => [flow.id, flow]));

  function normalizeFlowId(flowId) {
    const normalized = String(flowId || '').trim();
    return flowsById.has(normalized) ? normalized : DEFAULT_FLOW_ID;
  }

  function getDefaultFlowId() {
    return DEFAULT_FLOW_ID;
  }

  function getFlows() {
    return clone(FLOW_DEFINITIONS.map(({ steps, ...flow }) => flow));
  }

  function getFlow(flowId) {
    return clone(flowsById.get(normalizeFlowId(flowId)) || flowsById.get(DEFAULT_FLOW_ID));
  }

  function getSteps(flowId) {
    const flow = flowsById.get(normalizeFlowId(flowId)) || flowsById.get(DEFAULT_FLOW_ID);
    return clone(flow.steps || []);
  }

  function getStep(flowId, stepId) {
    const numericStepId = Number(stepId);
    return getSteps(flowId).find((step) => Number(step.id) === numericStepId) || null;
  }

  function getFlowIdForState(state = {}) {
    const explicitFlowId = normalizeFlowId(state.currentFlowId);
    if (state.currentFlowId && explicitFlowId !== DEFAULT_FLOW_ID) {
      return explicitFlowId;
    }
    return state.plusModeEnabled ? 'oauth-plus' : explicitFlowId;
  }

  function isPlusFlow(flowId) {
    return getFlow(flowId).mode === 'plus';
  }

  return {
    DEFAULT_FLOW_ID,
    getDefaultFlowId,
    getFlow,
    getFlowIdForState,
    getFlows,
    getStep,
    getSteps,
    isPlusFlow,
    normalizeFlowId,
  };
});
