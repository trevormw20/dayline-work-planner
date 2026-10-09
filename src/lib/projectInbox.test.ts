import { afterEach, describe, expect, it, vi } from 'vitest'
import { mergeProjectSubmission, parseProjectSubmission } from './projectInbox'
import { completeSubtask, emptyWorkspace, mergeWorkspaces } from './workspace'
import { readProjectInbox } from './github'

const raw = {
  format: 'dayline-project-task', version: 1, submissionId: '2026-10-09-fixes', projectId: 'count-on-chaos',
  projectName: 'Count on Chaos', submittedAt: '2026-10-09T09:00:00-06:00', title: 'October 9 modifications', workplace: 'soleivar',
  subtasks: [{ id: 'fix-restart', title: 'Fix restart' }, { id: 'playtest', title: 'Playtest and report feedback' }],
}
const submission = parseProjectSubmission(raw)
const imported = () => mergeProjectSubmission(emptyWorkspace(), submission, 'task-inbox/chaos.json', 'sha1', '2026-10-09T15:00:00Z')
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('project submissions', () => {
  it('creates exactly one parent with separate steps and avoids duplicate reads', () => {
    const data = imported()
    expect(data.tasks).toHaveLength(1)
    expect(data.tasks[0].subtasks).toHaveLength(2)
    expect(data.tasks[0].workplace).toBe('soleivar')
    expect(mergeProjectSubmission(data, submission, 'task-inbox/chaos.json', 'sha1')).toBe(data)
    expect(mergeProjectSubmission(data, submission, 'task-inbox/copy.json', 'sha2').tasks).toHaveLength(1)
  })
  it('completes and reopens the parent as checklist steps change', () => {
    const first = imported()
    const id = first.tasks[0].id
    const one = completeSubtask(first, id, 'fix-restart', true)
    expect(one.tasks[0].status).toBe('open')
    const done = completeSubtask(one, id, 'playtest', true)
    expect(done.tasks[0].status).toBe('done')
    expect(done.tasks[0].completedAt).toBeTruthy()
    expect(completeSubtask(done, id, 'playtest', false).tasks[0].status).toBe('open')
  })
  it('preserves edits and completions, appends new steps, and keeps removed steps', () => {
    const data = imported()
    data.tasks[0].title = 'My edited summary'
    data.tasks[0].subtasks![0].completedAt = '2026-10-09T15:01:00Z'
    const updated = parseProjectSubmission({ ...raw, title: 'Rewritten summary', subtasks: [{ id: 'fix-restart', title: 'Rewritten step' }, { id: 'new-test', title: 'Verify the new test' }] })
    const next = mergeProjectSubmission(data, updated, 'task-inbox/chaos.json', 'sha2')
    expect(next.tasks[0].title).toBe('My edited summary')
    expect(next.tasks[0].subtasks).toHaveLength(3)
    expect(next.tasks[0].subtasks![0].title).toBe('Fix restart')
    expect(next.tasks[0].subtasks![0].completedAt).toBeTruthy()
  })
  it('does not resurrect expired work even from a copied file', () => {
    const data = { ...imported(), tasks: [] }
    expect(mergeProjectSubmission(data, submission, 'task-inbox/copy.json', 'sha2').tasks).toHaveLength(0)
  })
  it('merges independent checkmarks from two devices', () => {
    vi.useFakeTimers()
    const data = imported()
    const id = data.tasks[0].id
    vi.setSystemTime(new Date('2026-10-09T15:01:00Z'))
    const desktop = completeSubtask(data, id, 'fix-restart', true)
    vi.setSystemTime(new Date('2026-10-09T15:02:00Z'))
    const phone = completeSubtask(data, id, 'playtest', true)
    const merged = mergeWorkspaces(desktop, phone)
    expect(merged.tasks[0].subtasks?.every((step) => step.completedAt)).toBe(true)
    expect(merged.tasks[0].status).toBe('done')
  })
  it('rejects duplicate step IDs and unknown versions', () => {
    expect(() => parseProjectSubmission({ ...raw, subtasks: [raw.subtasks[0], raw.subtasks[0]] })).toThrow('Duplicate')
    expect(() => parseProjectSubmission({ ...raw, version: 2 })).toThrow('version 1')
  })
  it('isolates malformed inbox files while importing valid files', async () => {
    const encode = (value: unknown) => btoa(JSON.stringify(value))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { type: 'file', name: 'bad.json', path: 'task-inbox/bad.json', sha: 'bad', size: 10 },
        { type: 'file', name: 'good.json', path: 'task-inbox/good.json', sha: 'good', size: 100 },
      ])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ encoding: 'base64', content: encode({ wrong: true }), sha: 'bad' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ encoding: 'base64', content: encode(raw), sha: 'good' })))
    vi.stubGlobal('fetch', fetchMock)
    const result = await readProjectInbox({ owner: 'owner', repo: 'vault', branch: 'main', path: 'data/workspace.json', token: 'example', rememberToken: false }, emptyWorkspace())
    expect(result.data.tasks).toHaveLength(1)
    expect(result.issues[0]).toContain('bad.json')
    expect(result.data.taskInbox?.['task-inbox/good.json'].sha).toBe('good')
    expect(result.data.taskInbox?.['task-inbox/bad.json']).toBeUndefined()
  })
})
