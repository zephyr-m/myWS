export const soundOptions = [
  { id: 'normal', name: 'Обычный сигнал' }, { id: 'error', name: 'Писк с понижением' },
  { id: 'beep', name: 'Чистый писк' }, { id: 'double', name: 'Двойной писк' },
  { id: 'soft', name: 'Мягкий сигнал' },
  { id: 'low', name: 'Писк — ниже' }, { id: 'high', name: 'Писк — выше' },
  { id: 'short', name: 'Короткий писк' }, { id: 'long', name: 'Протяжный писк' },
  { id: 'rise', name: 'Писк с повышением' }, { id: 'step', name: 'Двойной вниз' },
  { id: 'overtone', name: 'Писк с обертоном' }, { id: 'oops', name: 'Мягкое «ой»' },
  { id: 'knock', name: 'Двойной стук' }, { id: 'glass', name: 'Стеклянный звон' },
  { id: 'fall', name: 'Сбой системы' }, { id: 'minor', name: 'Грустные ноты' },
  { id: 'pulse', name: 'Внимание — два импульса' }, { id: 'bass', name: 'Низкий гул' },
  { id: 'retro', name: 'Ретро-ошибка' }, { id: 'success', name: 'Восходящие ноты' },
  { id: 'none', name: 'Без звука' },
] as const
export interface EventKind { id: string; name: string; color: string; sound: string; volume: number }
export interface EventTypeSettings { types: EventKind[]; assignments: Record<string, string> }
export const defaultKinds: EventKind[] = [
  { id: 'info', name: 'Уведомление', color: '#0ea5e9', sound: 'normal', volume: 0.5 },
  { id: 'error', name: 'Ошибка', color: '#ef4444', sound: 'error', volume: 0.5 },
]
export function migrateTypes(legacy: Record<string, string[]> = {}): EventTypeSettings {
  return { types: defaultKinds.map((kind) => ({ ...kind })), assignments: Object.fromEntries(
    Object.entries(legacy).flatMap(([room, events]) => events.map((event) => [JSON.stringify([room, event]), 'error'])),
  ) }
}
export function normalizeTypes(value: EventTypeSettings): EventTypeSettings {
  const types = value.types.filter((kind, index, all) => kind && typeof kind.id === 'string'
    && typeof kind.name === 'string' && kind.name.trim() && /^#[0-9a-f]{6}$/i.test(kind.color)
    && soundOptions.some((sound) => sound.id === kind.sound) && Number.isFinite(kind.volume)
    && kind.volume >= 0 && kind.volume <= 1 && all.findIndex((item) => item.id === kind.id) === index)
    .map((kind) => ({ ...kind, name: kind.name.trim() }))
  if (!types.some((kind) => kind.id === 'info')) types.unshift({ ...defaultKinds[0]! })
  return { types, assignments: Object.fromEntries(Object.entries(value.assignments ?? {})
    .filter(([, id]) => types.some((kind) => kind.id === id))) }
}
export function badgeTextColor(color: string) {
  const values = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * values[0]! + 0.7152 * values[1]! + 0.0722 * values[2]! > 0.179 ? '#111827' : '#ffffff'
}
// Offset, duration, starting/ending frequency, gain, waveform, attack.
type Tone = [number, number, number, number, number, OscillatorType, number]
const extraSounds: Record<string, Tone[]> = {
  low: [[0, .25, 520, 520, .4, 'sine', .06]],
  high: [[0, .25, 820, 820, .4, 'sine', .06]],
  short: [[0, .12, 660, 660, .4, 'sine', .025]],
  long: [[0, .4, 660, 660, .4, 'sine', .06]],
  rise: [[0, .25, 540, 740, .4, 'sine', .06]],
  step: [[0, .14, 660, 660, .4, 'sine', .03], [.2, .18, 520, 520, .4, 'sine', .03]],
  overtone: [[0, .25, 660, 660, .34, 'sine', .06], [0, .25, 1320, 1320, .06, 'sine', .06]],
  oops: [[0, .19, 520, 440, .34, 'sine', .012], [.19, .33, 350, 260, .32, 'sine', .012]],
  knock: [[0, .10, 240, 85, .65, 'sine', .012], [.19, .12, 200, 70, .60, 'sine', .012]],
  glass: [[0, .60, 1100, 1080, .24, 'sine', .012], [0, .40, 1740, 1720, .10, 'sine', .012], [.16, .55, 820, 800, .20, 'sine', .012]],
  fall: [[0, .38, 680, 140, .24, 'triangle', .012], [0, .4, 340, 70, .16, 'sine', .012]],
  minor: [[0, .22, 523.25, 523.25, .3, 'sine', .012], [.18, .22, 415.3, 415.3, .3, 'sine', .012], [.36, .35, 261.63, 261.63, .34, 'sine', .012]],
  pulse: [[0, .13, 740, 700, .32, 'triangle', .012], [.22, .17, 740, 600, .32, 'triangle', .012]],
  bass: [[0, .55, 180, 80, .55, 'sine', .012], [0, .38, 270, 120, .15, 'triangle', .012]],
  retro: [[0, .12, 440, 440, .13, 'square', .012], [.12, .12, 330, 330, .13, 'square', .012], [.24, .23, 165, 110, .13, 'square', .012]],
  success: [[0, .2, 523.25, 523.25, .3, 'sine', .02], [.16, .2, 659.25, 659.25, .3, 'sine', .02], [.32, .32, 783.99, 783.99, .3, 'sine', .02]],
}
export function playKindSound(context: AudioContext, kind: EventKind) {
  if (kind.sound === 'none' || kind.volume === 0 || context.state !== 'running') return
  const start = context.currentTime + 0.03
  const tones = extraSounds[kind.sound]
  if (tones) {
    for (const [offset, duration, frequency, end, volume, waveform, attack] of tones) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const now = start + offset
      oscillator.type = waveform
      oscillator.frequency.setValueAtTime(frequency, now)
      oscillator.frequency.exponentialRampToValueAtTime(end, now + duration)
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(volume * kind.volume, now + attack)
      gain.gain.exponentialRampToValueAtTime(Math.max(.00001, .001 * kind.volume), now + duration)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(now)
      oscillator.stop(now + duration)
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
    }
    return
  }
  const count = kind.sound === 'double' ? 2 : 1
  for (let index = 0; index < count; index++) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const now = start + index * 0.2
    const normal = kind.sound === 'normal'
    const duration = normal ? 0.14 : kind.sound === 'double' ? 0.12 : kind.sound === 'soft' ? 0.35 : 0.25
    oscillator.frequency.setValueAtTime(normal ? 720 : kind.sound === 'error' ? 740 : 660, now)
    oscillator.frequency.exponentialRampToValueAtTime(normal ? 960 : kind.sound === 'error' ? 540 : 660, now + (normal ? 0.09 : duration))
    gain.gain.setValueAtTime(normal ? 0.12 * kind.volume : 0, now)
    if (!normal) gain.gain.linearRampToValueAtTime(0.4 * kind.volume, now + Math.min(0.06, duration / 3))
    gain.gain.exponentialRampToValueAtTime(Math.max(0.00001, (normal ? 0.002 : 0.001) * kind.volume), now + duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + duration)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  }
}
export type KindCounts = Record<string, number>
export function sumKindCounts(rooms: string[], counts: Record<string, KindCounts>): KindCounts {
  const result: KindCounts = {}
  for (const room of new Set(rooms)) for (const [id, count] of Object.entries(counts[room] ?? {})) result[id] = (result[id] ?? 0) + count
  return result
}
