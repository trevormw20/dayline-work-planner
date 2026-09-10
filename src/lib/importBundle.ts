import type {
  ImportedTaskSnapshot,
  Task,
  TaskKind,
  WorkplaceConfig,
  WorkplaceId,
  WorkspaceData,
} from '../types'
import { makeTask } from './workspace'

const ID_PATTERN = /^[a-z0-9][a-z0-9._/-]{1,119}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/
const PRIORITIES = ['low', 'medium', 'high'] as const
const KINDS = ['task', 'follow_up', 'email'] as const
const SECRET_PATTERNS = [
  /github_pat_[A-Za-z0-9_]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
]

export interface PlannerTaskBundleItem {
  externalId: string
  title: string
  notes?: string
  kind: TaskKind
  priority: 'low' | 'medium' | 'high'
  dueOn?: string | null
  scheduledFor?: string | null
  tags?: string[]
  tip?: string
  sourceRefs?: string[]
}

export interface PlannerTaskBundle {
  format: 'planner-task-bundle'
  version: 1
  bundleId: string
  generatedAt: string
  source: {
    projectId: string
    projectName: string
    revision?: string
  }
  destinationHint?: {
    id?: string
    name?: string
  }
  items: PlannerTaskBundleItem[]
}

export type ImportAction = 'add' | 'update' | 'unchanged'

export interface ImportPreviewItem {
  externalId: string
  title: string
  action: ImportAction
  scheduled: boolean
  preservedEdits: number
}

export interface ImportSummary {
  added: number
  updated: number
  unchanged: number
  preservedEdits: number
  scheduled: number
}

export interface ImportPreview extends ImportSummary {
  items: ImportPreviewItem[]
}

interface PlannedTask {
  sourceId: string
  snapshot: ImportedTaskSnapshot
  sourceRefs: string[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function dateOnlyToIso(value?: string | null): string | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 17, 0, 0, 0).toISOString()
}

function collectStrings(value: unknown, result: string[] = []): string[] {
  if (typeof value === 'string') result.push(value)
  else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, result))
  else if (isObject(value)) Object.values(value).forEach((entry) => collectStrings(entry, result))
  return result
}

function stringArray(value: unknown, at: string, errors: string[]): string[] | undefined {
  if (value == null) return undefined
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    errors.push(`${at} must be an array of non-empty strings.`)
    return undefined
  }
  return [...new Set(value.map((entry) => String(entry).trim()))]
}

function optionalString(value: unknown, at: string, errors: string[]): string | undefined {
  if (value == null || value === '') return undefined
  if (typeof value !== 'string') {
    errors.push(`${at} must be a string.`)
    return undefined
  }
  return value.trim()
}

