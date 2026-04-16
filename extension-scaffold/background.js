importScripts('page-operation-tool.js');

const SETTINGS_STORAGE_KEY = 'scaffoldSettings';
const RUNTIME_STORAGE_KEY = 'scaffoldRuntimeState';
const OPEN_MODE_LABELS = {
  [PAGE_OPEN_MODE.NEW_TAB]: '新开标签',
  [PAGE_OPEN_MODE.REUSE_DOMAIN_TAB]: '复用域名标签',
  [PAGE_OPEN_MODE.CURRENT_TAB]: '当前标签',
};
const STEP_DEFINITIONS = [
  {
    id: 1,
    title: '打开页面并读取首条结果',
    execute: async () => {
      return executeStepOneFlow();
    },
  },
  {
    id: 2,
    title: '复用百度标签打开百度地图',
    execute: async () => {
      return pageOperationTool.loadPage(PAGE_OPEN_MODE.REUSE_DOMAIN_TAB, 'https://map.baidu.com');
    },
  },
  {
    id: 3,
    title: '当前标签打开示例页面',
    execute: async () => {
      return pageOperationTool.loadPage(PAGE_OPEN_MODE.CURRENT_TAB, 'https://example.com');
    },
  },
];
const STEP_ONE_PAGE_URL = 'https://www.baidu.com';
const STEP_ONE_TEXTAREA_SELECTOR = '#chat-textarea';
const STEP_ONE_SUBMIT_SELECTOR = '#chat-submit-button';
const STEP_ONE_RESULT_SELECTOR = 'div.cos-text-subtitle-sm.cos-highlight';
const STEP_WAIT_TIMEOUT_MS = 30000;
const STEP_WAIT_INTERVAL_MS = 500;
const pageOperationTool = new PageOperationTool();

let state = createDefaultState();
let activeExecutionId = 0;
const readyPromise = initialize();

function createDefaultSteps() {
  return STEP_DEFINITIONS.map((step) => ({
    id: step.id,
    title: step.title,
    status: 'pending',
  }));
}

function createDefaultSettings() {
  return {
    projectName: '新扩展项目',
    environment: 'dev',
    note: '',
    featureEnabled: false,
  };
}

function createDefaultUpdateInfo() {
  return {
    currentVersion: chrome.runtime.getManifest().version,
    latestVersion: null,
    hasUpdate: false,
    summary: '当前为骨架版本，尚未配置远程更新源。',
    checkedAt: null,
    sourceUrl: null,
  };
}

function createDefaultState() {
  return {
    status: 'idle',
    runCount: 1,
    settings: createDefaultSettings(),
    steps: createDefaultSteps(),
    logs: [
      {
        level: 'info',
        message: '骨架已初始化，可在此基础上继续扩展功能。',
        timestamp: Date.now(),
      },
    ],
    updateInfo: createDefaultUpdateInfo(),
    pageRegistry: {},
  };
}

async function loadPersistedState() {
  const stored = await chrome.storage.local.get([SETTINGS_STORAGE_KEY, RUNTIME_STORAGE_KEY]);
  const runtime = stored[RUNTIME_STORAGE_KEY] || {};
  state = {
    ...createDefaultState(),
    ...runtime,
    settings: {
      ...createDefaultSettings(),
      ...(stored[SETTINGS_STORAGE_KEY] || {}),
    },
    steps: normalizeSteps(runtime.steps),
    logs: normalizeLogs(runtime.logs),
    updateInfo: {
      ...createDefaultUpdateInfo(),
      ...(runtime.updateInfo || {}),
      currentVersion: chrome.runtime.getManifest().version,
    },
    pageRegistry: normalizePageRegistry(runtime.pageRegistry),
  };
  pageOperationTool.hydrateRegistry(state.pageRegistry);
}

function normalizeSteps(steps) {
  const fallbackSteps = createDefaultSteps();
  if (!Array.isArray(steps) || steps.length === 0) {
    return fallbackSteps;
  }

  const storedById = new Map(
    steps
      .filter((step) => step && Number.isInteger(step.id))
      .map((step) => [step.id, step]),
  );

  return fallbackSteps.map((fallbackStep) => {
    const step = storedById.get(fallbackStep.id) || {};
    return {
      id: fallbackStep.id,
      title: fallbackStep.title,
      status: normalizeStepStatus(step.status),
    };
  });
}

