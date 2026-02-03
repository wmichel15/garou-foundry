# Firing the Garou: Choose Form Macro (Built Into Module)

**Built-in (no setup):** When a user opens the **Shapeshifting Forms** or **Choose Garou Form** item sheet, the module adds a **"Choose Form"** button in the header. Clicking it runs the form picker. No Item Macro, Midi-QOL activity macro, or hotbar required.

The module provides two item-based ways to run the macro (both use **Item Macro**; activity macro field is unreliable for this):

1. **Shapeshifting Forms** – The feat has an embedded **Item Macro** that calls the world macro when you use the item. With the **Item Macro** module and **Override preUseItem Hook** enabled, using Shapeshifting Forms (or clicking its use button) runs the macro.
2. **Choose Garou Form** – A separate feat in **Garou – Features** (Core). Drag it onto a character sheet; using it runs the same macro. Handy if you want a dedicated “form picker” button without opening Shapeshifting Forms.

**Requirements:** Install the **Item Macro** module, then in **Game Settings → Module Settings → Item Macro** enable **Override `preUseItem` Hook** and save. The world macro **Garou: Choose Form** must exist (the Garou module creates it on world load if missing).

### Hotbar macro (optional)

Create a **macro** with this and drag it to the hotbar:

```javascript
const macroName = "Garou: Choose Form";
const payload = {
  actor: canvas.tokens?.controlled?.[0]?.actor ?? game.user?.character,
  token: canvas.tokens?.controlled?.[0],
  item: null
};
const macro = game.macros?.find(m => m.name === macroName);
if (macro) macro.execute(false, [payload]);
```

---

# Midi-QOL Activity Macro Not Firing

## Why the activity macro may not run

Midi-QOL’s workflow (and thus **preItemRoll** and the **activity macro** on the Midi-QOL tab) is built around item uses that involve a **roll** (attack, save, damage, etc.). When you use a **utility** activity that has **no roll** (like “Choose Form” or “Shift to This Form”), Midi-QOL often **does not start a workflow**, so it never runs:

- The item’s **onUseMacroName** (e.g. `[preItemRoll] Garou: Choose Form`)
- The **activity macro** you set in the activity’s Midi-QOL tab

So the macro not firing from the Midi-QOL tab is usually because **utility / no-roll activities don’t trigger that workflow**.

## Settings to check (in case your setup is different)

1. **Game Settings → Module Settings → Midi-QOL**
   - Look for anything like “Call item macro”, “Run macros”, “Item use macros”, or “Activity macros” and ensure it’s enabled if present.

2. **Game Settings → Module Settings → Midi-QOL → Workflow**
   - Check workflow / automation options. Some versions only run macros when “Roll automation” or similar is on (and even then, often only for items that actually roll).

3. **Activity: “Automation only”**
   - On the activity’s **Midi-QOL** tab, **uncheck “Automation only”** so the activity is allowed for normal (manual) use. If it’s checked, the activity might be treated as automation-only and not run the macro when you click it.

4. **Macro visibility**
   - The macro **Garou: Choose Form** must exist and be **visible/executable** by the player (or the user running the activity). If it’s GM-only or not found, the activity macro can’t run it.

## Reliable workaround: hotbar macro

You said that running this **from a hotbar macro** works:

```javascript
const macro = game.macros.find(m => m.name === "Garou: Choose Form");
if (macro) await macro.execute(false, []);
```

So the macro itself is fine; the issue is **when** Midi-QOL runs (or doesn’t run) the activity macro. Until Midi-QOL runs activity macros for utility / no-roll activities, the dependable approach is:

- Put the **Garou: Choose Form** macro (or a small macro that calls it like above) on the **hotbar** and use that when you want to choose form, instead of relying on the Midi-QOL activity macro for that activity.

## Optional: Garou module hook

The Garou module already listens for **midi-qol.preItemRoll** and runs **Garou: Choose Form** when the **Shapeshifting Forms** item is used. That only helps if Midi-QOL actually fires `preItemRoll` for that use; for utility activities it often does not, which matches the behavior you’re seeing.
