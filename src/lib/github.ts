import type { GitHubConnection, WorkspaceData } from '../types'
import { mergeWorkspaces, normalizeWorkspace } from './workspace'

const API_VERSION = '2026-03-10'

interface GitHubFileResponse {
  content: string
  encoding: 'base64'
  sha: string
}

export class GitHubError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GitHubError'
    this.status = status
  }
}

function headers(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': API_VERSION,
  }
}

function endpoint(connection: GitHubConnection): string {
  const path = connection.path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `https://api.github.com/repos/${encodeURIComponent(connection.owner)}/${encodeURIComponent(connection.repo)}/contents/${path}`
}

function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\n/g, ''))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
  }
  return btoa(binary)
}

async function parseError(response: Response): Promise<GitHubError> {
  let detail = response.statusText
  try {
    const body = (await response.json()) as { message?: string }
    if (body.message) detail = body.message
  } catch {
    // GitHub occasionally returns an empty response on network interruptions.
  }
  const friendly =
    response.status === 401
      ? 'GitHub rejected the token. Check that it has not expired.'
      : response.status === 403
        ? 'The token needs Contents read and write access to this repository.'
        : response.status === 404
          ? 'The repository or workspace file was not found.'
          : response.status === 409
            ? 'The workspace changed on another device.'
            : detail
  return new GitHubError(friendly, response.status)
}

export async function readGitHubWorkspace(
  connection: GitHubConnection,
): Promise<{ data: WorkspaceData; sha: string }> {
  const url = new URL(endpoint(connection))
  url.searchParams.set('ref', connection.branch)
  const response = await fetch(url, { headers: headers(connection.token), cache: 'no-store' })
  if (!response.ok) throw await parseError(response)
  const body = (await response.json()) as GitHubFileResponse
  if (body.encoding !== 'base64') throw new GitHubError('GitHub returned an unsupported file encoding.', 500)
  try {
    return { data: normalizeWorkspace(JSON.parse(decodeBase64(body.content))), sha: body.sha }
  } catch {
    throw new GitHubError('The workspace file exists, but it is not valid Dayline JSON.', 422)
  }
}

export async function writeGitHubWorkspace(
  connection: GitHubConnection,
  data: WorkspaceData,
  sha?: string,
): Promise<string> {
  const body: Record<string, string> = {
    message: `dayline: sync ${new Date().toLocaleDateString('en-US')}`,
    branch: connection.branch,
    content: encodeBase64(`${JSON.stringify(data, null, 2)}\n`),
  }
  if (sha) body.sha = sha
  const response = await fetch(endpoint(connection), {
    method: 'PUT',
    headers: { ...headers(connection.token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await parseError(response)
  const result = (await response.json()) as { content?: { sha?: string } }
  if (!result.content?.sha) throw new GitHubError('GitHub saved the file but did not return its version.', 500)
  return result.content.sha
}

export async function saveWithConflictResolution(
  connection: GitHubConnection,
  local: WorkspaceData,
  knownSha?: string,
): Promise<{ data: WorkspaceData; sha: string; merged: boolean }> {
  try {
    const sha = await writeGitHubWorkspace(connection, local, knownSha)
    return { data: local, sha, merged: false }
  } catch (error) {
    if (!(error instanceof GitHubError) || error.status !== 409) throw error
    const remote = await readGitHubWorkspace(connection)
    const mergedData = mergeWorkspaces(local, remote.data)
    const sha = await writeGitHubWorkspace(connection, mergedData, remote.sha)
    return { data: mergedData, sha, merged: true }
  }
}
