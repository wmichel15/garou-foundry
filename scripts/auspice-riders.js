// scripts/auspice-riders.js
// Auto-apply Auspice rider features (Trial by Combat) based on the actor's Auspice feature.
// Searches only garou.garou-features compendium.

const GAROU_MODULE_ID = "garou";
const FEATURES_PACK_KEY = "garou.garou-features";

const FLAG_SCOPE = "garou";
const AUSPICE_FLAG = "auspice";          // flags.garou.auspice
const BASE_KEY_FLAG = "featureKey";      // flags.garou.featureKey
const RIDER_FOR_FLAG = "riderFor";       // flags.garou.riderFor

const TRIAL_BY_COMBAT_KEY = "trialByCombat";
const VALID_AUSPICES = new Set(["ragabash", "theurge", "philodox", "galliard", "ahroun"]);

const _actorQueue = new Map();
const _actorLock = new Set();

function debounceActor(actorId, fn, delay = 200) {
  const prev = _actorQueue.get(actorId);
  if (prev) clearTimeout(prev);
  _actorQueue.set(actorId, setTimeout(() => {
    _actorQueue.delete(actorId);
    fn();
  }, delay));
}

function getActorAuspiceKey(actor) {
  const auspiceItem = actor.items.find(i => {
    const key = i.getFlag(FLAG_SCOPE, AUSPICE_FLAG);
    return typeof key === "string" && VALID_AUSPICES.has(key.toLowerCase());
  });
  return auspiceItem ? auspiceItem.getFlag(FLAG_SCOPE, AUSPICE_FLAG).toLowerCase() : null;
}

function actorHasBaseFeature(actor, featureKey) {
  return actor.items.some(i => i.getFlag(FLAG_SCOPE, BASE_KEY_FLAG) === featureKey);
}

function getActorRiderItems(actor, riderForKey) {
  return actor.items.filter(i => i.getFlag(FLAG_SCOPE, RIDER_FOR_FLAG) === riderForKey);
}

async function findRiderInFeaturesPack(riderForKey, auspiceKey) {
  const pack = game.packs.get(FEATURES_PACK_KEY);
  if (!pack) {
    console.warn(`[${GAROU_MODULE_ID}] Missing compendium pack: ${FEATURES_PACK_KEY}`);
    ui.notifications?.warn?.(`Garou: Missing compendium ${FEATURES_PACK_KEY}`);
    return null;
  }

  const index = await pack.getIndex({ fields: ["flags"] });
  const match = index.find(e => {
    const f = e.flags?.[FLAG_SCOPE];
    return f?.[RIDER_FOR_FLAG] === riderForKey
      && (f?.[AUSPICE_FLAG] || "").toLowerCase() === auspiceKey;
  });

  if (!match) return null;
  return await pack.getDocument(match._id);
}

async function ensureTrialByCombatRider(actor) {
  if (!actor || actor.type !== "character") return;
  if (game.system.id !== "dnd5e") return;
  if (_actorLock.has(actor.id)) return;

  const auspiceKey = getActorAuspiceKey(actor);
  if (!auspiceKey) return;

  // Only apply if actor has Trial by Combat base feature
  if (!actorHasBaseFeature(actor, TRIAL_BY_COMBAT_KEY)) return;

  const currentRiders = getActorRiderItems(actor, TRIAL_BY_COMBAT_KEY);
  const correct = currentRiders.find(i => (i.getFlag(FLAG_SCOPE, AUSPICE_FLAG) || "").toLowerCase() === auspiceKey);
  const incorrect = currentRiders.filter(i => (i.getFlag(FLAG_SCOPE, AUSPICE_FLAG) || "").toLowerCase() !== auspiceKey);

  _actorLock.add(actor.id);
  try {
    // Remove incorrect riders
    if (incorrect.length) {
      await actor.deleteEmbeddedDocuments("Item", incorrect.map(i => i.id));
    }

    // If correct rider already present, done
    if (correct) return;

    // Pull correct rider from garou.garou-features
    const riderDoc = await findRiderInFeaturesPack(TRIAL_BY_COMBAT_KEY, auspiceKey);
    if (!riderDoc) {
      console.warn(`[${GAROU_MODULE_ID}] Missing rider in ${FEATURES_PACK_KEY} for ${TRIAL_BY_COMBAT_KEY}:${auspiceKey}`);
      ui.notifications?.warn?.(`Garou: Missing ${auspiceKey} rider for Trial by Combat in Features pack.`);
      return;
    }

    await actor.createEmbeddedDocuments("Item", [riderDoc.toObject()]);
  } finally {
    _actorLock.delete(actor.id);
  }
}

// Re-check when actor items change
Hooks.on("updateActor", (actor, changed) => {
  if (!changed.items) return;
  debounceActor(actor.id, () => ensureTrialByCombatRider(actor).catch(err => {
    console.error(`[${GAROU_MODULE_ID}] ensureTrialByCombatRider error:`, err);
  }));
});

// Also re-check when sheet opens (helps for imported actors)
Hooks.on("renderActorSheet", (app) => {
  const actor = app.actor;
  debounceActor(actor.id, () => ensureTrialByCombatRider(actor).catch(err => {
    console.error(`[${GAROU_MODULE_ID}] ensureTrialByCombatRider error:`, err);
  }), 50);
});
