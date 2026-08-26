#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const DAY = 86_400_000
const timezone = process.env.DAYLINE_TIMEZONE || 'America/Denver'
const githubRepository = process.env.DAYLINE_DATA_REPO || process.env.GITHUB_REPOSITORY || ''
const githubToken = process.env.DAYLINE_DATA_TOKEN || process.env.GITHUB_TOKEN || ''
const githubBranch = process.env.DAYLINE_DATA_BRANCH || process.env.GITHUB_REF_NAME || 'main'
const workspacePath = process.env.DAYLINE_DATA_PATH || 'data/workspace.json'
const localPath = resolve(process.cwd(), workspacePath)
const now = new Date()

const defaultWorkplaces = [
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

function emptyWorkspace() {
  return {
    version: 1,
    updatedAt: now.toISOString(),
    tasks: [],
    briefs: [],
    reports: [],
    workplaces: defaultWorkplaces,
    gmail: { lastSyncAt: null, processedMessageIds: [] },
  }
}

function normalizeWorkspace(value) {
  const fallback = emptyWorkspace()
  if (!value || typeof value !== 'object') return fallback
  return {
    ...fallback,
    ...value,
    tasks: Array.isArray(value.tasks) ? value.tasks : [],
    briefs: Array.isArray(value.briefs) ? value.briefs : [],
    reports: Array.isArray(value.reports) ? value.reports : [],
    workplaces: Array.isArray(value.workplaces) && value.workplaces.length ? value.workplaces : defaultWorkplaces,
    gmail: { ...fallback.gmail, ...(value.gmail || {}) },
  }
}

function encodeBase64(text) {
  return Buffer.from(text, 'utf8').toString('base64')
}

function githubEndpoint() {
  const path = workspacePath.split('/').map(encodeURIComponent).join('/')
  return `https://api.github.com/repos/${githubRepository}/contents/${path}`
}

function githubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${githubToken}`,
    'X-GitHub-Api-Version': '2026-03-10',
  }
}

async function readWorkspace() {
  if (githubRepository && githubToken) {
    const url = new URL(githubEndpoint())
    url.searchParams.set('ref', githubBranch)
    const response = await fetch(url, { headers: githubHeaders() })
    if (response.status === 404) return { data: emptyWorkspace(), sha: undefined, remote: true }
    if (!response.ok) throw new Error(`GitHub read failed (${response.status}): ${await response.text()}`)
    const result = await response.json()
    return {
      data: normalizeWorkspace(JSON.parse(Buffer.from(result.content.replace(/\n/g, ''), 'base64').toString('utf8'))),
      sha: result.sha,
      remote: true,
    }
  }

  try {
    return { data: normalizeWorkspace(JSON.parse(await readFile(localPath, 'utf8'))), sha: undefined, remote: false }
  } catch (error) {
    if (error?.code === 'ENOENT') return { data: emptyWorkspace(), sha: undefined, remote: false }
    throw error
  }
}

async function writeWorkspace(data, sha, remote) {
  data.updatedAt = now.toISOString()
  const content = `${JSON.stringify(data, null, 2)}\n`
  if (!remote) {
    await mkdir(dirname(localPath), { recursive: true })
    await writeFile(localPath, content, 'utf8')
    return
  }

  const body = {
    message: `dayline: automated update ${localDateKey(now)}`,
    branch: githubBranch,
    content: encodeBase64(content),
    ...(sha ? { sha } : {}),
  }
  let response = await fetch(githubEndpoint(), {
    method: 'PUT',
    headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (response.status === 409) {
    const latest = await readWorkspace()
    body.sha = latest.sha
    body.content = encodeBase64(`${JSON.stringify(mergeWorkspace(latest.data, data), null, 2)}\n`)
    response = await fetch(githubEndpoint(), {
      method: 'PUT',
      headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
  if (!response.ok) throw new Error(`GitHub write failed (${response.status}): ${await response.text()}`)
}

function mergeWorkspace(remote, local) {
  const tasks = new Map()
  for (const task of [...remote.tasks, ...local.tasks]) {
    const current = tasks.get(task.id)
    if (!current || task.updatedAt > current.updatedAt) tasks.set(task.id, task)
  }
  return {
    ...remote,
    ...local,
    tasks: [...tasks.values()],
    briefs: [...new Map([...remote.briefs, ...local.briefs].map((brief) => [brief.date, brief])).values()],
    reports: [...new Map([...remote.reports, ...local.reports].map((report) => [report.id, report])).values()],
    gmail: {
      lastSyncAt: [remote.gmail.lastSyncAt, local.gmail.lastSyncAt].filter(Boolean).sort().at(-1) || null,
      processedMessageIds: [...new Set([...remote.gmail.processedMessageIds, ...local.gmail.processedMessageIds])].slice(-1000),
    },
  }
}

function localParts(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
}

function localDateKey(date) {
  const parts = localParts(date)
  return `${parts.year}-${parts.month}-${parts.day}`
}

function uid(prefix = 'task') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function inferWorkplace(text, workplaces) {
  const lower = text.toLowerCase()
  const scored = workplaces.map((workplace) => ({
    id: workplace.id,
    score: workplace.keywords.reduce((total, keyword) => total + (lower.includes(keyword.toLowerCase()) ? keyword.length : 0), 0),
  })).sort((a, b) => b.score - a.score)
  return scored[0]?.score > 0 ? scored[0].id : 'hidermatology'
}

function fallbackTip(title, kind) {
  if (kind === 'follow_up') return 'Decide the one outcome you need, open the contact details, and send the message or make the call before adding more notes.'
  if (/report|review|analy/i.test(title)) return 'Write the decision this should support, gather only the necessary inputs, and draft the conclusion first.'
  return 'Shrink this to the next visible action, set a 25-minute timer, and stop when that action is complete.'
}

function createTask(title, partial = {}, workplaces = defaultWorkplaces) {
  const createdAt = now.toISOString()
  const kind = partial.kind || (/\b(call|email|follow[ -]?up|contact|schedule|book|meeting)\b/i.test(title) ? 'follow_up' : 'task')
  return {
    id: partial.id || uid(),
    title: title.trim(),
    notes: partial.notes || '',
    workplace: partial.workplace || inferWorkplace(`${title} ${partial.notes || ''}`, workplaces),
    kind,
    status: 'open',
    startPriority: partial.startPriority || 'low',
    priorityOverride: null,
    createdAt,
    updatedAt: createdAt,
    dueAt: partial.dueAt || null,
    scheduledFor: partial.scheduledFor || null,
    completedAt: null,
    snoozedUntil: null,
    followUp: kind === 'follow_up' ? { contact: partial.contact || '', channel: partial.channel || 'email', nextDate: partial.dueAt || null, outcome: '' } : null,
    source: partial.source || 'manual',
    sourceId: partial.sourceId || null,
    tags: partial.tags || [],
    tip: partial.tip || fallbackTip(title, kind),
    ...(partial.dailyKey ? { dailyKey: partial.dailyKey } : {}),
  }
}

async function getGmailAccessToken() {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return null
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  if (!response.ok) throw new Error(`Gmail token refresh failed (${response.status}): ${await response.text()}`)
  return (await response.json()).access_token
}

function headerValue(message, name) {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || ''
}

async function fetchNewMessages(accessToken, processed) {
  const query = process.env.GMAIL_QUERY || 'is:unread newer_than:2d -category:promotions -category:social'
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
  listUrl.searchParams.set('q', query)
  listUrl.searchParams.set('maxResults', '25')
  const listResponse = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!listResponse.ok) throw new Error(`Gmail list failed (${listResponse.status}): ${await listResponse.text()}`)
  const listing = await listResponse.json()
  const ids = (listing.messages || []).map((message) => message.id).filter((id) => !processed.has(id))
  return Promise.all(ids.map(async (id) => {
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`)
    url.searchParams.set('format', 'metadata')
    for (const header of ['Subject', 'From', 'Date']) url.searchParams.append('metadataHeaders', header)
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!response.ok) throw new Error(`Gmail message read failed (${response.status}) for ${id}`)
    const message = await response.json()
    return { id, subject: headerValue(message, 'Subject') || '(No subject)', from: headerValue(message, 'From'), date: headerValue(message, 'Date'), snippet: message.snippet || '' }
  }))
}

