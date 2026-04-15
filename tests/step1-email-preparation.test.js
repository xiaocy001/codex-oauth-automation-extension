const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }

  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

test('ensureRegistrationEmailReadyForStep1 reuses existing email without refetching', async () => {
  const bundle = extractFunction('ensureRegistrationEmailReadyForStep1');
  const factory = new Function(`
let currentState = {
  email: 'ready@example.com',
  autoRunning: false,
  autoRunCurrentRun: 0,
  autoRunTotalRuns: 0,
  autoRunAttemptRun: 0,
  currentHotmailAccountId: '',
  emailGenerator: 'duck',
};
let autoRunCurrentRun = 0;
let autoRunTotalRuns = 1;
let autoRunAttemptRun = 0;
const calls = {
  ensureAutoEmailReady: 0,
  ensureHotmailAccountForFlow: 0,
  ensureLuckmailPurchaseForFlow: 0,
  setEmailState: [],
  fetchGeneratedEmail: 0,
  addLog: [],
};

async function getState() { return currentState; }
async function ensureAutoEmailReady() { calls.ensureAutoEmailReady += 1; return 'auto@example.com'; }
function isHotmailProvider() { return false; }
function isLuckmailProvider() { return false; }
function isGeneratedAliasProvider() { return false; }
function shouldUseCustomRegistrationEmail() { return false; }
async function ensureHotmailAccountForFlow() { calls.ensureHotmailAccountForFlow += 1; return { email: 'hot@example.com' }; }
async function ensureLuckmailPurchaseForFlow() { calls.ensureLuckmailPurchaseForFlow += 1; return { email_address: 'luck@example.com' }; }
function buildGeneratedAliasEmail() { return 'alias@2925.com'; }
async function setEmailState(value) { calls.setEmailState.push(value); currentState.email = value; }
function normalizeEmailGenerator(value = '') { return String(value || '').trim().toLowerCase() || 'duck'; }
async function fetchGeneratedEmail() { calls.fetchGeneratedEmail += 1; return 'duck@example.com'; }
function getEmailGeneratorLabel(value) { return value; }
async function addLog(message, level = 'info') { calls.addLog.push({ message, level }); }

${bundle}

return {
  ensureRegistrationEmailReadyForStep1,
  snapshot() { return { currentState, calls }; },
};
`);

  const api = factory();
  const email = await api.ensureRegistrationEmailReadyForStep1();
  const snapshot = api.snapshot();

  assert.equal(email, 'ready@example.com');
  assert.equal(snapshot.calls.ensureAutoEmailReady, 0);
  assert.equal(snapshot.calls.fetchGeneratedEmail, 0);
  assert.deepEqual(snapshot.calls.setEmailState, []);
});

test('ensureRegistrationEmailReadyForStep1 generates 2925 alias during step 1', async () => {
  const bundle = extractFunction('ensureRegistrationEmailReadyForStep1');
  const factory = new Function(`
let currentState = {
  email: null,
  autoRunning: false,
  autoRunCurrentRun: 0,
  autoRunTotalRuns: 0,
  autoRunAttemptRun: 0,
  currentHotmailAccountId: '',
  emailGenerator: 'duck',
};
let autoRunCurrentRun = 0;
let autoRunTotalRuns = 1;
let autoRunAttemptRun = 0;
const calls = { setEmailState: [], addLog: [] };

async function getState() { return currentState; }
async function ensureAutoEmailReady() { throw new Error('should not wait for auto email'); }
function isHotmailProvider() { return false; }
function isLuckmailProvider() { return false; }
function isGeneratedAliasProvider() { return true; }
function shouldUseCustomRegistrationEmail() { return false; }
async function ensureHotmailAccountForFlow() { throw new Error('should not allocate hotmail'); }
async function ensureLuckmailPurchaseForFlow() { throw new Error('should not buy luckmail'); }
function buildGeneratedAliasEmail() { return 'demo123@2925.com'; }
async function setEmailState(value) { calls.setEmailState.push(value); currentState.email = value; }
function normalizeEmailGenerator(value = '') { return String(value || '').trim().toLowerCase() || 'duck'; }
async function fetchGeneratedEmail() { throw new Error('should not fetch duck email'); }
function getEmailGeneratorLabel(value) { return value; }
async function addLog(message, level = 'info') { calls.addLog.push({ message, level }); }

${bundle}

return {
  ensureRegistrationEmailReadyForStep1,
  snapshot() { return { currentState, calls }; },
};
`);

  const api = factory();
  const email = await api.ensureRegistrationEmailReadyForStep1();
  const snapshot = api.snapshot();

  assert.equal(email, 'demo123@2925.com');
  assert.deepEqual(snapshot.calls.setEmailState, ['demo123@2925.com']);
  assert.equal(snapshot.currentState.email, 'demo123@2925.com');
  assert.match(snapshot.calls.addLog[0].message, /步骤 1：已生成注册邮箱 demo123@2925\.com/);
});

