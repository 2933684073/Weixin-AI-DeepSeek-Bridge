'use strict';

const fs = require('fs');
const path = require('path');
const { getConfig, timingSafeEqualString } = require('./config');
const { createChatCompletion } = require('./deepseek-client');
const { writeEnvUpdates } = require('./env-store');
const {
  controlService,
  deleteSkill,
  getServiceStatus,
  listPersonaFiles,
  listSkills,
  readOpenClawConfig,
  readPersonaFile,
  readSafeSummary,
  readServiceLogs,
  readSkill,
  runOpenClawSkillsCommand,
  saveSkill,
  toggleSkill,
  updateOpenClawModel,
  writeOpenClawConfig,
  writePersonaFile
} = require('./admin-utils');

function adminPagePath() {
  return path.resolve(__dirname, '..', 'public', 'admin.html');
}

function getBearerToken(request) {
  const header = request.headers.authorization || '';
  if (!header.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return header.slice(7).trim();
}

function requireAdminAuth(request, response, sendJson) {
  const token = getBearerToken(request);
  const adminToken = getConfig().adminToken;
  if (adminToken && timingSafeEqualString(token, adminToken)) {
    return true;
  }

  sendJson(response, 401, {
    error: {
      message: 'Admin authorization required',
      type: 'admin_authentication_error'
    }
  });
  return false;
}

function cleanConfigUpdate(body) {
  const allowed = {
    DEEPSEEK_MODEL: 'string',
    DEEPSEEK_BASE_URL: 'string',
    DEEPSEEK_CHAT_PATH: 'string',
    DEEPSEEK_TEMPERATURE: 'number',
    DEEPSEEK_MAX_TOKENS: 'integer',
    DEEPSEEK_TIMEOUT_MS: 'integer',
    DEEPSEEK_MOCK: 'boolean',
    SYSTEM_PROMPT: 'string',
    OPENCLAW_HOME: 'string',
    OPENCLAW_PROXY_KEY: 'secret',
    DEEPSEEK_API_KEY: 'secret',
    ADMIN_TOKEN: 'secret'
  };
  const updates = {};

  for (const [key, type] of Object.entries(allowed)) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) {
      continue;
    }
    const raw = body[key];
    if (type === 'secret' && !raw) {
      continue;
    }
    if (type === 'integer') {
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) {
        throw new Error(`${key} must be an integer`);
      }
      updates[key] = String(parsed);
    } else if (type === 'number') {
      const parsed = Number.parseFloat(raw);
      if (!Number.isFinite(parsed)) {
        throw new Error(`${key} must be a number`);
      }
      updates[key] = String(parsed);
    } else if (type === 'boolean') {
      updates[key] = raw ? '1' : '0';
    } else {
      updates[key] = String(raw || '').trim();
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('no valid config values provided');
  }
  return updates;
}

async function buildState() {
  const services = await Promise.all([
    getServiceStatus('weixin-ai-deepseek'),
    getServiceStatus('openclaw-gateway')
  ]);
  const openclaw = readOpenClawConfig();
  return {
    ok: true,
    now: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    summary: readSafeSummary(),
    services,
    persona: listPersonaFiles(),
    skills: listSkills(),
    openclaw: {
      exists: openclaw.exists,
      path: openclaw.path,
      parseError: openclaw.parseError || '',
      modelFields: openclaw.modelFields || []
    }
  };
}

