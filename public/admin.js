'use strict';

const state = {
  token: localStorage.getItem('adminToken') || '',
  data: null,
  selectedPersona: '',
  selectedSkill: null
};

const $ = (id) => document.getElementById(id);
const tabTitles = {
  overview: ['总览', '系统状态与快速操作'],
  model: ['模型', '桥接服务与密钥配置'],
  persona: ['人设', '薛泽的人格与工作规则'],
  skills: ['技能', '本地技能与 OpenClaw 技能命令'],
  openclaw: ['OpenClaw', '模型字段与原始配置'],
  services: ['服务日志', '后台服务控制和日志']
};

function showToast(text, bad = false) {
  const node = $('toast');
  node.textContent = text;
  node.className = `toast show${bad ? ' bad' : ''}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { node.className = 'toast'; }, 3600);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.error || '请求失败');
  return data;
}

function setTab(name) {
  document.querySelectorAll('.nav-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === name);
  });
  document.querySelectorAll('.section').forEach((section) => {
    section.classList.toggle('active', section.id === `tab-${name}`);
  });
  $('pageTitle').textContent = tabTitles[name][0];
  $('pageSubtitle').textContent = tabTitles[name][1];
}

function renderServices(services) {
  const rows = services.map((service) => {
    const ok = service.active === 'active';
    return `<tr><td><strong>${service.service}</strong></td><td><span class="pill ${ok ? 'ok' : 'bad'}">${service.active || service.error}</span></td><td>${service.enabled || '-'}</td><td><div class="toolbar"><button class="button" data-service="${service.service}" data-action="restart">重启</button><button class="button" data-service="${service.service}" data-action="status">状态</button></div></td></tr>`;
  }).join('');
  $('serviceMiniTable').innerHTML = rows;
  $('serviceTable').innerHTML = rows;
}

function renderModelForm(bridge, env) {
  const known = ['deepseek-v4-pro', 'deepseek-v4-flash'];
  $('modelSelect').value = known.includes(bridge.model) ? bridge.model : 'custom';
  $('customModel').value = bridge.model;
  $('baseUrl').value = bridge.baseUrl;
  $('chatPath').value = bridge.chatPath;
  $('temperature').value = bridge.temperature;
  $('maxTokens').value = bridge.maxTokens;
  $('timeoutMs').value = bridge.timeoutMs;
  $('openclawHome').value = env.OPENCLAW_HOME || state.data.summary.openclawHome;
}

function renderPersona(files) {
  $('personaList').innerHTML = files.map((item) => `<button data-persona="${item.file}" class="${state.selectedPersona === item.file ? 'active' : ''}"><strong>${item.file}</strong><small>${item.exists ? `${item.size} bytes` : '未创建'}</small></button>`).join('');
}

function renderSkills(skills) {
  $('skillList').innerHTML = skills.map((skill) => `<button data-skill="${skill.name}" data-enabled="${skill.enabled}" class="${state.selectedSkill?.name === skill.name ? 'active' : ''}"><strong>${skill.name}</strong><small>${skill.enabled ? '启用' : '停用'} · ${skill.description || skill.title}</small></button>`).join('');
}

function renderOpenClawFields(fields) {
  $('openclawModelPath').innerHTML = fields.length
    ? fields.map((field) => `<option value='${JSON.stringify(field.path)}'>${field.path.join('.')} = ${field.value}</option>`).join('')
    : '<option value="">未检测到模型字段</option>';
  if (fields[0]) $('openclawModelValue').value = fields[0].value;
}

function renderState(data) {
  state.data = data;
  const summary = data.summary;
  $('statusPill').textContent = '已连接';
  $('statusPill').className = 'pill ok';
  $('metricModel').textContent = summary.bridge.model;
  $('metricBase').textContent = `${summary.bridge.baseUrl}${summary.bridge.chatPath}`;
  $('metricKey').textContent = summary.bridge.deepSeekKeyMasked || '未设置';
  $('metricOpenClaw').textContent = data.openclaw.exists ? '已发现' : '未发现';
  $('metricOpenClawPath').textContent = data.openclaw.path || '-';
  $('metricUptime').textContent = `${data.uptimeSeconds}s`;
  renderServices(data.services || []);
  renderPersona(data.persona || []);
  renderSkills(data.skills || []);
  renderModelForm(summary.bridge, summary.env);
  renderOpenClawFields(data.openclaw.modelFields || []);
}

async function loadState() {
  const data = await api('/admin/api/state');
  renderState(data);
}

async function login() {
  const token = $('loginToken').value.trim();
  const data = await api('/admin/api/login', { method: 'POST', body: { token } });
  state.token = token;
  localStorage.setItem('adminToken', token);
  $('login').classList.add('hidden');
  renderState(data.state);
}

async function loadPersona(file) {
  state.selectedPersona = file;
  const data = await api(`/admin/api/persona?file=${encodeURIComponent(file)}`);
  $('personaTitle').textContent = file;
  $('personaEditor').value = data.content;
  renderPersona(state.data.persona || []);
}

async function savePersona() {
  await api('/admin/api/persona', {
    method: 'POST',
    body: { file: state.selectedPersona, content: $('personaEditor').value }
  });
  showToast('人设已保存');
  await loadState();
}

async function loadSkill(name, enabled) {
  const isEnabled = enabled === true || enabled === 'true';
  const data = await api(`/admin/api/skill?name=${encodeURIComponent(name)}&enabled=${isEnabled}`);
  state.selectedSkill = { name, enabled: isEnabled };
  $('skillTitle').textContent = name;
  $('skillName').value = name;
  $('skillEditor').value = data.content;
  $('toggleSkillButton').textContent = isEnabled ? '停用' : '启用';
  renderSkills(state.data.skills || []);
}

async function saveSkill() {
  const name = $('skillName').value.trim();
  await api('/admin/api/skill', {
    method: 'POST',
    body: { name, content: $('skillEditor').value, enabled: state.selectedSkill?.enabled !== false }
  });
  showToast('技能已保存');
  state.selectedSkill = { name, enabled: state.selectedSkill?.enabled !== false };
  await loadState();
}

async function toggleSkill() {
  if (!state.selectedSkill) return;
  const enabled = !state.selectedSkill.enabled;
  await api('/admin/api/skill/toggle', {
    method: 'POST',
    body: { name: state.selectedSkill.name, enabled }
  });
  showToast(enabled ? '技能已启用' : '技能已停用');
  state.selectedSkill.enabled = enabled;
  await loadState();
}

async function deleteSkill() {
  const name = $('skillName').value.trim();
  if (!name || prompt(`输入 ${name} 确认删除`) !== name) return;
  await api('/admin/api/skill', {
    method: 'DELETE',
    body: { name, enabled: state.selectedSkill?.enabled !== false, confirmName: name }
  });
  state.selectedSkill = null;
  $('skillName').value = '';
  $('skillEditor').value = '';
  showToast('技能已删除');
  await loadState();
}

async function saveModelConfig() {
  const selected = $('modelSelect').value;
  const model = selected === 'custom' ? $('customModel').value.trim() : selected;
  await api('/admin/api/config', {
    method: 'POST',
    body: {
      DEEPSEEK_MODEL: model,
      DEEPSEEK_BASE_URL: $('baseUrl').value,
      DEEPSEEK_CHAT_PATH: $('chatPath').value,
      DEEPSEEK_TEMPERATURE: $('temperature').value,
      DEEPSEEK_MAX_TOKENS: $('maxTokens').value,
      DEEPSEEK_TIMEOUT_MS: $('timeoutMs').value
    }
  });
  showToast('模型配置已保存');
  await loadState();
}

async function saveSecretConfig() {
  const body = { OPENCLAW_HOME: $('openclawHome').value };
  if ($('deepseekKey').value) body.DEEPSEEK_API_KEY = $('deepseekKey').value;
  if ($('proxyKey').value) body.OPENCLAW_PROXY_KEY = $('proxyKey').value;
  if ($('adminToken').value) body.ADMIN_TOKEN = $('adminToken').value;
  await api('/admin/api/config', { method: 'POST', body });
  if (body.ADMIN_TOKEN) {
    state.token = body.ADMIN_TOKEN;
    localStorage.setItem('adminToken', state.token);
  }
  $('deepseekKey').value = '';
  $('proxyKey').value = '';
  $('adminToken').value = '';
  showToast('安全配置已保存');
  await loadState();
}

async function testChat() {
  $('testOutput').textContent = '请求中...';
  const data = await api('/admin/api/test-chat', {
    method: 'POST',
    body: { message: $('testMessage').value }
  });
  $('testOutput').textContent = JSON.stringify(data.completion, null, 2);
}

async function serviceAction(service, action) {
  const data = await api('/admin/api/service', { method: 'POST', body: { service, action } });
  showToast(data.ok ? `${service} ${action} 已执行` : data.result.message || '执行失败', !data.ok);
  if (data.result?.stdout || data.result?.stderr || data.result?.message) {
    $('logOutput').textContent = `${data.result.stdout || ''}${data.result.stderr || ''}${data.result.message || ''}`;
  }
  await loadState();
}

async function loadLogs() {
  const service = $('logService').value;
  const data = await api(`/admin/api/logs?service=${encodeURIComponent(service)}&lines=160`);
  $('logOutput').textContent = `${data.result.stdout || ''}${data.result.stderr || ''}${data.result.message || ''}` || '没有日志';
}

async function loadOpenClawConfig() {
  const data = await api('/admin/api/openclaw/config');
  $('openclawRaw').value = data.raw || '';
  renderOpenClawFields(data.modelFields || []);
  showToast('OpenClaw 配置已读取');
}

async function saveOpenClawConfig() {
  await api('/admin/api/openclaw/config', { method: 'POST', body: { raw: $('openclawRaw').value } });
  showToast('OpenClaw JSON 已保存');
  await loadOpenClawConfig();
}

async function saveOpenClawModel() {
  const rawPath = $('openclawModelPath').value;
  if (!rawPath) return showToast('未检测到模型字段', true);
  await api('/admin/api/openclaw/model', {
    method: 'POST',
    body: { path: JSON.parse(rawPath), model: $('openclawModelValue').value }
  });
  showToast('OpenClaw 模型字段已更新');
  await loadOpenClawConfig();
}

async function runSkillsCommand() {
  $('skillsCommandOutput').textContent = '执行中...';
  const data = await api('/admin/api/openclaw/skills-command', {
    method: 'POST',
    body: { subcommand: $('skillsCommand').value, value: $('skillsCommandValue').value, limit: 10 }
  });
  $('skillsCommandOutput').textContent = `${data.result.stdout || ''}${data.result.stderr || ''}${data.result.message || ''}` || JSON.stringify(data, null, 2);
}

document.addEventListener('click', async (event) => {
  const nav = event.target.closest('[data-tab]');
  if (nav) return setTab(nav.dataset.tab);
  const persona = event.target.closest('[data-persona]');
  if (persona) return loadPersona(persona.dataset.persona).catch((error) => showToast(error.message, true));
  const skill = event.target.closest('[data-skill]');
  if (skill) return loadSkill(skill.dataset.skill, skill.dataset.enabled).catch((error) => showToast(error.message, true));
  const svc = event.target.closest('[data-service][data-action]');
  if (svc) return serviceAction(svc.dataset.service, svc.dataset.action).catch((error) => showToast(error.message, true));
});

$('loginButton').onclick = () => login().catch((error) => showToast(error.message, true));
$('refreshButton').onclick = () => loadState().catch((error) => showToast(error.message, true));
$('logoutButton').onclick = () => { localStorage.removeItem('adminToken'); location.reload(); };
$('testButton').onclick = () => testChat().catch((error) => { $('testOutput').textContent = error.message; showToast(error.message, true); });
$('saveModelButton').onclick = () => saveModelConfig().catch((error) => showToast(error.message, true));
$('saveSecretButton').onclick = () => saveSecretConfig().catch((error) => showToast(error.message, true));
$('savePersonaButton').onclick = () => savePersona().catch((error) => showToast(error.message, true));
$('newSkillButton').onclick = () => {
  state.selectedSkill = { name: '', enabled: true };
  $('skillTitle').textContent = '新建技能';
  $('skillName').value = '';
  $('skillEditor').value = '---\nname: my-skill\ndescription: Describe when this skill should be used.\n---\n\n# My Skill\n';
};
$('reloadSkillsButton').onclick = () => loadState().catch((error) => showToast(error.message, true));
$('saveSkillButton').onclick = () => saveSkill().catch((error) => showToast(error.message, true));
$('toggleSkillButton').onclick = () => toggleSkill().catch((error) => showToast(error.message, true));
$('deleteSkillButton').onclick = () => deleteSkill().catch((error) => showToast(error.message, true));
$('runSkillsCommandButton').onclick = () => runSkillsCommand().catch((error) => showToast(error.message, true));
$('loadOpenClawConfigButton').onclick = () => loadOpenClawConfig().catch((error) => showToast(error.message, true));
$('saveOpenClawConfigButton').onclick = () => saveOpenClawConfig().catch((error) => showToast(error.message, true));
$('saveOpenClawModelButton').onclick = () => saveOpenClawModel().catch((error) => showToast(error.message, true));
$('loadLogsButton').onclick = () => loadLogs().catch((error) => showToast(error.message, true));
$('openclawModelPath').onchange = () => {
  const fields = state.data?.openclaw?.modelFields || [];
  const selected = fields.find((field) => JSON.stringify(field.path) === $('openclawModelPath').value);
  if (selected) $('openclawModelValue').value = selected.value;
};
$('modelSelect').onchange = () => {
  if ($('modelSelect').value !== 'custom') $('customModel').value = $('modelSelect').value;
};

if (state.token) {
  $('loginToken').value = state.token;
  api('/admin/api/state')
    .then((data) => { $('login').classList.add('hidden'); renderState(data); })
    .catch(() => {});
}