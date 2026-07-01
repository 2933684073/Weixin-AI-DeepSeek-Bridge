'use strict';

const readline = require('readline');
const { getConfig } = require('./config');
const { createChatCompletion } = require('./deepseek-client');

const config = getConfig();

function getOnceMessage(argv) {
  const index = argv.indexOf('--once');
  if (index === -1) {
    return '';
  }

  return argv.slice(index + 1).join(' ').trim();
}

async function ask(messages, content) {
  messages.push({
    role: 'user',
    content
  });

  const completion = await createChatCompletion({
    messages
  });
  const reply =
    completion.choices &&
    completion.choices[0] &&
    completion.choices[0].message &&
    completion.choices[0].message.content
      ? completion.choices[0].message.content
      : '';

  messages.push({
    role: 'assistant',
    content: reply
  });

  return reply;
}

async function runOnce(content) {
  const messages = [
    {
      role: 'system',
      content: config.systemPrompt
    }
  ];

  const reply = await ask(messages, content);
  process.stdout.write(`${reply}\n`);
}

async function runInteractive() {
  const messages = [
    {
      role: 'system',
      content: config.systemPrompt
    }
  ];
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '你> '
  });

  console.log('输入 /exit 退出，输入 /reset 清空上下文。');
  rl.prompt();

  rl.on('line', async (line) => {
    const content = line.trim();
    if (!content) {
      rl.prompt();
      return;
    }

    if (content === '/exit') {
      rl.close();
      return;
    }

    if (content === '/reset') {
      messages.splice(1);
      console.log('已清空上下文。');
      rl.prompt();
      return;
    }

    try {
      const reply = await ask(messages, content);
      console.log(`AI> ${reply}`);
    } catch (error) {
      console.error(`错误: ${error.message}`);
    }

    rl.prompt();
  });
}

const once = getOnceMessage(process.argv.slice(2));

(once ? runOnce(once) : runInteractive()).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});