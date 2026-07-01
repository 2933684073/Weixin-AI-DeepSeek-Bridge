'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { getConfig, timingSafeEqualString } = require('./config');
const { createChatCompletion, streamChatCompletion } = require('./deepseek-client');
const { createAdminRouter } = require('./admin-api');
const {
  appendMessage,
  getConversation,
  resetConversation
} = require('./conversation-store');

const publicDir = path.resolve(__dirname, '..', 'public');

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, {
    'Content-Type': contentType
  });
  response.end(text);
}

function getBearerToken(request) {
  const header = request.headers.authorization || '';
  if (!header.toLowerCase().startsWith('bearer ')) {
    return '';
  }

  return header.slice(7).trim();
}

function requireProxyAuth(request, response) {
  const config = getConfig();
  if (!config.proxyKey) {
    return true;
  }

  const token = getBearerToken(request);
  if (timingSafeEqualString(token, config.proxyKey)) {
    return true;
  }

  sendJson(response, 401, {
    error: {
      message: 'Unauthorized',
      type: 'authentication_error'
    }
  });
  return false;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error('request body is too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('request body must be valid JSON'));
      }
    });

    request.on('error', reject);
  });
}

function serveIndex(response) {
  const filePath = path.join(publicDir, 'index.html');
  sendText(response, 200, fs.readFileSync(filePath, 'utf8'), 'text/html; charset=utf-8');
}

async function handleChat(request, response) {
  if (!requireProxyAuth(request, response)) {
    return;
  }

  const config = getConfig();
  const body = await readJsonBody(request);
  const message = String(body.message || '').trim();

  if (!message) {
    sendJson(response, 400, { error: 'message is required' });
    return;
  }

  const conversation = getConversation(
    body.conversationId,
    body.system || config.systemPrompt
  );

  appendMessage(conversation.id, {
    role: 'user',
    content: message
  });

  const completion = await createChatCompletion({
    messages: conversation.messages
  });
  const reply =
    completion.choices &&
    completion.choices[0] &&
    completion.choices[0].message &&
    completion.choices[0].message.content
      ? completion.choices[0].message.content
      : '';

  appendMessage(conversation.id, {
    role: 'assistant',
    content: reply
  });

  sendJson(response, 200, {
    conversationId: conversation.id,
    model: completion.model,
    reply,
    usage: completion.usage || null
  });
}

async function handleOpenAiChatCompletions(request, response) {
  if (!requireProxyAuth(request, response)) {
    return;
  }

  const body = await readJsonBody(request);
  if (body.stream) {
    await streamChatCompletion(body, response);
    return;
  }

  const completion = await createChatCompletion(body);
  sendJson(response, 200, completion);
}

function handleModels(request, response) {
  if (!requireProxyAuth(request, response)) {
    return;
  }

  const config = getConfig();
  sendJson(response, 200, {
    object: 'list',
    data: [
      {
        id: config.deepseek.model,
        object: 'model',
        created: 0,
        owned_by: 'deepseek'
      }
    ]
  });
}

const adminRouter = createAdminRouter({ sendJson, sendText, readJsonBody });

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (await adminRouter.handle(request, response, url)) {
    return;
  }

  if (request.method === 'GET' && url.pathname === '/') {
    serveIndex(response);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    const config = getConfig();
    sendJson(response, 200, {
      ok: true,
      service: 'weixin-ai-deepseek',
      model: config.deepseek.model,
      mock: config.deepseek.mock,
      auth: Boolean(config.proxyKey),
      admin: Boolean(config.adminToken),
      uptimeSeconds: Math.round(process.uptime())
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/chat') {
    await handleChat(request, response);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/reset') {
    if (!requireProxyAuth(request, response)) {
      return;
    }
    const body = await readJsonBody(request);
    if (body.conversationId) {
      resetConversation(body.conversationId);
    }
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/models') {
    handleModels(request, response);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
    await handleOpenAiChatCompletions(request, response);
    return;
  }

  sendJson(response, 404, {
    error: {
      message: 'Not found',
      type: 'not_found'
    }
  });
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    if (!response.headersSent) {
      sendJson(response, error.statusCode || 500, {
        error: {
          message: error.message,
          type: error.statusCode ? 'api_error' : 'server_error'
        }
      });
    } else {
      response.end();
    }
  });
});

if (require.main === module) {
  const config = getConfig();
  server.listen(config.port, config.host, () => {
    const address = server.address();
    const host = address.address === '0.0.0.0' ? '127.0.0.1' : address.address;
    console.log(`weixin-ai-deepseek listening on http://${host}:${address.port}`);
  });
}

module.exports = server;