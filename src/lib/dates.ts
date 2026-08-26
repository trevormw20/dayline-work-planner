const DAY = 86_400_000

export function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

export function toDateKey(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

export function differenceInDays(later: Date, earlier: Date): number {
  return Math.floor((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / DAY)
}

export function addDays(date: Date, amount: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

export function startOfWeek(date: Date): Date {
  const result = startOfDay(date)
  const day = result.getDay()
  const distance = day === 0 ? -6 : 1 - day
  result.setDate(result.getDate() + distance)
  return result
}

export function endOfWeek(date: Date): Date {
  const result = addDays(startOfWeek(date), 6)
  result.setHours(23, 59, 59, 999)
  return result
}

export function formatShortDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    typeof date === 'string' ? new Date(date) : date,
  )
}

export function formatLongDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(
    typeof date === 'string' ? new Date(date) : date,
  )
}

export function formatTime(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(
    typeof date === 'string' ? new Date(date) : date,
  )
}

export function formatRelativeDay(iso: string | null, now = new Date()): string {
  if (!iso) return 'No date'
  const date = new Date(iso)
  const days = differenceInDays(date, now)
  const time = formatTime(date)
  if (days === 0) return `Today · ${time}`
  if (days === 1) return `Tomorrow · ${time}`
  if (days === -1) return `Yesterday · ${time}`
  return `${formatShortDate(date)} · ${time}`
}

export function parseNaturalDate(text: string, now = new Date()): string | null {
  const lower = text.toLowerCase()
  const base = new Date(now)
  let target: Date | null = null

  if (/\btoday\b/.test(lower)) target = base
  if (/\btomorrow\b/.test(lower)) target = addDays(base, 1)

  const weekday = lower.match(/\b(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
  if (weekday) {
    const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const wanted = names.indexOf(weekday[1])
    let distance = (wanted - base.getDay() + 7) % 7
    if (distance === 0 || weekday[0].startsWith('next')) distance += 7
    target = addDays(base, distance)
  }

  if (!target) return null
  const time = lower.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s?(am|pm)\b/)
  let hour = 9
  let minute = 0
  if (time) {
    hour = Number(time[1]) % 12 + (time[3] === 'pm' ? 12 : 0)
    minute = Number(time[2] || 0)
  }
  target.setHours(hour, minute, 0, 0)
  return target.toISOString()
}

export function uid(prefix = 'task'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
