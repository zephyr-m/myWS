<script setup lang="ts">
import { computed, ref } from 'vue'

type Language = 'javascript' | 'php'

const activeLanguage = ref<Language>('javascript')
const copied = ref(false)
const httpOrigin = window.location.origin
const wsOrigin = httpOrigin.replace(/^http/, 'ws')

const examples: Record<Language, string> = {
  javascript: `const url = new URL('${wsOrigin}/api/logs')
url.searchParams.set('room', 'my-room')

const socket = new WebSocket(url)

socket.addEventListener('open', () => {
  socket.send('Любое сообщение')
})`,
  php: `<?php

$room = rawurlencode('my-room');
$url = '${httpOrigin}/api/logs?room=' . $room;

$curl = curl_init($url);
curl_setopt_array($curl, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => 'Любое сообщение',
    CURLOPT_HTTPHEADER => ['Content-Type: text/plain; charset=utf-8'],
    CURLOPT_RETURNTRANSFER => true,
]);

$response = curl_exec($curl);

if ($response === false) {
    throw new RuntimeException(curl_error($curl));
}

curl_close($curl);`,
}

const activeExample = computed(() => examples[activeLanguage.value])
const endpoint = computed(() => activeLanguage.value === 'javascript'
  ? `${wsOrigin}/api/logs?room=my-room`
  : `${httpOrigin}/api/logs?room=my-room`)

async function copyExample() {
  try {
    await navigator.clipboard.writeText(activeExample.value)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = activeExample.value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }

  copied.value = true
  window.setTimeout(() => { copied.value = false }, 1500)
}
</script>

<template>
  <div class="min-h-dvh bg-background text-foreground">
    <header class="flex h-16 items-center justify-between border-b px-5">
      <div>
        <p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Live Debug
        </p>
        <p class="text-sm font-semibold">Документация</p>
      </div>
      <a href="/" class="text-sm text-muted-foreground hover:text-foreground">← К панели</a>
    </header>

    <main class="mx-auto max-w-3xl px-5 py-10">
      <h1 class="text-2xl font-semibold tracking-tight">Отправка сообщения</h1>
      <p class="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        Укажите комнату в адресе и отправьте любое сообщение. Комната создастся
        автоматически, обязательного формата у тела сообщения нет.
      </p>

      <div class="mt-8 flex border-b" role="tablist" aria-label="Язык примера">
        <button
          v-for="language in (['javascript', 'php'] as Language[])"
          :key="language"
          type="button"
          role="tab"
          :aria-selected="activeLanguage === language"
          class="relative px-4 py-2.5 text-sm transition-colors"
          :class="activeLanguage === language ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="activeLanguage = language"
        >
          {{ language === 'javascript' ? 'JavaScript' : 'PHP' }}
          <span
            v-if="activeLanguage === language"
            class="absolute inset-x-0 bottom-0 h-0.5 bg-sky-500"
          />
        </button>
      </div>

      <section class="mt-5 overflow-hidden rounded-lg border">
        <div class="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
          <span class="rounded bg-muted px-2 py-1 font-mono text-[10px] font-semibold uppercase">
            {{ activeLanguage === 'javascript' ? 'WebSocket' : 'POST' }}
          </span>
          <code class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {{ endpoint }}
          </code>
          <button
            type="button"
            class="shrink-0 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            @click="copyExample"
          >
            {{ copied ? 'Скопировано' : 'Копировать код' }}
          </button>
        </div>

        <pre class="overflow-x-auto p-5 text-sm leading-6"><code>{{ activeExample }}</code></pre>
      </section>

      <p class="mt-4 text-xs leading-5 text-muted-foreground">
        Каждая отправка создаёт одно сообщение. Обычный текст показывается как есть;
        JSON можно передавать при необходимости, но он не обязателен.
      </p>
    </main>
  </div>
</template>
