/**
 * Caern API – helpers for Caern actors and state.
 * No hardcoded UUIDs; uses flags and name/tag matching.
 */

const GAROU = { scope: "garou" };
const CAERN_FLAG = "caern";

function getCaernFlags(actor) {
  return actor?.getFlag(GAROU.scope, CAERN_FLAG) ?? null;
}

/**
 * Detect if an actor is a Caern state container.
 * Checks: flags.garou.caern.isCaernActor, biography tag [GAROU_CAERN_ACTOR], or marker item flag.
 */
function isCaernActor(actor) {
  if (!actor) return false;
  const flags = getCaernFlags(actor);
  if (flags?.isCaernActor === true) return true;
  const bio = (actor.system?.details?.biography?.value ?? "").toLowerCase();
  if (bio.includes("[garou_caern_actor]")) return true;
  const hasMarker = actor.items?.some(i => i.getFlag(GAROU.scope, "caernMarker") === true);
  return !!hasMarker;
}

/**
 * Get the currently selected Caern actor.
 * Prefer: selected token's actor if it is a Caern; otherwise show dialog listing all Caern actors in the world.
 */
async function getSelectedCaernActor() {
  const controlled = canvas.tokens?.controlled ?? [];
  if (controlled.length === 1 && controlled[0].actor && isCaernActor(controlled[0].actor)) {
    return controlled[0].actor;
  }
  const caerns = game.actors?.filter(a => a.type === "npc" && isCaernActor(a)) ?? [];
  if (caerns.length === 0) {
    ui.notifications?.warn?.("No Caern actors found in the world. Create one from the Caern Template.");
    return null;
  }
  if (caerns.length === 1) return caerns[0];
  const options = caerns.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
  return new Promise(resolve => {
    new Dialog({
      title: "Choose Caern",
      content: `<p>Select the Caern to apply the rite to:</p><select id="caern-actor-id" style="width:100%;margin-top:8px;">${options}</select>`,
      buttons: {
        ok: { icon: '<i class="fas fa-check"></i>', label: "OK", callback: (html) => {
          const id = html.find("#caern-actor-id").val();
          resolve(game.actors.get(id) ?? null);
        }},
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) },
      },
      default: "ok",
      close: () => resolve(null),
    }).render(true);
  });
}

/**
 * Remove other items on the Caern in the same exclusiveGroup, then add the chosen state item.
 * stateItemDoc: Item document (from world or compendium) to add; we use toObject() for createEmbeddedDocuments.
 */
async function setExclusiveCaernState(caernActor, exclusiveGroup, stateItemDoc) {
  if (!caernActor?.createEmbeddedDocuments || !stateItemDoc) return;
  const group = (exclusiveGroup ?? "").toString().toLowerCase();
  const toRemove = caernActor.items.filter(item => {
    const desc = (item.system?.description?.value ?? "").toLowerCase();
    const match = desc.match(/exclusivegroup\s*=\s*([^\s;]+)/);
    const itemGroup = (match?.[1] ?? "").toLowerCase();
    if (itemGroup && itemGroup === group) return true;
    const name = (item.name ?? "").toLowerCase();
    if (group === "glorious-past" && (name.includes("glorious past —") || name.includes("glorious past -"))) return true;
    return false;
  });
  if (toRemove.length) {
    await caernActor.deleteEmbeddedDocuments("Item", toRemove.map(i => i.id));
  }
  const data = stateItemDoc.toObject ? stateItemDoc.toObject() : stateItemDoc;
  delete data._id;
  delete data.id;
  await caernActor.createEmbeddedDocuments("Item", [data]);
}

/**
 * Update Caern cooldown for a rite (e.g. perSeason or perMonth).
 * cadenceKey: "perSeason" or "perMonth"
 * riteId: e.g. "glorious-past"
 * data: value to store (e.g. seasonIndex or turnIndex when used)
 */
async function updateCaernCooldown(caernActor, cadenceKey, riteId, data) {
  const flags = getCaernFlags(caernActor) ?? {};
  const rites = flags.rites ?? { cooldowns: { perMonth: {}, perSeason: {} } };
  const cooldowns = rites.cooldowns ?? { perMonth: {}, perSeason: {} };
  if (!cooldowns[cadenceKey]) cooldowns[cadenceKey] = {};
  cooldowns[cadenceKey][riteId] = data;
  const next = { ...flags, rites: { ...rites, cooldowns } };
  await caernActor.setFlag(GAROU.scope, CAERN_FLAG, next);
}

/**
 * Append an entry to the Caern's history and set updatedAt/updatedBy.
 */
async function logCaernHistory(caernActor, entry) {
  const flags = getCaernFlags(caernActor) ?? {};
  const history = Array.isArray(flags.history) ? [...flags.history] : [];
  history.push({
    at: Date.now(),
    ...(typeof entry === "object" ? entry : { message: String(entry) }),
  });
  const rites = flags.rites ?? { history: [] };
  const riteHistory = Array.isArray(rites.history) ? [...rites.history] : [];
  riteHistory.push({ at: Date.now(), ...(typeof entry === "object" ? entry : { message: String(entry) }) });
  const next = {
    ...flags,
    history: history.slice(-100),
    updatedAt: Date.now(),
    updatedBy: game.user?.id ?? caernActor.id ?? null,
    rites: { ...rites, history: riteHistory.slice(-50) },
  };
  await caernActor.setFlag(GAROU.scope, CAERN_FLAG, next);
}

/**
 * Find a Glorious Past state item by effect key (legacy-of-resolve, ancestral-witness, storied-ground).
 * Searches world items then garou-features pack by name.
 */
const GLORIOUS_PAST_STATE_NAMES = {
  "legacy-of-resolve": "Glorious Past — Legacy of Resolve",
  "ancestral-witness": "Glorious Past — Ancestral Witness",
  "storied-ground": "Glorious Past — Storied Ground",
};

async function findGloriousPastStateItem(effectKey) {
  const name = GLORIOUS_PAST_STATE_NAMES[effectKey];
  if (!name) return null;
  const fromWorld = game.items?.find(i => (i.name ?? "").trim() === name);
  if (fromWorld) return fromWorld;
  const pack = game.packs.get("garou.garou-features");
  if (pack) {
    const index = await pack.getIndex({ fields: ["name"] });
    const entry = index.find(e => (e.name ?? "").trim() === name);
    if (entry) return pack.getDocument(entry._id);
  }
  const giftsPack = game.packs.get("garou.garou-gifts");
  if (giftsPack) {
    const index = await giftsPack.getIndex({ fields: ["name"] });
    const entry = index.find(e => (e.name ?? "").trim() === name);
    if (entry) return giftsPack.getDocument(entry._id);
  }
  return null;
}

export {
  GAROU,
  CAERN_FLAG,
  getCaernFlags,
  isCaernActor,
  getSelectedCaernActor,
  setExclusiveCaernState,
  updateCaernCooldown,
  logCaernHistory,
  findGloriousPastStateItem,
  GLORIOUS_PAST_STATE_NAMES,
};
