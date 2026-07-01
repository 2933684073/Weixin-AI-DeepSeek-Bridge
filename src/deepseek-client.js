'use strict';

const http = require('http');
const https = require('https');
const { getConfig } = require('./config');

function nowId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function buildEndpoint(config) {
  const path = config.deepseek.chatPath.startsWith('/')
    ? config.deepseek.chatPath
    : `/${config.deepseek.chatPath}`;
  return `${config.deepseek.baseUrl}${path}`;
}

function normalizePayload(payload, overrides = {}) {
  const config = getConfig();
  const body = {
    model: payload.model || overrides.model || config.deepseek.model,
    messages: payload.messages || [],
    temperature:
      payload.temperature === undefined
        ? config.deepseek.temperature
        : payload.temperature,
    max_tokens:
      payload.max_tokens === undefined
        ? config.deepseek.maxTokens
        : payload.max_tokens,
    stream: Boolean(payload.stream)
  };

  if (payload.tools) {
    body.tools = payload.tools;
  }
  if (payload.tool_choice) {
    body.tool_choice = payload.tool_choice;
  }
  if (payload.response_format) {
    body.response_format = payload.response_format;
  }

  return body;
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages must be a non-empty array');
  }

  for (const message of messages) {
    if (!message || typeof message.role !== 'string') {
      throw new Error('each message must include a role');
    }
    if (
      message.content !== undefined &&
      typeof message.content !== 'string' &&
      !Array.isArray(message.content)
    ) {
      throw new Error('message content must be a string or array');
    }
  }
}

function mockReply(messages) {
  const lastUser = [...messages].reverse().find((item) => item.role === 'user');
  const content = lastUser ? lastUser.content : '你好';
  return `mock: 已收到「${String(content).slice(0, 120)}」。DeepSeek API Key 填好后会返回真实回答。`;
}

function createMockCompletion(payload) {
  const reply = mockReply(payload.messages || []);

  return {
    id: nowId('chatcmpl-mock'),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: payload.model || getConfig().deepseek.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: reply
        },
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}

function requestJson(urlString, body, config) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === 'https:' ? https : http;
    const bodyJson = JSON.stringify(body);

    const request = transport.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        headers: {
          Authorization: `Bearer ${config.deepseek.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyJson),
          'User-Agent': 'weixin-ai-deepseek/0.1'
        },
        timeout: config.deepseek.timeoutMs
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json;

          try {
            json = text ? JSON.parse(text) : {};
          } catch (error) {
            reject(
              new Error(
                `DeepSeek returned non-JSON response (${response.statusCode}): ${text.slice(0, 300)}`
              )
            );
            return;
          }

          if (response.statusCode < 200 || response.statusCode >= 300) {
            const message =
              json.error && json.error.message
                ? json.error.message
                : `DeepSeek request failed with status ${response.statusCode}`;
            const apiError = new Error(message);
            apiError.statusCode = response.statusCode;
            apiError.response = json;
            reject(apiError);
            return;
          }

          resolve(json);
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('DeepSeek request timed out'));
    });
    request.on('error', reject);
    request.write(bodyJson);
    request.end();
  });
}

function streamRequest(urlString, body, config, serverResponse) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === 'https:' ? https : http;
    const bodyJson = JSON.stringify(body);

    const request = transport.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        headers: {
          Authorization: `Bearer ${config.deepseek.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyJson),
          'User-Agent': 'weixin-ai-deepseek/0.1'
        },
        timeout: config.deepseek.timeoutMs
      },
      (upstream) => {
        serverResponse.writeHead(upstream.statusCode || 502, {
          'Content-Type': upstream.headers['content-type'] || 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive'
        });

        upstream.on('data', (chunk) => serverResponse.write(chunk));
        upstream.on('end', () => {
          serverResponse.end();
          resolve();
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('DeepSeek stream request timed out'));
    });
    request.on('error', reject);
    request.write(bodyJson);
    request.end();
  });
}

function sendMockStream(payload, response) {
  const text = mockReply(payload.messages || []);
  const id = nowId('chatcmpl-mock');
  const model = payload.model || getConfig().deepseek.model;

  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });

  for (const part of text.match(/.{1,16}/g) || ['']) {
    response.write(
      `data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: { content: part },
            finish_reason: null
          }
        ]
      })}\n\n`
    );
  }

  response.write(
    `data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop'
        }
      ]
    })}\n\n`
  );
  response.write('data: [DONE]\n\n');
  response.end();
}

async function createChatCompletion(payload, overrides = {}) {
  const config = getConfig();
  const body = normalizePayload(payload, overrides);
  validateMessages(body.messages);

  if (config.deepseek.mock) {
    return createMockCompletion(body);
  }

  if (!config.deepseek.apiKey || config.deepseek.apiKey.startsWith('sk-your-')) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  body.stream = false;
  return requestJson(buildEndpoint(config), body, config);
}

async function streamChatCompletion(payload, response, overrides = {}) {
  const config = getConfig();
  const body = normalizePayload({ ...payload, stream: true }, overrides);
  validateMessages(body.messages);

  if (config.deepseek.mock) {
    sendMockStream(body, response);
    return;
  }

  if (!config.deepseek.apiKey || config.deepseek.apiKey.startsWith('sk-your-')) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  await streamRequest(buildEndpoint(config), body, config, response);
}

module.exports = {
  createChatCompletion,
  streamChatCompletion,
  validateMessages
};