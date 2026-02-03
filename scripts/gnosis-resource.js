// scripts/gnosis-resource.js
// Keeps Gnosis resource bar and Gnosis (Feature) item uses in sync with scale.garou.gnosis.

const GNOSIS_RESOURCE = "primary"; // primary | secondary | tertiary

// Fallback when scale.garou.gnosis isn't set yet (e.g. before dnd5e applies ScaleValue)
const GNOSIS_BY_LEVEL = { 1: 2, 2: 3, 3: 3, 4: 4, 5: 5, 6: 6, 7: 6, 8: 7, 9: 8, 10: 9, 11: 10, 12: 10, 13: 11, 14: 12, 15: 13, 16: 13, 17: 14, 18: 15, 19: 16, 20: 18 };

function getGnosisMax(actor) {
  // dnd5e stores class scale by class identifier: scale.garou.gnosis (not scale.class.gnosis)
  const scale = actor.system?.scale?.garou?.gnosis;
  if (Number.isFinite(scale)) return scale;

  const level = actor.system?.details?.level ?? 0;
  const fallback = GNOSIS_BY_LEVEL[level] ?? GNOSIS_BY_LEVEL[1];
  return fallback;
}

function hasGarouClass(actor) {
  if (!actor?.items) return false;
  const cls = actor.items.find((i) => i.type === "class");
  if (!cls) return false;
  const id = (cls.system?.identifier ?? "").toLowerCase();
  const name = (cls.name ?? "").toLowerCase();
  return id === "garou" || name === "garou";
}

function getGnosisFeatureItem(actor) {
  return (
    actor?.items?.find(
      (i) =>
        i.type === "feat" &&
        (i.name === "Gnosis (Feature)" ||
          (typeof i.name === "string" && i.name.toLowerCase().includes("gnosis") && !i.name.toLowerCase().includes("spiritual renewal")))
    ) ?? null
  );
}

async function ensureGnosisResource(actor) {
  if (actor.type !== "character") return;
  if (!hasGarouClass(actor)) return;

  const max = getGnosisMax(actor);
  const path = `system.resources.${GNOSIS_RESOURCE}`;
  const current = foundry.utils.getProperty(actor, path) ?? {};
  const updates = {};

  if (current.label !== "Gnosis") {
    updates[`${path}.label`] = "Gnosis";
  }
  if (current.max !== max) {
    updates[`${path}.max`] = max;
  }
  if (current.value === undefined || current.value === null) {
    updates[`${path}.value`] = max;
  }

  if (Object.keys(updates).length) {
    await actor.update(updates);
  }

  // Force numeric max (and value) on Gnosis (Feature) item so sheet shows X/X not 0/0
  const gnosisItem = getGnosisFeatureItem(actor);
  if (gnosisItem) {
    const u = gnosisItem.system?.uses ?? {};
    const currentMax = typeof u.max === "number" ? u.max : NaN;
    const needMax = currentMax !== max;
    const spent = Number(u.spent ?? 0);
    const value = Number.isFinite(Number(u.value)) ? Number(u.value) : Math.max(0, max - spent);
    const itemUpdates = {};
    if (needMax) itemUpdates["system.uses.max"] = max;
    if (u.value === undefined || u.value === null || (needMax && value !== u.value)) {
      itemUpdates["system.uses.value"] = Math.min(value, max);
    }
    if (Object.keys(itemUpdates).length) {
      await gnosisItem.update(itemUpdates);
    }
  }
}

Hooks.on("createActor", ensureGnosisResource);

Hooks.on("updateActor", async (actor, changed) => {
  if (!changed.system) return;
  await ensureGnosisResource(actor);
});

// Re-sync when sheet opens
Hooks.on("renderActorSheet", (app) => {
  const actor = app.actor;
  if (actor?.type === "character" && hasGarouClass(actor)) {
    ensureGnosisResource(actor).catch((err) => console.error("Garou gnosis-resource (render):", err));
  }
});

// One-time sync for existing Garou actors when world loads
Hooks.once("ready", async () => {
  for (const actor of game.actors?.contents ?? []) {
    if (actor.type !== "character" || !hasGarouClass(actor)) continue;
    try {
      await ensureGnosisResource(actor);
    } catch (err) {
      console.error("Garou gnosis-resource (ready):", err);
    }
  }
});
