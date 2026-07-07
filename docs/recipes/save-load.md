---
name: save-load
description: Persist and restore game state via the Capybara SDK facade. Use when implementing save/load, autosave, or session persistence.
---

# Recipe: Save and Load

Use the Capybara SDK facade for persistence.

## Read first

- `docs/SDK_FACADE.md`
- `src/sdk/index.ts` only if exact signatures are needed

Avoid SDK internals such as `src/sdk/Save.ts` unless a bug is proven.

## Session/auth

Save/load requires a user session, but the SDK facade automatically creates a guest session for `sdk.save.*` calls when no user is logged in. Gameplay code normally calls `sdk.save.loadGameData()` / `sdk.save.saveGameData(...)` directly. Shared state uses the same guest-auth path via `sdk.save.loadSharedState()` / `sdk.save.saveSharedState(...)`. Use email OTP only when the task explicitly asks for a player-facing email login flow.

## Save shape

Save only serializable gameplay state, not entity ids if they can be recreated.

For farming-style games, prefer separate global and season day fields:

```ts
export interface GameSaveData {
  version: 1;
  season: "spring" | "summer" | "autumn" | "winter";
  globalDay: number;
  seasonDay: number;
  gold: number;
  crops: Array<{
    id: string;
    placementId: string;
    row?: number;
    col?: number;
    state: 0 | 1 | 2 | 3 | 4 | 5;
    daysSincePlanting: number;
  }>;
}
```

For non-farming games, adapt the payload to stable gameplay fields; `docs/SDK_FACADE.md` shows the generic SDK contract.

## Load pattern

Scene creation should normally return `GameAPI` synchronously. Register default resources first, then start a fire-and-forget async bootstrap that authenticates, loads, validates, and patches resources/entities.

```ts
game.registerResource("farm", createDefaultFarmState());

void (async () => {
  const farm = game.getResource<FarmState>("farm");
  try {
    const saved = await sdk.save.loadGameData(); // Auto guest-auths; Record<string, unknown> | null
    if (isGameSaveData(saved)) {
      hydrateFarmFromSave(game, saved);
    }
  } catch (error) {
    farm.lastSaveError = error instanceof Error ? error.message : String(error);
  } finally {
    farm.loadingSave = false;
  }
})();
```

`loadGameData()` returns the raw saved object or `null`; it does not return `{ data: ... }`.

After loading, reconnect stable saved records to fresh runtime entities. For example, rebuild or patch crop overlay entities from saved crop states instead of saving entity ids.

## Save pattern

Save on meaningful transitions such as day advance, harvest, purchase, explicit checkpoint, or menu quit.

```ts
await sdk.save.saveGameData(toSavePayload(farm));
```

`saveGameData(payload)` overwrites/replaces the current saved data object for the authenticated user/game.

For independent key/value data such as agent history, settings, or feature blobs that should not overwrite the main save payload, use `sdk.storage.get/set/delete` instead of nesting everything into `saveGameData(...)`. Persistent AI agent history uses isolated storage internally; see `docs/recipes/persistent-agent-history.md`.

## Shared state

Use shared state when every player of the game should see the same persisted JSON blob, such as a global leaderboard, world event flag, or shared build progress.

```ts
const shared = await sdk.save.loadSharedState();
if (shared?.version === 1) {
  farm.globalEventActive = shared.globalEventActive === true;
}

await sdk.save.saveSharedState({
  version: 1,
  globalEventActive: farm.globalEventActive,
  leaderboard: farm.leaderboard,
});
```

- `loadSharedState()` returns the raw shared object or `null`.
- `saveSharedState(data)` overwrites/replaces the shared object for the active game.
- Prefer per-user `saveGameData(...)` for individual player progress.
- Prefer `sdk.multiplayer.*` for ephemeral room state with presence and version conflicts.

Avoid saving every frame. Use a `pendingSave` flag set by systems/inputs and consumed by a save system.

## What not to save

Do not save:

- DOM/widget local ephemeral state (not HUD visibility — use `ui` resource + `game.patchUi`)
- entity ids unless needed only for current session
- generated asset URLs
- full map/character JSON
- SDK objects

Do save stable ids and serializable state:

- crop placement ids, row/col, or other stable placement keys
- season/global day/season day/gold
- crop state counters
- inventory/tool selection if needed for resume
