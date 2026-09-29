---
name: Daily Outlier Workflow and Teams Post
description: Scheduled morning outlier workflow and Teams Adaptive Card webhook step
targets:
  - ../src/mastra/workflows/daily-outlier-analysis-workflow.ts
  - ../src/mastra/workflows/steps/post-to-teams-webhook.ts
---

# Daily Outlier Workflow and Teams Post

## Workflow

- Workflow id `daily-outlier-analysis`
  `[@test] ../tests/agent-tool-bindings/daily-outlier-workflow.test.ts`
- Schedule: cron `0 9 * * *`, timezone `Europe/Madrid`
  `[@test] ../tests/agent-tool-bindings/daily-outlier-workflow.test.ts`
- Steps: Outlier Analysis Agent (max 50 steps) → `post-to-teams-webhook`
- Output: `{ text, teamsPosted }`

## Teams payload

- Payload is a Power Automate Adaptive Card message (`type: message`, Adaptive Card 1.4)
  `[@test] ../tests/teams-webhook/payload.test.ts`
- Report text longer than 25_000 chars is truncated with a suffix
  `[@test] ../tests/teams-webhook/payload.test.ts`
- Long text is split into TextBlocks of at most 4_000 chars
  `[@test] ../tests/teams-webhook/payload.test.ts`
- Missing `TEAMS_OUTLIER_WEBHOOK_URL` throws; non-2xx HTTP responses throw