function extractResponseText(response) {
  if (response.output_text) return response.output_text
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text)
    .join('')
}

async function openAiJson({ instructions, input, name, schema }) {
  if (!process.env.OPENAI_API_KEY) return null
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      store: false,
      instructions,
      input,
      text: { format: { type: 'json_schema', name, strict: true, schema } },
    }),
  })
  if (!response.ok) {
    console.warn(`OpenAI request failed (${response.status}); using the built-in fallback.`)
    return null
  }
  try {
    return JSON.parse(extractResponseText(await response))
  } catch {
    console.warn('OpenAI returned an unreadable response; using the built-in fallback.')
    return null
  }
}

async function triageMessages(messages, workplaces) {
  const result = await openAiJson({
    instructions:
      'You triage work email for two businesses. Create tasks only when the owner must do something. Ignore newsletters, receipts requiring no action, automated alerts, promotions, FYIs, and already-completed confirmations. Never copy medical details or names into a title. Titles must be short verb-first actions. Use the supplied workplace IDs. Tips must be one practical sentence.',
    input: JSON.stringify({ workplaces: workplaces.map(({ id, name, keywords }) => ({ id, name, keywords })), messages }),
    name: 'gmail_triage',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              messageId: { type: 'string' },
              actionable: { type: 'boolean' },
              title: { type: 'string' },
              workplace: { type: 'string', enum: workplaces.map((workplace) => workplace.id) },
              priority: { type: 'string', enum: ['low', 'medium', 'high'] },
              kind: { type: 'string', enum: ['task', 'follow_up', 'email'] },
              tip: { type: 'string' },
            },
            required: ['messageId', 'actionable', 'title', 'workplace', 'priority', 'kind', 'tip'],
          },
        },
      },
      required: ['items'],
    },
  })
  if (result) return result.items
  return messages.map((message) => ({
    messageId: message.id,
    actionable: !/newsletter|receipt|no.?reply|notification|digest|sale|promotion/i.test(`${message.subject} ${message.from}`),
    title: `Review email: ${message.subject}`,
    workplace: inferWorkplace(`${message.subject} ${message.from}`, workplaces),
    priority: /urgent|asap|today|action required/i.test(message.subject) ? 'high' : 'low',
    kind: 'email',
    tip: 'Open the email, identify the requested outcome, and answer in one focused pass.',
  }))
}

