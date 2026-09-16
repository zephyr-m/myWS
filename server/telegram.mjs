import { setTimeout as delay } from 'node:timers/promises'

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function telegramText(entry, event, error) {
  let message = entry.message
  let data = ''
  try {
    const parsed = JSON.parse(entry.message)
    if (parsed && typeof parsed === 'object' && typeof parsed.event === 'string') {
      message = typeof parsed.message === 'string' ? parsed.message : ''
      data = parsed.data === undefined ? '' : JSON.stringify(parsed.data, null, 2)
      if (!message && !data) data = JSON.stringify(parsed, null, 2)
    } else if (typeof parsed === 'string') message = parsed
    else { message = ''; data = JSON.stringify(parsed, null, 2) }
  } catch { /* Plain text is escaped below, never treated as HTML. */ }

  // Limit visible text before escaping, so entities and closing tags stay intact.
  let remaining = 3900
  let truncated = false
  function block(value, tag = '') {
    const raw = String(value ?? '')
    let text = raw.slice(0, remaining).replace(/[\uD800-\uDBFF]$/, '')
    if (text.length < raw.length) truncated = true
    remaining -= text.length
    if (!text) return ''
    text = escapeHtml(text)
    return tag ? `<${tag}>${text}</${tag}>` : text
  }
  const label = error && typeof error === 'object' ? `● ${error.name}` : error ? '🔴 Ошибка' : '🔵 Уведомление'
  const header = block(`${label} · ${event}`, 'b')
  const location = block(`Комната: ${entry.room}`)
  const source = entry.sourceRoom && entry.sourceRoom !== entry.room
    ? block(`Источник: ${entry.sourceRoom}`) : ''
  const time = block(`${entry.at} · ×${entry.count ?? 1}`, 'i')
  const body = block(message)
  const details = block(data, 'pre')
  return [header, location, source, time, '', body, details,
    truncated ? '… Сообщение сокращено' : ''].filter(Boolean).join('\n')
}

export function createTelegram({ token = '', chatId = '', request = fetch, wait = delay } = {}) {
  const configured = Boolean(token && chatId)
  const queue = []
  let running = false
  let lastError = ''
  let dropped = 0
  async function drain() {
    if (running) return
    running = true
    try {
      while (queue.length) {
        const item = queue[0]
        if (!item.enabled()) { queue.shift(); continue }
        let pause = 3100
        try {
          const response = await request(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: item.text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
            signal: AbortSignal.timeout(10000),
          })
          const result = await response.json()
          if (response.ok && result.ok) {
            queue.shift()
            lastError = ''
          } else {
            const code = Number(result.error_code ?? response.status)
            lastError = `Telegram: ошибка ${code}`
            item.attempts++
            if ((code === 429 || code >= 500) && item.attempts < 3) {
              const retry = Number(result.parameters?.retry_after)
              pause = Number.isFinite(retry) && retry > 0 ? Math.max(3100, retry * 1000) : 5000
            } else { queue.shift(); dropped++ }
          }
        } catch {
          // Never log the request URL or raw exception: they may contain the bot token.
          lastError = 'Telegram: сеть недоступна или истекло время ожидания'
          if (++item.attempts >= 3) { queue.shift(); dropped++ }
          pause = 5000
        }
        await wait(pause)
      }
    } finally { running = false }
  }
  return {
    status: () => ({ configured, pending: queue.length, lastError, dropped }),
    enqueue(text, enabled) {
      if (!configured || !enabled()) return
      if (queue.length >= 200) { dropped++; lastError = 'Telegram: очередь заполнена'; return }
      queue.push({ text, enabled, attempts: 0 })
      void drain()
    },
  }
}
