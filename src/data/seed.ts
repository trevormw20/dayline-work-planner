import type { WorkspaceData } from '../types'
import { addDays, startOfWeek, toDateKey } from '../lib/dates'
import { DEFAULT_WORKPLACES, emptyWorkspace, makeTask } from '../lib/workspace'

function at(date: Date, hour: number, minute = 0): string {
  const result = new Date(date)
  result.setHours(hour, minute, 0, 0)
  return result.toISOString()
}

export function demoWorkspace(now = new Date()): WorkspaceData {
  const base = emptyWorkspace()
  const yesterday = addDays(now, -1)
  const tomorrow = addDays(now, 1)
  const friday = addDays(startOfWeek(now), 4)
  const lastWeek = addDays(startOfWeek(now), -7)

  const tasks = [
    makeTask('Review Google Ads call agenda', {
      id: 'demo_google_ads',
      workplace: 'hidermatology',
      kind: 'follow_up',
      startPriority: 'high',
      createdAt: addDays(now, -5).toISOString(),
      dueAt: at(yesterday, 15),
      scheduledFor: at(now, 9, 30),
      followUp: { contact: 'Google Ads support', channel: 'call', nextDate: at(now, 9, 30), outcome: '' },
      notes: 'Confirm conversion tracking and agree on the next campaign test.',
      tip: 'Write down the one decision you need from the call, then send the agenda before dialing.',
    }, DEFAULT_WORKPLACES),
    makeTask('Approve clinic social posts', {
      id: 'demo_social',
      workplace: 'hidermatology',
      startPriority: 'medium',
      scheduledFor: at(now, 11),
      dueAt: at(now, 12),
      tags: ['content'],
    }, DEFAULT_WORKPLACES),
    makeTask('Check Soleivar inventory reorder levels', {
      id: 'demo_inventory',
      workplace: 'soleivar',
      startPriority: 'medium',
      scheduledFor: at(now, 13, 30),
      dueAt: at(tomorrow, 17),
      tags: ['operations'],
    }, DEFAULT_WORKPLACES),
    makeTask('Reply to web designer with final copy', {
      id: 'demo_email',
      workplace: 'soleivar',
      kind: 'email',
      source: 'gmail',
      sourceId: 'demo_message_1',
      startPriority: 'low',
      createdAt: at(now, 7, 42),
      dueAt: at(friday, 15),
      tip: 'Answer the open questions in bullets, attach the approved copy, and ask for a clear publish date.',
    }, DEFAULT_WORKPLACES),
    makeTask('Update August expense notes', {
      id: 'demo_expenses',
      workplace: 'hidermatology',
      startPriority: 'low',
      createdAt: addDays(now, -8).toISOString(),
      dueAt: null,
      scheduledFor: at(friday, 10),
      tags: ['admin'],
    }, DEFAULT_WORKPLACES),
    makeTask('Choose today’s three wins', {
      id: 'demo_daily',
      workplace: 'hidermatology',
      source: 'daily',
      dailyKey: toDateKey(now),
      startPriority: 'medium',
      scheduledFor: at(now, 8, 30),
      dueAt: at(now, 9),
      notes: 'Pick one must-do, one progress task, and one quick win.',
    }, DEFAULT_WORKPLACES),
  ]

  const doneOne = makeTask('Publish updated clinic FAQ', {
    id: 'demo_done_1',
    workplace: 'hidermatology',
    status: 'done',
    completedAt: addDays(now, -2).toISOString(),
  })
  const doneTwo = makeTask('Confirm Soleivar packaging order', {
    id: 'demo_done_2',
    workplace: 'soleivar',
    status: 'done',
    completedAt: addDays(now, -1).toISOString(),
  })

  return {
    ...base,
    tasks: [...tasks, doneOne, doneTwo],
    briefs: [
      {
        date: toDateKey(now),
        summary:
          'Start with the Google Ads call while the overdue context is fresh, then approve the clinic posts before noon. The Soleivar inventory check is the best afternoon focus; keep email contained to one short pass after that.',
        focusTaskIds: ['demo_google_ads', 'demo_social', 'demo_inventory'],
        generatedAt: at(now, 6, 30),
      },
    ],
    reports: [
      {
        id: toDateKey(lastWeek),
        weekStart: lastWeek.toISOString(),
        weekEnd: addDays(lastWeek, 6).toISOString(),
        createdAt: addDays(lastWeek, 7).toISOString(),
        completedTaskIds: ['report_a', 'report_b', 'report_c', 'report_d', 'report_e', 'report_f', 'report_g'],
        byWorkplace: { hidermatology: 5, soleivar: 2 },
        summary:
          'Completed 7 items across both businesses. The strongest progress was the clinic FAQ launch and the Soleivar packaging approval; two marketing follow-ups rolled into this week.',
      },
    ],
    gmail: { lastSyncAt: at(now, 7, 45), processedMessageIds: ['demo_message_1'] },
  }
}
