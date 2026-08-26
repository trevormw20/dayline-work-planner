#!/usr/bin/env node

import http from 'node:http'
import { randomBytes } from 'node:crypto'

const clientId = process.env.GMAIL_CLIENT_ID
const clientSecret = process.env.GMAIL_CLIENT_SECRET
const port = Number(process.env.OAUTH_PORT || 53682)
const redirectUri = `http://127.0.0.1:${port}/callback`
const state = randomBytes(18).toString('hex')

if (!clientId || !clientSecret) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET before running this helper.')
  process.exit(1)
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/gmail.readonly',
  access_type: 'offline',
  prompt: 'consent',
  state,
}).toString()

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', redirectUri)
  if (url.pathname !== '/callback') {
    response.writeHead(404).end('Not found')
    return
  }
  if (url.searchParams.get('state') !== state || !url.searchParams.get('code')) {
    response.writeHead(400, { 'Content-Type': 'text/plain' }).end('Authorization failed. Return to the terminal and try again.')
    server.close()
    return
  }
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: url.searchParams.get('code'),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenResponse.json()
    if (!tokenResponse.ok) throw new Error(tokens.error_description || tokens.error || 'Token exchange failed')
    response.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>Dayline is authorized</h1><p>You can close this tab and return to the terminal.</p>')
    console.log('\nAdd this value as the GMAIL_REFRESH_TOKEN GitHub Actions secret:\n')
    console.log(tokens.refresh_token)
    console.log('\nTreat it like a password. Do not commit it to the repository.')
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain' }).end('Could not finish authorization. Return to the terminal.')
    console.error(error)
  } finally {
    server.close()
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log('Open this URL in your browser:\n')
  console.log(authUrl.toString())
  console.log(`\nWaiting for Google to return to ${redirectUri} …`)
})
