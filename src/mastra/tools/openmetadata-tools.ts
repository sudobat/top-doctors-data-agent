import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  getCertifiedTable,
  getPublishedGlossaryTerm,
  getPublishedMetric,
  listCertifiedAssets,
  searchPublishedGlossaryTerms,
  searchPublishedMetrics,
} from '../db/openmetadata';

export const omSearchGlossaryTool = createTool({
  id: 'om_search_glossary',
  description:
    'Search published (Approved) OpenMetadata glossary terms. Use before business data questions. Draft/unpublished terms are never returned.',
  inputSchema: z.object({
    query: z.string().describe('Search text for glossary term name or description.'),
    limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10).'),
  }),
  execute: async ({ query, limit }) => {
    const terms = await searchPublishedGlossaryTerms(query, limit ?? 10);
    return {
      publishedOnly: true,
      count: terms.length,
      terms: terms.map(t => ({
        name: t.name,
        displayName: t.displayName,
        fullyQualifiedName: t.fullyQualifiedName,
        description: t.description,
        synonyms: t.synonyms,
        glossary: t.glossary?.fullyQualifiedName || t.glossary?.name,
        entityStatus: t.entityStatus || 'Approved',
      })),
    };
  },
});

export const omGetGlossaryTermTool = createTool({
  id: 'om_get_glossary_term',
  description:
    'Fetch one published OpenMetadata glossary term by name or FQN. Returns null-shaped empty result if missing or not Approved.',
  inputSchema: z.object({
    nameOrFqn: z.string().describe('Glossary term name or fully qualified name.'),
  }),
  execute: async ({ nameOrFqn }) => {
    const term = await getPublishedGlossaryTerm(nameOrFqn);
    if (!term) {
      return { found: false, publishedOnly: true, term: null };
    }
    return {
      found: true,
      publishedOnly: true,
      term: {
        name: term.name,
        displayName: term.displayName,
        fullyQualifiedName: term.fullyQualifiedName,
        description: term.description,
        synonyms: term.synonyms,
        glossary: term.glossary?.fullyQualifiedName || term.glossary?.name,
        entityStatus: term.entityStatus || 'Approved',
      },
    };
  },
});

export const omSearchMetricsTool = createTool({
  id: 'om_search_metrics',
  description:
    'Search published OpenMetadata metrics (business definition + optional formula guidance). Formulas are guidance only — implement/query via certified BigQuery silver_/gold_ models.',
  inputSchema: z.object({
    query: z.string().describe('Search text for metric name or description.'),
    limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10).'),
  }),
  execute: async ({ query, limit }) => {
    const metrics = await searchPublishedMetrics(query, limit ?? 10);
    return {
      publishedOnly: true,
      formulasAreGuidanceOnly: true,
      count: metrics.length,
      metrics: metrics.map(m => ({
        name: m.name,
        displayName: m.displayName,
        fullyQualifiedName: m.fullyQualifiedName,
        description: m.description,
        metricType: m.metricType,
        unitOfMeasurement: m.unitOfMeasurement,
        metricExpression: m.metricExpression,
        entityStatus: m.entityStatus || 'Approved',
      })),
    };
  },
});

export const omGetMetricTool = createTool({
  id: 'om_get_metric',
  description:
    'Fetch one published OpenMetadata metric by name or FQN. Formula fields are metadata guidance only, not executable.',
  inputSchema: z.object({
    nameOrFqn: z.string().describe('Metric name or fully qualified name.'),
  }),
  execute: async ({ nameOrFqn }) => {
    const metric = await getPublishedMetric(nameOrFqn);
    if (!metric) {
      return { found: false, publishedOnly: true, formulasAreGuidanceOnly: true, metric: null };
    }
    return {
      found: true,
      publishedOnly: true,
      formulasAreGuidanceOnly: true,
      metric: {
        name: metric.name,
        displayName: metric.displayName,
        fullyQualifiedName: metric.fullyQualifiedName,
        description: metric.description,
        metricType: metric.metricType,
        unitOfMeasurement: metric.unitOfMeasurement,
        metricExpression: metric.metricExpression,
        entityStatus: metric.entityStatus || 'Approved',
      },
    };
  },
});

export const omListCertifiedAssetsTool = createTool({
  id: 'om_list_certified_assets',
  description:
    'List certified semantic-layer tables known to OpenMetadata (names starting with silver_ or gold_). Prefer these for SQL.',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(200).optional().describe('Max results (default 50).'),
  }),
  execute: async ({ limit }) => {
    const tables = await listCertifiedAssets(limit ?? 50);
    return {
      certifiedPrefixes: ['silver_', 'gold_'],
      count: tables.length,
      tables: tables.map(t => ({
        name: t.name,
        displayName: t.displayName,
        fullyQualifiedName: t.fullyQualifiedName,
        description: t.description,
      })),
    };
  },
});

export const omDescribeCertifiedTableTool = createTool({
  id: 'om_describe_certified_table',
  description:
    'Describe a certified silver_/gold_ table from OpenMetadata, including column descriptions from the catalog.',
  inputSchema: z.object({
    nameOrFqn: z
      .string()
      .describe('Table name (e.g. gold_revenue_by_specialty) or fully qualified OpenMetadata name.'),
  }),
  execute: async ({ nameOrFqn }) => {
    const table = await getCertifiedTable(nameOrFqn);
    if (!table) {
      return {
        found: false,
        reason: 'Not found in OpenMetadata, or not a certified silver_/gold_ table.',
        table: null,
      };
    }
    return {
      found: true,
      table: {
        name: table.name,
        displayName: table.displayName,
        fullyQualifiedName: table.fullyQualifiedName,
        description: table.description,
        columns: (table.columns || []).map(c => ({
          name: c.name,
          displayName: c.displayName,
          description: c.description,
          dataType: c.dataType,
        })),
      },
    };
  },
});