async function syncGmail(data) {
  const accessToken = await getGmailAccessToken()
  if (!accessToken) return { added: 0, checked: 0, touched: false }
  const processed = new Set(data.gmail.processedMessageIds)
  const messages = await fetchNewMessages(accessToken, processed)
  if (!messages.length) {
    data.gmail.lastSyncAt = now.toISOString()
    return { added: 0, checked: 0, touched: true }
  }
  const triage = await triageMessages(messages, data.workplaces)
  const messagesById = new Map(messages.map((message) => [message.id, message]))
  let added = 0
  for (const item of triage) {
    const message = messagesById.get(item.messageId)
    if (!message || !item.actionable) continue
    const from = message.from.replace(/<.*?>/, '').trim()
    data.tasks.unshift(createTask(item.title, {
      workplace: item.workplace,
      kind: item.kind,
      startPriority: item.priority,
      source: 'gmail',
      sourceId: message.id,
      notes: `From: ${from}\nOpen in Gmail: https://mail.google.com/mail/u/0/#inbox/${message.id}`,
      tip: item.tip,
      contact: from,
      channel: 'email',
    }, data.workplaces))
    added += 1
  }
  data.gmail.processedMessageIds = [...processed, ...messages.map((message) => message.id)].slice(-1000)
  data.gmail.lastSyncAt = now.toISOString()
  return { added, checked: messages.length, touched: true }
}

function ensureDailyTask(data) {
  const key = localDateKey(now)
  if (data.tasks.some((task) => task.dailyKey === key)) return false
  data.tasks.unshift(createTask('Choose today’s three wins', {
    workplace: 'hidermatology',
    startPriority: 'medium',
    source: 'daily',
    dailyKey: key,
    tags: ['daily reset'],
    notes: 'Pick one must-do, one progress task, and one quick win. Keep the list small enough to finish.',
    tip: 'Choose one must-do, one progress task, and one quick win. Everything else can wait until those are moving.',
  }, data.workplaces))
  return true
}

function taskPriority(task) {
  if (task.priorityOverride) return task.priorityOverride
  const rank = { low: 1, medium: 2, high: 3, urgent: 4 }
  const overdue = task.dueAt ? Math.max(0, Math.floor((now - new Date(task.dueAt)) / DAY)) : 0
  const age = Math.max(0, Math.floor((now - new Date(task.createdAt)) / DAY))
  const elapsed = task.dueAt ? overdue : age
  let score = rank[task.startPriority]
  if (task.startPriority === 'low') score += elapsed >= (task.dueAt ? 14 : 30) ? 3 : elapsed >= (task.dueAt ? 7 : 14) ? 2 : elapsed >= (task.dueAt ? 3 : 7) ? 1 : 0
  if (task.startPriority === 'medium') score += elapsed >= (task.dueAt ? 9 : 21) ? 2 : elapsed >= (task.dueAt ? 4 : 10) ? 1 : 0
  if (task.startPriority === 'high' && elapsed >= (task.dueAt ? 3 : 7)) score += 1
  return Object.entries(rank).find(([, value]) => value === Math.min(4, score))?.[0] || 'low'
}

