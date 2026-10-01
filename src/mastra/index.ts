import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from '@mastra/duckdb';
import { MastraCompositeStore } from '@mastra/core/storage';
import {
  MastraStorageExporter,
  MastraPlatformExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability';
import { agent } from './agents/agent';
import { dataEngineerAgent } from './agents/data-engineer-agent';
import { outlierAnalysisAgent } from './agents/outlier-analysis-agent';
import {
  bqDescribeColumnsTool,
  bqListDatasetsTool,
  bqListTablesTool,
  bqRunSqlTool,
} from './tools/bigquery-tools';
import {
  omDescribeCertifiedTableTool,
  omGetGlossaryTermTool,
  omGetMetricTool,
  omListCertifiedAssetsTool,
  omSearchGlossaryTool,
  omSearchMetricsTool,
} from './tools/openmetadata-tools';
import { startScheduleTool, stopScheduleTool } from './tools/schedule-tools';
import { dailyOutlierAnalysisWorkflow } from './workflows/daily-outlier-analysis-workflow';
import {
  answerSimilarityJudgeScorer,
  answerStructureScorer,
  requiredToolsScorer,
  sqlReadonlyObservableScorer,
} from './scorers/index.js';

export const mastra = new Mastra({
  bundler: {
    externals: ['@duckdb/node-bindings'],
  },
  agents: { agent, dataEngineerAgent, outlierAnalysisAgent },
  workflows: { dailyOutlierAnalysisWorkflow },
  scorers: {
    'required-tools': requiredToolsScorer,
    'sql-readonly-observable': sqlReadonlyObservableScorer,
    'answer-structure': answerStructureScorer,
    'answer-similarity-judge': answerSimilarityJudgeScorer,
  },
  tools: {
    startScheduleTool,
    stopScheduleTool,
    omSearchGlossaryTool,
    omGetGlossaryTermTool,
    omSearchMetricsTool,
    omGetMetricTool,
    omListCertifiedAssetsTool,
    omDescribeCertifiedTableTool,
    bqListDatasetsTool,
    bqListTablesTool,
    bqDescribeColumnsTool,
    bqRunSqlTool,
  },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: 'mastra-storage',
      url: process.env.TURSO_DATABASE_URL || 'file:./mastra.db',
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    },
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [new MastraStorageExporter(), new MastraPlatformExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
