import {
  AlarmClock,
  Archive,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Cloud,
  CloudOff,
  ExternalLink,
  Github,
  Inbox,
  Lightbulb,
  ListTodo,
  LoaderCircle,
  Mail,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Tag,
  TimerReset,
  Trash2,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { useWorkspace } from './hooks/useWorkspace'
import {
  activeTasks,
  buildCurrentBrief,
  completeTask,
  makeTask,
  snoozeTask,
  updateTask,
} from './lib/workspace'
import {
  addDays,
  differenceInDays,
  endOfWeek,
  formatLongDate,
  formatRelativeDay,
  formatShortDate,
  formatTime,
  fromLocalInput,
  startOfWeek,
  toDateKey,
  toLocalInput,
} from './lib/dates'
import { getEffectivePriority, priorityLabel, sortTasks } from './lib/priority'
import type {
  GitHubConnection,
  Priority,
  Task,
  ViewId,
  WorkplaceFilter,
  WorkplaceId,
  WorkspaceData,
} from './types'

const NAV_ITEMS: Array<{ id: ViewId; label: string; icon: typeof ListTodo }> = [
  { id: 'today', label: 'Today', icon: ListTodo },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
]

function App() {
  const workspace = useWorkspace()
  const [view, setView] = useState<ViewId>('today')
  const [workplaceFilter, setWorkplaceFilter] = useState<WorkplaceFilter>('all')
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const newInboxCount = workspace.data.tasks.filter(
    (task) => task.source === 'gmail' && task.status === 'open' && differenceInDays(new Date(), new Date(task.createdAt)) <= 1,
  ).length

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).matches('input, textarea, select')) return
      if (event.key.toLowerCase() === 'n') setQuickAddOpen(true)
      if (event.key === '/') {
        event.preventDefault()
        setShowSearch(true)
      }
      if (event.key === 'Escape') {
        setQuickAddOpen(false)
        setEditingTask(null)
        setShowSearch(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const visibleData = useMemo(() => {
    if (workplaceFilter === 'all' && !search.trim()) return workspace.data
    const query = search.toLowerCase().trim()
    return {
      ...workspace.data,
      tasks: workspace.data.tasks.filter(
        (task) =>
          (workplaceFilter === 'all' || task.workplace === workplaceFilter) &&
          (!query || `${task.title} ${task.notes} ${task.tags.join(' ')}`.toLowerCase().includes(query)),
      ),
    }
  }, [workspace.data, workplaceFilter, search])

  const onComplete = (task: Task, completed: boolean) => {
    workspace.mutate((data) => completeTask(data, task.id, completed))
    setToast(completed ? 'Nice work — added to this week’s report' : 'Task moved back to your plan')
  }

  const onSnooze = (task: Task) => {
    workspace.mutate((data) => snoozeTask(data, task.id, addDays(new Date(), 1)))
    setToast('Snoozed until tomorrow')
  }

  const openView = (next: ViewId) => {
    setView(next)
    setMobileMenuOpen(false)
  }

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        onView={openView}
        newInboxCount={newInboxCount}
        mobileOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onAdd={() => setQuickAddOpen(true)}
      />

      <div className="main-shell">
        <Topbar
          filter={workplaceFilter}
          setFilter={setWorkplaceFilter}
          data={workspace.data}
          syncState={workspace.syncState}
          syncMessage={workspace.syncMessage}
          onRefresh={() => void workspace.refresh()}
          onMenu={() => setMobileMenuOpen(true)}
          showSearch={showSearch}
          setShowSearch={setShowSearch}
          search={search}
          setSearch={setSearch}
        />

        {workspace.isDemo && view !== 'settings' && (
          <DemoBanner onConnect={() => setView('settings')} />
        )}

        <main className="main-content">
          {view === 'today' && (
            <TodayView
              data={visibleData}
              fullData={workspace.data}
              onAdd={() => setQuickAddOpen(true)}
              onComplete={onComplete}
              onEdit={setEditingTask}
              onSnooze={onSnooze}
            />
          )}
          {view === 'inbox' && (
            <InboxView
              data={visibleData}
              isConnected={!workspace.isDemo}
              onComplete={onComplete}
              onEdit={setEditingTask}
              onSnooze={onSnooze}
              onSettings={() => setView('settings')}
            />
          )}
          {view === 'schedule' && (
            <ScheduleView
              data={visibleData}
              mutate={workspace.mutate}
              onComplete={onComplete}
              onEdit={setEditingTask}
            />
          )}
          {view === 'reports' && <ReportsView data={visibleData} />}
          {view === 'settings' && (
            <SettingsView
              data={workspace.data}
              connection={workspace.connection}
              syncMessage={workspace.syncMessage}
              syncState={workspace.syncState}
              onConnect={workspace.connect}
              onDisconnect={workspace.disconnect}
              onRefresh={() => void workspace.refresh()}
            />
          )}
        </main>
      </div>

      <MobileNav view={view} onView={openView} onAdd={() => setQuickAddOpen(true)} newInboxCount={newInboxCount} />

      {quickAddOpen && (
        <QuickAdd
          data={workspace.data}
          onClose={() => setQuickAddOpen(false)}
          onCreate={(tasks) => {
            workspace.mutate((data) => ({ ...data, updatedAt: new Date().toISOString(), tasks: [...tasks, ...data.tasks] }))
            setQuickAddOpen(false)
            setToast(`${tasks.length} task${tasks.length === 1 ? '' : 's'} added`)
          }}
        />
      )}

      {editingTask && (
        <TaskEditor
          task={workspace.data.tasks.find((task) => task.id === editingTask.id) || editingTask}
          onClose={() => setEditingTask(null)}
          onSave={(taskId, updates) => {
            workspace.mutate((data) => updateTask(data, taskId, updates))
            setEditingTask(null)
            setToast('Task updated')
          }}
          onArchive={(taskId) => {
            workspace.mutate((data) => updateTask(data, taskId, { status: 'done', completedAt: new Date().toISOString() }))
            setEditingTask(null)
            setToast('Task archived in this week’s report')
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </div>
  )
}

function Sidebar({
  view,
  onView,
  newInboxCount,
  mobileOpen,
  onClose,
  onAdd,
}: {
  view: ViewId
  onView: (view: ViewId) => void
  newInboxCount: number
  mobileOpen: boolean
  onClose: () => void
  onAdd: () => void
}) {
  return (
    <>
      {mobileOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={onClose} />}
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark">D</div>
          <div>
            <div className="brand-name">Dayline</div>
            <div className="brand-tagline">Work, kept in motion</div>
          </div>
          <button className="icon-button mobile-only" onClick={onClose} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <button className="new-task-button" onClick={onAdd}>
          <Plus size={18} />
          New task
          <kbd>N</kbd>
        </button>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={view === item.id ? 'active' : ''}
                onClick={() => onView(item.id)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                {item.id === 'inbox' && newInboxCount > 0 && <span className="nav-count">{newInboxCount}</span>}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-insight">
          <div className="insight-icon"><Sparkles size={17} /></div>
          <p>Protect the first hour.</p>
          <span>Start with an outcome, not your inbox.</span>
        </div>

        <div className="profile-row">
          <div className="profile-avatar">M</div>
          <div>
            <strong>My workspace</strong>
            <span>Private by design</span>
          </div>
          <MoreHorizontal size={18} />
        </div>
      </aside>
    </>
  )
}

function Topbar({
  filter,
  setFilter,
  data,
  syncState,
  syncMessage,
  onRefresh,
  onMenu,
  showSearch,
  setShowSearch,
  search,
  setSearch,
}: {
  filter: WorkplaceFilter
  setFilter: (filter: WorkplaceFilter) => void
  data: WorkspaceData
  syncState: string
  syncMessage: string
  onRefresh: () => void
  onMenu: () => void
  showSearch: boolean
  setShowSearch: (show: boolean) => void
  search: string
  setSearch: (search: string) => void
}) {
  return (
    <header className="topbar">
      <button className="icon-button menu-button" onClick={onMenu} aria-label="Open menu"><Menu size={21} /></button>
      {showSearch ? (
        <div className="search-field expanded">
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks and notes" autoFocus />
          <button className="bare-button" onClick={() => { setSearch(''); setShowSearch(false) }}><X size={17} /></button>
        </div>
      ) : (
        <div className="workspace-switcher">
          <span className="workspace-label">Workspace</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value as WorkplaceFilter)}>
            <option value="all">All work</option>
            {data.workplaces.map((workplace) => <option key={workplace.id} value={workplace.id}>{workplace.name}</option>)}
          </select>
          <ChevronDown size={15} />
        </div>
      )}
      <div className="topbar-actions">
        {!showSearch && <button className="icon-button hide-small" onClick={() => setShowSearch(true)} aria-label="Search"><Search size={19} /></button>}
        <button className={`sync-pill ${syncState}`} onClick={onRefresh} title={syncMessage}>
          {syncState === 'saving' || syncState === 'connecting' ? <LoaderCircle className="spin" size={15} /> : syncState === 'offline' || syncState === 'error' ? <CloudOff size={15} /> : <Cloud size={15} />}
          <span>{syncState === 'demo' ? 'Demo' : syncState === 'saving' ? 'Saving' : syncState === 'error' ? 'Sync issue' : syncState === 'offline' ? 'Offline' : 'Synced'}</span>
        </button>
        <button className="icon-button hide-small" aria-label="Help"><CircleHelp size={19} /></button>
      </div>
    </header>
  )
}

function DemoBanner({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="demo-banner">
      <WandSparkles size={17} />
      <span>You’re exploring a sample day. Connect a private GitHub repo when you’re ready to use your own work.</span>
      <button onClick={onConnect}>Connect GitHub <ArrowRight size={15} /></button>
    </div>
  )
}

function TodayView({
  data,
  fullData,
  onAdd,
  onComplete,
  onEdit,
  onSnooze,
}: {
  data: WorkspaceData
  fullData: WorkspaceData
  onAdd: () => void
  onComplete: (task: Task, completed: boolean) => void
  onEdit: (task: Task) => void
  onSnooze: (task: Task) => void
}) {
  const now = new Date()
  const tasks = activeTasks(data, now)
  const brief = fullData.briefs.find((item) => item.date === toDateKey(now))
  const focusIds = brief?.focusTaskIds || tasks.slice(0, 3).map((task) => task.id)
  const focusTasks = focusIds.map((id) => tasks.find((task) => task.id === id)).filter(Boolean) as Task[]
  const remaining = tasks.filter((task) => !focusIds.includes(task.id))
  const upNext = remaining.filter((task) => {
    const date = task.scheduledFor || task.dueAt
    return getEffectivePriority(task, now).score >= 3 || (date && differenceInDays(new Date(date), now) <= 2)
  })
  const later = remaining.filter((task) => !upNext.some((item) => item.id === task.id))
  const completedToday = data.tasks.filter((task) => task.completedAt && toDateKey(task.completedAt) === toDateKey(now)).length
  const overdue = tasks.filter((task) => getEffectivePriority(task, now).overdueDays > 0).length

  return (
    <div className="page today-page">
      <section className="page-heading today-heading">
        <div>
          <span className="eyebrow">{formatLongDate(now)}</span>
          <h1>Good morning. Let’s make today count.</h1>
          <p>{tasks.length ? `${tasks.length} open items, but only ${Math.min(3, focusTasks.length)} need your attention first.` : 'Your plan is clear. Enjoy the space you created.'}</p>
        </div>
        <button className="primary-button" onClick={onAdd}><Plus size={18} /> Add task</button>
      </section>

      <section className="daily-brief-card">
        <div className="brief-glow" />
        <div className="brief-label"><Sparkles size={16} /> Daily brief</div>
        <p>{brief?.summary || buildCurrentBrief(data, now)}</p>
        <div className="brief-footer">
          <span>{brief ? `Prepared ${formatTime(brief.generatedAt)}` : 'Live summary from your current plan'}</span>
          <span className="ai-badge">AI-ready</span>
        </div>
      </section>

      <section className="pulse-grid">
        <div className="pulse-card">
          <span className="pulse-icon coral"><Zap size={18} /></span>
          <div><strong>{overdue}</strong><span>need a decision</span></div>
        </div>
        <div className="pulse-card">
          <span className="pulse-icon green"><ListTodo size={18} /></span>
          <div><strong>{focusTasks.filter((task) => task.status !== 'done').length}</strong><span>in today’s focus</span></div>
        </div>
        <div className="pulse-card">
          <span className="pulse-icon blue"><CheckCircle2 size={18} /></span>
          <div><strong>{completedToday}</strong><span>finished today</span></div>
        </div>
      </section>

      <TaskSection
        title="Today’s focus"
        subtitle="A deliberately short list"
        tasks={focusTasks}
        empty="Your focus list is clear. Add one meaningful outcome for today."
        onComplete={onComplete}
        onEdit={onEdit}
        onSnooze={onSnooze}
        featured
      />
      {upNext.length > 0 && <TaskSection title="Up next" subtitle="Important, but not first" tasks={upNext} onComplete={onComplete} onEdit={onEdit} onSnooze={onSnooze} />}
      {later.length > 0 && <TaskSection title="Later" subtitle="Safe to leave here" tasks={later} onComplete={onComplete} onEdit={onEdit} onSnooze={onSnooze} collapsed />}
    </div>
  )
}

function TaskSection({
  title,
  subtitle,
  tasks,
  empty,
  onComplete,
  onEdit,
  onSnooze,
  featured = false,
  collapsed = false,
}: {
  title: string
  subtitle: string
  tasks: Task[]
  empty?: string
  onComplete: (task: Task, completed: boolean) => void
  onEdit: (task: Task) => void
  onSnooze: (task: Task) => void
  featured?: boolean
  collapsed?: boolean
}) {
  const [open, setOpen] = useState(!collapsed)
  return (
    <section className={`task-section ${featured ? 'featured' : ''}`}>
      <button className="section-title-row" onClick={() => collapsed && setOpen(!open)}>
        <span><h2>{title}</h2><p>{subtitle}</p></span>
        <span className="section-count">{tasks.length}</span>
        {collapsed && <ChevronDown className={open ? 'rotate' : ''} size={18} />}
      </button>
      {open && (
        <div className="task-list">
          {tasks.length ? tasks.map((task) => (
            <TaskRow key={task.id} task={task} onComplete={onComplete} onEdit={onEdit} onSnooze={onSnooze} />
          )) : <div className="empty-row"><CheckCircle2 size={22} /><span>{empty}</span></div>}
        </div>
      )}
    </section>
  )
}

function TaskRow({
  task,
  onComplete,
  onEdit,
  onSnooze,
  compact = false,
}: {
  task: Task
  onComplete: (task: Task, completed: boolean) => void
  onEdit: (task: Task) => void
  onSnooze: (task: Task) => void
  compact?: boolean
}) {
  const effective = getEffectivePriority(task)
  const date = task.scheduledFor || task.dueAt
  return (
    <article className={`task-row ${compact ? 'compact' : ''}`}>
      <button className="task-check" onClick={() => onComplete(task, task.status !== 'done')} aria-label={`Complete ${task.title}`}>
        {task.status === 'done' && <Check size={16} />}
      </button>
      <button className="task-main" onClick={() => onEdit(task)}>
        <span className="task-title-line">
          <strong>{task.title}</strong>
          {task.source === 'gmail' && <Mail size={14} aria-label="From Gmail" />}
          {task.kind === 'follow_up' && <AlarmClock size={14} aria-label="Follow-up" />}
        </span>
        <span className="task-meta">
          <span className={`priority-dot ${effective.priority}`} />
          <span className={`priority-text ${effective.priority}`}>{priorityLabel(effective.priority)}</span>
          <span className="meta-divider" />
          <span className={`workspace-dot ${task.workplace}`} />
          <span>{task.workplace === 'hidermatology' ? 'Hidermatology' : 'Soleivar'}</span>
          {date && <><span className="meta-divider" /><Clock3 size={13} /><span>{formatRelativeDay(date)}</span></>}
        </span>
      </button>
      {!compact && <span className={`aging-reason ${effective.overdueDays ? 'overdue' : ''}`}>{effective.reason}</span>}
      <button className="task-action" onClick={() => onSnooze(task)} title="Snooze until tomorrow" aria-label="Snooze until tomorrow"><TimerReset size={17} /></button>
    </article>
  )
}

function InboxView({
  data,
  isConnected,
  onComplete,
  onEdit,
  onSnooze,
  onSettings,
}: {
  data: WorkspaceData
  isConnected: boolean
  onComplete: (task: Task, completed: boolean) => void
  onEdit: (task: Task) => void
  onSnooze: (task: Task) => void
  onSettings: () => void
}) {
  const gmailTasks = data.tasks.filter((task) => task.source === 'gmail' && task.status === 'open').sort(sortTasks)
  const captured = data.tasks.filter((task) => task.source !== 'gmail' && task.status === 'open' && !task.scheduledFor).sort(sortTasks)
  return (
    <div className="page">
      <section className="page-heading">
        <div><span className="eyebrow">Triage, don’t collect</span><h1>Inbox</h1><p>New work lands here already sorted, ready for a quick decision.</p></div>
        <button className="secondary-button" onClick={onSettings}><Settings size={17} /> Gmail rules</button>
      </section>

      <section className="connection-card">
        <div className={`connection-icon ${data.gmail.lastSyncAt ? 'connected' : ''}`}><Mail size={21} /></div>
        <div><strong>{data.gmail.lastSyncAt ? 'Gmail triage is ready' : 'Connect Gmail triage'}</strong><p>{data.gmail.lastSyncAt ? `Last checked ${formatRelativeDay(data.gmail.lastSyncAt)} · Actionable messages become tasks automatically.` : 'A secure GitHub workflow can check unread mail and turn only actionable messages into tasks.'}</p></div>
        <span className={`status-badge ${data.gmail.lastSyncAt ? 'success' : ''}`}>{data.gmail.lastSyncAt ? 'Active' : isConnected ? 'Setup needed' : 'Demo'}</span>
      </section>

      <TaskSection title="From Gmail" subtitle="Messages that need action" tasks={gmailTasks} empty="No actionable email waiting. That’s a good inbox." onComplete={onComplete} onEdit={onEdit} onSnooze={onSnooze} featured />
      <TaskSection title="Unscheduled" subtitle="Captured without a date" tasks={captured} empty="Everything has a place." onComplete={onComplete} onEdit={onEdit} onSnooze={onSnooze} />
    </div>
  )
}

function ScheduleView({
  data,
  mutate,
  onComplete,
  onEdit,
}: {
  data: WorkspaceData
  mutate: (updater: (data: WorkspaceData) => WorkspaceData) => void
  onComplete: (task: Task, completed: boolean) => void
  onEdit: (task: Task) => void
}) {
  const [weekOffset, setWeekOffset] = useState(0)
  const weekStart = addDays(startOfWeek(new Date()), weekOffset * 7)
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const openTasks = activeTasks(data)
  const unscheduled = openTasks.filter((task) => !task.scheduledFor)

  const scheduleOn = (taskId: string, date: Date) => {
    const scheduled = new Date(date)
    scheduled.setHours(9, 0, 0, 0)
    mutate((current) => updateTask(current, taskId, { scheduledFor: scheduled.toISOString() }))
  }

  const onDrop = (event: DragEvent, day: Date) => {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/task-id')
    if (id) scheduleOn(id, day)
  }

  return (
    <div className="page schedule-page">
      <section className="page-heading schedule-heading">
        <div><span className="eyebrow">Plan with breathing room</span><h1>Schedule</h1><p>Drag work to a day. Leave space for the unexpected.</p></div>
        <div className="week-controls">
          <button className="icon-button" onClick={() => setWeekOffset((value) => value - 1)} aria-label="Previous week"><ArrowLeft size={18} /></button>
          <button className="week-label" onClick={() => setWeekOffset(0)}>{formatShortDate(weekStart)} – {formatShortDate(endOfWeek(weekStart))}</button>
          <button className="icon-button" onClick={() => setWeekOffset((value) => value + 1)} aria-label="Next week"><ArrowRight size={18} /></button>
        </div>
      </section>

      <section className="calendar-board">
        {days.map((day) => {
          const dayTasks = openTasks.filter((task) => task.scheduledFor && toDateKey(task.scheduledFor) === toDateKey(day)).sort(sortTasks)
          const isToday = toDateKey(day) === toDateKey(new Date())
          return (
            <div key={day.toISOString()} className={`calendar-day ${isToday ? 'today' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, day)}>
              <div className="calendar-day-head"><span>{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(day)}</span><strong>{day.getDate()}</strong></div>
              <div className="calendar-day-tasks">
                {dayTasks.map((task) => (
                  <button
                    key={task.id}
                    className={`calendar-task priority-${getEffectivePriority(task).priority}`}
                    onClick={() => onEdit(task)}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('text/task-id', task.id)}
                  >
                    <span>{formatTime(task.scheduledFor!)}</span>
                    <strong>{task.title}</strong>
                    <span className={`workspace-chip ${task.workplace}`}>{task.workplace === 'hidermatology' ? 'Hider' : 'Soleivar'}</span>
                    <i onClick={(event) => { event.stopPropagation(); onComplete(task, true) }}><Check size={12} /></i>
                  </button>
                ))}
                {!dayTasks.length && <span className="drop-hint">Drop here</span>}
              </div>
            </div>
          )
        })}
      </section>

      <section className="unscheduled-tray">
        <div className="tray-heading"><div><h2>Unscheduled</h2><p>Drag these into a day when you’re ready.</p></div><span>{unscheduled.length}</span></div>
        <div className="tray-tasks">
          {unscheduled.map((task) => (
            <button key={task.id} draggable onDragStart={(event) => event.dataTransfer.setData('text/task-id', task.id)} onClick={() => onEdit(task)}>
              <span className={`priority-dot ${getEffectivePriority(task).priority}`} />
              <strong>{task.title}</strong>
              <span className={`workspace-dot ${task.workplace}`} />
            </button>
          ))}
          {!unscheduled.length && <span className="tray-empty">Everything has a day.</span>}
        </div>
      </section>
    </div>
  )
}

function ReportsView({ data }: { data: WorkspaceData }) {
  const now = new Date()
  const weekStart = startOfWeek(now)
  const weekEnd = endOfWeek(now)
  const completed = data.tasks.filter((task) => task.completedAt && new Date(task.completedAt) >= weekStart && new Date(task.completedAt) <= weekEnd)
  const active = activeTasks(data)
  const byWorkplace = {
    hidermatology: completed.filter((task) => task.workplace === 'hidermatology').length,
    soleivar: completed.filter((task) => task.workplace === 'soleivar').length,
  }
  const daily = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(weekStart, index)
    return { day, count: completed.filter((task) => task.completedAt && toDateKey(task.completedAt) === toDateKey(day)).length }
  })
  const max = Math.max(1, ...daily.map((item) => item.count))

  return (
    <div className="page reports-page">
      <section className="page-heading">
        <div><span className="eyebrow">Progress you can see</span><h1>Weekly report</h1><p>{formatShortDate(weekStart)} – {formatShortDate(weekEnd)} · Saved for 31 days</p></div>
        <button className="secondary-button" onClick={() => window.print()}><Archive size={17} /> Save report</button>
      </section>

      <section className="report-summary-grid">
        <div className="report-hero-card">
          <span className="card-kicker">This week</span>
          <strong>{completed.length}</strong>
          <h2>tasks completed</h2>
          <p>{completed.length ? `You moved ${byWorkplace.hidermatology} Hidermatology and ${byWorkplace.soleivar} Soleivar items across the line.` : 'Complete your first task and this report will build itself.'}</p>
        </div>
        <div className="report-chart-card">
          <div className="report-card-head"><div><span className="card-kicker">Daily rhythm</span><h2>Completed work</h2></div><span className="trend-chip">{active.length} still open</span></div>
          <div className="bar-chart">
            {daily.map((item) => <div className="bar-column" key={item.day.toISOString()}><span>{item.count || ''}</span><i style={{ height: `${Math.max(7, (item.count / max) * 100)}%` }} /><small>{new Intl.DateTimeFormat('en-US', { weekday: 'narrow' }).format(item.day)}</small></div>)}
          </div>
        </div>
      </section>

      <section className="workplace-progress">
        <div><span className="workspace-logo hider">H</span><div><strong>Hidermatology</strong><span>{byWorkplace.hidermatology} completed this week</span></div><b>{completed.length ? Math.round((byWorkplace.hidermatology / completed.length) * 100) : 0}%</b></div>
        <div><span className="workspace-logo soleivar">S</span><div><strong>Soleivar</strong><span>{byWorkplace.soleivar} completed this week</span></div><b>{completed.length ? Math.round((byWorkplace.soleivar / completed.length) * 100) : 0}%</b></div>
      </section>

      <section className="report-history">
        <div className="history-heading"><div><h2>Recent reports</h2><p>Reports older than one month are removed automatically.</p></div><span><Trash2 size={15} /> 31-day retention</span></div>
        {data.reports.length ? data.reports.map((report) => (
          <article key={report.id} className="history-card">
            <div className="history-date"><strong>{formatShortDate(report.weekStart)}</strong><span>to {formatShortDate(report.weekEnd)}</span></div>
            <p>{report.summary}</p>
            <div className="history-totals"><span><i className="workspace-dot hidermatology" /> {report.byWorkplace.hidermatology} Hider</span><span><i className="workspace-dot soleivar" /> {report.byWorkplace.soleivar} Soleivar</span></div>
          </article>
        )) : <div className="blank-state"><BarChart3 size={28} /><strong>Your first report is taking shape</strong><span>Finish work this week and Dayline will preserve the highlights.</span></div>}
      </section>
    </div>
  )
}

function SettingsView({
  data,
  connection,
  syncMessage,
  syncState,
  onConnect,
  onDisconnect,
  onRefresh,
}: {
  data: WorkspaceData
  connection: GitHubConnection | null
  syncMessage: string
  syncState: string
  onConnect: (connection: GitHubConnection) => Promise<void>
  onDisconnect: () => void
  onRefresh: () => void
}) {
  const [form, setForm] = useState<GitHubConnection>(connection || { owner: '', repo: 'dayline-data', branch: 'main', path: 'data/workspace.json', token: '', rememberToken: false })
  const [formError, setFormError] = useState('')
  const [notificationState, setNotificationState] = useState<NotificationPermission>(typeof Notification === 'undefined' ? 'denied' : Notification.permission)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError('')
    if (!form.owner.trim() || !form.repo.trim() || !form.token.trim()) {
      setFormError('Owner, repository, and token are required.')
      return
    }
    try {
      await onConnect({ ...form, owner: form.owner.trim(), repo: form.repo.trim(), branch: form.branch.trim() || 'main', path: form.path.trim() || 'data/workspace.json', token: form.token.trim() })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Connection failed')
    }
  }

  const requestNotifications = async () => {
    if (typeof Notification === 'undefined') return
    setNotificationState(await Notification.requestPermission())
  }

  return (
    <div className="page settings-page">
      <section className="page-heading"><div><span className="eyebrow">Your workspace, your data</span><h1>Settings</h1><p>Connect each service once, then let the plan maintain itself.</p></div></section>

      <section className="settings-section">
        <div className="settings-copy"><span className="settings-icon github"><Github size={21} /></span><div><h2>GitHub data vault</h2><p>Tasks, reports, and AI briefs live in one JSON file in your private repository. No work data is stored in this browser.</p></div></div>
        <div className="settings-panel">
          {connection ? (
            <div className="connected-panel">
              <div className="connected-head"><span><CheckCircle2 size={20} /><strong>Connected</strong></span><span className={`status-badge ${syncState === 'saved' ? 'success' : ''}`}>{syncState}</span></div>
              <div className="repo-address"><Github size={18} /><span>{connection.owner} / <strong>{connection.repo}</strong></span><code>{connection.path}</code></div>
              <p className="sync-detail">{syncMessage}</p>
              <div className="button-row"><button className="secondary-button" onClick={onRefresh}><RefreshCw size={16} /> Sync now</button><button className="danger-text-button" onClick={onDisconnect}>Disconnect this device</button></div>
            </div>
          ) : (
            <form className="connection-form" onSubmit={submit}>
              <div className="form-grid two"><Field label="GitHub owner"><input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} placeholder="your-username" autoComplete="username" /></Field><Field label="Private repository"><input value={form.repo} onChange={(event) => setForm({ ...form, repo: event.target.value })} placeholder="dayline-data" /></Field></div>
              <div className="form-grid two"><Field label="Branch"><input value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })} /></Field><Field label="Workspace file"><input value={form.path} onChange={(event) => setForm({ ...form, path: event.target.value })} /></Field></div>
              <Field label="Fine-grained access token" hint="Repository access: this repo only · Contents: read and write"><input type="password" value={form.token} onChange={(event) => setForm({ ...form, token: event.target.value })} placeholder="github_pat_…" autoComplete="off" /></Field>
              <label className="remember-row"><input type="checkbox" checked={form.rememberToken} onChange={(event) => setForm({ ...form, rememberToken: event.target.checked })} /><span><strong>Remember token on this device</strong><small>Leave off on a shared computer. The token otherwise lasts only for this browser session.</small></span></label>
              {formError && <div className="form-error">{formError}</div>}
              <div className="button-row"><button className="primary-button" type="submit" disabled={syncState === 'connecting'}>{syncState === 'connecting' ? <LoaderCircle className="spin" size={17} /> : <Github size={17} />} Connect & test</button><a className="text-link" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Create a token <ExternalLink size={14} /></a></div>
            </form>
          )}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-copy"><span className="settings-icon gmail"><Mail size={21} /></span><div><h2>Gmail task triage</h2><p>The GitHub workflow checks unread mail, identifies actionable work, routes it to the right business, and adds it to your inbox.</p></div></div>
        <div className="settings-panel integration-panel">
          <div className="integration-head"><span><strong>Automation status</strong><small>{data.gmail.lastSyncAt ? `Last run ${formatRelativeDay(data.gmail.lastSyncAt)}` : 'Waiting for repository secrets'}</small></span><span className={`status-badge ${data.gmail.lastSyncAt ? 'success' : ''}`}>{data.gmail.lastSyncAt ? 'Active' : 'Not configured'}</span></div>
          <ol className="setup-steps"><li><span>1</span><div><strong>Add Gmail OAuth secrets</strong><small>GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN</small></div></li><li><span>2</span><div><strong>Add your OpenAI API key</strong><small>OPENAI_API_KEY creates concise summaries and improves email routing.</small></div></li><li><span>3</span><div><strong>Enable GitHub Actions</strong><small>The included workflow checks mail every 15 minutes and prepares a daily brief.</small></div></li></ol>
          <a className="secondary-button inline" href="./setup.html" target="_blank"><CircleHelp size={16} /> Open setup guide</a>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-copy"><span className="settings-icon notify"><BellRing size={21} /></span><div><h2>New-task alerts</h2><p>While Dayline is open, it checks GitHub every minute and can alert you when Gmail creates a new task.</p></div></div>
        <div className="settings-panel compact-panel"><div><strong>Browser notifications</strong><p>{notificationState === 'granted' ? 'Allowed on this device.' : notificationState === 'denied' ? 'Blocked in browser settings.' : 'Not enabled yet.'}</p></div><button className="secondary-button" onClick={() => void requestNotifications()} disabled={notificationState === 'granted' || notificationState === 'denied'}><Bell size={16} /> {notificationState === 'granted' ? 'Enabled' : 'Enable alerts'}</button></div>
      </section>

      <section className="settings-section">
        <div className="settings-copy"><span className="settings-icon rules"><Tag size={21} /></span><div><h2>Automatic routing</h2><p>Keywords give every manual task and email a reliable starting workspace. OpenAI can refine uncertain Gmail items.</p></div></div>
        <div className="settings-panel routing-panel">{data.workplaces.map((workplace) => <div key={workplace.id}><span className={`workspace-logo ${workplace.id === 'hidermatology' ? 'hider' : 'soleivar'}`}>{workplace.shortName[0]}</span><div><strong>{workplace.name}</strong><p>{workplace.keywords.slice(0, 8).map((keyword) => <span key={keyword}>{keyword}</span>)}</p></div></div>)}</div>
      </section>

      <div className="privacy-note"><Cloud size={17} /><span><strong>Privacy note:</strong> Keep patient names, medical details, and other regulated health information out of task titles and email snippets unless your GitHub/OpenAI agreements and account configuration are approved for that data.</span></div>
    </div>
  )
}

function QuickAdd({ data, onClose, onCreate }: { data: WorkspaceData; onClose: () => void; onCreate: (tasks: Task[]) => void }) {
  const [text, setText] = useState('')
  const [workplace, setWorkplace] = useState<'auto' | WorkplaceId>('auto')
  const [priority, setPriority] = useState<'auto' | Exclude<Priority, 'urgent'>>('auto')
  const [date, setDate] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const titles = text.split('\n').map((line) => line.replace(/^\s*[-*☐□]\s*/, '').trim()).filter(Boolean)
    if (!titles.length) return
    const tasks = titles.map((title) => makeTask(title, {
      ...(workplace !== 'auto' ? { workplace } : {}),
      ...(priority !== 'auto' ? { startPriority: priority } : {}),
      ...(date ? { scheduledFor: fromLocalInput(date), dueAt: fromLocalInput(date) } : {}),
    }, data.workplaces))
    onCreate(tasks)
  }

  return (
    <Modal title="Capture what’s on your mind" subtitle="One line becomes one task. Paste a whole Keep checklist if you like." onClose={onClose} wide>
      <form className="quick-add-form" onSubmit={submit}>
        <textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder={'Schedule a call with Google Ads tomorrow 10am\nApprove clinic social posts\nCheck Soleivar inventory'} autoFocus />
        <div className="auto-hint"><Sparkles size={15} /><span>Workplace, task type, priority, and common dates are detected automatically.</span></div>
        <div className="quick-options">
          <Field label="Workspace"><select value={workplace} onChange={(event) => setWorkplace(event.target.value as 'auto' | WorkplaceId)}><option value="auto">Auto-route</option><option value="hidermatology">Hidermatology</option><option value="soleivar">Soleivar</option></select></Field>
          <Field label="Starting priority"><select value={priority} onChange={(event) => setPriority(event.target.value as 'auto' | Exclude<Priority, 'urgent'>)}><option value="auto">Auto</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
          <Field label="Schedule (optional)"><input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        </div>
        <div className="modal-actions"><span><kbd>⌘</kbd> + <kbd>Enter</kbd> to add</span><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit"><Plus size={17} /> Add {text.split('\n').filter((line) => line.trim()).length || ''} task{text.split('\n').filter((line) => line.trim()).length === 1 ? '' : 's'}</button></div>
      </form>
    </Modal>
  )
}

function TaskEditor({
  task,
  onClose,
  onSave,
  onArchive,
}: {
  task: Task
  onClose: () => void
  onSave: (id: string, updates: Partial<Task>) => void
  onArchive: (id: string) => void
}) {
  const [draft, setDraft] = useState(task)
  const effective = getEffectivePriority(task)
  const set = <K extends keyof Task>(key: K, value: Task[K]) => setDraft((current) => ({ ...current, [key]: value }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSave(task.id, draft)
  }

  return (
    <div className="drawer-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="task-drawer" aria-label="Edit task">
        <div className="drawer-head"><div><span className={`priority-badge ${effective.priority}`}>{priorityLabel(effective.priority)}</span><span>{effective.reason}</span></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div>
        <form onSubmit={submit}>
          <input className="drawer-title" value={draft.title} onChange={(event) => set('title', event.target.value)} aria-label="Task title" />
          <div className="drawer-meta-line"><span className={`workspace-dot ${draft.workplace}`} /><span>{draft.workplace === 'hidermatology' ? 'Hidermatology' : 'Soleivar'}</span><span>Created {formatShortDate(draft.createdAt)}</span>{draft.source === 'gmail' && <span><Mail size={13} /> Gmail</span>}</div>

          <div className="drawer-grid">
            <Field label="Workspace"><select value={draft.workplace} onChange={(event) => set('workplace', event.target.value as WorkplaceId)}><option value="hidermatology">Hidermatology</option><option value="soleivar">Soleivar</option></select></Field>
            <Field label="Starting priority"><select value={draft.startPriority} onChange={(event) => set('startPriority', event.target.value as Exclude<Priority, 'urgent'>)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
            <Field label="Schedule"><input type="datetime-local" value={toLocalInput(draft.scheduledFor)} onChange={(event) => set('scheduledFor', fromLocalInput(event.target.value))} /></Field>
            <Field label="Due"><input type="datetime-local" value={toLocalInput(draft.dueAt)} onChange={(event) => set('dueAt', fromLocalInput(event.target.value))} /></Field>
          </div>

          <Field label="Notes"><textarea className="notes-area" value={draft.notes} onChange={(event) => set('notes', event.target.value)} placeholder="Context, links, or the result you need…" /></Field>

          <div className="kind-toggle"><button type="button" className={draft.kind === 'task' ? 'active' : ''} onClick={() => { set('kind', 'task'); set('followUp', null) }}><ListTodo size={16} /> Standard task</button><button type="button" className={draft.kind === 'follow_up' ? 'active' : ''} onClick={() => { set('kind', 'follow_up'); set('followUp', draft.followUp || { contact: '', channel: 'call', nextDate: draft.scheduledFor, outcome: '' }) }}><AlarmClock size={16} /> Follow-up</button></div>

          {draft.kind === 'follow_up' && draft.followUp && (
            <div className="followup-panel">
              <div className="panel-title"><AlarmClock size={17} /><div><strong>Follow-up scheduler</strong><span>This stays open until you record the outcome.</span></div></div>
              <div className="drawer-grid">
                <Field label="Contact"><input value={draft.followUp.contact} onChange={(event) => set('followUp', { ...draft.followUp!, contact: event.target.value })} placeholder="Name or company" /></Field>
                <Field label="Channel"><select value={draft.followUp.channel} onChange={(event) => set('followUp', { ...draft.followUp!, channel: event.target.value as 'call' | 'email' | 'meeting' })}><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option></select></Field>
                <Field label="Next follow-up"><input type="datetime-local" value={toLocalInput(draft.followUp.nextDate)} onChange={(event) => set('followUp', { ...draft.followUp!, nextDate: fromLocalInput(event.target.value) })} /></Field>
                <Field label="Outcome"><input value={draft.followUp.outcome} onChange={(event) => set('followUp', { ...draft.followUp!, outcome: event.target.value })} placeholder="Add after contact" /></Field>
              </div>
            </div>
          )}

          <div className="tip-card"><Lightbulb size={18} /><div><strong>Fastest next step</strong><textarea value={draft.tip} onChange={(event) => set('tip', event.target.value)} /></div></div>
          <div className="drawer-actions"><button type="button" className="archive-button" onClick={() => onArchive(task.id)}><Archive size={16} /> Archive</button><span /><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Save changes</button></div>
        </form>
      </aside>
    </div>
  )
}

function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head"><div><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose}><X size={20} /></button></div>
        {children}
      </section>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

function MobileNav({ view, onView, onAdd, newInboxCount }: { view: ViewId; onView: (view: ViewId) => void; onAdd: () => void; newInboxCount: number }) {
  const items = NAV_ITEMS.slice(0, 4)
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {items.slice(0, 2).map((item) => <MobileNavButton key={item.id} item={item} active={view === item.id} count={item.id === 'inbox' ? newInboxCount : 0} onClick={() => onView(item.id)} />)}
      <button className="mobile-add" onClick={onAdd}><Plus size={24} /><span>Add</span></button>
      {items.slice(2).map((item) => <MobileNavButton key={item.id} item={item} active={view === item.id} count={0} onClick={() => onView(item.id)} />)}
    </nav>
  )
}

function MobileNavButton({ item, active, count, onClick }: { item: (typeof NAV_ITEMS)[number]; active: boolean; count: number; onClick: () => void }) {
  const Icon = item.icon
  return <button className={active ? 'active' : ''} onClick={onClick}><span><Icon size={19} />{count > 0 && <i>{count}</i>}</span><small>{item.label}</small></button>
}

export default App
