# Submit project work to Dayline

Each project chat creates its own JSON file. One file becomes **one parent task** in the main plan and a checklist in **Projects**, grouped under the project name. Subtasks are never added as independent master-list tasks.

Dayline checks the `task-inbox/` folder in its connected private data repository when it opens, every minute while open, and on Sync. GitHub is the shared inbox for desktop and phone. A browser cannot automatically read another project's local folder.

## Instructions to paste into another project chat

> Read `C:/Users/maker/Documents/Codex/schedual/PROJECT_TASK_INBOX.md`. Inspect this project's remaining work. Create a separate `dayline-project-task` JSON submission in this project's folder, with today's dated summary as the parent title and concrete checklist subtasks for fixes, additions, verification, and playtest feedback as appropriate. Include only verified remaining work. Give each new submission a unique stable ID and each step a stable ID. Validate with the Dayline submission helper using `--check`, then submit the file to the private inbox using the helper. Do not change `data/workspace.json` or include secrets. Report the filename and successful submission result.

## File format

Start from `templates/project-task.example.json` (example only; do not submit its placeholder tasks).

```json
{
  "format": "dayline-project-task",
  "version": 1,
  "submissionId": "2026-10-09-restart-fixes",
  "projectId": "count-on-chaos",
  "projectName": "Count on Chaos",
  "submittedAt": "2026-10-09T09:00:00-06:00",
  "title": "October 9 — fix restart and verify the update",
  "notes": "Concise context and the outcome needed.",
  "priority": "medium",
  "subtasks": [
    { "id": "fix-restart", "title": "Fix restart after game over", "notes": "Describe reproduction and the expected result." },
    { "id": "verify-restart", "title": "Test consecutive restarts", "notes": "Check fresh state and absence of duplicate entities." },
    { "id": "playtest-feedback", "title": "Playtest and record feedback" }
  ]
}
```

- `submissionId` and `projectId`: 2–120 lowercase letters, digits, dots, underscores or hyphens. A new dated work batch gets a new submission ID; retries keep the same ID.
- `submittedAt`: actual creation timestamp, including timezone. The UI displays it as the submission date; this date does not invent a deadline.
- `title`: dated summary, up to 180 characters.
- `priority`: `low`, `medium`, or `high`; defaults to `medium`.
- `workplace`: optional `hidermatology` or `soleivar`. Omit to use the existing keyword routing. Project grouping is independent of workplace; select **All work** to see all projects.
- `subtasks`: 1–100 entries. Every `id` is stable and unique in that submission. `title` is required, up to 240 characters; `notes` is optional.
- Maximum file size: 256 KB. No credentials or unrelated private data.

## Validate and submit from any project folder

Requires Node 24+ and GitHub CLI signed in with write access to `trevormw20/dayline-data`. The helper uses GitHub CLI's existing credentials; no token needs to go in the file or chat.

```powershell
node "C:/Users/maker/Documents/Codex/schedual/scripts/submit-project-task.mjs" "C:/path/to/project/dayline-task-2026-10-09.json" --check
node "C:/Users/maker/Documents/Codex/schedual/scripts/submit-project-task.mjs" "C:/path/to/project/dayline-task-2026-10-09.json"
```

The helper saves to `task-inbox/<projectId>--<submissionId>.json` in the private repository on `main`. For another vault, set `DAYLINE_DATA_REPO` (`owner/repo`) and optionally `DAYLINE_DATA_BRANCH` for that command. Alternatively upload the validated file directly to `task-inbox/` using GitHub's Add file UI. Every submission is a separate file; leave existing files intact.

## Completion and updates

- Open **Projects**, expand the work by reading its checklist, and check off each step. Each change saves to the same GitHub workspace as ordinary tasks.
- Checking the final step completes the parent and adds it to the normal weekly report. Unchecking a step reopens it. Completed submissions are visible using **Show completed submissions**.
- Re-reading or submitting the same IDs does not duplicate tasks or clear checkmarks. Source updates can append new step IDs; existing step text, manual edits and completions are preserved. Adding a new step to an existing completed task reopens it.
- Removing a step from a submitted file does not delete it from the planner. Edit the parent’s notes for corrections; use a new submission for materially different work.
- Import receipts remain after completed task retention so old inbox files cannot resurrect expired work. To submit fresh work after a parent has expired, use a new submission ID.
- Invalid files are shown as errors in Projects without stopping imports of valid files. Fix the source file and resubmit.
- Importing and checkboxes use no OpenAI tokens. Normal daily AI summaries may include the parent title like other tasks.
