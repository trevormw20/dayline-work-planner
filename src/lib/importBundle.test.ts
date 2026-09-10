import { describe, expect, it } from 'vitest'
import { emptyWorkspace, updateTask } from './workspace'
import { mergeTaskBundle, parsePlannerTaskBundle, previewTaskBundle, suggestedWorkplace } from './importBundle'

function bundle(overrides: Record<string, unknown> = {}) {
  return parsePlannerTaskBundle({
    format: 'planner-task-bundle',
    version: 1,
    bundleId: 'quadro-release-plan',
    generatedAt: '2026-09-02T16:00:00.000Z',
    source: { projectId: 'quadro', projectName: 'Quadro' },
    destinationHint: { name: 'Soleivar' },
    items: [
      {
        externalId: 'demo/smoke-test',
        title: 'Smoke-test the demo',
        notes: 'Verify launch and save/load.',
        kind: 'task',
        priority: 'high',
        dueOn: '2026-10-05',
        tags: ['demo'],
        sourceRefs: ['README.md#demo'],
      },
      {
        externalId: 'press/follow-up',
        title: 'Email press-preview contacts',
        kind: 'email',
        priority: 'medium',
        scheduledFor: '2026-10-08T09:00:00-06:00',
      },
    ],
    ...overrides,
  })
}

describe('planner task bundle parsing', () => {
  it('rejects unsupported files and unsafe timestamps', () => {
    expect(() => parsePlannerTaskBundle({ version: 1 })).toThrow('format must be')
    expect(() => bundle({ generatedAt: 'tomorrow' })).toThrow('generatedAt')
  })

  it('rejects credentials instead of storing them in planner data', () => {
    expect(() => bundle({ source: { projectId: 'quadro', projectName: 'github_pat_abcdefghijklmnopqrstuvwxyz1234567890' } })).toThrow('credential')
  })
})

describe('planner task bundle import', () => {
  it('suggests the matching workplace and previews additions', () => {
    const data = emptyWorkspace()
    const parsed = bundle()
    expect(suggestedWorkplace(parsed, data.workplaces)).toBe('soleivar')
    expect(previewTaskBundle(data, parsed, 'soleivar')).toMatchObject({ added: 2, updated: 0, scheduled: 1 })
  })

  it('adds scheduled work and reimports without duplicates', () => {
    const data = emptyWorkspace()
    const parsed = bundle()
    const first = mergeTaskBundle(data, parsed, 'soleivar')
    expect(first.summary).toMatchObject({ added: 2, updated: 0, unchanged: 0 })
    expect(first.data.tasks).toHaveLength(2)
    expect(first.data.tasks.find((task) => task.kind === 'email')?.scheduledFor).toBe('2026-10-08T15:00:00.000Z')
    expect(first.data.tasks.find((task) => task.title.includes('Smoke-test'))?.notes).toContain('README.md#demo')

    const second = mergeTaskBundle(first.data, parsed, 'soleivar')
    expect(second.summary).toMatchObject({ added: 0, updated: 0, unchanged: 2 })
    expect(second.data.tasks).toHaveLength(2)
  })

  it('updates source fields while preserving completion and manual overrides', () => {
    const first = mergeTaskBundle(emptyWorkspace(), bundle(), 'soleivar').data
    const imported = first.tasks.find((task) => task.sourceId?.endsWith('demo/smoke-test'))!
    const completed = updateTask(first, imported.id, {
      status: 'done',
      completedAt: '2026-09-03T00:00:00.000Z',
      priorityOverride: 'urgent',
    })
    const changed = bundle({
      items: [{
        externalId: 'demo/smoke-test',
        title: 'Smoke-test the final demo',
        kind: 'task',
        priority: 'medium',
        dueOn: '2026-10-06',
      }],
    })
    const result = mergeTaskBundle(completed, changed, 'soleivar')
    const task = result.data.tasks.find((item) => item.id === imported.id)!
    expect(task.title).toBe('Smoke-test the final demo')
    expect(task.status).toBe('done')
    expect(task.completedAt).toBe('2026-09-03T00:00:00.000Z')
    expect(task.priorityOverride).toBe('urgent')
    expect(result.summary.updated).toBe(1)
  })

  it('preserves a manually edited imported field during a later update', () => {
    const first = mergeTaskBundle(emptyWorkspace(), bundle(), 'soleivar').data
    const imported = first.tasks.find((task) => task.sourceId?.endsWith('demo/smoke-test'))!
    const edited = updateTask(first, imported.id, { title: 'My custom smoke-test wording' })
    const changed = bundle({
      items: [{
        externalId: 'demo/smoke-test',
        title: 'New source wording',
        kind: 'task',
        priority: 'medium',
      }],
    })
    const result = mergeTaskBundle(edited, changed, 'soleivar')
    const task = result.data.tasks.find((item) => item.id === imported.id)!
    expect(task.title).toBe('My custom smoke-test wording')
    expect(result.summary.preservedEdits).toBeGreaterThan(0)
  })

  it('does not delete work omitted by a later bundle', () => {
    const first = mergeTaskBundle(emptyWorkspace(), bundle(), 'soleivar').data
    const later = mergeTaskBundle(first, bundle({ items: [] }), 'soleivar').data
    expect(later.tasks).toHaveLength(2)
  })
})
