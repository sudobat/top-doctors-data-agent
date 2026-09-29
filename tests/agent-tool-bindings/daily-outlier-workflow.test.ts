import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dailyOutlierAnalysisWorkflow } from '../../src/mastra/workflows/daily-outlier-analysis-workflow.js';

describe('dailyOutlierAnalysisWorkflow', () => {
  it('has id and morning Europe/Madrid schedule', () => {
    assert.equal(dailyOutlierAnalysisWorkflow.id, 'daily-outlier-analysis');

    const schedules = dailyOutlierAnalysisWorkflow.getScheduleConfigs();
    assert.equal(schedules.length, 1);
    assert.equal(schedules[0]?.cron, '0 9 * * *');
    assert.equal(schedules[0]?.timezone, 'Europe/Madrid');
  });
});
