'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getConfig } = require('./config');
const { maskSecret, readEnvFile } = require('./env-store');

const personaFiles = ['IDENTITY.md', 'SOUL.md', 'AGENTS.md', 'USER.md'];
const allowedServices = new Set(['weixin-ai-deepseek', 'openclaw-gateway']);

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'command';
  const args = process.platform === 'win32' ? [command] : ['-v', command];
  try {
    if (checker === 'command') {
      childProcess.execFileSync('sh', ['-lc', `command -v ${command}`], {
        stdio: 'ignore'
      });
    } else {
      childProcess.execFileSync(checker, args, { stdio: 'ignore' });
    }
    return true;
  } catch (error) {
    return false;
  }
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const timeoutMs = options.timeoutMs || 20000;
    const env = {
      ...process.env,
      HOME: process.env.HOME || os.homedir(),
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin'
    };

    const child = childProcess.execFile(
      command,
      args,
      {
        env,
        cwd: options.cwd || getConfig().appRoot,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: error && typeof error.code === 'number' ? error.code : 0,
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          message: error ? error.message : ''
        });
      }
    );

    child.on('error', (error) => {
      resolve({ ok: false, code: 1, stdout: '', stderr: '', message: error.message });
    });
  });
}

async function getServiceStatus(service) {
  if (!allowedServices.has(service)) {
    return { service, ok: false, error: 'service is not allowed' };
  }
  if (process.platform === 'win32' || !commandExists('systemctl')) {
    return { service, ok: false, available: false, error: 'systemctl is unavailable' };
  }

  const active = await runCommand('systemctl', ['is-active', service], { timeoutMs: 5000 });
  const enabled = await runCommand('systemctl', ['is-enabled', service], { timeoutMs: 5000 });
  return {
    service,
    ok: true,
    available: true,
    active: active.stdout.trim() || active.stderr.trim() || 'unknown',
    enabled: enabled.stdout.trim() || enabled.stderr.trim() || 'unknown'
  };
}

async function controlService(service, action) {
  if (!allowedServices.has(service)) {
    return { ok: false, message: 'service is not allowed' };
  }
  if (!['start', 'stop', 'restart', 'status'].includes(action)) {
    return { ok: false, message: 'action is not allowed' };
  }
  if (process.platform === 'win32' || !commandExists('systemctl')) {
    return { ok: false, message: 'systemctl is unavailable' };
  }

  const args = action === 'status'
    ? ['--no-pager', '--full', 'status', service]
    : [action, service];
  return runCommand('systemctl', args, { timeoutMs: 30000 });
}

async function readServiceLogs(service, lines = 120) {
  if (!allowedServices.has(service)) {
    return { ok: false, message: 'service is not allowed' };
  }
  if (process.platform === 'win32' || !commandExists('journalctl')) {
    return { ok: false, stdout: '', stderr: 'journalctl is unavailable' };
  }
  const count = String(Math.min(Math.max(Number(lines) || 120, 20), 500));
  return runCommand('journalctl', ['-u', service, '-n', count, '--no-pager'], {
    timeoutMs: 10000
  });
}

function workspaceDir() {
  return path.join(getConfig().openclawHome, 'workspace');
}

function skillsDir(enabled = true) {
  return path.join(workspaceDir(), enabled ? 'skills' : 'skills.disabled');
}

function safeName(name) {
  const value = String(name || '').trim();
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(value)) {
    throw new Error('name can only include letters, numbers, dot, underscore and dash');
  }
  return value;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function listPersonaFiles() {
  const dir = workspaceDir();
  return personaFiles.map((file) => {
    const filePath = path.join(dir, file);
    return {
      file,
      exists: fs.existsSync(filePath),
      size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
    };
  });
}

function readPersonaFile(file) {
  if (!personaFiles.includes(file)) {
    throw new Error('persona file is not allowed');
  }
  const filePath = path.join(workspaceDir(), file);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function writePersonaFile(file, content) {
  if (!personaFiles.includes(file)) {
    throw new Error('persona file is not allowed');
  }
  ensureDir(workspaceDir());
  fs.writeFileSync(path.join(workspaceDir(), file), String(content || ''), 'utf8');
}

function listSkills() {
  const result = [];
  for (const enabled of [true, false]) {
    const dir = skillsDir(enabled);
    if (!fs.existsSync(dir)) {
      continue;
    }
    for (const name of fs.readdirSync(dir)) {
      const skillPath = path.join(dir, name);
      const stat = fs.statSync(skillPath);
      if (!stat.isDirectory()) {
        continue;
      }
      const skillFile = path.join(skillPath, 'SKILL.md');
      let title = name;
      let description = '';
      if (fs.existsSync(skillFile)) {
        const content = fs.readFileSync(skillFile, 'utf8');
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        const descMatch = content.match(/^description:\s*(.+)$/m);
        title = nameMatch ? nameMatch[1].trim() : title;
        description = descMatch ? descMatch[1].trim() : '';
      }
      result.push({
        name,
        title,
        description,
        enabled,
        path: skillPath,
        updatedAt: stat.mtime.toISOString()
      });
    }
  }
  return result.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
}

function readSkill(name, enabled = true) {
  const clean = safeName(name);
  const filePath = path.join(skillsDir(Boolean(enabled)), clean, 'SKILL.md');
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function saveSkill(name, content, enabled = true) {
  const clean = safeName(name);
  const dir = path.join(skillsDir(Boolean(enabled)), clean);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, 'SKILL.md'), String(content || ''), 'utf8');
  return { name: clean, enabled: Boolean(enabled) };
}