export function parsePlannerTaskBundle(input: unknown): PlannerTaskBundle {
  const errors: string[] = []
  if (!isObject(input)) throw new Error('This is not a planner task bundle: the JSON root must be an object.')
  if (input.format !== 'planner-task-bundle') errors.push('format must be "planner-task-bundle".')
  if (input.version !== 1) errors.push('Only planner task bundle version 1 is supported.')
  const bundleId = typeof input.bundleId === 'string' ? input.bundleId.trim() : ''
  if (!ID_PATTERN.test(bundleId)) errors.push('bundleId must be a stable lower-case ID between 2 and 120 characters.')
  const generatedAt = typeof input.generatedAt === 'string' ? input.generatedAt : ''
  if (!TIMESTAMP_PATTERN.test(generatedAt) || Number.isNaN(Date.parse(generatedAt))) errors.push('generatedAt must include a valid date, time, and timezone.')

  const source = isObject(input.source) ? input.source : {}
  const projectId = typeof source.projectId === 'string' ? source.projectId.trim() : ''
  const projectName = typeof source.projectName === 'string' ? source.projectName.trim() : ''
  if (!ID_PATTERN.test(projectId)) errors.push('source.projectId must be a stable lower-case ID.')
  if (!projectName) errors.push('source.projectName is required.')
  const revision = optionalString(source.revision, 'source.revision', errors)

  const rawItems = Array.isArray(input.items) ? input.items : []
  if (!Array.isArray(input.items)) errors.push('items must be an array.')
  if (rawItems.length > 500) errors.push('A bundle may contain at most 500 tasks.')
  const seen = new Set<string>()
  const items: PlannerTaskBundleItem[] = []

  rawItems.forEach((rawItem, index) => {
    const at = `items[${index}]`
    if (!isObject(rawItem)) {
      errors.push(`${at} must be an object.`)
      return
    }
    const externalId = typeof rawItem.externalId === 'string' ? rawItem.externalId.trim() : ''
    const title = typeof rawItem.title === 'string' ? rawItem.title.trim() : ''
    if (!ID_PATTERN.test(externalId)) errors.push(`${at}.externalId must be a stable lower-case ID.`)
    else if (seen.has(externalId)) errors.push(`${at}.externalId duplicates "${externalId}".`)
    else seen.add(externalId)
    if (!title) errors.push(`${at}.title is required.`)
    else if (title.length > 180) errors.push(`${at}.title must be 180 characters or fewer.`)
    if (!KINDS.includes(rawItem.kind as TaskKind)) errors.push(`${at}.kind must be task, follow_up, or email.`)
    if (!PRIORITIES.includes(rawItem.priority as (typeof PRIORITIES)[number])) errors.push(`${at}.priority must be low, medium, or high.`)

    const dueOn = rawItem.dueOn == null ? undefined : String(rawItem.dueOn)
    if (dueOn && !isValidDateOnly(dueOn)) errors.push(`${at}.dueOn must be a real YYYY-MM-DD date.`)
    const scheduledFor = rawItem.scheduledFor == null ? undefined : String(rawItem.scheduledFor)
    if (scheduledFor && (!TIMESTAMP_PATTERN.test(scheduledFor) || Number.isNaN(Date.parse(scheduledFor)))) errors.push(`${at}.scheduledFor must include an explicit timezone.`)
    const notes = optionalString(rawItem.notes, `${at}.notes`, errors)
    const tip = optionalString(rawItem.tip, `${at}.tip`, errors)
    const tags = stringArray(rawItem.tags, `${at}.tags`, errors)
    const sourceRefs = stringArray(rawItem.sourceRefs, `${at}.sourceRefs`, errors)
    if (sourceRefs?.some((reference) => /^(?:[A-Za-z]:\\|\/)/.test(reference))) errors.push(`${at}.sourceRefs must use project-relative references.`)

    items.push({
      externalId,
      title,
      kind: rawItem.kind as TaskKind,
      priority: rawItem.priority as PlannerTaskBundleItem['priority'],
      ...(notes ? { notes } : {}),
      ...(tip ? { tip } : {}),
      ...(dueOn ? { dueOn } : {}),
      ...(scheduledFor ? { scheduledFor } : {}),
      ...(tags ? { tags } : {}),
      ...(sourceRefs ? { sourceRefs } : {}),
    })
  })

  const destination = isObject(input.destinationHint) ? input.destinationHint : undefined
  const destinationId = optionalString(destination?.id, 'destinationHint.id', errors)
  const destinationName = optionalString(destination?.name, 'destinationHint.name', errors)
  if (collectStrings(input).some((value) => SECRET_PATTERNS.some((pattern) => pattern.test(value)))) errors.push('This file appears to contain a credential or private key. Remove it before importing.')
  if (errors.length) throw new Error(errors.slice(0, 8).join(' '))
  return {
    format: 'planner-task-bundle',
    version: 1,
    bundleId,
    generatedAt,
    source: { projectId, projectName, ...(revision ? { revision } : {}) },
    ...((destinationId || destinationName) ? { destinationHint: { ...(destinationId ? { id: destinationId } : {}), ...(destinationName ? { name: destinationName } : {}) } } : {}),
    items,
  }
}

export function suggestedWorkplace(bundle: PlannerTaskBundle, workplaces: WorkplaceConfig[]): WorkplaceId | undefined {
  const hintId = bundle.destinationHint?.id?.toLowerCase()
  const hintName = bundle.destinationHint?.name?.toLowerCase()
  return workplaces.find((workplace) => workplace.id.toLowerCase() === hintId || workplace.name.toLowerCase() === hintName || workplace.shortName.toLowerCase() === hintName)?.id
}

function sourceId(bundleId: string, externalId: string): string {
  return `bundle:${bundleId}:${externalId}`
}

function composeNotes(item: PlannerTaskBundleItem): string {
  const refs = item.sourceRefs?.length ? `Project references: ${item.sourceRefs.join(', ')}` : ''
  return [item.notes?.trim(), refs].filter(Boolean).join('\n\n')
}

