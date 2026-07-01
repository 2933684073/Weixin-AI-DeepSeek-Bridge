'use strict';

const crypto = require('crypto');

const conversations = new Map();
const maxConversations = 200;
const maxMessagesPerConversation = 30;

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function getConversation(conversationId, systemPrompt) {
  const id = conversationId || createId();

  if (!conversations.has(id)) {
    conversations.set(id, [
      {
        role: 'system',
        content: systemPrompt
      }
    ]);
  }

  return {
    id,
    messages: conversations.get(id)
  };
}

function appendMessage(conversationId, message) {
  const messages = conversations.get(conversationId);
  if (!messages) {
    return;
  }

  messages.push(message);

  const system = messages.find((item) => item.role === 'system');
  const tail = messages
    .filter((item) => item.role !== 'system')
    .slice(-maxMessagesPerConversation);
  conversations.set(conversationId, system ? [system, ...tail] : tail);

  if (conversations.size > maxConversations) {
    const oldestKey = conversations.keys().next().value;
    conversations.delete(oldestKey);
  }
}

function resetConversation(conversationId) {
  conversations.delete(conversationId);
}

module.exports = {
  appendMessage,
  getConversation,
  resetConversation
};