async function ensureDailyBrief(data) {
  const key = localDateKey(now)
  const hour = Number(localParts(now).hour)
  if (hour < 6 || data.briefs.some((brief) => brief.date === key)) return false
  const active = data.tasks.filter((task) => task.status === 'open').map((task) => ({
    id: task.id,
    title: task.title,
    workplace: task.workplace,
    priority: taskPriority(task),
    dueAt: task.dueAt,
    scheduledFor: task.scheduledFor,
  })).sort((a, b) => ({ urgent: 4, high: 3, medium: 2, low: 1 }[b.priority] - { urgent: 4, high: 3, medium: 2, low: 1 }[a.priority]))
  let summary
  let focusTaskIds
  const result = await openAiJson({
    instructions: 'Write a calm morning work brief in one short paragraph, never more than 70 words. Choose no more than three task IDs. Lead with outcomes and protect focus; do not shame the user about overdue work.',
    input: JSON.stringify({ date: key, tasks: active.slice(0, 25) }),
    name: 'daily_brief',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string' },
        focusTaskIds: { type: 'array', maxItems: 3, items: { type: 'string' } },
      },
      required: ['summary', 'focusTaskIds'],
    },
  })
  if (result) {
    summary = result.summary
    focusTaskIds = result.focusTaskIds.filter((id) => active.some((task) => task.id === id)).slice(0, 3)
  } else {
    focusTaskIds = active.slice(0, 3).map((task) => task.id)
    summary = active.length
      ? `Begin with ${active.slice(0, 3).map((task) => `“${task.title}”`).join(', then ')}. Keep the first work block protected and move anything that does not support those outcomes out of today.`
      : 'Your board is clear. Capture one meaningful next step or enjoy the breathing room without creating busywork.'
  }
  data.briefs = [{ date: key, summary, focusTaskIds, generatedAt: now.toISOString() }, ...data.briefs].filter((brief) => now - new Date(brief.generatedAt) <= 31 * DAY)
  return true
}

function shiftDateKey(key, days) {
  const result = new Date(`${key}T12:00:00.000Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

function dateForReport(key) {
  return new Date(`${key}T12:00:00.000Z`)
}

function previousLocalWeek() {
  const parts = localParts(now)
  const dayIndex = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[parts.weekday]
  const currentKey = localDateKey(now)
  const currentWeekStart = shiftDateKey(currentKey, -dayIndex)
  const startKey = shiftDateKey(currentWeekStart, -7)
  const endKey = shiftDateKey(currentWeekStart, -1)
  return { startKey, endKey }
}

function maintainReportsAndRetention(data) {
  const cutoff = new Date(now - 31 * DAY)
  const { startKey, endKey } = previousLocalWeek()
  const reportId = startKey
  const completed = data.tasks.filter((task) => {
    if (!task.completedAt) return false
    const key = localDateKey(new Date(task.completedAt))
    return key >= startKey && key <= endKey
  })
  let reportAdded = false
  if (completed.length && !data.reports.some((report) => report.id === reportId)) {
    const byWorkplace = { hidermatology: 0, soleivar: 0 }
    for (const task of completed) byWorkplace[task.workplace] += 1
    data.reports.unshift({
      id: reportId,
      weekStart: dateForReport(startKey).toISOString(),
      weekEnd: dateForReport(endKey).toISOString(),
      createdAt: now.toISOString(),
      completedTaskIds: completed.map((task) => task.id),
      summary: `Completed ${completed.length} item${completed.length === 1 ? '' : 's'} across the week, including ${completed.slice(0, 4).map((task) => task.title).join(', ')}.`,
      byWorkplace,
    })
    reportAdded = true
  }
  const before = { reports: data.reports.length, tasks: data.tasks.length, briefs: data.briefs.length }
  data.reports = data.reports.filter((report) => new Date(report.createdAt) >= cutoff)
  data.briefs = data.briefs.filter((brief) => new Date(brief.generatedAt) >= cutoff)
  data.tasks = data.tasks.filter((task) => !task.completedAt || new Date(task.completedAt) >= cutoff)
  return reportAdded || before.reports !== data.reports.length || before.tasks !== data.tasks.length || before.briefs !== data.briefs.length
}

async function main() {
  const workspace = await readWorkspace()
  const data = workspace.data
  const maintenanceChanged = maintainReportsAndRetention(data)
  const dailyTaskAdded = ensureDailyTask(data)
  const gmail = await syncGmail(data)
  const briefAdded = await ensureDailyBrief(data)
  const changed = maintenanceChanged || dailyTaskAdded || briefAdded || gmail.touched
  if (changed) await writeWorkspace(data, workspace.sha, workspace.remote)
  console.log(`Dayline complete: ${gmail.checked} email(s) checked, ${gmail.added} task(s) added, daily task ${dailyTaskAdded ? 'created' : 'ready'}, brief ${briefAdded ? 'created' : 'ready'}.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