function normalizeStepStatus(status) {
  if (status === 'running' || status === 'completed' || status === 'failed') {
    return status;
  }
  return 'pending';
}

function normalizePageRegistry(pageRegistry) {
  if (!pageRegistry || typeof pageRegistry !== 'object' || Array.isArray(pageRegistry)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(pageRegistry).filter(([, tabId]) => Number.isInteger(tabId) && tabId > 0),
  );
}

function normalizeLogs(logs) {
  if (!Array.isArray(logs) || logs.length === 0) {
    return createDefaultState().logs;
  }

  return logs
    .map((entry) => ({
      level: typeof entry?.level === 'string' ? entry.level : 'info',
      message: typeof entry?.message === 'string' ? entry.message : '',
      timestamp: Number.isFinite(entry?.timestamp) ? entry.timestamp : Date.now(),
    }))
    .filter((entry) => entry.message);
}

async function persistState() {
  state.pageRegistry = pageOperationTool.exportRegistry();
  await chrome.storage.local.set({
    [SETTINGS_STORAGE_KEY]: state.settings,
    [RUNTIME_STORAGE_KEY]: {
      status: state.status,
      runCount: state.runCount,
      steps: state.steps,
      logs: state.logs,
      updateInfo: state.updateInfo,
      pageRegistry: state.pageRegistry,
    },
  });
}

function cloneState() {
  return JSON.parse(JSON.stringify(state));
}

async function broadcastState() {
  const snapshot = cloneState();
  try {
    await chrome.runtime.sendMessage({ type: 'STATE_CHANGED', payload: snapshot });
  } catch (error) {
    // Side panel may be closed.
  }
}

async function commitState(mutator) {
  mutator(state);
  await persistState();
  await broadcastState();
}

async function setPanelBehavior() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    // Ignore unsupported environments.
  }
}

function addLog(message, level = 'info') {
  state.logs = [
    ...state.logs,
    {
      level,
      message,
      timestamp: Date.now(),
    },
  ].slice(-200);
}

function startExecution() {
  activeExecutionId += 1;
  return activeExecutionId;
}

function cancelActiveExecution() {
  activeExecutionId += 1;
}

function isExecutionActive(executionId) {
  return activeExecutionId === executionId;
}

function getStepDefinition(stepId) {
  return STEP_DEFINITIONS.find((step) => step.id === stepId) || null;
}

async function initialize() {
  await loadPersistedState();
  await setPanelBehavior();
  addLog('背景服务已就绪。');
  await persistState();
  await broadcastState();
}

chrome.runtime.onInstalled.addListener(() => {
  void setPanelBehavior();
});

chrome.runtime.onStartup?.addListener(() => {
  void setPanelBehavior();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const nextRegistry = Object.fromEntries(
    Object.entries(pageOperationTool.exportRegistry()).filter(([, savedTabId]) => savedTabId !== tabId),
  );
  pageOperationTool.hydrateRegistry(nextRegistry);
  state.pageRegistry = nextRegistry;
  void persistState();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  readyPromise
    .then(() => handleMessage(message))
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case 'GET_STATE':
      return cloneState();
    case 'SAVE_SETTINGS':
      return saveSettings(message.payload || {});
    case 'START_RUN':
      return startRun(message.payload || {});
    case 'STOP_RUN':
      return stopRun();
    case 'RESET_RUN':
      return resetRun();
    case 'RUN_STEP':
      return runStep(message.payload?.stepId);
    case 'CLEAR_LOGS':
      return clearLogs();
    case 'CHECK_UPDATES':
      return checkUpdates();
    default:
      throw new Error('未知消息类型');
  }
}

async function saveSettings(nextSettings) {
  await commitState((draft) => {
    draft.settings = {
      ...draft.settings,
      ...(nextSettings || {}),
    };
    addLog('配置已保存。');
  });
  return cloneState();
}