function createAdminRouter(helpers) {
  const { sendJson, sendText, readJsonBody } = helpers;

  async function handle(request, response, url) {
    if (request.method === 'GET' && url.pathname === '/admin') {
      const html = fs.readFileSync(adminPagePath(), 'utf8');
      sendText(response, 200, html, 'text/html; charset=utf-8');
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/admin/admin.css') {
      const css = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'admin.css'), 'utf8');
      sendText(response, 200, css, 'text/css; charset=utf-8');
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/admin/admin.js') {
      const js = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'admin.js'), 'utf8');
      sendText(response, 200, js, 'application/javascript; charset=utf-8');
      return true;
    }

    if (!url.pathname.startsWith('/admin/api/')) {
      return false;
    }

    if (request.method === 'POST' && url.pathname === '/admin/api/login') {
      const body = await readJsonBody(request);
      const adminToken = getConfig().adminToken;
      if (adminToken && timingSafeEqualString(body.token || '', adminToken)) {
        sendJson(response, 200, { ok: true, state: await buildState() });
      } else {
        sendJson(response, 401, { ok: false, error: 'token is invalid' });
      }
      return true;
    }

    if (!requireAdminAuth(request, response, sendJson)) {
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/admin/api/state') {
      sendJson(response, 200, await buildState());
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/admin/api/config') {
      const body = await readJsonBody(request);
      const updates = cleanConfigUpdate(body);
      writeEnvUpdates(updates);
      sendJson(response, 200, { ok: true, updates: Object.keys(updates), state: await buildState() });
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/admin/api/test-chat') {
      const body = await readJsonBody(request);
      const message = String(body.message || 'ping').trim();
      const completion = await createChatCompletion({
        messages: [
          { role: 'system', content: getConfig().systemPrompt },
          { role: 'user', content: message }
        ]
      });
      sendJson(response, 200, { ok: true, completion });
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/admin/api/persona') {
      sendJson(response, 200, {
        ok: true,
        file: url.searchParams.get('file'),
        content: readPersonaFile(url.searchParams.get('file'))
      });
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/admin/api/persona') {
      const body = await readJsonBody(request);
      writePersonaFile(body.file, body.content);
      sendJson(response, 200, { ok: true, persona: listPersonaFiles() });
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/admin/api/skills') {
      sendJson(response, 200, { ok: true, skills: listSkills() });
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/admin/api/skill') {
      const name = url.searchParams.get('name');
      const enabled = url.searchParams.get('enabled') !== 'false';
      sendJson(response, 200, { ok: true, name, enabled, content: readSkill(name, enabled) });
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/admin/api/skill') {
      const body = await readJsonBody(request);
      const saved = saveSkill(body.name, body.content, body.enabled !== false);
      sendJson(response, 200, { ok: true, skill: saved, skills: listSkills() });
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/admin/api/skill/toggle') {
      const body = await readJsonBody(request);
      const toggled = toggleSkill(body.name, Boolean(body.enabled));
      sendJson(response, 200, { ok: true, skill: toggled, skills: listSkills() });
      return true;
    }

    if (request.method === 'DELETE' && url.pathname === '/admin/api/skill') {
      const body = await readJsonBody(request);
      deleteSkill(body.name, body.enabled !== false, body.confirmName);
      sendJson(response, 200, { ok: true, skills: listSkills() });
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/admin/api/openclaw/config') {
      const config = readOpenClawConfig();
      sendJson(response, 200, {
        ok: true,
        path: config.path,
        exists: config.exists,
        raw: config.raw,
        parseError: config.parseError || '',
        modelFields: config.modelFields || []
      });
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/admin/api/openclaw/config') {
      const body = await readJsonBody(request);
      const config = writeOpenClawConfig(body.raw);
      sendJson(response, 200, { ok: true, modelFields: config.modelFields || [] });
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/admin/api/openclaw/model') {
      const body = await readJsonBody(request);
      const config = updateOpenClawModel(body.path, body.model);
      sendJson(response, 200, { ok: true, modelFields: config.modelFields || [] });
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/admin/api/openclaw/skills-command') {
      const body = await readJsonBody(request);
      const result = await runOpenClawSkillsCommand(body);
      sendJson(response, 200, { ok: result.ok, result });
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/admin/api/service') {
      const body = await readJsonBody(request);
      const result = await controlService(body.service, body.action);
      sendJson(response, 200, { ok: result.ok, result, services: await Promise.all([
        getServiceStatus('weixin-ai-deepseek'),
        getServiceStatus('openclaw-gateway')
      ]) });
      return true;
    }

    if (request.method === 'GET' && url.pathname === '/admin/api/logs') {
      const result = await readServiceLogs(
        url.searchParams.get('service') || 'openclaw-gateway',
        url.searchParams.get('lines') || 120
      );
      sendJson(response, 200, { ok: result.ok, result });
      return true;
    }

    sendJson(response, 404, { error: { message: 'Admin endpoint not found' } });
    return true;
  }

  return { handle };
}

module.exports = {
  createAdminRouter,
  requireAdminAuth
};