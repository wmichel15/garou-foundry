# Regal Bearing — Mechanical Build Plan (Foundry VTT)

## Feature (3rd-level Silver Fang)

**Regal Bearing**

- Your presence demands attention and respect.
- **When you roll initiative**, you may choose a number of allies within 30 feet of you equal to your proficiency bonus (including yourself).
- Until the end of each chosen creature's **first turn** in this combat, that creature has **advantage on the first attack roll or saving throw** it makes during that turn.
- Once you use this feature, you can't use it again until you finish a short or long rest.
- **Auspice rider (additional layer):** Depending on the Garou's auspice, each chosen ally also gets:
  - **Ragabash** — Shadowed Command: may take Hide as a bonus action on their first turn.
  - **Theurge** — Warded by Luna: advantage on the first saving throw vs spell or supernatural effect before end of first turn.
  - **Philodox** — Weight of Authority: advantage on the first contested ability check before end of first turn.
  - **Galliard** — Stirring Cry: temporary hit points equal to your proficiency bonus.
  - **Ahroun** — Battle Standard: +2 bonus to damage on the first successful weapon attack before end of first turn.

---

## 1. Data (JSON)

### 1.1 Base feature — "Regal Bearing"

- **Where:** `packs/garou-features/` (e.g. `Core/` or `silver-fangs/`).
- **Item (feat):**
  - `name`: "Regal Bearing"
  - `flags.garou.featureKey`: `"regalBearing"`
  - `system.description.value`: Full feature text (above).
  - `system.uses.max`: 1
  - `system.uses.recovery`: short rest + long rest (dnd5e recovery array).
- **Grant:** Add an **ItemGrant** in `packs/garou-classes/subclasses/silver-fangs.json`
### 1.2 Five rider items at level 3 (e.g. alongside Lambent Flame — two ItemGrants at 3).


- **Where:** `packs/garou-features/auspice-riders/regal-bearing/` (five JSONs).
- Each rider: `name` e.g. "Regal Bearing — Ragabash Rider", `flags.garou.riderFor`: `"regalBearing"`, `flags.garou.auspice`: `"ragabash"` | `"theurge"` | `"philodox"` | `"galliard"` | `"ahroun"`, plus description of that rider.

### 1.3 auspice-riders.js

- Generalize to support **both** base keys: `["trialByCombat", "regalBearing"]`, and call a shared `ensureRiderForBase(actor, baseKey)` for each. Result: any character with Regal Bearing + auspice gets the correct rider item on their sheet.

---

## 2. Automation (script: `scripts/regal-bearing.js`)

### 2.1 Trigger: when the Silver Fang rolls initiative

- **Option A (recommended):** Wrap `Combat.prototype.rollInitiative` (e.g. with libWrapper). After the wrapped call resolves, for each combatant ID that was rolled, get that combatant's actor; if the actor has Regal Bearing (`featureKey === "regalBearing"`) and has at least one use left, run the Regal Bearing flow for that combatant (prompt only the player who owns that actor).
- **Option B:** Hook `updateCombat` when the combat document is updated; detect which combatants had `initiative` set in this update; for each, check Regal Bearing + use and prompt (avoid double prompts on "Roll All").

### 2.2 Flow after trigger

1. **Eligibility:** Combatant's actor has Regal Bearing and has a use available. Only consume the use after the user confirms in the dialog.
2. **Ally selection:** Silver Fang's token must be on the scene. Get tokens within **30 feet** of that token. Filter to **allies** (include the Silver Fang's token as "yourself"). Cap selection at **PB** (Garou's proficiency bonus).
3. **Dialog:** "Use Regal Bearing? Choose up to [PB] allies within 30 feet (including yourself)." Multi-select list (or checkboxes) of eligible tokens; user selects up to PB; OK / Cancel. On OK: consume the feature use, then apply effects to each chosen ally.
4. **Auspice:** `getActorAuspiceKey(garouActor)` (from auspice-riders.js or duplicated) to get the rider type.

### 2.3 Effects on each chosen ally

**A) Base — advantage on first attack or save on first turn**

- Create an Active Effect on the **ally**, e.g. name "Regal Bearing".
- `origin: garouActor.uuid`, `flags.garou.regalBearing = { triggered: false, sourceActorUuid }`.
- **Duration:** Until end of that ally's **first turn**. Implement by: (1) giving the effect a 1-round duration and (2) when that combatant's turn **ends**, remove any "Regal Bearing" (base) effect from that actor (hook combat turn change).
- **Mechanics:** When the ally makes an **attack roll** or **saving throw**, if the effect exists and `!triggered`, add advantage (Midi or dnd5e hook) and set `triggered: true`.

**B) Auspice rider**

- One effect per auspice on each chosen ally, same duration (until end of ally's first turn), same turn-end cleanup.
- **Ragabash** — Shadowed Command: description-only or CUB/DAE "Hide as bonus action" if available.
- **Theurge** — Warded by Luna: Midi hook on first save → advantage, set triggered.
- **Philodox** — Weight of Authority: Midi/dnd5e hook on first (contested) ability check → advantage, set triggered.
- **Galliard** — Stirring Cry: **Immediate** temp HP = Garou's PB when applying; no duration effect needed (optional flavor effect).
- **Ahroun** — Battle Standard: Midi DamageBonus hook, +2 on first successful weapon attack, set triggered.

### 2.4 Turn-end cleanup

- On combat turn change: when an actor's turn **ends**, remove from that actor any effects that are Regal Bearing (base or rider) so they last only until end of that creature's first turn.

### 2.5 Midi-QOL

- Use Midi hooks for: (1) advantage on first attack roll (base), (2) advantage on first saving throw (base), (3) Theurge/Philodox/Ahroun riders. If Midi is inactive, only Galliard temp HP and the initiative/choice flow run; others are descriptive.

---

## 3. Files to add or change

| Action | File |
|--------|------|
| Add | `packs/garou-features/.../regal-bearing.json` (base feature) |
| Add | `packs/garou-features/auspice-riders/regal-bearing/*.json` (5 riders) |
| Edit | `packs/garou-classes/subclasses/silver-fangs.json` — add ItemGrant for Regal Bearing at level 3 |
| Edit | `scripts/auspice-riders.js` — support `regalBearing` in the rider-ensure loop |
| Add | `scripts/regal-bearing.js` — initiative hook, ally selection, apply base + rider effects, turn-end cleanup, Midi hooks |
| Edit | `module.json` — add `scripts/regal-bearing.js` to `esmodules` |

---

## 4. Flow (summary)

1. Silver Fang rolls initiative (single or Roll All).
2. Script detects who rolled and checks Regal Bearing + use.
3. Dialog: "Use Regal Bearing? Choose up to PB allies within 30 ft (including yourself)."
4. User selects allies; script consumes use and gets Garou's auspice.
5. For each chosen ally: create "Regal Bearing" effect (base) + auspice rider effect (or apply Galliard temp HP).
6. When each ally makes their first attack or save in that turn: grant advantage (base), set triggered.
7. When each ally's turn ends: remove Regal Bearing (base + rider) effects from that actor.
