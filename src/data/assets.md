# Generated Assets Manifest

Agent-facing source of truth for handles in this game.

## Maps

_(none — scene uses an inline blank starter panel)_

## Characters

| Handle       | File        | Notes |
| ------------ | ----------- | ----- |
| `charPlayer` | `char.json` | Multi-clip directional pack (`animations.walk` × front/back/right). Left = flip `right`. |

### Character JSON (recommended)

```json
{
  "label": "hero",
  "defaultAnimation": "idle",
  "defaultFacing": "front",
  "animations": {
    "idle": {
      "front": { "url": "...", "metadata": { "frame_count": 4, "frame_w": 64, "frame_h": 64 } },
      "back":  { "url": "...", "metadata": { ... } },
      "right": { "url": "...", "metadata": { ... } }
    },
    "walk": {
      "front": { "url": "...", "metadata": { "frame_count": 8, ... } },
      "back":  { ... },
      "right": { ... }
    },
    "run": { "front": { ... }, "back": { ... }, "right": { ... } },
    "attack": { "front": { ... }, "back": { ... }, "right": { ... } }
  }
}
```

**Rules**

| Field | Meaning |
|-------|---------|
| `animations.{clip}.{facing}` | One horizontal strip per clip × facing |
| Sheet name at runtime | `{clip}_{facing}` → `walk_front`, `idle_right` |
| `front` | Toward camera (move down) |
| `back` | Away from camera (move up) |
| `right` | Side; engine mirrors with `facingX = -1` for left |
| `left` | Optional unique left art (no flip) |
| Missing `idle` | Actor freezes **frame 0** of the walk strip for that facing |

Wire:

```ts
import { charPlayer, toArchetype } from "../data";
game.defineArchetype("player", toArchetype(charPlayer, { speed: 200 }));
game.spawnAtFeet("player", 500, 520);
// 4-way is native on Actor — no extra system
```

One-shot clips (attack, emote):

```ts
game.setEntityAnimation(id, "attack_front");
// when done, movement will restore walk/idle on next move intent
```

### Legacy single-clip pack (still supported)

Top-level `front` / `back` / `right` + `"animation": "walking"` still expands to `walking_*` sheets.

## Props

_(none)_

## Common / audio

See `common.json`.
