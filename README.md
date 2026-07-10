# Capybara 2.5D Engine

A **lightweight, dependency-light** game engine built for coding agents.

The entire public engine interface lives in one file — [`src/Game.ts`](src/Game.ts) — so agents (and humans) have a single, stable surface to learn and call. Deep modules sit underneath for camera, input, maps, rendering, and widgets; you customize those when you need to, without the facade getting in the way.

It also ships an **SDK** ([`src/sdk/`](src/sdk/)) for server-side concerns: save/load, auth, and multiplayer.

## Why this shape

- **AI assets are first-class** — generated maps, characters, props, audio, and widgets are part of the workflow, not bolted on later.
- **Simple interfaces, deep modules** — thin public APIs with room to customize underneath, so the engine does not limit what coding agents can build.
- **Dependency-light** — fewer moving parts means easier extension, fewer version fights, and a codebase agents can actually hold in context.

## Quick start

**Prerequisite:** set up **Capybara MCP** (API key + MCP install) to generate assets — [developer.capybara.build](https://developer.capybara.build/).

```bash
npm install
npm run dev
```

Typecheck with `npm run typecheck`.

## Layout (high level)

| Path | Role |
|------|------|
| `src/Game.ts` | Public facade — primary API for gameplay code |
| `src/sdk/` | Server functionality (save, auth, multiplayer) |
| `src/scenes/` | Scene entrypoints and orchestration |
| `src/systems/` | Per-frame gameplay logic |
| `src/archetypes/` | Reusable entity defaults |
| `src/widgets/` | DOM HUD plugins |
| `src/data/` | Generated assets and adapters |
| `docs/recipes/` | Optional implementation patterns |

See [`AGENTS.md`](AGENTS.md) for architecture rules, coordinate conventions, and common patterns.

## Agent harnesses

One shared engine on `main`; harness folders coexist:

| Path | Role |
|------|------|
| [`AGENTS.md`](AGENTS.md) | Shared agent instructions (Codex, Cursor, and others) |
| [`CLAUDE.md`](CLAUDE.md) | Claude entry — imports via `@AGENTS.md` |
| `.claude/skills/` | Project skills for Claude Code |
| `.agents/skills/` | Same skills for other harnesses (copied, not symlinked) |
