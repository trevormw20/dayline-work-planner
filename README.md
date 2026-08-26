# Dayline

Dayline is a calm, mobile-first work planner for Hidermatology and Soleivar. It keeps the focus list deliberately short, raises the priority of work that ages or misses a deadline, turns calls and emails into trackable follow-ups, and builds a rolling weekly record of completed work.

The app is a static installable website. Your work data lives in a private GitHub repository, not in browser storage. The browser only retains the GitHub repository address and—if you explicitly choose it—the access token used by that device.

## What is finished

- Responsive desktop and phone interface with installable PWA shell
- Today, Inbox, drag-and-drop Schedule, Reports, and Settings views
- Multiline capture for pasting Google Keep checklists
- Automatic Hidermatology/Soleivar routing with editable keyword rules
- Automatic follow-up scheduling for calls, emails, meetings, and “follow up” tasks
- Natural-date capture for phrases such as `tomorrow 2pm` and `next Monday`
- Low → medium → high → urgent priority aging
- GitHub-backed JSON persistence with cross-device conflict merging
- Gmail polling through a server-side GitHub Action; no Gmail credentials in the browser
- OpenAI daily briefs, email triage, business routing, and action tips using Structured Outputs
- One daily planning task, weekly reports, and automatic 31-day retention
- Browser alerts for new Gmail tasks while Dayline is open
- Safe in-memory demo mode and offline-aware sync status

## Run it locally

You need Node.js 24 or newer.

```powershell
npm install
npm run dev
```

Run the verification suite with:

```powershell
npm test
npm run build
npm audit
```

## Recommended GitHub layout

There are two good ways to host Dayline.

### Option A: one private repository

Use one private repository for the source, GitHub Pages deployment, workflows, and `data/workspace.json`. This is simplest if your GitHub plan allows Pages from a private repository. The Pages artifact contains only the compiled app; Vite does not publish the root `data` folder.

### Option B: public app + private data repository

This works on GitHub Free and keeps work data private:

1. Put this project in a public repository such as `dayline-app` and enable GitHub Pages.
2. Create a second **private** repository such as `dayline-data`.
3. Copy `data/workspace.json` into the private repository, or let Dayline create it on first connection.
4. Create a fine-grained token limited to `dayline-data` with **Contents: read and write**.
5. In the app repository, add the Actions variable `DAYLINE_DATA_REPO` with `YOUR-USER/dayline-data`.
6. In the app repository, add the Actions secret `DAYLINE_DATA_TOKEN` with that fine-grained token.

The browser and automation can then write the same private file safely while the website itself remains public.

## Publish the app

1. Create the GitHub repository and push this folder to its `main` branch.
2. Open **Repository settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions**.
4. Run **Deploy Dayline to GitHub Pages** from the Actions tab, or push to `main`.
5. Open the generated Pages URL on desktop and phone. On mobile, use **Add to Home Screen** for an app-like launch icon.

The included [deployment workflow](.github/workflows/deploy-pages.yml) installs from the lockfile, verifies the production build, and publishes only `dist`.

## Connect the app to private GitHub data

On each device:

1. Open Dayline → **Settings → GitHub data vault**.
2. Enter the owner, private repository name, branch, and `data/workspace.json`.
3. Enter a fine-grained personal access token limited to that repository with **Contents: read and write**.
4. Leave **Remember token** off on a shared device. The token will then stay in session storage and disappear when that browser session ends.
5. Select **Connect & test**. If the JSON file does not exist, Dayline creates it.

All task changes use GitHub’s repository-contents API. If desktop and phone save at nearly the same time, Dayline reloads the latest file and keeps the newest version of every task before retrying.

## Enable Gmail task triage

Gmail access runs in GitHub Actions so OAuth credentials never reach the public website.

### 1. Create Google OAuth credentials

1. Create or choose a Google Cloud project.
2. Enable the **Gmail API**.
3. Configure the OAuth consent screen. If the app is in testing, add your work Gmail account as a test user.
4. Create an OAuth client ID with application type **Desktop app**.
5. Copy its client ID and client secret.

### 2. Generate the one-time refresh token

In PowerShell, from this project folder:

```powershell
$env:GMAIL_CLIENT_ID='your-client-id'
$env:GMAIL_CLIENT_SECRET='your-client-secret'
node scripts/google-oauth.mjs
```