test('ensureRegistrationEmailReadyForStep1 requires manual email for custom mode', async () => {
  const bundle = extractFunction('ensureRegistrationEmailReadyForStep1');
  const factory = new Function(`
let currentState = {
  email: null,
  autoRunning: false,
  autoRunCurrentRun: 0,
  autoRunTotalRuns: 0,
  autoRunAttemptRun: 0,
  currentHotmailAccountId: '',
  emailGenerator: 'custom',
};
let autoRunCurrentRun = 0;
let autoRunTotalRuns = 1;
let autoRunAttemptRun = 0;

async function getState() { return currentState; }
async function ensureAutoEmailReady() { throw new Error('should not wait for auto email'); }
function isHotmailProvider() { return false; }
function isLuckmailProvider() { return false; }
function isGeneratedAliasProvider() { return false; }
function shouldUseCustomRegistrationEmail() { return true; }
async function ensureHotmailAccountForFlow() { throw new Error('should not allocate hotmail'); }
async function ensureLuckmailPurchaseForFlow() { throw new Error('should not buy luckmail'); }
function buildGeneratedAliasEmail() { return 'unused@2925.com'; }
async function setEmailState() { throw new Error('should not set email'); }
function normalizeEmailGenerator(value = '') { return String(value || '').trim().toLowerCase() || 'duck'; }
async function fetchGeneratedEmail() { throw new Error('should not fetch generated email'); }
function getEmailGeneratorLabel(value) { return value; }
async function addLog() {}

${bundle}

return { ensureRegistrationEmailReadyForStep1 };
`);

  const api = factory();
  await assert.rejects(
    () => api.ensureRegistrationEmailReadyForStep1(),
    /请先在侧边栏填写注册邮箱后再执行步骤 1/
  );
});

test('ensureAutoEmailReady reuses step-1 email before reallocating provider mailbox', async () => {
  const bundle = extractFunction('ensureAutoEmailReady');
  const factory = new Function(`
let currentState = {
  email: 'prepared@example.com',
  emailPrefix: 'demo',
  emailGenerator: 'duck',
};
const calls = {
  ensureHotmailAccountForFlow: 0,
  ensureLuckmailPurchaseForFlow: 0,
  setEmailState: [],
  addLog: [],
  fetchGeneratedEmail: 0,
};
const EMAIL_FETCH_MAX_ATTEMPTS = 5;
const CLOUDFLARE_TEMP_EMAIL_GENERATOR = 'cloudflare-temp-email';

async function getState() { return currentState; }
function isHotmailProvider() { return true; }
function isLuckmailProvider() { return false; }
function isGeneratedAliasProvider() { return false; }
function shouldUseCustomRegistrationEmail() { return false; }
async function ensureHotmailAccountForFlow() { calls.ensureHotmailAccountForFlow += 1; return { email: 'hot@example.com' }; }
async function ensureLuckmailPurchaseForFlow() { calls.ensureLuckmailPurchaseForFlow += 1; return { email_address: 'luck@example.com' }; }
function buildGeneratedAliasEmail() { return 'alias@2925.com'; }
async function setEmailState(value) { calls.setEmailState.push(value); currentState.email = value; }
async function addLog(message, level = 'info') { calls.addLog.push({ message, level }); }
async function broadcastAutoRunStatus() {}
async function waitForResume() {}
function normalizeEmailGenerator(value = '') { return String(value || '').trim().toLowerCase() || 'duck'; }
function getEmailGeneratorLabel(value) { return value; }
async function fetchGeneratedEmail() { calls.fetchGeneratedEmail += 1; return 'duck@example.com'; }

${bundle}

return {
  ensureAutoEmailReady,
  snapshot() { return { currentState, calls }; },
};
`);

  const api = factory();
  const email = await api.ensureAutoEmailReady(1, 3, 1);
  const snapshot = api.snapshot();

  assert.equal(email, 'prepared@example.com');
  assert.equal(snapshot.calls.ensureHotmailAccountForFlow, 0);
  assert.equal(snapshot.calls.ensureLuckmailPurchaseForFlow, 0);
  assert.equal(snapshot.calls.fetchGeneratedEmail, 0);
});
