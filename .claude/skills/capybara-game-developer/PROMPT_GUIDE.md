### Core Prompting Guidelines (Optimized for Schema Integration)

The schema automatically validates asset types, IDs, dependencies (`referenceId`), and field structures. Use these instructions to guide the **content, style, composition, and physical layout** of your prompts.

**Always include a `base_map` as the first asset in the batch.** It is the anchor for consistency: extend maps, map overlays, placement-aware props, and other world-space assets should set `referenceId` to that base map so materials, scale, palette, and layout stay aligned. You do not need separate generation calls—list the `base_map` first and include dependent assets in the same batch request.

---

### 1. Style & Perspective Constraints

- **Orthogonal Oblique Perspective**: The asset pipeline enforces a fixed $3/4$ oblique angle. **Do not** write camera-angle keywords in world-space prompts (e.g., _"top-down", "2.5D", "isometric", "camera angle", "zoomed out", "wide angle"_). Describe physical materials, rectangular layouts, and flat surface orientations instead.
- **Art Style Consistency**: Use the batch-level `artStyle` field to specify global aesthetic rules (e.g., _"16-bit pixel art, vibrant color palette"_). Do not repeat these style phrases inside individual asset prompts.
- **Technical Shading**: Specify flat ambient lighting with small, clean, high-contrast drop shadows directly underneath each asset. Avoid long cast shadows, heavy vignettes, or environmental fog.

---

### 2. Base Map Composition & Pathing

List the `base_map` before any extend maps, `props_map_overlay` assets, or other assets that depend on a `referenceId` in the same batch payload. Downstream prompts should copy floor materials, wall language, and spatial scale from this map.

- **Open-Edge Layout**: Compose maps with the North boundary containing the structural walls, cliff faces, buildings, or deep foliage. Leave the East, West, and South edges open and walkable to facilitate future map extensions.
- **The North-Wall Buffer Rule**: If an NPC or player must stand or move behind a counter, bar, desk, or workstation along the North wall, you must describe a horizontal walkable aisle or gap between that furniture piece and the North wall. If the furniture is flush against the North wall, place the interactive space on its open South side.
- **Clear Walkable Lanes**: Keep central corridors open. Group decorative props and heavy furniture tightly in designated corners or along boundaries to prevent collision-locking.
- **Precise Alignment**: When placing transitions (doors, gates, stairs) along the North boundary, define their horizontal position clearly (e.g., _"exactly centered on the North wall"_).

#### Base Map Prompt Template:

```text
[Theme/Location] interior/exterior. Floor is smooth [material] with East, West, and South edges left open and continuous. The North boundary is a flat, straight [wall material/facade] containing [aligned doors/archways] and [wall-mounted decor]. A compact [main furniture/feature] sits in the upper-middle floor, leaving a clear horizontal aisle behind it. Isolated, grid-aligned [props] are placed in the [named corner/zone] surrounded by open walkable floor space. Flat ambient lighting and small clean drop shadows directly underneath each asset.
```

---

### 3. Extend Map Composition

- **Seamless Seams**: Keep the transition edge shared with the reference map completely clear of props, walls, or decorative assets.
- **Material Matching**: Use the exact floor-material description from the reference map verbatim to maintain consistency across transition boundaries.
- **Secondary Scale**: Keep extensions structurally simple. Push heavy utility elements (hearths, shelves, storage) flat against the North wall.

#### Extend Map Prompt Template:

```text
[Same shell type as reference map]. Floor is made of the exact same [floor material phrase copied verbatim from reference map], bleeding continuously off the [open transition edge] with no obstacles. The North boundary features the same flat [wall material] with [theme-specific wall fixtures] flush against it. The floor is highly walkable, with isolated [props] placed in the [opposite zone] far from the transition seam.
```

---

### 4. Gameplay Logic for Props & Characters

- **Initial State Rule**: Always depict the raw, un-interacted "before" state of the world in the `base_map` (e.g., flat bare soil, intact boulders, closed chests). Post-interaction states are handled via `props_map_overlay`.
- **Character Variant Rules**: Use `base_character_variant` specifically for Job NPCs performing active tasks (e.g., a blacksmith working at an anvil). The prompt should depict the character in their workspace pose, holding their signature tool.
- **Prop Classification Decision Matrix**:
  - **Use `props_single`** for portable, floating, or inventory items (keys, coins, small weapons) that don't need exact coordinate alignments.
  - **Use `props_multiple`** for state sheets of matching scale (crop growth phases, tilled soil steps, tool icons).
  - **Use `props_map_overlay`** when a map-baked structure (chest, cell door, cabinet) changes physical states but must remain in the exact same coordinates.

---

### 5. Background Music Composition

To ensure background music loop generation functions correctly:

- **Initial Word**: Every music prompt must begin with **"Instrumental"**.
- **Rhythmic Anchors**: Always include a soft rhythmic element (e.g., _"light hand percussion", "soft shaker rhythm"_) to anchor melodic elements.
- **Instrument Hierarchy**: Define clear lead and backing instruments to prevent competing frequencies (e.g., _"fingerpicked acoustic guitar base, warm marimba melody"_).
- **Structural Ending**: End every prompt with: **"loopable, steady relaxed tempo"**.

---

### 6. HUD & UI Art Composition

- **UI Chrome Integration**: Bake permanent frames, panel borders, neutral button containers, close medals, and slot outlines directly into the prompt.
- **Neutral State Rule**: Describe only the default/unselected states of HUD elements. Do not include active highlights, glowing selections, filled meters, or pre-loaded inventory items.
- **Text Legibility Insets**: Provide flat, high-contrast, quiet background regions (e.g., _"blank warm parchment inset", "flat near-black glass panel"_) where text can be dynamically rendered by code.
- **Corner Constraints**: Keep gameplay overlay elements (health indicators, hotbars, minimaps) compact and scaled to their corner anchors. Spanning layouts are reserved for start screens, full menus, shop interfaces, and dialogue overlays.

---

### After generation

Prompting ends when the tool call succeeds. Next, **wire** the new assets into the engine — register handles, mount maps/characters/props/audio/HUD scaffolds, update the scene. Follow [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md). Do not leave generated files unwired unless the user asked for generation only.
