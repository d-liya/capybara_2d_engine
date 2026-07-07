---
name: rpg-quests-inventory
description: Quest flags, objectives, pickups, chests, equipment, consumables, shops, and inventory HUDs. Use when implementing adventure/RPG item and quest mechanics.
---

# Recipe: RPG Quests, Inventory, and Pickups

Use this for adventure/RPG mechanics: quest flags, NPC objectives, pickups, chests, equipment, consumables, shops, and quest/inventory HUDs.

## Core idea

RPG progress should be represented by stable, serializable IDs:

- quest IDs
- objective IDs
- item IDs
- NPC IDs/names
- chest IDs
- door/region IDs
- defeated boss flags

Do not save runtime entity ids, generated asset URLs, DOM state, or full generated JSON.

## State shape

```ts
export type QuestStatus = "inactive" | "active" | "readyToTurnIn" | "completed";

export interface QuestState {
  id: string;
  title: string;
  status: QuestStatus;
  objectiveText: string;
  progress: number;
  required: number;
  giverNpcId?: string;
  rewardGold?: number;
  rewardItems?: string[];
}

export interface InventoryItemStack {
  itemId: string;
  label: string;
  count: number;
  maxStack?: number;
  kind: "quest" | "consumable" | "equipment" | "currency" | "key";
}

export interface RpgState {
  gold: number;
  quests: Record<string, QuestState>;
  inventory: InventoryItemStack[];
  openedChests: Record<string, true>;
  defeatedEnemies: Record<string, true>;
  equippedWeaponId?: string;
  selectedItemId?: string;
}
```

Register this as a resource:

```ts
game.registerResource("rpg", createDefaultRpgState());
```

Use `game.getResource<RpgState>("rpg")` when reading it.

## Item definitions

Keep item definitions in gameplay code/types unless they are generated assets. Use `src/data/assets.md` only for actual art handles.

```ts
export const ITEM_DEFS = {
  apple: {
    label: "Apple",
    kind: "consumable",
    // Optional icon fields should use propGroup/itemName values copied from src/data/assets.md.
  },
  bronzeKey: {
    label: "Bronze Key",
    kind: "key",
  },
} as const;
```

Only add prop groups/item names that exist in `src/data/assets.md`. If the exact requested item art does not exist, substitute the nearest listed prop and document the substitution in the plan.

## Pickups and chests

Define pickup/chest archetypes with stable IDs:

```ts
game.defineArchetype("pickup", {
  kind: "pickup",
  label: "Pickup",
  width: 46,
  height: 46,
  radius: 26,
});

game.defineArchetype("chest", {
  kind: "chest",
  label: "Chest",
  tooltip: "Press E to open",
  width: 105,
  height: 90,
});
```

Spawn using authored placement targets when available:

```ts
const chestId = game.spawnCentered("chest", 520, 640, {
  stableId: "chest_farm_intro",
  rewardItemId: "bronzeKey",
  rewardCount: 1,
});
```

On interaction, mutate the RPG resource and patch/destroy the entity:

```ts
function addItem(rpg: RpgState, itemId: string, count = 1) {
  const existing = rpg.inventory.find((item) => item.itemId === itemId);
  if (existing) existing.count += count;
  else rpg.inventory.push({ itemId, label: itemId, count, kind: "quest" });
}

game.on("rpg:openChest", (payload) => {
  const { chestEntityId } = payload as { chestEntityId?: EntityId };
  if (!chestEntityId) return;

  const chest = game.get(chestEntityId);
  const stableId = String(chest?.stableId ?? "");
  if (!chest || !stableId) return;

  const rpg = game.getResource<RpgState>("rpg");
  if (rpg.openedChests[stableId]) return;

  addItem(
    rpg,
    String(chest.rewardItemId ?? "unknown"),
    Number(chest.rewardCount ?? 1),
  );
  rpg.openedChests[stableId] = true;
  game.patch(chestEntityId, { opened: true, tooltip: "Opened" });
  game.emit("quest:progress", { type: "chestOpened", stableId });
});
```

Import `EntityId` from `../Game` if needed.

## Quest progression

Use events to decouple gameplay systems from quest logic:

```ts
game.on("quest:progress", (payload) => {
  const event = payload as {
    type?: string;
    itemId?: string;
    enemyId?: string;
    npcId?: string;
  };
  const rpg = game.getResource<RpgState>("rpg");
  const quest = rpg.quests.introQuest;
  if (!quest || quest.status !== "active") return;

  if (event.type === "itemCollected" && event.itemId === "apple") {
    quest.progress = Math.min(quest.required, quest.progress + 1);
    if (quest.progress >= quest.required) quest.status = "readyToTurnIn";
  }
});
```

NPC dialogue can read quest state and emit events such as:

- `quest:start`
- `quest:turnIn`
- `quest:progress`
- `dialogue:open`

## Inventory use/equipment

Inputs or widgets should dispatch intent; state changes happen in input handlers/events/systems.

```ts
game.on("inventory:use", (payload) => {
  const { itemId } = payload as { itemId?: string };
  if (!itemId) return;

  const rpg = game.getResource<RpgState>("rpg");
  const stack = rpg.inventory.find((item) => item.itemId === itemId);
  if (!stack || stack.count <= 0) return;

  if (stack.kind === "consumable") {
    const combat = game.getResource<{ playerHp: number; playerMaxHp: number }>(
      "combat",
    );
    combat.playerHp = Math.min(combat.playerMaxHp, combat.playerHp + 1);
    stack.count -= 1;
  }

  rpg.inventory = rpg.inventory.filter((item) => item.count > 0);
});
```

For equipment, store the selected/equipped item ID in the RPG/combat resource, then have combat systems read it for damage, projectile art, cooldown, or range.

## HUD/widgets

Drive HUD shell visibility with `game.patchUi(...)` and `ui` bindings (`docs/recipes/hud-widget.md`). Use widgets for:

- inventory grid
- equipment panel
- quest log
- pickup toast
- shop/menu dialog

Rules:

- Passive quest trackers and pickup toasts should not block movement.
- Inventory, shop, pause, and dialogue menus can block world input while open.
- Widgets display resources and emit/dispatch intent; they do not own inventory/quest state.

## Save/load

Recommended save payload:

```ts
export interface RpgSaveData {
  version: 1;
  gold: number;
  quests: Record<string, Pick<QuestState, "status" | "progress">>;
  inventory: Array<{ itemId: string; count: number }>;
  openedChests: Record<string, true>;
  defeatedEnemies: Record<string, true>;
  equippedWeaponId?: string;
}
```

On load, rebuild runtime entity state from stable IDs:

- mark opened chests as opened
- hide/destroy already collected pickups
- restore quest status/progress
- restore inventory counts
- restore equipment selection

Do not save entity IDs, active dialogue text, DOM state, generated asset URLs, or complete generated data.
