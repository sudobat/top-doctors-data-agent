import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';

/** Power Automate Teams webhooks expect Adaptive Cards; keep payload under typical size limits. */
const MAX_TEAMS_TEXT_CHARS = 25_000;
/** TextBlock content chunks stay readable and under Teams per-block limits. */
const TEXT_BLOCK_CHUNK_CHARS = 4_000;

function chunkText(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

/** Payload required by Power Automate "When a Teams webhook request is received". */
function buildTeamsWebhookPayload(reportText: string) {
  const body = [
    {
      type: 'TextBlock',
      text: 'Daily outlier analysis',
      weight: 'Bolder',
      size: 'Medium',
      wrap: true,
    },
    ...chunkText(reportText, TEXT_BLOCK_CHUNK_CHARS).map((text) => ({
      type: 'TextBlock',
      text,
      wrap: true,
    })),
  ];

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          msteams: { width: 'Full' },
          body,
        },
      },
    ],
  };
}

export const postToTeamsWebhookStep = createStep({
  id: 'post-to-teams-webhook',
  description:
    'Posts the outlier analysis report to a Microsoft Teams channel via Power Automate webhook (Adaptive Card).',
  inputSchema: z.object({
    text: z.string(),
  }),
  outputSchema: z.object({
    text: z.string(),
    teamsPosted: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    const webhookUrl = process.env.TEAMS_OUTLIER_WEBHOOK_URL?.trim();
    if (!webhookUrl) {
      throw new Error(
        'TEAMS_OUTLIER_WEBHOOK_URL is not set. Add the Teams Incoming Webhook (or Power Automate webhook) URL to .env.',
      );
    }

    const logger = mastra?.getLogger();
    let text = inputData.text;
    if (text.length > MAX_TEAMS_TEXT_CHARS) {
      logger?.warn('Teams report truncated for webhook size limit', {
        originalLength: text.length,
        maxChars: MAX_TEAMS_TEXT_CHARS,
      });
      text = `${text.slice(0, MAX_TEAMS_TEXT_CHARS)}\n\n…(truncated for Teams webhook size limit)`;
    }

    const payload = buildTeamsWebhookPayload(text);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Power Automate returns 202 Accepted when the trigger receives the request;
    // a later flow action can still fail, so treat non-2xx as hard errors only.
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Teams webhook post failed (${response.status} ${response.statusText})${body ? `: ${body}` : ''}`,
      );
    }

    logger?.info('Teams webhook accepted Adaptive Card payload', {
      status: response.status,
    });

    return {
      text: inputData.text,
      teamsPosted: true,
    };
  },
});
