# Foundry Setup and Import Guide

This guide walks you through getting the Garou module (and new content like Silver Fangs) into Foundry so you can use it in a world.

---

## 1. Install or link the module

### Option A – Install from manifest (players / normal use)

1. In Foundry: **Setup** → **Game Systems** → ensure **D&D 5e** is installed.
2. **Setup** → **Add-on Modules** → **Install Module**.
3. Paste the manifest URL:  
   `https://raw.githubusercontent.com/wmichel15/garou-foundry/main/module.json`
4. Install, then enable the module for your world in **Manage Modules**.

### Option B – Link for development (edit repo, test in Foundry)

1. In Foundry’s **User Data** folder, go to `Data/modules/`.
2. Create a **symbolic link** named `garou` pointing to your repo folder (e.g. `c:\Dev\garou-foundry`).
   - **Windows (Admin CMD or PowerShell):**  
     `mklink /D "C:\Users\<You>\AppData\Local\FoundryVTT\Data\modules\garou" "c:\Dev\garou-foundry"`
   - **Mac/Linux:**  
     `ln -s /path/to/garou-foundry /path/to/FoundryVTT/Data/modules/garou`
3. In **Manage Modules**, enable **Garou: The Apocalypse**.

After that, Foundry loads the module from your repo. The compendium **content** comes from the pack databases (the `.ldb` files in each `packs/` folder), not directly from the JSON files in subfolders. So new JSON (e.g. Silver Fangs) must be **imported into the compendia** (see below).

---

## 2. Get new content (e.g. Silver Fangs) into the compendia

The JSON files under `packs/garou-classes/subclasses/` and `packs/garou-gifts/gifts/tribe-gifts/silver-fangs/` are **source**; Foundry reads the compendia from the pack database. You need to import those documents into the right compendium so they show up in-game.

### Step 2a – Open a world with Garou enabled

1. Create or open a world that uses **D&D 5e** and has **Garou: The Apocalypse** enabled.
2. Make sure the compendia **Garou - Classes** and **Garou - Gifts & Rites** appear in the **Compendium Packs** sidebar.

### Step 2b – Import into the module compendia (if writable)

Some setups let you write into module compendia (e.g. when the module is loaded via symlink and you have GM rights).

1. In the **Compendium Packs** sidebar, find **Garou - Classes**.
2. Open it (double-click or right‑click → Open).
3. Check for an **Import** or **Import from JSON** option (e.g. in the header, or right‑click the pack name).
   - If you have it: choose **Import** and select:  
     `packs/garou-classes/subclasses/silver-fangs.json`  
     (from your repo/module folder).  
     Repeat for **Garou - Gifts & Rites** with each of the four Silver Fangs gift JSONs under `packs/garou-gifts/gifts/tribe-gifts/silver-fangs/`.
4. If there is **no Import** on the pack: use **Step 2c** (world compendia) instead.

### Step 2c – Use world compendia (if module packs are read‑only)

If the Garou module compendia are read‑only, use **world** compendia for your content and optionally export later.

1. **Create world compendia (one-time)**  
   - **Compendium Packs** tab → **Create Compendium**.  
   - Create two packs:  
     - **Name:** e.g. `Garou - Classes (World)`  
     - **Type:** Item  
     - **System:** dnd5e  
   - Same for a second pack: e.g. `Garou - Gifts (World)`.

2. **Import the JSON files**  
   - Open **Garou - Classes (World)** → use **Import** (or **Import from JSON**) and select:  
     `silver-fangs.json`  
     from `packs/garou-classes/subclasses/`.
   - Open **Garou - Gifts (World)** → Import each of:  
     `lambent-flame.json`, `unity-of-the-pack.json`, `claim-of-authority.json`, `lunas-avenger.json`  
     from `packs/garou-gifts/gifts/tribe-gifts/silver-fangs/`.