function toggleSkill(name, enabled) {
  const clean = safeName(name);
  const from = path.join(skillsDir(!enabled), clean);
  const to = path.join(skillsDir(Boolean(enabled)), clean);
  if (!fs.existsSync(from)) {
    throw new Error('skill not found');
  }
  ensureDir(path.dirname(to));
  fs.renameSync(from, to);
  return { name: clean, enabled: Boolean(enabled) };
}

function deleteSkill(name, enabled, confirmName) {
  const clean = safeName(name);
  if (confirmName !== clean) {
    throw new Error('confirmName must match skill name');
  }
  const dir = path.join(skillsDir(Boolean(enabled)), clean);
  if (!fs.existsSync(dir)) {
    throw new Error('skill not found');
  }
  fs.rmSync(dir, { recursive: true, force: false });
}

function openclawConfigPath() {
  return path.join(getConfig().openclawHome, 'openclaw.json');
}

function readOpenClawConfig() {
  const filePath = openclawConfigPath();
  if (!fs.existsSync(filePath)) {
    return { exists: false, path: filePath, raw: '', json: null, modelFields: [] };
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  let json = null;
  let parseError = '';
  try {
    json = JSON.parse(raw);
  } catch (error) {
    parseError = error.message;
  }
  return {
    exists: true,
    path: filePath,
    raw,
    json,
    parseError,
    modelFields: json ? findModelFields(json) : []
  };
}

function writeOpenClawConfig(raw) {
  const filePath = openclawConfigPath();
  const json = JSON.parse(String(raw || '{}'));
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  return readOpenClawConfig();
}

function findModelFields(root) {
  const fields = [];
  function walk(value, pathParts) {
    if (!value || typeof value !== 'object') {
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const nextPath = [...pathParts, key];
      if (typeof child === 'string') {
        const lowerKey = key.toLowerCase();
        const lowerValue = child.toLowerCase();
        if (lowerKey.includes('model') || lowerValue.includes('deepseek/') || lowerValue.includes('gpt-')) {
          fields.push({ path: nextPath, value: child });
        }
      } else {
        walk(child, nextPath);
      }
    }
  }
  walk(root, []);
  return fields;
}

function setByPath(root, pathParts, value) {
  let cursor = root;
  for (let index = 0; index < pathParts.length - 1; index += 1) {
    cursor = cursor[pathParts[index]];
    if (!cursor || typeof cursor !== 'object') {
      throw new Error('model path is invalid');
    }
  }
  cursor[pathParts[pathParts.length - 1]] = value;
}

function updateOpenClawModel(pathParts, model) {
  const current = readOpenClawConfig();
  if (!current.json) {
    throw new Error('openclaw config is not valid JSON');
  }
  if (!Array.isArray(pathParts) || pathParts.length === 0) {
    throw new Error('model path is required');
  }
  setByPath(current.json, pathParts, String(model || '').trim());
  return writeOpenClawConfig(JSON.stringify(current.json, null, 2));
}

async function runOpenClawSkillsCommand(body) {
  const subcommand = String(body.subcommand || '').trim();
  const value = String(body.value || '').trim();
  const allowed = new Set(['list', 'search', 'verify', 'install']);
  if (!allowed.has(subcommand)) {
    return { ok: false, message: 'unsupported skills command' };
  }
  if (!commandExists('openclaw')) {
    return { ok: false, message: 'openclaw command is unavailable' };
  }

  const args = ['skills', subcommand];
  if (subcommand !== 'list') {
    if (!value) {
      return { ok: false, message: 'value is required' };
    }
    args.push(value);
  }
  if (body.limit && subcommand === 'search') {
    args.push('--limit', String(Math.min(Number(body.limit) || 10, 30)));
  }
  return runCommand('openclaw', args, { timeoutMs: subcommand === 'install' ? 120000 : 30000 });
}

function readSafeSummary() {
  const config = getConfig();
  const env = readEnvFile(config.envFile);
  return {
    appRoot: config.appRoot,
    envFile: config.envFile,
    openclawHome: config.openclawHome,
    bridge: {
      host: config.host,
      port: config.port,
      model: config.deepseek.model,
      baseUrl: config.deepseek.baseUrl,
      chatPath: config.deepseek.chatPath,
      mock: config.deepseek.mock,
      temperature: config.deepseek.temperature,
      maxTokens: config.deepseek.maxTokens,
      timeoutMs: config.deepseek.timeoutMs,
      hasDeepSeekKey: Boolean(config.deepseek.apiKey),
      deepSeekKeyMasked: maskSecret(config.deepseek.apiKey),
      hasProxyKey: Boolean(config.proxyKey),
      proxyKeyMasked: maskSecret(config.proxyKey),
      hasAdminToken: Boolean(config.adminToken),
      adminTokenMasked: maskSecret(config.adminToken)
    },
    env: {
      ADMIN_TOKEN: maskSecret(env.ADMIN_TOKEN),
      OPENCLAW_PROXY_KEY: maskSecret(env.OPENCLAW_PROXY_KEY),
      DEEPSEEK_API_KEY: maskSecret(env.DEEPSEEK_API_KEY),
      DEEPSEEK_MODEL: env.DEEPSEEK_MODEL || '',
      DEEPSEEK_BASE_URL: env.DEEPSEEK_BASE_URL || '',
      OPENCLAW_HOME: env.OPENCLAW_HOME || ''
    }
  };
}

module.exports = {
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
};