const STATUS_ICONS = {
  pending: '',
  running: '…',
  completed: '✓',
  failed: '✗',
};

const STATUS_LABELS = {
  idle: '就绪',
  running: '运行中',
  stopped: '已停止',
  error: '异常',
};

const STATUS_COLORS = {
  idle: 'var(--green)',
  running: 'var(--blue)',
  stopped: 'var(--orange)',
  error: 'var(--red)',
};

const extensionUpdateStatus = document.getElementById('extension-update-status');
const extensionVersionMeta = document.getElementById('extension-version-meta');
const btnReleaseLog = document.getElementById('btn-release-log');
const btnOpenRelease = document.getElementById('btn-open-release');
const btnToggleUpdate = document.getElementById('btn-toggle-update');
const btnToggleConfig = document.getElementById('btn-toggle-config');
const updateCard = document.querySelector('.update-card');
const settingsCard = document.getElementById('settings-card');
const updateSectionBody = document.getElementById('update-section-body');
const dataSectionBody = document.getElementById('data-section-body');
const updateCardVersion = document.getElementById('update-card-version');
const updateCardSummary = document.getElementById('update-card-summary');
const updateReleaseList = document.getElementById('update-release-list');
const inputRunCount = document.getElementById('input-run-count');
const btnAutoRun = document.getElementById('btn-auto-run');
const btnStop = document.getElementById('btn-stop');
const btnReset = document.getElementById('btn-reset');
const btnTheme = document.getElementById('btn-theme');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnClearLog = document.getElementById('btn-clear-log');
const btnConfigMenu = document.getElementById('btn-config-menu');
const configMenu = document.getElementById('config-menu');
const btnExportSettings = document.getElementById('btn-export-settings');
const btnImportSettings = document.getElementById('btn-import-settings');
const inputImportSettingsFile = document.getElementById('input-import-settings-file');
const displayOauthUrl = document.getElementById('display-oauth-url');
const displayLocalhostUrl = document.getElementById('display-localhost-url');
const displayStatus = document.getElementById('display-status');
const statusDot = document.querySelector('.status-dot');
const logArea = document.getElementById('log-area');
const stepsProgress = document.getElementById('steps-progress');
const stepsList = document.getElementById('steps-list');
const inputProjectName = document.getElementById('input-project-name');
const selectEnvironment = document.getElementById('select-environment');
const inputFeatureEnabled = document.getElementById('input-feature-enabled');
const inputNote = document.getElementById('input-note');
const toastContainer = document.getElementById('toast-container');

let latestState = null;
let configMenuOpen = false;
let updateSectionCollapsed = false;
let configSectionCollapsed = false;

async function sendMessage(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) {
    throw new Error(response?.error || '请求失败');
  }
  return response.payload;
}

function render(state) {
  latestState = state;
  renderUpdateInfo(state.updateInfo || {});
  renderSettings(state.settings || {});
  renderRuntime(state);
  renderSteps(state.steps || []);
  renderLogs(state.logs || []);
}

function renderUpdateInfo(updateInfo) {
  const currentVersion = updateInfo.currentVersion || '0.1.0';
  const latestVersion = updateInfo.latestVersion || currentVersion;
  extensionUpdateStatus.textContent = `v${currentVersion}`;
  extensionVersionMeta.textContent = updateInfo.hasUpdate ? `发现新版本 v${latestVersion}` : '骨架模板';
  updateCardVersion.textContent = updateInfo.hasUpdate ? `可升级到 v${latestVersion}` : `当前版本 v${currentVersion}`;
  updateCardSummary.textContent = updateInfo.summary || '尚未配置升级信息。';
  updateReleaseList.innerHTML = '';

  const items = [];
  if (updateInfo.checkedAt) {
    items.push(`最近检查：${formatTime(updateInfo.checkedAt)}`);
  }
  if (updateInfo.sourceUrl) {
    items.push(`更新源：${updateInfo.sourceUrl}`);
  }
  if (items.length === 0) {
    items.push('当前仅保留升级区外壳，后续可接入真实更新逻辑。');
  }

  items.forEach((text) => {
    const item = document.createElement('div');
    item.className = 'release-note-item';
    item.textContent = text;
    updateReleaseList.appendChild(item);
  });
}

