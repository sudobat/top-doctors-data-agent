import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTeamsWebhookPayload,
  chunkText,
  MAX_TEAMS_TEXT_CHARS,
  TEXT_BLOCK_CHUNK_CHARS,
  truncateReportForTeams,
} from '../../src/mastra/workflows/steps/post-to-teams-webhook.js';

describe('Teams webhook payload helpers', () => {
  it('builds an Adaptive Card message envelope', () => {
    const payload = buildTeamsWebhookPayload('hello outliers');
    assert.equal(payload.type, 'message');
    assert.equal(payload.attachments.length, 1);
    assert.equal(payload.attachments[0].contentType, 'application/vnd.microsoft.card.adaptive');
    assert.equal(payload.attachments[0].content.type, 'AdaptiveCard');
    assert.equal(payload.attachments[0].content.version, '1.4');
    const texts = payload.attachments[0].content.body.map((b: { text: string }) => b.text);
    assert.equal(texts[0], 'Daily outlier analysis');
    assert.ok(texts.includes('hello outliers'));
  });

  it('truncates reports above the Teams size limit', () => {
    const long = 'x'.repeat(MAX_TEAMS_TEXT_CHARS + 100);
    const truncated = truncateReportForTeams(long);
    assert.ok(truncated.length < long.length);
    assert.ok(truncated.endsWith('…(truncated for Teams webhook size limit)'));
    assert.equal(truncateReportForTeams('short'), 'short');
  });

  it('chunks long text into TextBlock-sized pieces', () => {
    const text = 'a'.repeat(TEXT_BLOCK_CHUNK_CHARS * 2 + 10);
    const chunks = chunkText(text, TEXT_BLOCK_CHUNK_CHARS);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].length, TEXT_BLOCK_CHUNK_CHARS);
    assert.equal(chunks[2].length, 10);

    const payload = buildTeamsWebhookPayload(text);
    // title + 3 chunks
    assert.equal(payload.attachments[0].content.body.length, 4);
  });
});
