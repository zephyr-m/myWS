import assert from 'node:assert/strict'
import { createTelegram, telegramText } from '../../server/telegram.mjs'
const tick = () => new Promise((resolve) => setImmediate(resolve))
const sent = []
const waits = []
const request = async (url, options) => {
  sent.push({ url, ...JSON.parse(options.body) })
  return { ok: true, json: async () => ({ ok: true }) }
}
const disabled = createTelegram({ request })
disabled.enqueue('unused', () => true)
assert.equal(sent.length, 0)
const sender = createTelegram({ token: 'fake-token', chatId: 'fake-chat', request, wait: async (ms) => { waits.push(ms) } })
sender.enqueue('disabled event', () => false)
assert.equal(sent.length, 0)
sender.enqueue('first', () => true)
sender.enqueue('repeat', () => true)
await tick()
assert.deepEqual(sent.map((item) => item.text), ['first', 'repeat'])
assert.equal(sent[0].chat_id, 'fake-chat')
assert.equal(sent[0].parse_mode, 'HTML')
assert.equal(sender.status().pending, 0)
assert.equal(waits.every((ms) => ms >= 3100), true)
assert.equal(JSON.stringify(sender.status()).includes('fake-token'), false)
let attempts = 0
const retryWaits = []
const retry = createTelegram({ token: 'fake', chatId: 'chat', wait: async (ms) => retryWaits.push(ms),
  request: async () => ++attempts === 1
    ? { ok: false, json: async () => ({ error_code: 429, parameters: { retry_after: 8 } }) }
    : { ok: true, json: async () => ({ ok: true }) } })
retry.enqueue('retry', () => true)
await tick()
assert.equal(attempts, 2)
assert.equal(retryWaits[0], 8000)
assert.equal(retry.status().lastError, '')
const failing = createTelegram({ token: 'SECRET', chatId: 'chat', wait: async () => {},
  request: async () => { throw new Error('SECRET') } })
failing.enqueue('fail', () => true)
await tick()
assert.equal(failing.status().dropped, 1)
assert.equal(failing.status().pending, 0)
assert.equal(failing.status().lastError.includes('SECRET'), false)
const text = telegramText({ room: 'target', sourceRoom: 'source', at: 'now', count: 3, message: '<b>hello</b>' }, 'failure', true)
assert.ok(text.includes('🔴'))
assert.ok(text.includes('Комната: target'))
assert.ok(text.includes('Источник: source'))
assert.ok(text.includes('×3'))
assert.ok(text.includes('&lt;b&gt;hello&lt;/b&gt;'))
assert.ok(telegramText({ message: '😀'.repeat(5000) }, 'event', false).length <= 4096)
let release
const blocked = createTelegram({ token: 'fake', chatId: 'chat', wait: async () => {},
  request: async () => { await new Promise(resolve => { release = resolve }); return { ok: true, json: async () => ({ ok: true }) } } })
let enabled = true
for (let index = 0; index < 201; index++) blocked.enqueue('queued', () => enabled)
assert.equal(blocked.status().pending, 200)
assert.equal(blocked.status().dropped, 1)
enabled = false
release()
await tick()
assert.equal(blocked.status().pending, 0, 'Disabled events are removed from the waiting queue')
console.log('Telegram: opt-in, missing credentials, delivery, repeat, rate limit, retry, secret redaction, formatting, queue bound and cancellation passed')

const escaped = String.raw`{"event":"Test","message":"\u041e\u0448\u0438\u0431\u043a\u0430\nDetails","data":{"\u0423\u0440\u043e\u0432\u0435\u043d\u044c":"\u0421\u0431\u043e\u0439"}}`
const readable = telegramText({ room: 'r', sourceRoom: 'r', message: escaped }, 'Test', false)
assert.ok(readable.includes('Ошибка\nDetails'))
assert.ok(readable.includes('"Уровень": "Сбой"'))
assert.equal(readable.includes('\\u041e'), false)
assert.equal(readable.includes('"event"'), false)
assert.ok(telegramText({ message: 'Plain text' }, 'Test', false).endsWith('Plain text'))
console.log('Telegram Unicode and structured message formatting passed')

const html = telegramText({ room: '<room>', sourceRoom: '<room>', at: 'now', message: JSON.stringify({ event: 'E', message: 'A < B & C', data: { value: '</pre>&' } }) }, '<event>', true)
assert.ok(html.includes('<b>🔴 Ошибка · &lt;event&gt;</b>'))
assert.ok(html.includes('A &lt; B &amp; C'))
assert.ok(html.includes('<pre>'))
assert.ok(html.includes('&lt;/pre&gt;&amp;'))
const longHtml = telegramText({ room: 'r', at: 'now', message: JSON.stringify({ event: 'E', data: { value: '<&😀'.repeat(5000) } }) }, 'E', false)
assert.ok(longHtml.includes('</pre>'))
const visible = longHtml.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
assert.ok(visible.length <= 4096)
assert.ok(visible.includes('Сообщение сокращено'))
console.log('Telegram HTML: escaping, code blocks and safe truncation passed')

const customType = telegramText({ room: 'r', at: 'now', message: 'body' }, 'event', { name: 'Проверить <это>' })
assert.ok(customType.includes('Проверить &lt;это&gt;'))
console.log('Telegram custom event type label passed')
