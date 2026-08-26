import { describe, expect, it } from 'vitest'
import { getEffectivePriority } from './priority'
import { emptyWorkspace, inferTaskKind, inferWorkplace, makeTask, mergeWorkspaces } from './workspace'

const now = new Date('2026-08-26T16:00:00.000Z')

describe('priority aging', () => {
  it('moves a low priority task to medium after three overdue days', () => {
    const task = makeTask('Review the draft', {
      startPriority: 'low',
      createdAt: '2026-08-01T16:00:00.000Z',
      dueAt: '2026-08-23T16:00:00.000Z',
    })
    expect(getEffectivePriority(task, now).priority).toBe('medium')
  })

  it('moves a high priority task to urgent after three overdue days', () => {
    const task = makeTask('Call the vendor', {
      startPriority: 'high',
      createdAt: '2026-08-01T16:00:00.000Z',
      dueAt: '2026-08-20T16:00:00.000Z',
    })
    expect(getEffectivePriority(task, now).priority).toBe('urgent')
  })
})

describe('task inference', () => {
  it('recognizes follow-ups and business keywords', () => {
    expect(inferTaskKind('Schedule a call with Google Ads')).toBe('follow_up')
    expect(inferWorkplace('Check Soleivar inventory and shipping')).toBe('soleivar')
    expect(makeTask('Schedule a call with Google Ads').followUp?.channel).toBe('call')
  })
})

describe('workspace conflicts', () => {
  it('keeps the newest version of a task', () => {
    const first = makeTask('A', { id: 'same', updatedAt: '2026-08-20T00:00:00.000Z' })
    const latest = { ...first, title: 'Updated', updatedAt: '2026-08-21T00:00:00.000Z' }
    const remote = { ...emptyWorkspace(), tasks: [first] }
    const local = { ...emptyWorkspace(), tasks: [latest] }
    expect(mergeWorkspaces(local, remote).tasks[0].title).toBe('Updated')
  })
})
