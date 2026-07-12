# Capybara 2.5D Engine

[![MCP setup](https://i.vimeocdn.com/video/2178843637-1790ab9c71007d0db167c387813bb3125bb953d90e430590f581f26d01c50071-d_640x360)](https://vimeo.com/1209288685)

**Watch:** [MCP setup](https://vimeo.com/1209288685)

**MCP & API key:** [developer.capybara.build](https://developer.capybara.build/)

**Community:** [Join the Discord](https://discord.gg/GTfuBwCRd)

The entire public engine interface lives in a single file: `src/Game.ts`. This gives your agent a stable, predictable surface to learn and call without getting lost in a massive codebase.

## What’s Inside

- **AI-First Workflow:** Built from the ground up for generated maps, characters, props, audio, and widgets.
- **Simple Interfaces:** Thin public APIs with deep modules underneath. It gives agents room to customize without the engine limiting what they can build.
- **Dependency-Light:** Fewer moving parts means fewer version fights, easier extensions, and a codebase small enough for agents to hold in context.
- **Server SDK:** Includes a built-in SDK (`src/sdk/`) to handle the boring parts like player accounts, cloud saves, and multiplayer in just a line or two.

## Quick Start

The engine works as a **standalone product** — you can run it, write gameplay code, and ship without any extra services.

If you want the convenience of the **asset generation pipeline** (maps, characters, props, audio, HUD art), set up the Capybara MCP. Coding agents can't natively generate those assets on their own. Grab an API key and follow the setup instructions at [developer.capybara.build](https://developer.capybara.build/).

Get the engine running locally:

```bash
npm install
npm run dev

```

### Assets look wrong?

**Check the original file in `src/data` before regenerating.** Generated art is usually fine — coding agents often wire it in with the wrong aspect ratio.
