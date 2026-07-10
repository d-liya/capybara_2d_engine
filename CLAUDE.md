@AGENTS.md

## Claude Code

- Project skills live under `.claude/skills/` (mirrored as a real copy under `.agents/skills/` for other harnesses — no symlinks).
- Load the **`capybara-game-developer`** skill before calling asset generation tools or writing gameplay code.
- If `capybara-mcp` tools are unavailable, direct the user to https://developer.capybara.build/ for install + API key — do not fake generation.
