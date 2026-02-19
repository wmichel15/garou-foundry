# Add Gift Advancements to the Garou Class Manually in Foundry

Use the same **Choose Items** advancement dialog as for Rites. Do this on the **Garou** class item in your world (Items sidebar).

---

## Before you start

- Have your **Gift** items available (in a compendium or world Items), organized or tagged by **Rank** (1–5) so you know which go in each pool. The Garou - Gifts & Rites compendium (or similar) should have Gifts by rank.

---

## Rules reminder (for hints)

- **First Rank 1 Gift:** You get your first Rank 1 Gift at **2nd level** from this class. A Rank 1 Gift at 1st level is only from certain character-creation features (e.g. Breed, Auspice) and counts as a **bonus** Gift, not the class’s standard Gift progression.
- **Rank access by level:** Rank 1 at 2nd; Rank 2 at 5th; Rank 3 at 9th; Rank 4 at 13th; Rank 5 at 17th. You may pick a lower-rank Gift when a higher rank is available.
- **Max Gifts known by rank:** Rank 1: 3 | Rank 2: 2 | Rank 3: 1 | Rank 4: 1 | Rank 5: 1. If you exceed the cap, you must replace one to stay within the limit.
- **Replacement:** Whenever you gain a level that grants a new Gift, you may replace one Gift you know with another you’re eligible to learn (within the rank limits).

---

## For each of the 5 Gift advancements

Open the **Garou** class → **Advancement** tab. Add a new **Item Choice** advancement for each row below.

### 1. Add the advancement

- Click **Add Advancement** and choose **Item Choice** (Choose Items).

### 2. Fill in the dialog

- **Custom Title:** use the “Title” from the table.
- **Class Restriction:** **Original Class Only** (or Garou-only, if available).
- **Hint:** paste the “Hint” from the table (optional but helpful).
- **Allow Drops:** Yes (checked).
- **Replacement:** Yes (so they can replace a Gift when they gain a level that grants a new Gift).
- **Item Type / Type:** whatever your Gift items are (e.g. **Feature**, **Feat**).
- **Item Options (pool):** drag in the items listed in “Pool” for that row.
- **Choices:** in the LVL/COUNT table, put **1** in the **COUNT** for the level in the table, and **0** for all other levels.

### 3. Save

- Save the advancement, then save the class.

---

## The 5 Gift entries to add (class progression)

*Note: A Rank 1 Gift at 1st level comes only from character-creation features (e.g. Breed, Auspice) as a bonus — add those via their own advancements, not here.*

| # | Level | Title | Hint | Pool (add these items) |
|---|-------|--------|------|------------------------|
| 1 | **2** | Gift (Rank 1) | First class Gift at 2nd level. Max by rank: R1=3, R2=2, R3=1, R4=1, R5=1. You may replace one Gift when you gain a level that grants a new Gift. | All **Rank 1** Gifts |
| 2 | **5** | Gift (Rank 2 or lower) | Rank 2 access at 5th level. Same max and replacement rules. | All **Rank 1** + **Rank 2** Gifts |
| 3 | **9** | Gift (Rank 3 or lower) | Rank 3 access at 9th level. Same max and replacement rules. | All **Rank 1, 2, and 3** Gifts |
| 4 | **13** | Gift (Rank 4 or lower) | Rank 4 access at 13th level. Same max and replacement rules. | All **Rank 1, 2, 3, and 4** Gifts |
| 5 | **17** | Gift (Rank 5 or lower) | Rank 5 access at 17th level. Same max and replacement rules. | All **Rank 1–5** Gifts |

---

## Summary

- **Levels that grant a class Gift:** 2, 5, 9, 13, 17 (five choices). Level 1 Rank 1 Gifts are **bonus** only, from creation features (Breed, Auspice, etc.).
- **Level 2:** Rank 1 Gifts only (first standard Gift).
- **Level 5:** Rank 2 or lower (pool = R1 + R2).
- **Level 9:** Rank 3 or lower (pool = R1 + R2 + R3).
- **Level 13:** Rank 4 or lower (pool = R1–R4).
- **Level 17:** Rank 5 or lower (pool = R1–R5).
- For each: **1 choice** at that level, **Allow Drops** and **Replacement** on, pool = Gifts of that rank or lower as in the table.

Foundry won’t enforce the “max Gifts known by rank” limits; the hint text reminds players. If your Gift items don’t have a rank field, keep the pools correct by only adding Gifts of the allowed ranks to each advancement.
