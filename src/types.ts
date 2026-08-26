export type WorkplaceId = 'hidermatology' | 'soleivar'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'open' | 'done' | 'snoozed'
export type TaskKind = 'task' | 'follow_up' | 'email'
export type SourceType = 'manual' | 'gmail' | 'daily' | 'import'

export interface FollowUp {
  contact: string
  channel: 'call' | 'email' | 'meeting'
  nextDate: string | null
  outcome: string
}

export interface Task {
  id: string
  title: string
  notes: string
  workplace: WorkplaceId
  kind: TaskKind
  status: TaskStatus
  startPriority: Exclude<Priority, 'urgent'>
  priorityOverride: Priority | null
  createdAt: string
  updatedAt: string
  dueAt: string | null
  scheduledFor: string | null
  completedAt: string | null
  snoozedUntil: string | null
  followUp: FollowUp | null
  source: SourceType
  sourceId: string | null
  tags: string[]
  tip: string
  dailyKey?: string
}

export interface AiBrief {
  date: string
  summary: string
  focusTaskIds: string[]
  generatedAt: string
}

export interface WeeklyReport {
  id: string
  weekStart: string
  weekEnd: string
  createdAt: string
  completedTaskIds: string[]
  summary: string
  byWorkplace: Record<WorkplaceId, number>
}

export interface WorkplaceConfig {
  id: WorkplaceId
  name: string
  shortName: string
  color: string
  keywords: string[]
}

export interface WorkspaceData {
  version: 1
  updatedAt: string
  tasks: Task[]
  briefs: AiBrief[]
  reports: WeeklyReport[]
  workplaces: WorkplaceConfig[]
  gmail: {
    lastSyncAt: string | null
    processedMessageIds: string[]
  }
}

export interface GitHubConnection {
  owner: string
  repo: string
  branch: string
  path: string
  token: string
  rememberToken: boolean
}

export type ViewId = 'today' | 'inbox' | 'schedule' | 'reports' | 'settings'
export type WorkplaceFilter = 'all' | WorkplaceId
