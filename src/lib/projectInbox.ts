import type { Subtask, Task, WorkspaceData, WorkplaceId } from '../types'

// Pure module: shared by the browser importer and the Node submission helper.
export interface ProjectSubmission {
  format: 'dayline-project-task'
  version: 1
  submissionId: string
  projectId: string
  projectName: string
  submittedAt: string
  title: string
  notes: string
  workplace?: WorkplaceId
  priority: 'low' | 'medium' | 'high'
  subtasks: Array<{ id: string; title: string; notes: string }>
}

const idPattern = /^[a-z0-9][a-z0-9._-]{1,119}$/
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.')
  return value as Record<string, unknown>
}
function text(value: unknown, field: string, limit: number, optional = false): string {
  if (optional && value === undefined) return ''
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > limit) throw new Error(`${field} must be text up to ${limit} characters.`)
  return value.trim()
}
function id(value: unknown, field: string): string {
  const result = text(value, field, 120)
  if (!idPattern.test(result)) throw new Error(`${field} needs a stable lowercase ID (letters, digits, dots, hyphens or underscores).`)
  return result
}

export function parseProjectSubmission(value: unknown): ProjectSubmission {
  const raw = object(value)
  if (JSON.stringify(raw).length > 256_000) throw new Error('Submission is too large (maximum 256 KB).')
  if (raw.format !== 'dayline-project-task' || raw.version !== 1) throw new Error('Expected dayline-project-task version 1.')
  const submittedAt = text(raw.submittedAt, 'submittedAt', 40)
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(submittedAt) || Number.isNaN(Date.parse(submittedAt))) throw new Error('submittedAt needs an ISO date and time with a timezone.')
  if (raw.workplace !== undefined && raw.workplace !== 'soleivar' && raw.workplace !== 'hidermatology') throw new Error('workplace must be soleivar or hidermatology, or omitted for automatic routing.')
  const priority = raw.priority ?? 'medium'
  if (priority !== 'low' && priority !== 'medium' && priority !== 'high') throw new Error('priority must be low, medium or high.')
  if (!Array.isArray(raw.subtasks) || !raw.subtasks.length || raw.subtasks.length > 100) throw new Error('Include between 1 and 100 subtasks.')
  const seen = new Set<string>()
  const subtasks = raw.subtasks.map((value, index) => {
    const step = object(value)
    const stepId = id(step.id, `subtasks[${index}].id`)
    if (seen.has(stepId)) throw new Error(`Duplicate subtask ID: ${stepId}.`)
    seen.add(stepId)
    return { id: stepId, title: text(step.title, `subtasks[${index}].title`, 240), notes: text(step.notes, `subtasks[${index}].notes`, 8000, true) }
  })
  if (/github_pat_[A-Za-z0-9_]{20,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bsk-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(JSON.stringify(raw))) throw new Error('Remove credentials or private keys before submitting.')
  return {
    format: 'dayline-project-task', version: 1,
    submissionId: id(raw.submissionId, 'submissionId'), projectId: id(raw.projectId, 'projectId'),
    projectName: text(raw.projectName, 'projectName', 120), submittedAt,
    title: text(raw.title, 'title', 180), notes: text(raw.notes, 'notes', 8000, true),
    ...(raw.workplace ? { workplace: raw.workplace as WorkplaceId } : {}), priority, subtasks,
  }
}

export function mergeProjectSubmission(data: WorkspaceData, submission: ProjectSubmission, path: string, sha: string, now = new Date().toISOString()): WorkspaceData {
  const previousReceipt = data.taskInbox?.[path]
  if (previousReceipt?.sha === sha) return data
  const taskId = `project:${submission.projectId}:${submission.submissionId}`
  const existing = data.tasks.find((task) => task.id === taskId)
  // Receipts survive retention: a removed completed task must not reappear.
  const alreadyImported = Object.values(data.taskInbox ?? {}).some((receipt) => receipt.submissionId === taskId)
  const receipt = { sha, submissionId: taskId, importedAt: now }
  if (!existing && alreadyImported) return { ...data, taskInbox: { ...data.taskInbox, [path]: receipt }, updatedAt: now }
  const subtasks: Subtask[] = existing ? [...(existing.subtasks ?? [])] : []
  for (const step of submission.subtasks) {
    // Existing step text and completion belong to the user; source revisions only append new IDs.
    if (!subtasks.some((item) => item.id === step.id)) subtasks.push({ ...step, completedAt: null, updatedAt: now })
  }
  const addedSteps = subtasks.length > (existing?.subtasks?.length ?? 0)
  const workplace = submission.workplace ?? data.workplaces
    .map((entry) => ({ id: entry.id, score: entry.keywords.filter((keyword) => `${submission.projectName} ${submission.title} ${submission.notes}`.toLowerCase().includes(keyword.toLowerCase())).length }))
    .sort((a, b) => b.score - a.score)[0]?.id ?? 'hidermatology'
  const task: Task = existing ? {
    ...existing, subtasks, updatedAt: now,
    ...(addedSteps && existing.status === 'done' ? { status: 'open', completedAt: null } : {}),
  } : {
    id: taskId, title: submission.title, notes: submission.notes, workplace,
    kind: 'task', status: 'open', startPriority: submission.priority, priorityOverride: null,
    createdAt: submission.submittedAt, updatedAt: now, dueAt: null, scheduledFor: null,
    completedAt: null, snoozedUntil: null, followUp: null, source: 'import', sourceId: taskId,
    tags: [submission.projectName], tip: 'Start with the first unfinished step. Check off each result before moving on.',
    projectSubmission: { submissionId: submission.submissionId, projectId: submission.projectId, projectName: submission.projectName, submittedAt: submission.submittedAt }, subtasks,
  }
  return { ...data, tasks: existing ? data.tasks.map((entry) => entry.id === task.id ? task : entry) : [task, ...data.tasks], taskInbox: { ...data.taskInbox, [path]: receipt }, updatedAt: now }
}