Open the URL printed by the helper, approve read-only Gmail access, and return to the terminal. Copy the refresh token it prints. Treat that value like a password.

### 3. Add repository secrets

In **Repository settings → Secrets and variables → Actions**, add:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`

The Gmail scope is read-only. Dayline does not mark, move, send, or delete email. By default it checks:

```text
is:unread newer_than:2d -category:promotions -category:social
```

Override that with the Actions variable `GMAIL_QUERY` if needed. The Gmail message body is never saved to GitHub. A created task stores a short action title, sender, and a direct Gmail link.

## Enable OpenAI summaries and smarter routing

1. Create an OpenAI API key in the API platform.
2. Add it as the Actions secret `OPENAI_API_KEY`.
3. Optionally set the Actions variable `OPENAI_MODEL`; the default is `gpt-5-mini`.
4. Run **Dayline automation** manually once from the Actions tab.

The automation uses the OpenAI Responses API with strict JSON schemas for both Gmail triage and daily briefs. It sends only email subject/sender/snippet for triage and active task titles/dates for the daily brief. It sets `store: false`. OpenAI API usage is billed separately from a ChatGPT subscription.

If `OPENAI_API_KEY` is absent, Dayline still creates a short deterministic daily brief, applies keyword routing, and uses conservative email heuristics.

## Automation variables

Optional repository variables:

| Variable | Default | Purpose |
|---|---|---|
| `DAYLINE_DATA_REPO` | current repository | Private data repository in `owner/repo` form |
| `DAYLINE_DATA_BRANCH` | `main` | Data branch |
| `DAYLINE_DATA_PATH` | `data/workspace.json` | Workspace file path |
| `DAYLINE_TIMEZONE` | `America/Denver` | Local date used for daily planning |
| `GMAIL_QUERY` | unread, recent, no promotions/social | Gmail search query |
| `OPENAI_MODEL` | `gpt-5-mini` | Responses API model |

The automation runs at minutes 7, 22, 37, and 52 each hour. GitHub schedules can be delayed during busy periods. The app itself checks GitHub once a minute while open and shows a browser notification for newly created Gmail tasks if notifications are enabled.

## Priority behavior

Escalation is derived at display time, so the JSON stays simple and the current priority is always accurate.

| Starting priority | Missed due date | No due date / stale |
|---|---|---|
| Low | Medium after 3 days, high after 7, urgent after 14 | Medium after 7 days, high after 14, urgent after 30 |
| Medium | High after 4 days, urgent after 9 | High after 10 days, urgent after 21 |
| High | Urgent after 3 days | Urgent after 7 days |

You can manually override a priority in the data model. Snoozing removes an item from the active plan until tomorrow without resetting its age.

## Privacy and medical-work warning

Dayline is privacy-conscious, but this repository is **not a certification of HIPAA compliance**. Before allowing clinic email to be processed, confirm that your Google Workspace, GitHub, and OpenAI accounts, agreements, access controls, and retention configuration are approved for your organization’s data.

Until then:

- Do not put patient names, diagnoses, photos, treatment details, or other protected health information in tasks.
- Use a Gmail query or label that excludes patient communication.
- Keep the data repository private and give each token access only to that repository.
- Rotate a token immediately if it is exposed.

## Data lifecycle

- Open work remains until completed.
- Completed tasks feed the weekly report.
- Weekly reports, AI briefs, and completed task detail are deleted after 31 days by the automation.
- Gmail message IDs are retained only to prevent duplicates; the list is capped at 1,000 entries.
- The app has no analytics, advertising scripts, or third-party data store.

## Project map

```text
src/                         React application
  hooks/useWorkspace.ts      GitHub sync and device polling
  lib/priority.ts            Priority-aging rules
  lib/workspace.ts           Tasks, reports, routing, conflict merge
scripts/dayline-automation.mjs  Gmail, OpenAI, reports, retention
scripts/google-oauth.mjs        One-time Gmail authorization helper
.github/workflows/           Pages deployment and scheduled automation
data/workspace.json          Empty starter data file
```

## Notes for future changes

- Keep patient/medical details out of test fixtures and screenshots.
- Never add API keys, OAuth tokens, or Gmail content to `.env.example` or commits.
- Preserve the GitHub conflict merge when changing the persistence layer.
- Extend workplace routing by editing the keyword arrays in `data/workspace.json`.
