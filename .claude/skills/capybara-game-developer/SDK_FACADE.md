# Capybara SDK Facade Guide

Use this guide before opening SDK internals. Gameplay code should import the facade from `src/sdk/index.ts`.

This file is the source of truth for SDK-facing behavior. Workflow and engine docs should link here instead of restating auth, save/load, storage, or multiplayer contracts.

## Import

From files under `src/scenes`, `src/systems`, `src/inputs`, or `src/widgets`:

```ts
import { sdk } from "../sdk";
```

Adjust the relative path if needed.

## Initialization

Gameplay code usually does **not** call `sdk.init()`.

SDK calls lazy-initialize from `window.gameId`, which is injected by `index.html`. Do not pass a game id in gameplay code.

Only call eager initialization when explicitly required for custom client options:

```ts
sdk.init({ baseUrl: "https://example.invalid" });
```

## Auth/session behavior

Cloud save and multiplayer require an authenticated user session. The SDK facade now handles the default guest-session path automatically: if no user is logged in, calls such as `sdk.save.loadGameData()`, `sdk.save.saveGameData(...)`, `sdk.save.loadSharedState()`, `sdk.save.saveSharedState(...)`, `sdk.storage.*`, and `sdk.multiplayer.*` sign in as a guest before contacting the service.

Gameplay code usually does **not** need to call `sdk.auth.ensureGuestSession()`.

Use explicit auth only when the game has a player-facing account flow. If the task explicitly asks for email login, implement email OTP:

```ts
await sdk.auth.sendLoginEmail(email);
const user = await sdk.auth.verifyLoginEmail(email, otp, name);
```

The explicit helper remains available for unusual cases where a scene wants to warm the guest session before any SDK feature is used:

```ts
await sdk.auth.ensureGuestSession();
```

## Save/load exact contract

Save data is scoped by the active `window.gameId` and authenticated user.

```ts
const saved = await sdk.save.loadGameData();
```

Contract:

```ts
sdk.save.loadGameData(): Promise<Record<string, unknown> | null>
sdk.save.saveGameData(data: Record<string, unknown>): Promise<void>
sdk.save.loadSharedState(): Promise<Record<string, unknown> | null>
sdk.save.saveSharedState(data: Record<string, unknown>): Promise<void>
sdk.storage.get<T = unknown>(key: string): Promise<T | null>
sdk.storage.set<T = unknown>(key: string, value: T): Promise<void>
sdk.storage.delete(key: string): Promise<void>
```

- `loadGameData()` returns the raw saved data object, not `{ data: ... }`.
- `loadGameData()` returns `null` when no save exists.
- `loadGameData()` throws for non-404 SDK/server errors.
- `saveGameData(data)` overwrites/replaces the saved data object for the current user/game.
- `loadSharedState()` returns one shared JSON object for the whole game, visible to every authenticated player.
- `loadSharedState()` returns `null` when no shared state exists yet.
- `saveSharedState(data)` overwrites/replaces that shared object for the active game.
- `sdk.storage` stores isolated key/value records scoped to the active game and authenticated user. Prefer it for agent history, settings, independent feature blobs, and data that should not overwrite the main game save.
- Save only JSON-serializable gameplay data.
- Do not save entity ids, DOM state, audio elements, map JSON, URLs that can be re-derived from asset names, or SDK objects.

Recommended pattern:

```ts
type SavePayload = {
  version: 1;
  season: "spring" | "summer" | "autumn" | "winter";
  globalDay: number;
  seasonDay: number;
  gold: number;
  crops: Array<{ id: string; state: number; daysSincePlanting: number }>;
};

// Facade auto guest-auths if no user is logged in.
const saved = (await sdk.save.loadGameData()) as SavePayload | null;
if (saved?.version === 1) {
  // hydrate resources from saved
}

await sdk.save.saveGameData({
  version: 1,
  season: farm.season,
  globalDay: farm.globalDay,
  seasonDay: farm.seasonDay,
  gold: farm.gold,
  crops: farm.crops.map((crop) => ({
    id: crop.id,
    state: crop.state,
    daysSincePlanting: crop.daysSincePlanting,
  })),
});
```

Save on important transitions such as day advance, harvest, or explicit checkpoint. Do not save every frame.





## Multiplayer

Only use multiplayer when the task asks for multiplayer/account features.

```ts
await sdk.multiplayer.joinRoom("room-id", { name: "Player" });
```

## Do not read SDK internals by default

Avoid opening:

- `src/sdk/Save.ts`
- `src/sdk/Auth.ts`
- `src/sdk/Core.ts`
- `src/sdk/Multiplayer.ts`

Open them only if `src/sdk/index.ts` and this facade guide are insufficient or a real SDK bug is identified. If you do inspect an internal file during an autonomous task, inspect the smallest necessary file and mention why in the final summary.