function plannedTask(item: PlannerTaskBundleItem, bundle: PlannerTaskBundle, workplace: WorkplaceId, workplaces: WorkplaceConfig[]): PlannedTask {
  const scheduledFor = item.scheduledFor ? new Date(item.scheduledFor).toISOString() : null
  const draft = makeTask(item.title, {
    workplace,
    notes: composeNotes(item),
    kind: item.kind,
    startPriority: item.priority,
    dueAt: dateOnlyToIso(item.dueOn) ?? scheduledFor,
    scheduledFor,
    source: 'import',
    sourceId: sourceId(bundle.bundleId, item.externalId),
    tags: item.tags ?? [],
    ...(item.tip ? { tip: item.tip } : {}),
  }, workplaces)
  return {
    sourceId: draft.sourceId!,
    sourceRefs: item.sourceRefs ?? [],
    snapshot: {
      title: draft.title,
      notes: draft.notes,
      workplace: draft.workplace,
      kind: draft.kind,
      startPriority: draft.startPriority,
      dueAt: draft.dueAt,
      scheduledFor: draft.scheduledFor,
      tags: draft.tags,
      tip: draft.tip,
    },
  }
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function applyPlannedTask(existing: Task, plan: PlannedTask, bundle: PlannerTaskBundle, now: string): { task: Task; changed: boolean; preservedEdits: number } {
  const previous = existing.importMeta?.managed
  const next = { ...existing, tags: [...existing.tags] }
  let changed = false
  let preservedEdits = 0
  const fields: Array<keyof ImportedTaskSnapshot> = ['title', 'notes', 'workplace', 'kind', 'startPriority', 'dueAt', 'scheduledFor', 'tags', 'tip']
  for (const field of fields) {
    const currentValue = existing[field]
    const incomingValue = plan.snapshot[field]
    const previousValue = previous?.[field]
    if (previous && !equal(currentValue, previousValue) && !equal(currentValue, incomingValue)) {
      preservedEdits += 1
      continue
    }
    if (!equal(currentValue, incomingValue)) {
      ;(next as unknown as Record<string, unknown>)[field] = Array.isArray(incomingValue) ? [...incomingValue] : incomingValue
      changed = true
    }
  }

  if (next.kind === 'task') next.followUp = null
  else {
    const channel = next.kind === 'email' || /\bemail\b/i.test(next.title) ? 'email' : /\bcall|phone\b/i.test(next.title) ? 'call' : 'meeting'
    next.followUp = {
      contact: existing.followUp?.contact ?? '',
      channel,
      nextDate: next.scheduledFor,
      outcome: existing.followUp?.outcome ?? '',
    }
  }
  next.source = 'import'
  next.sourceId = plan.sourceId
  next.importMeta = {
    bundleId: bundle.bundleId,
    externalId: plan.sourceId.slice(`bundle:${bundle.bundleId}:`.length),
    sourceProjectId: bundle.source.projectId,
    sourceProjectName: bundle.source.projectName,
    importedAt: now,
    sourceRefs: [...plan.sourceRefs],
    managed: { ...plan.snapshot, tags: [...plan.snapshot.tags] },
  }
  if (changed) next.updatedAt = now
  return { task: next, changed, preservedEdits }
}

function analyze(data: WorkspaceData, bundle: PlannerTaskBundle, workplace: WorkplaceId, apply: boolean): { data: WorkspaceData; preview: ImportPreview } {
  const now = new Date().toISOString()
  const tasks = [...data.tasks]
  const items: ImportPreviewItem[] = []
  let added = 0
  let updated = 0
  let unchanged = 0
  let preservedEdits = 0
  let scheduled = 0

  for (const item of bundle.items) {
    const plan = plannedTask(item, bundle, workplace, data.workplaces)
    const index = tasks.findIndex((task) => task.source === 'import' && task.sourceId === plan.sourceId)
    if (plan.snapshot.scheduledFor) scheduled += 1
    if (index < 0) {
      added += 1
      items.push({ externalId: item.externalId, title: item.title, action: 'add', scheduled: Boolean(plan.snapshot.scheduledFor), preservedEdits: 0 })
      if (apply) {
        const task = makeTask(item.title, {
          ...plan.snapshot,
          source: 'import',
          sourceId: plan.sourceId,
          importMeta: {
            bundleId: bundle.bundleId,
            externalId: item.externalId,
            sourceProjectId: bundle.source.projectId,
            sourceProjectName: bundle.source.projectName,
            importedAt: now,
            sourceRefs: [...plan.sourceRefs],
            managed: { ...plan.snapshot, tags: [...plan.snapshot.tags] },
          },
        }, data.workplaces)
        tasks.unshift(task)
      }
      continue
    }
    const result = applyPlannedTask(tasks[index], plan, bundle, now)
    const action: ImportAction = result.changed ? 'update' : 'unchanged'
    if (action === 'update') updated += 1
    else unchanged += 1
    preservedEdits += result.preservedEdits
    items.push({ externalId: item.externalId, title: item.title, action, scheduled: Boolean(plan.snapshot.scheduledFor), preservedEdits: result.preservedEdits })
    if (apply) tasks[index] = result.task
  }

  return {
    data: apply ? { ...data, tasks, updatedAt: now } : data,
    preview: { added, updated, unchanged, preservedEdits, scheduled, items },
  }
}

export function previewTaskBundle(data: WorkspaceData, bundle: PlannerTaskBundle, workplace: WorkplaceId): ImportPreview {
  return analyze(data, bundle, workplace, false).preview
}

export function mergeTaskBundle(data: WorkspaceData, bundle: PlannerTaskBundle, workplace: WorkplaceId): { data: WorkspaceData; summary: ImportSummary } {
  const result = analyze(data, bundle, workplace, true)
  const { items: _items, ...summary } = result.preview
  return { data: result.data, summary }
}
