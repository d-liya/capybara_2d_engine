---
name: inventory-tools
description: Hotbar tool selection and cursor-attached icons. Use when building hotbars where clicking a slot selects a tool and shows it on the cursor.
---

# Recipe: Inventory Tools and Cursor Attachment

Use this for hotbars where clicking a generated HUD slot selects a tool and attaches an icon to the cursor.

## Assets

Use the actual tool prop group/item names from `src/data/` generated JSON. Example/current tool handles may look like:

```ts
getPropItemUrl("prop_tool_icons", "iron_hoe");
getPropItemUrl("prop_tool_icons", "watering_can");
getPropItemUrl("prop_tool_icons", "seed_packet");
getPropItemUrl("prop_tool_icons", "scythe");
```

## State

```ts
export interface InventorySlot {
  id: string;
  name: string;
  toolId?: "hoe" | "watering_can" | "seed_packet" | "scythe";
  iconUrl: string;
  count: number;
  description: string;
}

export interface InventoryState {
  slots: Array<InventorySlot | null>;
  selectedSlotIndex: number | null;
  selectedToolId: InventorySlot["toolId"] | null;
  cursorIconUrl: string | null;
}
```

Register this as a resource:

```ts
game.registerResource("inventory", createInitialInventory());
```

Show the hotbar during gameplay with your panel id:

```ts
game.useWidget(createInventoryWidget, { ui: { type: "panel", id: "hotbar" } });
game.patchUi({ panels: { hotbar: true } });
```

## Inputs

Bind number keys and clear:

```ts
game.bindInputAction("tool:clear", ["Escape"]);
```

Generated widgets may handle number keys internally. Prefer making widgets dispatch actions or emit events:

```ts
game.dispatchInputAction("tool:select", { phase: "down", slot: 0 });
```

If widgets currently contain stubs like `onSelectSlot`, replace stub bodies so they dispatch actions or update the `inventory` resource through `api.game` if available.

## Cursor icon

Implement cursor attachment in one of two ways:

1. A small widget that follows `pointermove` and reads `inventory.cursorIconUrl`.
2. DOM logic in the inventory widget if the task only needs visual cursor attachment.

Do not store selected tool only in widget-local state. The selected tool must live in the `inventory` resource so crop click logic can read it.

## Crop click handling

Pointer/click handling should:

1. Convert client point to normalized world point with `game.canvasClientToNormalizedPoint(...)`.
2. Find which crop placement/overlay was clicked.
3. Read `inventory.selectedToolId`.
4. Apply the valid crop transition.
5. Patch the crop overlay image if needed.
