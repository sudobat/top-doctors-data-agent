# AGENTS.md

## CRITICAL: Load `mastra` skill first

Load the `mastra` skill BEFORE any Mastra work. Never rely on cached knowledge — APIs change between versions.

## Rules

- Register all agents, tools, workflows, and scorers in `src/mastra/index.ts`
- Use the `dev` and `build` scripts from `package.json` instead of running `mastra dev` / `mastra build` directly
- Do **not** use spec-driven development (no `specs/`, no requirement interviews, no spec approval before code)
- Do **not** use test-driven development (no writing tests first, no requiring tests unless explicitly asked)

## Resources

- [Mastra Documentation](https://mastra.ai/llms.txt)
