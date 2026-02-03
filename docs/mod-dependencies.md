# Garou Module – Recommended Mod Dependencies

Based on the homebrew PDF (The Garou – Werewolf: The Apocalypse conversion for D&D 5e): Rage, Gnosis, 5 forms, tribes (subclasses), gifts, rites, fetishes.

## What You Already Use

| Mod | Use |
|-----|-----|
| **midi-qol** | Combat automation (attacks, damage, saves). Used for Trial by Combat, Relentless Assault, Fenrisian Endurance, Doom of the Unworthy. |
| **Item Macro** | Run macros from item use (e.g. form picker). Optional now that the Garou module overrides `item.use` for Shapeshifting Forms. |

## Recommended / Optional

| Mod | Recommendation | Why |
|-----|----------------|------|
| **lib-wrapper** | **Recommended** | Garou wraps `CONFIG.Item.documentClass.prototype.use` so using Shapeshifting Forms opens the form picker before Midi-QOL runs. Without it, that flow falls back to `dnd5e.preUseItem` (which may not fire in time). |
| **Item Macro** | Optional | Still useful if you want other items to run macros on use. Garou no longer *depends* on it for the form picker. |
| **DAE (Dynamic Active Effects)** | Optional | If you want Gifts/Rites/Fetishes to apply automated effects (duration, damage mods, conditions) via effects instead of (or in addition to) Midi-QOL hooks. Not required for current automation. |
| **Midi-QOL** | Optional for combat automation | Keep if you want automated damage, saves, and item macros for combat Gifts. Garou automation scripts are written for Midi-QOL; removing it would require reimplementing those features with another system or manual use. |

## Script / Helper Mods

| Mod | Recommendation | Why |
|-----|----------------|------|
| **SocketLib** | Optional | Lets the module send messages between GM and players (e.g. “GM applies effect,” “player chooses form”). Only needed if you add cross-client automation. |
| **Times Up** | Optional | If you want Rage duration (1 minute), Gift durations, or rite cooldowns to auto-expire. dnd5e and Midi-QOL already handle some of this. |
| **Item Piles** | Optional | Thematic for fetishes/talismans as physical objects in the world. Not required for the class. |
| **No “script helpers” required** | — | The Garou module is self-contained: it uses core Foundry + dnd5e hooks, optional lib-wrapper, and optional Midi-QOL. No separate “script helper” mod is required. |

## Summary

- **Keep:** midi-qol (for combat Gifts), **add:** lib-wrapper (for reliable Shapeshifting Forms use).
- **Optional:** Item Macro (convenience), DAE (effect-heavy Gifts).
- **No** separate script-helper mod is needed; the module’s own scripts handle Rage, Gnosis, forms, and automation.
