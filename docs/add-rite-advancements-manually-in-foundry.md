# Add Rite Advancements to the Garou Class Manually in Foundry

Do this on the **Garou** class item in your world (Items sidebar). If Garou is only in the compendium, import it into the world first so you can edit it.

---

## Before you start

- Have the **Garou - Features** compendium available (so you can pick the Rite placeholder items for the pool). The placeholders are: **Rite (Level 1)**, **Rite (Level 2)**, **Rite (Level 3)**, **Rite (Level 4)**, **Rite (Level 5)**, and **Minor Rite**. If they’re not in the compendium yet, import the JSON files from `packs/garou-features/Core/` (rite-level-1-placeholder.json through rite-minor-placeholder.json) into world Items, then put them into the Garou - Features compendium.

---

## For each of the 8 advancements

Open the **Garou** class → **Advancement** tab. For each row below, add a new advancement and fill it in as follows.

### 1. Add an advancement

- Click **Add Advancement** (or the **+** / “Add” control for the advancement list).
- Set **Type** to **Item Choice** (or “Choice” / “Item Choice”).

### 2. Set level and title

- **Level:** use the “Level” value from the table below.
- **Title:** use the “Title” from the table.
- **Hint** (if there is one): copy from the “Hint” column.

### 3. Configure the choice

- **Allow Drops:** Yes (checked).
- **Replacement:** Yes (allowed to replace this choice when gaining a level).
- **Choices:** 1 choice at the level you set (e.g. “At level 2, 1 choice” or “Level 2: count 1”).
- **Pool:** add the items listed in “Pool” below. Use the compendium (Garou - Features) or world items; add each listed item to the choice’s pool.

### 4. Save

- Save the advancement, then save the class if needed.

---

## The 8 entries to add

| # | Level | Title | Hint | Pool (add these items to the choice) |
|---|-------|--------|------|--------------------------------------|
| 1 | **2** | Rite (Level 1) | Max Rites = WIS mod + PB (min 1). Minor Rites don't count. You may replace one Rite when you gain a level. | Rite (Level 1) |
| 2 | **3** | Minor Rite | Feature-granted; does not count against Rites known. | Minor Rite |
| 3 | **5** | Rite (Level 2 or lower) | Max Rites = WIS mod + PB (min 1). You may replace one Rite when you gain a level. | Rite (Level 1), Rite (Level 2) |
| 4 | **6** | Minor Rite | Feature-granted; does not count against Rites known. | Minor Rite |
| 5 | **9** | Rite (Level 3 or lower) | Max Rites = WIS mod + PB (min 1). You may replace one Rite when you gain a level. | Rite (Level 1), Rite (Level 2), Rite (Level 3) |
| 6 | **11** | Minor Rite | Feature-granted; does not count against Rites known. | Minor Rite |
| 7 | **13** | Rite (Level 4 or lower) | Max Rites = WIS mod + PB (min 1). You may replace one Rite when you gain a level. | Rite (Level 1), Rite (Level 2), Rite (Level 3), Rite (Level 4) |
| 8 | **17** | Rite (Level 5 or lower) | Max Rites = WIS mod + PB (min 1). You may replace one Rite when you gain a level. | Rite (Level 1), Rite (Level 2), Rite (Level 3), Rite (Level 4), Rite (Level 5) |

---

## Summary

- **Levels:** 2, 3, 5, 6, 9, 11, 13, 17.
- **Tiered Rites (2, 5, 9, 13, 17):** one choice each, “that tier or lower”; allow replacement and drops.
- **Minor Rites (3, 6, 11):** one choice each from **Minor Rite** only; same hint and options.

After all eight are added, save the Garou class. Then transfer that class from world Items into the **Garou - Classes** compendium if you want the compendium to have the updated version.