function renderSettings(settings) {
  inputProjectName.value = settings.projectName || '';
  selectEnvironment.value = settings.environment || 'dev';
  inputFeatureEnabled.checked = Boolean(settings.featureEnabled);
  inputNote.value = settings.note || '';
}

function renderRuntime(state) {
  const status = state.status || 'idle';
  const lastLog = Array.isArray(state.logs) && state.logs.length > 0 ? state.logs[state.logs.length - 1] : null;
  inputRunCount.value = String(state.runCount || 1);
  displayStatus.textContent = STATUS_LABELS[status] || status;
  statusDot.style.background = STATUS_COLORS[status] || 'var(--green)';
  displayOauthUrl.textContent = buildSnapshotText(state);
  displayLocalhostUrl.textContent = lastLog?.message || '尚无动作';
  btnAutoRun.disabled = status === 'running';
  btnStop.disabled = status !== 'running';
}

function buildSnapshotText(state) {
  const settings = state.settings || {};
  const featureText = settings.featureEnabled ? 'on' : 'off';
  return `${settings.projectName || '未命名'} / ${settings.environment || 'dev'} / feature:${featureText}`;
}

function renderSteps(steps) {
  const completedCount = steps.filter((step) => step.status === 'completed').length;
  stepsProgress.textContent = `${completedCount} / ${steps.length || 0}`;
  stepsList.innerHTML = '';

  steps.forEach((step) => {
    const row = document.createElement('div');
    row.className = 'step-row';
    row.dataset.step = String(step.id);
    row.dataset.status = step.status || 'pending';

    const indicator = document.createElement('div');
    indicator.className = 'step-indicator';
    indicator.dataset.step = String(step.id);

    const num = document.createElement('span');
    num.className = 'step-num';
    num.textContent = String(step.id);
    indicator.appendChild(num);

    const button = document.createElement('button');
    button.className = 'step-btn';
    button.dataset.step = String(step.id);
    button.textContent = step.title || `步骤 ${step.id}`;
    button.disabled = latestState?.status === 'running';
    button.addEventListener('click', async () => {
      const state = await sendMessage('RUN_STEP', { stepId: step.id });
      render(state);
    });

    const status = document.createElement('span');
    status.className = 'step-status';
    status.dataset.step = String(step.id);
    status.textContent = STATUS_ICONS[step.status] || '';

    row.append(indicator, button, status);
    stepsList.appendChild(row);
  });
}

function renderLogs(logs) {
  logArea.innerHTML = '';
  if (!logs.length) {
    const empty = document.createElement('div');
    empty.className = 'release-note-item';
    empty.textContent = '暂无日志。';
    logArea.appendChild(empty);
    return;
  }

  logs.slice().reverse().forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'log-entry';

    const meta = document.createElement('div');
    meta.className = 'log-entry-meta';

    const level = document.createElement('span');
    level.textContent = entry.level || 'info';

    const time = document.createElement('span');
    time.textContent = formatTime(entry.timestamp);

    meta.append(level, time);

    const message = document.createElement('div');
    message.className = 'log-entry-message';
    message.textContent = entry.message;

    item.append(meta, message);
    logArea.appendChild(item);
  });
}

function formatTime(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return '--';
  }
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false,
  });
}

function getSettingsPayload() {
  return {
    projectName: inputProjectName.value.trim(),
    environment: selectEnvironment.value,
    featureEnabled: inputFeatureEnabled.checked,
    note: inputNote.value.trim(),
  };
}

