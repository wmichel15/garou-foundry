// scripts/rage-resource.js
// Keeps Rage resource bar and Rage item uses in sync with Garou class level (RAGE_USES_BY_LEVEL table).

const RAGE_RESOURCE = "secondary"; // primary=Gnosis, secondary=Rage, tertiary=other

// Rage Uses by Garou class level (matches Scale Value "Rage Uses" on Garou class)
const RAGE_USES_BY_LEVEL = {
  1: 1, 2: 2, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3, 8: 3, 9: 4, 10: 4, 11: 4, 12: 4,
  13: 5, 14: 5, 15: 5, 16: 5, 17: 6, 18: 6, 19: 6, 20: 6
};

function getRageMax(actor) {
  const garouLevel = actor?.system?.classes?.garou?.levels ?? actor?.system?.details?.level ?? 0;
  return RAGE_USES_BY_LEVEL[garouLevel] ?? RAGE_USES_BY_LEVEL[1];
}

function hasGarouClass(actor) {
  if (!actor?.items) return false;
  const cls = actor.items.find((i) => i.type === "class");
  if (!cls) return false;
  const id = (cls.system?.identifier ?? "").toLowerCase();
  const name = (cls.name ?? "").toLowerCase();
  return id === "garou" || name === "garou";
}

function getRageFeatureItem(actor) {
  return actor?.items?.find(
    (i) => i.type === "feat" && (i.name ?? "").trim().toLowerCase() === "rage"
  ) ?? null;
}

async function ensureRageItemGranted(actor) {
  if (getRageFeatureItem(actor)) return;
  const pack = game.packs.get("garou.garou-features");
  if (!pack) return;
  const entry = pack.index.find((e) => (e.name ?? "").trim().toLowerCase() === "rage");
  if (!entry) return;
  const item = await pack.getDocument(entry._id);
  if (!item) return;
  const data = item.toObject();
  delete data._id;
  await actor.createEmbeddedDocuments("Item", [data]);
}

async function ensureRageResource(actor) {
  if (actor.type !== "character") return;
  if (!hasGarouClass(actor)) return;

  // Grant Rage item if missing (e.g. character created before class had ItemGrant)
  await ensureRageItemGranted(actor);

  const max = getRageMax(actor);
  const path = `system.resources.${RAGE_RESOURCE}`;
  const current = foundry.utils.getProperty(actor, path) ?? {};
  const updates = {};

  if (current.label !== "Rage") {
    updates[`${path}.label`] = "Rage";
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

  const rageItem = getRageFeatureItem(actor);
  if (rageItem) {
    const u = rageItem.system?.uses ?? {};
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
      await rageItem.update(itemUpdates);
    }
  }
}

Hooks.on("createActor", ensureRageResource);

Hooks.on("updateActor", async (actor, changed) => {
  if (!changed.system) return;
  await ensureRageResource(actor);
});

Hooks.on("updateItem", async (item, changed, options) => {
  if (item.type !== "class" || (item.actor ?? item.parent)?.type !== "character") return;
  const id = (item.system?.identifier ?? "").toLowerCase();
  const name = (item.name ?? "").toLowerCase();
  if (id !== "garou" && name !== "garou") return;
  const actor = item.actor ?? item.parent;
  if (actor) await ensureRageResource(actor);
});

Hooks.on("renderActorSheet", (app) => {
  const actor = app.actor;
  if (actor?.type === "character" && hasGarouClass(actor)) {
    ensureRageResource(actor).catch((err) => console.error("Garou rage-resource (render):", err));
  }
});

Hooks.once("ready", async () => {
  for (const actor of game.actors?.contents ?? []) {
    if (actor.type !== "character" || !hasGarouClass(actor)) continue;
    try {
      await ensureRageResource(actor);
    } catch (err) {
      console.error("Garou rage-resource (ready):", err);
    }
  }
});