async function startRun(payload) {
  const nextRunCount = sanitizeRunCount(payload.runCount);
  const executionId = startExecution();

  await commitState((draft) => {
    draft.runCount = nextRunCount;
    draft.status = 'running';
    draft.steps = createDefaultSteps();
    addLog(`开始运行，计划执行 ${nextRunCount} 次。`);
  });

  void runSequence(executionId, nextRunCount);
  return cloneState();
}

async function stopRun() {
  cancelActiveExecution();
  await commitState((draft) => {
    draft.status = 'stopped';
    draft.steps = draft.steps.map((step) => (step.status === 'running' ? { ...step, status: 'pending' } : step));
    addLog('运行已停止。', 'warn');
  });
  return cloneState();
}

async function resetRun() {
  cancelActiveExecution();
  await commitState((draft) => {
    draft.status = 'idle';
    draft.runCount = 1;
    draft.steps = createDefaultSteps();
    draft.pageRegistry = {};
    addLog('运行状态已重置。');
  });
  pageOperationTool.hydrateRegistry({});
  return cloneState();
}

async function runStep(stepId) {
  const numericStepId = Number(stepId);
  const stepDefinition = getStepDefinition(numericStepId);
  if (!stepDefinition) {
    throw new Error('步骤编号无效');
  }

  const executionId = startExecution();
  await commitState((draft) => {
    draft.status = 'running';
    draft.steps = draft.steps.map((step) => {
      if (step.id === numericStepId) {
        return { ...step, status: 'pending' };
      }
      return step;
    });
    addLog(`手动执行步骤 ${numericStepId}：${stepDefinition.title}。`);
  });

  await executeConfiguredStep(stepDefinition, executionId);
  if (isExecutionActive(executionId) && state.status === 'running') {
    await commitState((draft) => {
      draft.status = 'idle';
      addLog(`步骤 ${numericStepId} 执行结束。`);
    });
  }
  return cloneState();
}

async function runSequence(executionId, runCount) {
  let terminatedEarly = false;

  for (let round = 1; round <= runCount; round += 1) {
    if (!isExecutionActive(executionId)) {
      terminatedEarly = true;
      break;
    }

    if (round > 1) {
      await commitState((draft) => {
        draft.steps = createDefaultSteps();
        addLog(`开始第 ${round} 轮执行。`);
      });
    }

    for (const stepDefinition of STEP_DEFINITIONS) {
      const result = await executeConfiguredStep(stepDefinition, executionId);
      if (!result.ok) {
        terminatedEarly = true;
        break;
      }
    }

    if (terminatedEarly) {
      break;
    }
  }

  if (!isExecutionActive(executionId) || state.status !== 'running') {
    return;
  }

  await commitState((draft) => {
    draft.status = 'idle';
    addLog('全部步骤已按顺序执行完成。');
  });
}

async function executeConfiguredStep(stepDefinition, executionId) {
  if (!isExecutionActive(executionId)) {
    return { ok: false, reason: 'stopped' };
  }

  await commitState((draft) => {
    draft.steps = draft.steps.map((step) => {
      if (step.id === stepDefinition.id) {
        return { ...step, status: 'running' };
      }
      return step;
    });
    addLog(`步骤 ${stepDefinition.id}：开始执行 ${stepDefinition.title}。`);
  });

  try {
    const result = await executeStepAction(stepDefinition);
    if (!isExecutionActive(executionId)) {
      return { ok: false, reason: 'stopped' };
    }

    await commitState((draft) => {
      draft.pageRegistry = pageOperationTool.exportRegistry();
      draft.steps = draft.steps.map((step) => {
        if (step.id === stepDefinition.id) {
          return { ...step, status: 'completed' };
        }
        return step;
      });
      addLog(buildStepSuccessLog(stepDefinition, result));
    });
    return { ok: true, result };
  } catch (error) {
    if (!isExecutionActive(executionId)) {
      return { ok: false, reason: 'stopped' };
    }

    await commitState((draft) => {
      draft.status = 'error';
      draft.steps = draft.steps.map((step) => {
        if (step.id === stepDefinition.id) {
          return { ...step, status: 'failed' };
        }
        return step;
      });
      addLog(`步骤 ${stepDefinition.id}：执行失败，${error?.message || '未知错误'}。`, 'error');
    });
    return { ok: false, reason: 'failed', error };
  }
}

