'use strict';

const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { loadEnv } = require('./env');

loadEnv();

function asInteger(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be an integer`);
  }
  return parsed;
}

function asFloat(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`);
  }
  return parsed;
}

function asBoolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function getConfig() {
  loadEnv({ override: false });
  const mock = asBoolean('DEEPSEEK_MOCK', false);
  const appRoot = path.resolve(__dirname, '..');

  return {
    appRoot,
    envFile: process.env.ENV_FILE || path.join(appRoot, '.env'),
    host: process.env.HOST || '0.0.0.0',
    port: asInteger('PORT', 8787),
    proxyKey: process.env.OPENCLAW_PROXY_KEY || '',
    adminToken: process.env.ADMIN_TOKEN || process.env.OPENCLAW_PROXY_KEY || '',
    openclawHome: process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw'),
    systemPrompt:
      process.env.SYSTEM_PROMPT ||
      '\u4f60\u662f\u4e00\u4e2a\u8fde\u63a5\u5728\u5fae\u4fe1\u91cc\u7684AI\u52a9\u624b\uff0c\u56de\u7b54\u8981\u81ea\u7136\u3001\u51c6\u786e\u3001\u7b80\u6d01\u3002',
    deepseek: {
      mock,
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseUrl: stripTrailingSlash(
        process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
      ),
      chatPath: process.env.DEEPSEEK_CHAT_PATH || '/chat/completions',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
      timeoutMs: asInteger('DEEPSEEK_TIMEOUT_MS', 60000),
      temperature: asFloat('DEEPSEEK_TEMPERATURE', 0.7),
      maxTokens: asInteger('DEEPSEEK_MAX_TOKENS', 2048)
    }
  };
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = {
  getConfig,
  timingSafeEqualString
};