/**
 * Normalize Mastra experiment / unit-test scorer run payloads into a common shape.
 *
 * Live agent experiments pass scorers:
 *   run.output = MastraDBMessage[]  (ScorerRunOutputForAgent)
 * via `scorerOutput`, which takes precedence over the Studio result
 * `{ text, toolCalls: [{ payload: { toolName, args } }] }`.
 *
 * Unit tests historically pass flat:
 *   run.toolCalls / run.tracing.toolCalls with { toolName, args } (or string ids)
 *   run.output as a plain string
 */

import { extractTrajectory } from '@mastra/core/evals';

export type NormalizedToolCall = {
  toolName: string;
  args?: Record<string, unknown>;
  input?: Record<string, unknown>;
};

export type NormalizedScorerRun = {
  outputText: string;
  toolCalls: NormalizedToolCall[];
  groundTruth: Record<string, unknown> | undefined;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isMastraDbMessageArray(output: unknown): output is Array<Record<string, unknown>> {
  if (!Array.isArray(output) || output.length === 0) return false;
  const first = asRecord(output[0]);
  if (!first) return false;
  // MastraDBMessage has role + content object; string parts arrays are also possible in tests
  return typeof first.role === 'string' || asRecord(first.content)?.format === 2;
}

function textFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  const texts: string[] = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      texts.push(part);
      continue;
    }
    const p = asRecord(part);
    if (!p) continue;
    if (p.type === 'text' && typeof p.text === 'string') texts.push(p.text);
    else if (typeof p.text === 'string' && !p.type) texts.push(p.text);
  }
  return texts.join('\n');
}

function textFromMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return textFromParts(content);

  const obj = asRecord(content);
  if (!obj) return '';

  if (typeof obj.content === 'string' && obj.content.length > 0) return obj.content;
  if (Array.isArray(obj.content)) {
    const nested = textFromParts(obj.content);
    if (nested.trim()) return nested;
  }

  const fromParts = textFromParts(obj.parts);
  if (fromParts.trim()) return fromParts;

  return '';
}

function extractTextFromMastraMessages(messages: Array<Record<string, unknown>>): string {
  const chunks: string[] = [];
  for (const message of messages) {
    if (message.role && message.role !== 'assistant') continue;
    const text = textFromMessageContent(message.content);
    if (text.trim()) chunks.push(text);
  }
  // Fallback: any message text if no assistant role matched
  if (chunks.length === 0) {
    for (const message of messages) {
      const text = textFromMessageContent(message.content);
      if (text.trim()) chunks.push(text);
    }
  }
  return chunks.join('\n\n');
}

function toolNameFromEntry(entry: unknown): string | undefined {
  if (typeof entry === 'string' && entry.length > 0) return entry;
  const obj = asRecord(entry);
  if (!obj) return undefined;

  const payload = asRecord(obj.payload);
  const candidates = [
    payload?.toolName,
    payload?.toolId,
    payload?.name,
    obj.toolName,
    obj.toolId,
    obj.name,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return undefined;
}

function argsFromEntry(entry: unknown): Record<string, unknown> | undefined {
  const obj = asRecord(entry);
  if (!obj) return undefined;
  const payload = asRecord(obj.payload);
  return (
    asRecord(payload?.args) ??
    asRecord(payload?.input) ??
    asRecord(obj.args) ??
    asRecord(obj.input)
  );
}

function collectFlatToolEntries(run: Record<string, unknown>): unknown[] {
  const entries: unknown[] = [];
  const pushAll = (value: unknown) => {
    if (Array.isArray(value)) entries.push(...value);
  };

  pushAll(run.toolCalls);

  const tracing = asRecord(run.tracing);
  pushAll(tracing?.toolCalls);

  const output = asRecord(run.output);
  pushAll(output?.toolCalls);

  const nested = asRecord(output?.output);
  pushAll(nested?.toolCalls);

  return entries;
}

function extractOutputText(output: unknown): string {
  if (typeof output === 'string') return output;

  if (isMastraDbMessageArray(output)) {
    return extractTextFromMastraMessages(output);
  }

  if (Array.isArray(output)) {
    // Generic array (e.g. content parts) — avoid String([object Object])
    return output
      .map((part) => {
        if (typeof part === 'string') return part;
        const obj = asRecord(part);
        if (!obj) return '';
        if (typeof obj.text === 'string') return obj.text;
        if (typeof obj.content === 'string') return obj.content;
        return textFromMessageContent(obj.content ?? obj);
      })
      .filter(Boolean)
      .join('\n');
  }

  const obj = asRecord(output);
  if (!obj) return String(output ?? '');

  if (typeof obj.text === 'string') return obj.text;
  if (typeof obj.content === 'string') return obj.content;

  const nested = asRecord(obj.output);
  if (nested && typeof nested.text === 'string') return nested.text;

  if ('toolCalls' in obj && !('text' in obj) && !('content' in obj)) return '';
  return '';
}

function extractToolsFromMastraMessages(messages: Array<Record<string, unknown>>): NormalizedToolCall[] {
  try {
    const trajectory = extractTrajectory(messages as never);
    const tools: NormalizedToolCall[] = [];
    for (const step of trajectory.steps ?? []) {
      if (step.stepType !== 'tool_call') continue;
      if (typeof step.name !== 'string' || !step.name) continue;
      const args =
        step.toolArgs && typeof step.toolArgs === 'object' && !Array.isArray(step.toolArgs)
          ? (step.toolArgs as Record<string, unknown>)
          : undefined;
      tools.push({
        toolName: step.name,
        ...(args ? { args, input: args } : {}),
      });
    }
    return tools;
  } catch {
    return [];
  }
}

export function normalizeScorerRun(run: unknown): NormalizedScorerRun {
  const obj = asRecord(run) ?? {};
  const toolCalls: NormalizedToolCall[] = [];
  const seen = new Set<string>();

  const addTool = (tool: NormalizedToolCall) => {
    const key = `${tool.toolName}:${JSON.stringify(tool.args ?? null)}`;
    // Deduplicate exact duplicates but allow same tool with different args
    if (seen.has(key)) return;
    seen.add(key);
    toolCalls.push(tool);
  };

  // 1) Mastra agent experiment path: MastraDBMessage[]
  if (isMastraDbMessageArray(obj.output)) {
    for (const tool of extractToolsFromMastraMessages(obj.output)) addTool(tool);
  }

  // 2) Flat / Studio result shapes
  for (const entry of collectFlatToolEntries(obj)) {
    const toolName = toolNameFromEntry(entry);
    if (!toolName) continue;
    const args = argsFromEntry(entry);
    addTool({
      toolName,
      ...(args ? { args, input: args } : {}),
    });
  }

  return {
    outputText: extractOutputText(obj.output),
    toolCalls,
    groundTruth: asRecord(obj.groundTruth),
  };
}
