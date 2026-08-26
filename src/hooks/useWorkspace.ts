import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitHubConnection, WorkspaceData } from '../types'
import { demoWorkspace } from '../data/seed'
import { GitHubError, readGitHubWorkspace, saveWithConflictResolution, writeGitHubWorkspace } from '../lib/github'
import { emptyWorkspace, ensureDailyTask, generateReports, wakeSnoozedTasks } from '../lib/workspace'

const CONFIG_KEY = 'dayline.github.config'
const TOKEN_KEY = 'dayline.github.token'

type SyncState = 'demo' | 'connecting' | 'saved' | 'saving' | 'error' | 'offline'

interface StoredConfig extends Omit<GitHubConnection, 'token'> {}

function prepare(data: WorkspaceData): WorkspaceData {
  return generateReports(ensureDailyTask(wakeSnoozedTasks(data)))
}

function readStoredConnection(): GitHubConnection | null {
  try {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null') as StoredConfig | null
    if (!config) return null
    const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || ''
    if (!token) return null
    return { ...config, token }
  } catch {
    return null
  }
}

export function useWorkspace() {
  const [data, setData] = useState<WorkspaceData>(() => demoWorkspace())
  const [connection, setConnection] = useState<GitHubConnection | null>(() => readStoredConnection())
  const [syncState, setSyncState] = useState<SyncState>(() => (readStoredConnection() ? 'connecting' : 'demo'))
  const [syncMessage, setSyncMessage] = useState('Try everything safely — demo changes are not saved')
  const shaRef = useRef<string | undefined>(undefined)
  const saveTimer = useRef<number | undefined>(undefined)
  const connectionRef = useRef<GitHubConnection | null>(connection)
  const dataRef = useRef(data)
  const loadingRef = useRef(false)
  const dirtyRef = useRef(false)

  useEffect(() => {
    connectionRef.current = connection
  }, [connection])

  useEffect(() => {
    dataRef.current = data
  }, [data])

  const saveNow = useCallback(async (nextData?: WorkspaceData) => {
    const activeConnection = connectionRef.current
    if (!activeConnection) return
    const payload = nextData || dataRef.current
    if (!navigator.onLine) {
      setSyncState('offline')
      setSyncMessage('Offline — reconnect before making more changes')
      return
    }
    setSyncState('saving')
    setSyncMessage('Saving to GitHub…')
    try {
      const result = await saveWithConflictResolution(activeConnection, payload, shaRef.current)
      shaRef.current = result.sha
      if (result.merged) setData(result.data)
      setSyncState('saved')
      setSyncMessage(result.merged ? 'Merged changes from another device' : 'Saved to GitHub')
      dirtyRef.current = false
    } catch (error) {
      setSyncState('error')
      setSyncMessage(error instanceof Error ? error.message : 'Could not save to GitHub')
    }
  }, [])

  const queueSave = useCallback(
    (next: WorkspaceData) => {
      if (!connectionRef.current) return
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => void saveNow(next), 700)
    },
    [saveNow],
  )

  const mutate = useCallback(
    (updater: (current: WorkspaceData) => WorkspaceData) => {
      setData((current) => {
        const next = updater(current)
        if (connectionRef.current) dirtyRef.current = true
        dataRef.current = next
        queueSave(next)
        return next
      })
    },
    [queueSave],
  )

  const connect = useCallback(async (nextConnection: GitHubConnection) => {
    setSyncState('connecting')
    setSyncMessage('Connecting to GitHub…')
    loadingRef.current = true
    try {
      let remote: WorkspaceData
      let sha: string
      try {
        const result = await readGitHubWorkspace(nextConnection)
        remote = prepare(result.data)
        sha = result.sha
      } catch (error) {
        if (!(error instanceof GitHubError) || error.status !== 404) throw error
        remote = prepare(emptyWorkspace())
        sha = await writeGitHubWorkspace(nextConnection, remote)
      }
      const config: StoredConfig = {
        owner: nextConnection.owner,
        repo: nextConnection.repo,
        branch: nextConnection.branch,
        path: nextConnection.path,
        rememberToken: nextConnection.rememberToken,
      }
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
      localStorage.removeItem(TOKEN_KEY)
      sessionStorage.removeItem(TOKEN_KEY)
      ;(nextConnection.rememberToken ? localStorage : sessionStorage).setItem(TOKEN_KEY, nextConnection.token)
      shaRef.current = sha
      connectionRef.current = nextConnection
      setConnection(nextConnection)
      setData(remote)
      dataRef.current = remote
      setSyncState('saved')
      setSyncMessage('Connected · saved to GitHub')
      dirtyRef.current = false
    } catch (error) {
      setSyncState('error')
      setSyncMessage(error instanceof Error ? error.message : 'Could not connect to GitHub')
      throw error
    } finally {
      loadingRef.current = false
    }
  }, [])

  const disconnect = useCallback(() => {
    window.clearTimeout(saveTimer.current)
    localStorage.removeItem(CONFIG_KEY)
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    shaRef.current = undefined
    connectionRef.current = null
    dirtyRef.current = false
    setConnection(null)
    setData(demoWorkspace())
    setSyncState('demo')
    setSyncMessage('Demo mode · changes are not saved')
  }, [])

  const refresh = useCallback(async (notify = false) => {
    const activeConnection = connectionRef.current
    if (!activeConnection || loadingRef.current || !navigator.onLine || dirtyRef.current) return
    loadingRef.current = true
    try {
      const result = await readGitHubWorkspace(activeConnection)
      const next = prepare(result.data)
      const previousIds = new Set(dataRef.current.tasks.map((task) => task.id))
      const newTasks = next.tasks.filter((task) => !previousIds.has(task.id) && task.source === 'gmail')
      shaRef.current = result.sha
      dataRef.current = next
      setData(next)
      setSyncState('saved')
      setSyncMessage('Up to date with GitHub')
      if (notify && newTasks.length && Notification.permission === 'granted' && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'DAYLINE_NOTIFY',
          title: `${newTasks.length} new task${newTasks.length === 1 ? '' : 's'} from Gmail`,
          body: newTasks[0].title,
          tag: `gmail-${newTasks[0].id}`,
        })
      }
    } catch (error) {
      setSyncState(navigator.onLine ? 'error' : 'offline')
      setSyncMessage(error instanceof Error ? error.message : 'Could not refresh from GitHub')
    } finally {
      loadingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (connection) void refresh()
    const interval = window.setInterval(() => void refresh(true), 60_000)
    const online = () => (dirtyRef.current ? void saveNow(dataRef.current) : void refresh())
    window.addEventListener('online', online)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('online', online)
    }
  }, [connection, refresh, saveNow])

  useEffect(() => () => window.clearTimeout(saveTimer.current), [])

  return {
    data,
    mutate,
    connection,
    connect,
    disconnect,
    refresh,
    saveNow,
    syncState,
    syncMessage,
    isDemo: !connection,
  }
}
