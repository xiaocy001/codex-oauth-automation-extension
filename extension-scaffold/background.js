const STEP_TITLES = [
  '步骤 1',
  '步骤 2',
  '步骤 3',
  '步骤 4',
  '步骤 5',
  '步骤 6',
  '步骤 7',
  '步骤 8',
  '步骤 9',
];

const STEP_STATUS_ORDER = ['pending', 'running', 'completed', 'failed'];
const SETTINGS_STORAGE_KEY = 'scaffoldSettings';
const RUNTIME_STORAGE_KEY = 'scaffoldRuntimeState';

function createDefaultSteps() {
  return STEP_TITLES.map((title, index) => ({
    id: index + 1,
    title,
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
    updateInfo: {
      currentVersion: chrome.runtime.getManifest().version,
      latestVersion: null,
      hasUpdate: false,
      summary: '当前为骨架版本，尚未配置远程更新源。',
      checkedAt: null,
      sourceUrl: null,
    },
  };
}

let state = createDefaultState();
const readyPromise = initialize();

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
      ...createDefaultState().updateInfo,
      ...(runtime.updateInfo || {}),
      currentVersion: chrome.runtime.getManifest().version,
    },
  };
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return createDefaultSteps();
  }

  return createDefaultSteps().map((fallbackStep, index) => {
    const step = steps[index] || {};
    return {
      id: fallbackStep.id,
      title: typeof step.title === 'string' && step.title.trim() ? step.title.trim() : fallbackStep.title,
      status: STEP_STATUS_ORDER.includes(step.status) ? step.status : 'pending',
    };
  });
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
  await chrome.storage.local.set({
    [SETTINGS_STORAGE_KEY]: state.settings,
    [RUNTIME_STORAGE_KEY]: {
      status: state.status,
      runCount: state.runCount,
      steps: state.steps,
      logs: state.logs,
      updateInfo: state.updateInfo,
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
  await commitState((draft) => {
    draft.runCount = nextRunCount;
    draft.status = 'running';
    draft.steps = draft.steps.map((step) => ({ ...step, status: 'pending' }));
    addLog(`开始运行，计划执行 ${nextRunCount} 次。`);
  });
  return cloneState();
}

async function stopRun() {
  await commitState((draft) => {
    draft.status = 'stopped';
    addLog('运行已停止。', 'warn');
  });
  return cloneState();
}

async function resetRun() {
  await commitState((draft) => {
    draft.status = 'idle';
    draft.runCount = 1;
    draft.steps = createDefaultSteps();
    addLog('运行状态已重置。');
  });
  return cloneState();
}

async function runStep(stepId) {
  const numericStepId = Number(stepId);
  if (!Number.isInteger(numericStepId) || numericStepId < 1 || numericStepId > STEP_TITLES.length) {
    throw new Error('步骤编号无效');
  }

  await commitState((draft) => {
    draft.status = 'running';
    draft.steps = draft.steps.map((step) => {
      if (step.id < numericStepId && step.status === 'pending') {
        return { ...step, status: 'completed' };
      }
      if (step.id === numericStepId) {
        const currentIndex = STEP_STATUS_ORDER.indexOf(step.status);
        const nextStatus = STEP_STATUS_ORDER[(currentIndex + 1) % STEP_STATUS_ORDER.length];
        return { ...step, status: nextStatus };
      }
      return step;
    });
    addLog(`步骤 ${numericStepId} 状态已更新。`);
  });
  return cloneState();
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
      summary: '这是一个本地骨架模板。后续可替换为真实的更新检查逻辑。',
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
