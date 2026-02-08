/**
 * Caern state consume hooks – Ancestral Witness and Storied Ground.
 * When the consume activity is used on a Caern actor, log to Caern history.
 * Uses are decremented by the system via activity consumption; we only log.
 */

import { isCaernActor, logCaernHistory } from "./caern-api.js";

const STATE_NAMES = [
  "Glorious Past — Ancestral Witness",
  "Glorious Past — Storied Ground",
];

function isGloriousPastConsumableStateItem(item) {
  if (!item) return false;
  const name = (item.name ?? "").trim();
  return STATE_NAMES.some(n => name === n);
}

/**
 * Register hook: when a Glorious Past state item with a consume activity is used
 * by a Caern actor, log to that Caern's history. Do not block default use.
 */
export function registerStateConsumeHooks() {
  Hooks.on("dnd5e.preUseItem", (item, config, options) => {
    if (!isGloriousPastConsumableStateItem(item)) return;
    const owner = item.actor ?? options?.actor ?? null;
    if (!owner || !isCaernActor(owner)) return;

    const effectKey = (item.name ?? "").includes("Ancestral Witness")
      ? "ancestral-witness"
      : "storied-ground";

    // Log after the use completes (system handles consumption)
    setTimeout(() => {
      logCaernHistory(owner, {
        type: "stateConsumed",
        effect: effectKey,
        itemName: item.name,
      }).catch(() => {});
    }, 150);
  });
}

export { isGloriousPastConsumableStateItem };
