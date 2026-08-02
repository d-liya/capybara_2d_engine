# Capybara 2.5D Engine

**Capybara v2 is here.** This update brings:

- **Richly detailed maps**, generated with far more depth, texture, and life in every tile
- **A web interface built for pixel-perfect control**, so every placement feels exact, not approximate
- **Sharper art consistency** across props, characters, and HUDs, paired with a brand new layer of voice lines, sound effects, and an original background score

**Try the demo game:** [DEMO LINK]

**Platform:** [www.capybara.build](https://www.capybara.build/)

**Community:** [Join the Discord](https://discord.gg/GTfuBwCRd)

The entire public engine interface lives in a single file: `src/Game.ts`. This gives your agent a stable, predictable surface to learn and call without getting lost in a massive codebase.

## What's Inside

- **AI-First Workflow:** Built from the ground up for generated maps, characters, props, audio, and widgets.
- **Simple Interfaces:** Thin public APIs with deep modules underneath. It gives agents room to customize without the engine limiting what they can build.
- **Dependency-Light:** Fewer moving parts means fewer version fights, easier extensions, and a codebase small enough for agents to hold in context.
- **Server SDK:** Includes a built-in SDK (`src/sdk/`) to handle the boring parts like player accounts, cloud saves, and multiplayer in just a line or two.

## Quick Start

Capybara v2 moves asset generation into a web interface: start there to generate your worlds, characters, props, and audio, then export the code and bring it into your own coding agent to wire up gameplay.

1. Generate your worlds and assets at [capybara.build](https://www.capybara.build)
2. Export the code
3. Use your coding agent to wire up gameplay and make changes
4. Sync changes back and forth between local and cloud as you go (see below)
5. Publish directly from your coding agent when ready

The engine also works as a **standalone product** — you can run it, write gameplay code, and ship without generating any new assets.

Get the engine running locally:

```bash
npm install
npm run dev
```

> Miss the old MCP setup? Let us know on [Discord](https://discord.gg/GTfuBwCRd) — happy to bring back support if there's demand for it.

### Assets look wrong?

**Check the original file in `src/data` before regenerating.** Generated art is usually fine — coding agents often wire it in with the wrong aspect ratio.

## Push, pull & publish to Capybara

When you download an HTML export from [capybara.build](https://www.capybara.build), the zip includes a `.env` with a chat-scoped API key and this project's `.git` history.

```bash
npm run pull     # fetch + merge latest code from Capybara
npm run push     # merge cloud first, then upload local commits
npm run publish  # push, build locally, upload dist/, print live / game / app links
```

`pull` / `push` merge with the cloud (they do not overwrite your `origin`). On conflict they write `.capybara/sync-status.json` and exit `2` so a coding agent can resolve markers, commit, and re-run.

For new generated assets (maps, characters, props, audio, HUD), create them on [capybara.build](https://www.capybara.build) then `npm run pull`.

The API key only works for these CLI endpoints. Do not commit `.env`.
