# Updating the Garou Class in Your Compendium

You can't edit compendium contents directly in Foundry. To get the updated Garou class (with Rite advancements) into the **Garou - Classes** compendium, use this workflow:

1. **Import the class into the world**
   - In Foundry, open the **Items** sidebar (or Items directory).
   - Use **Import** (or **Import from File** / **Import Data**) and select the Garou class JSON file from this repo:
     - **`packs/garou-classes/garou.json`**
   - That creates a **Garou** class item in your world Items.

2. **Put that world Item into the compendium**
   - Open the **Garou - Classes** compendium.
   - Transfer or export the **Garou** item from your world Items into that compendium (e.g. drag the world Item into the compendium, or use the compendium's "Import from World" / export option, depending on your Foundry version).
   - If the compendium already had a Garou entry, replace it with this one so the compendium has the version with all Rite advancements.

The repo file `packs/garou-classes/garou.json` is the source of truth. Whenever you pull updates (e.g. new Rite entries or fixes), repeat: import that file into world Items, then transfer the Garou item into the Garou - Classes compendium.
