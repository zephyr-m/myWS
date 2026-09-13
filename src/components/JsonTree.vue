<script setup lang="ts">
withDefaults(defineProps<{
  depth?: number
  value: unknown
}>(), {
  depth: 0,
})

function normalize(value: unknown) {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value

  try {
    const parsed: unknown = JSON.parse(trimmed)
    return typeof parsed === 'object' && parsed !== null ? parsed : value
  } catch {
    return value
  }
}

function items(value: unknown) {
  const normalized = normalize(value)
  if (typeof normalized !== 'object' || normalized === null) return []
  return Object.entries(normalized).map(([key, item]) => ({ key, value: normalize(item) }))
}

function isBranch(value: unknown) {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0
}

function branchLabel(value: unknown) {
  const count = Object.keys(value as object).length
  return Array.isArray(value) ? `${count} элементов` : `${count} полей`
}

function primitiveLabel(value: unknown) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return '[]'
  if (typeof value === 'object') return '{}'
  return String(value)
}
</script>

<template>
  <div :class="depth === 0 && 'overflow-hidden rounded-lg border bg-background/40'">
    <div
      v-if="depth === 0"
      class="border-b bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
    >
      JSON
    </div>

    <div
      v-for="item in items(value)"
      :key="item.key"
      class="border-b border-border/60 last:border-b-0"
    >
      <details v-if="isBranch(item.value)" :open="depth < 1">
        <summary class="cursor-pointer select-none px-3 py-1.5 hover:bg-muted/40">
          <span class="break-words font-medium">{{ item.key }}</span>
          <span class="ml-1 text-muted-foreground">· {{ branchLabel(item.value) }}</span>
        </summary>
        <div class="ml-3 border-l pl-2">
          <JsonTree :depth="depth + 1" :value="item.value" />
        </div>
      </details>

      <div
        v-else
        class="grid grid-cols-[minmax(0,0.45fr)_minmax(0,1fr)] gap-3 px-3 py-1.5"
      >
        <span class="break-words font-medium">{{ item.key }}</span>
        <span class="min-w-0 break-words text-muted-foreground">
          {{ primitiveLabel(item.value) }}
        </span>
      </div>
    </div>
  </div>
</template>
