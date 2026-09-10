import type { Priority, Task, TaskKind, WeeklyReport, WorkplaceConfig, WorkplaceId, WorkspaceData } from '../types'
import { addDays, endOfWeek, parseNaturalDate, startOfWeek, toDateKey, uid } from './dates'
import { getEffectivePriority, sortTasks } from './priority'

export const DEFAULT_WORKPLACES: WorkplaceConfig[] = [
  {
    id: 'hidermatology',
    name: 'Hidermatology',
    shortName: 'Hider',
    color: '#35756a',
    keywords: ['hider', 'dermatology', 'clinic', 'patient', 'appointment', 'provider', 'medical', 'derm', 'google ads'],
  },
  {
    id: 'soleivar',
    name: 'Soleivar',
    shortName: 'Soleivar',
    color: '#d06a48',
    keywords: ['soleivar', 'order', 'inventory', 'product', 'vendor', 'shipping', 'store', 'customer', 'supplier'],
  },
]

export function emptyWorkspace(): WorkspaceData {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    tasks: [],
    briefs: [],
    reports: [],
    workplaces: DEFAULT_WORKPLACES,
    gmail: { lastSyncAt: null, processedMessageIds: [] },
  }
}

export function inferWorkplace(text: string, workplaces = DEFAULT_WORKPLACES): WorkplaceId {
  const lower = text.toLowerCase()
  const scores = workplaces.map((workplace) => ({
    id: workplace.id,
    score: workplace.keywords.reduce((total, keyword) => total + (lower.includes(keyword.toLowerCase()) ? keyword.length : 0), 0),
  }))
  scores.sort((a, b) => b.score - a.score)
  return scores[0].score > 0 ? scores[0].id : 'hidermatology'
}

export function inferTaskKind(text: string): TaskKind {
  if (/\b(call|phone|email|follow[ -]?up|reach out|contact|schedule|book|meeting)\b/i.test(text)) return 'follow_up'
  return 'task'
}

export function inferPriority(text: string): Exclude<Priority, 'urgent'> {
  if (/\b(urgent|asap|immediately|today|critical)\b/i.test(text)) return 'high'
  if (/\b(important|soon|this week|follow[ -]?up)\b/i.test(text)) return 'medium'
  return 'low'
}

export function makeTask(
  title: string,
  partial: Partial<Task> = {},
  workplaces: WorkplaceConfig[] = DEFAULT_WORKPLACES,
): Task {
  const now = new Date().toISOString()
  const kind = partial.kind || inferTaskKind(title)
  const scheduledFor = partial.scheduledFor === undefined ? parseNaturalDate(title) : partial.scheduledFor
  return {
    id: partial.id || uid(),
    title: title.trim(),
    notes: partial.notes || '',
    workplace: partial.workplace || inferWorkplace(`${title} ${partial.notes || ''}`, workplaces),
    kind,
    status: partial.status || 'open',
    startPriority: partial.startPriority || inferPriority(title),
    priorityOverride: partial.priorityOverride || null,
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
    dueAt: partial.dueAt === undefined ? scheduledFor : partial.dueAt,
    scheduledFor,
    completedAt: partial.completedAt || null,
    snoozedUntil: partial.snoozedUntil || null,
    followUp:
      partial.followUp === undefined && kind === 'follow_up'
        ? {
            contact: '',
            channel: /\bemail\b/i.test(title) ? 'email' : /\bcall|phone\b/i.test(title) ? 'call' : 'meeting',
            nextDate: scheduledFor,
            outcome: '',
          }
        : partial.followUp || null,
    source: partial.source || 'manual',
    sourceId: partial.sourceId || null,
    tags: partial.tags || [],
    tip: partial.tip || defaultTip(title, kind),
    ...(partial.dailyKey ? { dailyKey: partial.dailyKey } : {}),
    ...(partial.importMeta ? { importMeta: partial.importMeta } : {}),
  }
}

