# Dayline private data vault

This private repository is the shared source of truth for the Dayline app.

- `data/workspace.json` stores tasks, schedules, briefs, and rolling reports.
- `scripts/dayline-automation.mjs` maintains daily tasks, Gmail triage, OpenAI briefs, reports, and 31-day retention.
- `.github/workflows/automation.yml` runs the maintenance job every 15 minutes.

Keep this repository private. Do not store patient names, diagnoses, treatment information, photographs, or other protected health information unless your organization has approved every connected service and agreement for that data.

## Optional Gmail and OpenAI secrets

Add these under **Settings → Secrets and variables → Actions**:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `OPENAI_API_KEY`

Optional variables:

- `DAYLINE_TIMEZONE` (default `America/Denver`)
- `GMAIL_QUERY`
- `OPENAI_MODEL` (default `gpt-5-mini`)

The browser connects with a separate fine-grained token limited to this repository with **Contents: read and write**.
