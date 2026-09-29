---
name: Schedule Tools
description: Start and pause recurring schedules for the starter agent
targets:
  - ../src/mastra/tools/schedule-tools.ts
---

# Schedule Tools

| Tool id | Behavior |
| --- | --- |
| `start_schedule` | Creates a cron schedule for agent id `agent` with the given prompt |
| `stop_schedule` | Pauses a schedule by id |

- Creating a schedule requires `threadId` and `resourceId` on the agent request context; otherwise throws
- Registered on the Mastra instance and bound to the starter `agent`

## Verification

- Schedule tools are registered on the Mastra instance (see `src/mastra/index.ts`); starter-agent binding is out of unit-test scope until workspace/sandbox tools can load without Studio
  `[@test] ../tests/package-scripts.test.ts`