export function defaultTip(title: string, kind: TaskKind): string {
  if (kind === 'follow_up') return 'Open the contact details first, decide the one outcome you need, then make the call or send the message before adding more notes.'
  if (/report|review|analy/i.test(title)) return 'Define the decision this work should support, gather only the inputs needed for that decision, then draft the conclusion first.'
  if (/write|draft|content|post/i.test(title)) return 'Start with a rough three-point outline and give yourself one short editing pass after the first draft.'
  if (/ads|campaign|marketing/i.test(title)) return 'Check the single metric tied to the goal, make one controlled change, and record what you expect it to improve.'
  return 'Shrink this to the next visible action, set a 25-minute timer, and stop when that action is complete.'
}

export function ensureDailyTask(data: WorkspaceData, now = new Date()): WorkspaceData {
  const key = toDateKey(now)
  if (data.tasks.some((task) => task.dailyKey === key)) return data
  const atNine = new Date(now)
  atNine.setHours(9, 0, 0, 0)
  const daily = makeTask('Choose today’s three wins', {
    workplace: 'hidermatology',
    startPriority: 'medium',
    scheduledFor: atNine.toISOString(),
    dueAt: atNine.toISOString(),
    source: 'daily',
    dailyKey: key,
    tags: ['daily reset'],
    notes: 'Pick one meaningful outcome for each work block. Keep the list small enough to finish.',
    tip: 'Choose one must-do, one progress task, and one quick win. Everything else can wait until those are moving.',
  }, data.workplaces)
  return touch({ ...data, tasks: [daily, ...data.tasks] })
}

export function updateTask(data: WorkspaceData, taskId: string, updates: Partial<Task>): WorkspaceData {
  const now = new Date().toISOString()
  return touch({
    ...data,
    tasks: data.tasks.map((task) => (task.id === taskId ? { ...task, ...updates, updatedAt: now } : task)),
  })
}

export function completeTask(data: WorkspaceData, taskId: string, completed: boolean): WorkspaceData {
  const now = new Date().toISOString()
  return updateTask(data, taskId, {
    status: completed ? 'done' : 'open',
    completedAt: completed ? now : null,
  })
}

export function snoozeTask(data: WorkspaceData, taskId: string, until: Date): WorkspaceData {
  return updateTask(data, taskId, { status: 'snoozed', snoozedUntil: until.toISOString() })
}

export function wakeSnoozedTasks(data: WorkspaceData, now = new Date()): WorkspaceData {
  const needsWake = data.tasks.some((task) => task.status === 'snoozed' && task.snoozedUntil && new Date(task.snoozedUntil) <= now)
  if (!needsWake) return data
  return touch({
    ...data,
    tasks: data.tasks.map((task) =>
      task.status === 'snoozed' && task.snoozedUntil && new Date(task.snoozedUntil) <= now
        ? { ...task, status: 'open' as const, snoozedUntil: null, updatedAt: now.toISOString() }
        : task,
    ),
  })
}

export function activeTasks(data: WorkspaceData, now = new Date()): Task[] {
  return data.tasks
    .filter((task) => task.status === 'open' || (task.status === 'snoozed' && task.snoozedUntil && new Date(task.snoozedUntil) <= now))
    .sort((a, b) => sortTasks(a, b, now))
}

export function buildCurrentBrief(data: WorkspaceData, now = new Date()): string {
  const tasks = activeTasks(data, now)
  if (!tasks.length) return 'Your board is clear. Use the breathing room to capture one meaningful next step, or finish early without creating busywork.'
  const urgent = tasks.filter((task) => getEffectivePriority(task, now).priority === 'urgent')
  const high = tasks.filter((task) => getEffectivePriority(task, now).priority === 'high')
  const focus = [...urgent, ...high, ...tasks].filter((task, index, all) => all.findIndex((item) => item.id === task.id) === index).slice(0, 3)
  const lead = urgent.length
    ? `${urgent.length} item${urgent.length === 1 ? ' needs' : 's need'} immediate attention.`
    : high.length
      ? `${high.length} high-priority item${high.length === 1 ? ' is' : 's are'} ready to move.`
      : 'Nothing is on fire today, which is exactly the goal.'
  return `${lead} Start with ${focus.map((task) => `“${task.title}”`).join(', then ')}. Keep the first work block protected and move anything that does not support these outcomes out of today.`
}

