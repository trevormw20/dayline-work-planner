#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { parseProjectSubmission } from '../src/lib/projectInbox.ts'

// Node 24 can run this TypeScript validator directly, with no build or API key.
const args = process.argv.slice(2)
const file = args.find((arg) => !arg.startsWith('--'))
if (!file) {
  console.error('Usage: node scripts/submit-project-task.mjs <file.json> [--check]')
  process.exit(1)
}
try {
  const submission = parseProjectSubmission(JSON.parse(await readFile(file, 'utf8')))
  const filename = `${submission.projectId}--${submission.submissionId}.json`
  const repository = process.env.DAYLINE_DATA_REPO || 'trevormw20/dayline-data'
  const branch = process.env.DAYLINE_DATA_BRANCH || 'main'
  const path = `task-inbox/${filename}`
  console.log(`Validated: ${submission.projectName} — ${submission.title} (${submission.subtasks.length} steps)`)
  if (!args.includes('--check')) {
    const base = `repos/${repository}/contents/${path}`
    const gh = (command, input) => execFileSync('gh', command, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let sha
    try {
      const result = JSON.parse(gh(['api', `${base}?ref=${encodeURIComponent(branch)}`]))
      sha = result.sha
    } catch (error) {
      if (!String(error.stderr).includes('404')) throw error
    }
    const payload = { message: `dayline: submit ${filename}`, branch, content: Buffer.from(`${JSON.stringify(submission, null, 2)}\n`).toString('base64'), ...(sha ? { sha } : {}) }
    gh(['api', base, '--method', 'PUT', '--input', '-'], JSON.stringify(payload))
    console.log(`Submitted to ${repository}/${path}. Open Dayline or press Sync to import.`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Submission failed.')
  process.exitCode = 1
}
