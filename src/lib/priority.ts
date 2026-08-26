import type { Priority, Task } from '../types'
import { differenceInDays } from './dates'

const rank: Record<Priority, number> = { low: 1, medium: 2, high: 3, urgent: 4 }
const labels: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }

export interface PriorityResult {
  priority: Priority
  reason: string
  score: number
  overdueDays: number
}

export function getEffectivePriority(task: Task, now = new Date()): PriorityResult {
  if (task.priorityOverride) {
    return { priority: task.priorityOverride, reason: 'Set manually', score: rank[task.priorityOverride], overdueDays: 0 }
  }

  const createdDays = Math.max(0, differenceInDays(now, new Date(task.createdAt)))
  const overdueDays = task.dueAt ? Math.max(0, differenceInDays(now, new Date(task.dueAt))) : 0
  const age = task.dueAt ? overdueDays : createdDays
  let priority: Priority = task.startPriority

  if (task.startPriority === 'low') {
    if (age >= (task.dueAt ? 14 : 30)) priority = 'urgent'
    else if (age >= (task.dueAt ? 7 : 14)) priority = 'high'
    else if (age >= (task.dueAt ? 3 : 7)) priority = 'medium'
  } else if (task.startPriority === 'medium') {
    if (age >= (task.dueAt ? 9 : 21)) priority = 'urgent'
    else if (age >= (task.dueAt ? 4 : 10)) priority = 'high'
  } else if (task.startPriority === 'high' && age >= (task.dueAt ? 3 : 7)) {
    priority = 'urgent'
  }

  let reason = 'Priority is steady'
  if (overdueDays > 0) reason = `${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue`
  else if (!task.dueAt && createdDays > 0) reason = `Open for ${createdDays} day${createdDays === 1 ? '' : 's'}`
  else if (task.dueAt) reason = 'Due date is ahead'

  return { priority, reason, score: rank[priority], overdueDays }
}

export function priorityLabel(priority: Priority): string {
  return labels[priority]
}

export function sortTasks(a: Task, b: Task, now = new Date()): number {
  const aPriority = getEffectivePriority(a, now)
  const bPriority = getEffectivePriority(b, now)
  if (aPriority.score !== bPriority.score) return bPriority.score - aPriority.score
  const aDate = a.scheduledFor || a.dueAt
  const bDate = b.scheduledFor || b.dueAt
  if (aDate && bDate) return new Date(aDate).getTime() - new Date(bDate).getTime()
  if (aDate) return -1
  if (bDate) return 1
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}
