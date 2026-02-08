TEST UPDATE 1.2

# Garou Foundry Module (D&D 5e)

This repository contains a Foundry VTT module that adds a homebrew **Garou** class and related content (tribes, gifts, rites, and lore) for D&D 5e.

## Install (Foundry VTT)
In Foundry: **Game Settings → Manage Modules → Install Module**  
Paste this Manifest URL:

https://raw.githubusercontent.com/wmichel15/garou-foundry/main/module.json

## Caern Rites (Rite of the Glorious Past)

- **Select Caern:** Have a Caern token selected, or use the Rite item and choose the Caern from the dialog (lists all Caern actors in the world).
- **Use the Rite:** Use the "Rite of Glorious Past" feature/activity on a Garou character. The script checks that the Caern is functioning (Corruption &lt; 5, Rating ≥ 1), enforces **once per season** per Caern, then prompts for the effect (Legacy of Resolve, Ancestral Witness, or Storied Ground).
- **State on Caern:** The chosen state item is added to the Caern actor and any other Glorious Past state is removed. Cadence and history are stored in the Caern's `flags.garou.caern` (e.g. `rites.cooldowns.perSeason`, `rites.active`, `activeEffectKey`, `history`).
- **Consume states:** When Ancestral Witness or Storied Ground is used (consume activity) on a Caern actor, the use is logged to that Caern's history.

## Disclaimer
This is a fan-made homebrew conversion for tabletop use.  
It is not affiliated with or endorsed by any publisher.  
All original setting names and concepts referenced remain the property of their respective owners.
Version 0.1.0 – Initial module scaffold.