function toggleConfigMenu(force) {
  configMenuOpen = typeof force === 'boolean' ? force : !configMenuOpen;
  configMenu.hidden = !configMenuOpen;
  btnConfigMenu.setAttribute('aria-expanded', String(configMenuOpen));
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

function applySectionCollapse(card, body, button, collapsed) {
  card.classList.toggle('is-collapsed', collapsed);
  body.hidden = collapsed;
  button.textContent = collapsed ? '展开' : '收起';
  button.setAttribute('aria-expanded', String(!collapsed));
}

function syncSectionCollapseState() {
  applySectionCollapse(updateCard, updateSectionBody, btnToggleUpdate, updateSectionCollapsed);
  applySectionCollapse(settingsCard, dataSectionBody, btnToggleConfig, configSectionCollapsed);
}

function loadSectionCollapseState() {
  updateSectionCollapsed = localStorage.getItem('scaffold-update-collapsed') === 'true';
  configSectionCollapsed = localStorage.getItem('scaffold-config-collapsed') === 'true';
  syncSectionCollapseState();
}

function toggleSectionCollapse(sectionName) {
  if (sectionName === 'update') {
    updateSectionCollapsed = !updateSectionCollapsed;
    localStorage.setItem('scaffold-update-collapsed', String(updateSectionCollapsed));
  }
  if (sectionName === 'config') {
    configSectionCollapsed = !configSectionCollapsed;
    localStorage.setItem('scaffold-config-collapsed', String(configSectionCollapsed));
  }
  syncSectionCollapseState();
}

async function refreshState() {
  const state = await sendMessage('GET_STATE');
  render(state);
}

async function saveSettings() {
  const state = await sendMessage('SAVE_SETTINGS', getSettingsPayload());
  render(state);
  showToast('配置已保存');
}

async function exportSettings() {
  const payload = JSON.stringify(getSettingsPayload(), null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'scaffold-settings.json';
  link.click();
  URL.revokeObjectURL(url);
  toggleConfigMenu(false);
  showToast('已导出配置');
}

async function importSettings(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const state = await sendMessage('SAVE_SETTINGS', parsed);
  render(state);
  showToast('已导入配置');
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('scaffold-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function openReleaseLog() {
  const sourceUrl = latestState?.updateInfo?.sourceUrl;
  if (!sourceUrl) {
    showToast('当前未配置远程更新日志');
    return;
  }
  window.open(sourceUrl, '_blank', 'noopener,noreferrer');
}

async function initialize() {
  applyTheme(localStorage.getItem('scaffold-theme') === 'dark' ? 'dark' : 'light');
  loadSectionCollapseState();
  await refreshState();

  btnAutoRun.addEventListener('click', async () => {
    const state = await sendMessage('START_RUN', { runCount: inputRunCount.value });
    render(state);
  });

  btnStop.addEventListener('click', async () => {
    const state = await sendMessage('STOP_RUN');
    render(state);
  });

  btnReset.addEventListener('click', async () => {
    const state = await sendMessage('RESET_RUN');
    render(state);
  });

  btnSaveSettings.addEventListener('click', saveSettings);
  btnClearLog.addEventListener('click', async () => {
    const state = await sendMessage('CLEAR_LOGS');
    render(state);
    showToast('日志已清空');
  });

  btnOpenRelease.addEventListener('click', async () => {
    const state = await sendMessage('CHECK_UPDATES');
    render(state);
    showToast('升级区已刷新');
  });

  btnToggleUpdate.addEventListener('click', () => toggleSectionCollapse('update'));
  btnToggleConfig.addEventListener('click', () => toggleSectionCollapse('config'));
  btnReleaseLog.addEventListener('click', openReleaseLog);
  btnTheme.addEventListener('click', toggleTheme);

  btnConfigMenu.addEventListener('click', () => toggleConfigMenu());
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#config-menu-shell')) {
      toggleConfigMenu(false);
    }
  });

  btnExportSettings.addEventListener('click', exportSettings);
  btnImportSettings.addEventListener('click', () => {
    inputImportSettingsFile.click();
    toggleConfigMenu(false);
  });
  inputImportSettingsFile.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      await importSettings(file);
    } catch (error) {
      showToast(error.message || '导入失败');
    } finally {
      inputImportSettingsFile.value = '';
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'STATE_CHANGED' && message.payload) {
      render(message.payload);
    }
  });
}

initialize().catch((error) => {
  showToast(error.message || '初始化失败');
});