export function generateReports(data: WorkspaceData, now = new Date()): WorkspaceData {
  const cutoff = addDays(now, -31)
  const previousWeek = addDays(startOfWeek(now), -1)
  const weekStart = startOfWeek(previousWeek)
  const weekEnd = endOfWeek(previousWeek)
  const id = toDateKey(weekStart)
  const completed = data.tasks.filter(
    (task) => task.completedAt && new Date(task.completedAt) >= weekStart && new Date(task.completedAt) <= weekEnd,
  )
  const existing = data.reports.some((report) => report.id === id)
  let reports = data.reports.filter((report) => new Date(report.createdAt) >= cutoff)
  if (!existing && completed.length) {
    const byWorkplace = completed.reduce<Record<WorkplaceId, number>>(
      (totals, task) => ({ ...totals, [task.workplace]: totals[task.workplace] + 1 }),
      { hidermatology: 0, soleivar: 0 },
    )
    const highlights = completed.slice(0, 4).map((task) => task.title).join(', ')
    const report: WeeklyReport = {
      id,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      createdAt: now.toISOString(),
      completedTaskIds: completed.map((task) => task.id),
      byWorkplace,
      summary: `Completed ${completed.length} item${completed.length === 1 ? '' : 's'} across the week, including ${highlights}.`,
    }
    reports = [report, ...reports]
  }
  if (reports === data.reports) return data
  return touch({ ...data, reports })
}

export function mergeWorkspaces(local: WorkspaceData, remote: WorkspaceData): WorkspaceData {
  const tasks = new Map<string, Task>()
  for (const task of [...remote.tasks, ...local.tasks]) {
    const existing = tasks.get(task.id)
    if (!existing || new Date(task.updatedAt) > new Date(existing.updatedAt)) tasks.set(task.id, task)
  }
  const reports = new Map([...remote.reports, ...local.reports].map((report) => [report.id, report]))
  const briefs = new Map([...remote.briefs, ...local.briefs].map((brief) => [brief.date, brief]))
  return touch({
    ...remote,
    tasks: [...tasks.values()],
    reports: [...reports.values()],
    briefs: [...briefs.values()],
    workplaces: local.workplaces.length ? local.workplaces : remote.workplaces,
    gmail: {
      lastSyncAt:
        local.gmail.lastSyncAt && (!remote.gmail.lastSyncAt || local.gmail.lastSyncAt > remote.gmail.lastSyncAt)
          ? local.gmail.lastSyncAt
          : remote.gmail.lastSyncAt,
      processedMessageIds: [...new Set([...remote.gmail.processedMessageIds, ...local.gmail.processedMessageIds])].slice(-1000),
    },
  })
}

export function normalizeWorkspace(input: unknown): WorkspaceData {
  const fallback = emptyWorkspace()
  if (!input || typeof input !== 'object') return fallback
  const candidate = input as Partial<WorkspaceData>
  return {
    ...fallback,
    ...candidate,
    tasks: Array.isArray(candidate.tasks) ? candidate.tasks : [],
    briefs: Array.isArray(candidate.briefs) ? candidate.briefs : [],
    reports: Array.isArray(candidate.reports) ? candidate.reports : [],
    workplaces: Array.isArray(candidate.workplaces) && candidate.workplaces.length ? candidate.workplaces : DEFAULT_WORKPLACES,
    gmail: { ...fallback.gmail, ...(candidate.gmail || {}) },
  }
}

function touch(data: WorkspaceData): WorkspaceData {
  return { ...data, updatedAt: new Date().toISOString() }
}