async function executeStepOneFlow() {
  const pageResult = await pageOperationTool.loadPage(PAGE_OPEN_MODE.NEW_TAB, STEP_ONE_PAGE_URL);
  const target = {
    tabId: pageResult.tabId,
    selector: STEP_ONE_TEXTAREA_SELECTOR,
  };

  await waitForPageObject({
    tabId: pageResult.tabId,
    selector: STEP_ONE_TEXTAREA_SELECTOR,
  });
  await pageOperationTool.inputValue({
    ...target,
    value: 'IP',
  });
  await waitForPageObject({
    tabId: pageResult.tabId,
    selector: STEP_ONE_SUBMIT_SELECTOR,
  });
  await pageOperationTool.click({
    tabId: pageResult.tabId,
    selector: STEP_ONE_SUBMIT_SELECTOR,
  });

  const firstResult = await waitForPageContent({
    tabId: pageResult.tabId,
    selector: STEP_ONE_RESULT_SELECTOR,
    contentMode: PAGE_CONTENT_MODE.TEXT,
  });

  return {
    ...pageResult,
    output: firstResult.content,
  };
}

async function waitForPageObject(target, timeoutMs = STEP_WAIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      return await pageOperationTool.getPageObject(target);
    } catch (error) {
      lastError = error;
      if (!isRetryablePageError(error)) {
        throw error;
      }
      await delay(STEP_WAIT_INTERVAL_MS);
    }
  }

  throw new Error(buildWaitErrorMessage(`等待页面对象超时：${target.selector}`, lastError));
}

async function waitForPageContent(target, timeoutMs = STEP_WAIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const result = await pageOperationTool.readPageContent(target);
      if (typeof result.content === 'string' && result.content.trim()) {
        return {
          ...result,
          content: result.content.trim(),
        };
      }
      lastError = new Error(`页面内容为空：${target.selector}`);
    } catch (error) {
      lastError = error;
      if (!isRetryablePageError(error)) {
        throw error;
      }
    }

    await delay(STEP_WAIT_INTERVAL_MS);
  }

  throw new Error(buildWaitErrorMessage(`等待页面内容超时：${target.selector}`, lastError));
}

function isRetryablePageError(error) {
  const message = error?.message || '';
  return message.includes('页面对象不存在')
    || message.includes('页面内容为空')
    || message.includes('The frame was removed')
    || message.includes('Frame with ID')
    || message.includes('Cannot access contents of the page');
}

function buildWaitErrorMessage(prefix, error) {
  const message = error?.message || '';
  if (!message) {
    return prefix;
  }
  return `${prefix}；最后错误：${message}`;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function executeStepAction(stepDefinition) {
  if (typeof stepDefinition.execute === 'function') {
    return stepDefinition.execute();
  }
  throw new Error('未配置步骤执行方法');
}

function buildStepSuccessLog(stepDefinition, result) {
  const openModeLabel = OPEN_MODE_LABELS[result?.mode] || '未知方式';
  const targetUrl = result?.url || '未知地址';
  const suffix = typeof result?.output === 'string' && result.output.trim()
    ? `，结果：${result.output}`
    : '';
  return `步骤 ${stepDefinition.id}：已通过${openModeLabel}打开 ${targetUrl}（标签页 ${result?.tabId || '未知'}）${suffix}。`;
}

async function clearLogs() {
  await commitState((draft) => {
    draft.logs = [];
  });
  return cloneState();
}

async function checkUpdates() {
  await commitState((draft) => {
    draft.updateInfo = {
      ...draft.updateInfo,
      currentVersion: chrome.runtime.getManifest().version,
      latestVersion: chrome.runtime.getManifest().version,
      hasUpdate: false,
      summary: `当前脚本已配置 ${STEP_DEFINITIONS.length} 个演示步骤，可继续替换为真实业务流程。`,
      checkedAt: Date.now(),
      sourceUrl: null,
    };
    addLog('已刷新升级区信息。');
  });
  return cloneState();
}

function sanitizeRunCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(Math.max(parsed, 1), 99);
}
