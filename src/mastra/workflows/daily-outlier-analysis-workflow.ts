import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { outlierAnalysisAgent } from '../agents/outlier-analysis-agent';
import { postToTeamsWebhookStep } from './steps/post-to-teams-webhook';

export const DAILY_OUTLIER_ANALYSIS_PROMPT = `Run the morning outlier sweep across the clinic warehouse.

1. Scan gold marts for statistical and business outliers: gold_revenue_by_specialty, gold_doctor_workload, gold_patient_visit_summary, gold_invoices_mart, and gold_visits_mart.
2. For each material outlier (or a clear top-N set), trace root cause upstream through silver_/bronze_ and ops_ as needed.
3. Prefer methods that fit the data (IQR, z-score, bronze last-two-execution diffs, business rules). State method, thresholds, and sample size.
4. Treat the audience as technical (data engineer). Skip emojis.

Structure the answer as Scope, Outliers found, Root causes, and Confidence & caveats. Include the SQL you ran and real results — do not invent rows.`;

export const dailyOutlierAnalysisWorkflow = createWorkflow({
  id: 'daily-outlier-analysis',
  description:
    'Runs the Outlier Analysis Agent every morning to detect warehouse outliers, then posts the report to Teams.',
  inputSchema: z.object({
    prompt: z
      .string()
      .default(DAILY_OUTLIER_ANALYSIS_PROMPT)
      .describe('Analysis prompt passed to the Outlier Analysis Agent.'),
  }),
  outputSchema: z.object({
    text: z.string(),
    teamsPosted: z.boolean(),
  }),
  schedule: {
    cron: '0 9 * * *',
    timezone: 'Europe/Madrid',
    inputData: {
      prompt: DAILY_OUTLIER_ANALYSIS_PROMPT,
    },
  },
})
  .agent(outlierAnalysisAgent, {
    maxSteps: 50,
    memory: {
      thread: 'daily-outlier-analysis',
      resource: 'scheduled-outlier-analysis',
    },
  })
  .then(postToTeamsWebhookStep)
  .commit();