3. **Use these in the world**  
   - When building a Garou, drag the **Garou** class from **Garou - Classes** (module), and the **Silver Fangs** subclass from **Garou - Classes (World)** (or from the world compendium where you imported it).  
   - Drag the four Silver Fangs gifts from the world compendium onto the character at the right levels (3, 6, 11, 17) if they don’t auto‑grant.

4. **Optional – Ship with module later**  
   - Export the world compendia (e.g. **Compendium** → **Export** if your Foundry version supports it), then replace or merge the module’s pack database with that export so the module ships with Silver Fangs.

---

## 3. Verify in Foundry

1. **Create or open an actor** (e.g. a new character).
2. **Add the Garou class**  
   - Drag **Garou** from **Garou - Classes** onto the sheet (or add via Class item).
3. **Set level to 3**  
   - In the class entry, set Garou level to 3 so the level‑3 advancement appears.
4. **Choose subclass**  
   - Use the level‑3 advancement to choose **Silver Fangs** (or **Get of Fenris**).  
   - If Silver Fangs doesn’t appear, the subclass document isn’t in the compendium the class is using—confirm you imported `silver-fangs.json` into **Garou - Classes** (or the world compendium you’re using for subclasses).
5. **Check tribe gifts**  
   - After choosing Silver Fangs, the character should get **Lambent Flame** at 3.  
   - Level to 6, 11, and 17 and confirm **Unity of the Pack**, **Claim of Authority**, and **Luna's Avenger** are granted (or add them manually from the compendium if your setup doesn’t auto‑grant from the subclass).

---

## 4. Quick reference – file locations

| Content            | JSON path (in repo) |
|--------------------|----------------------|
| Silver Fangs subclass | `packs/garou-classes/subclasses/silver-fangs.json` |
| Lambent Flame      | `packs/garou-gifts/gifts/tribe-gifts/silver-fangs/lambent-flame.json` |
| Unity of the Pack  | `packs/garou-gifts/gifts/tribe-gifts/silver-fangs/unity-of-the-pack.json` |
| Claim of Authority | `packs/garou-gifts/gifts/tribe-gifts/silver-fangs/claim-of-authority.json` |
| Luna's Avenger     | `packs/garou-gifts/gifts/tribe-gifts/silver-fangs/lunas-avenger.json` |

---

## 5. Troubleshooting

- **Silver Fangs doesn’t appear at level 3**  
  The subclass must be in the same compendium the Garou class uses for subclasses (usually **Garou - Classes**). Import `silver-fangs.json` into that pack, or use a world compendium and assign the subclass from there.

- **“Document not found” or missing gifts**  
  The subclass’s advancement entries reference gift UUIDs like `Compendium.garou.garou-gifts.Item.SF3LambentFlm01`. Those items must exist in **Garou - Gifts & Rites** (or the compendium your world uses). Import the four Silver Fangs gift JSONs into that pack.

- **Module compendia have no Import button**  
  Use world compendia (Step 2c), or build the pack outside Foundry (e.g. a script that writes the pack database from the JSON files) and replace the module’s `packs/garou-*.ldb` (or equivalent) with the result.

- **Development: changes to JSON not showing**  
  Foundry reads the pack **database** (e.g. `.ldb`), not the loose JSON. Re‑import the updated JSON into the compendium (or world compendium) and refresh, or rebuild the pack from JSON if you have a build step.

- **“Bonus Rank 1 Gift” shows “Chosen: 0 of 1” with nothing to pick**  
  The auspice’s **ItemChoice** advancement has an empty **pool**. Edit the auspice item (e.g. **Auspice: Theurge**) → **Advancement** tab → click the **edit (pencil)** on “Bonus Rank 1 Gift(Theurge)” → in the configuration, add items to the **Pool** by dragging Rank 1 gift items from **Garou - Gifts & Rites** (or your gifts compendium) into the pool area. Save. If you don’t have core Rank 1 gifts in the compendium, import them first (e.g. from `src/gifts/rank-1/`: Catfeet, Hare's Leap, Heightened Senses, Luna's Armor, Sense Wyrm).
