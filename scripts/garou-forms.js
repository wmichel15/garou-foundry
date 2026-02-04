// scripts/garou-forms.js
// Auto-enforce only one Garou form ActiveEffect enabled at a time.
// Ensures Garou characters have Shapeshifting Forms + 5 form items (grant if missing after creation).

const GAROU_CLASS_IDENTIFIER = "garou";      // your class identifier
const FORM_PREFIX = "Form: ";
const FORM_NAMES = ["Homid", "Glabro", "Crinos", "Hispo", "Lupus"];
const GUARD_OPTION = "garouAutoForms";
const FEATURES_PACK_KEY = "garou.garou-features";
const SHAPESHIFTING_FORMS_NAME = "Shapeshifting Forms";

function isGarouActor(actor) {
  if (!actor || actor.type !== "character") return false;
  // Check if actor has Garou class by identifier (safer than name)
  const classes = actor.items.filter(i => i.type === "class");
  return classes.some(c => c.system?.identifier === GAROU_CLASS_IDENTIFIER || c.name?.toLowerCase() === "garou");
}

function isFormEffect(effect) {
  const n = (effect?.name ?? "").trim();
  if (!n.startsWith(FORM_PREFIX)) return false;
  const form = n.slice(FORM_PREFIX.length).trim();
  return FORM_NAMES.includes(form);
}

function getFormEffects(actor) {
  return actor.effects.filter(isFormEffect);
}

/** Check if actor has the Shapeshifting Forms feature item (by name). */
function hasShapeshiftingFormsItem(actor) {
  if (!actor?.items) return false;
  return actor.items.some(i => (i.name ?? "").trim() === SHAPESHIFTING_FORMS_NAME);
}

/** Check if actor has a form item (e.g. Homid, Glabro). Match by name or "Form: X". */
function hasFormItem(actor, formName) {
  if (!actor?.items) return false;
  const want = formName.trim();
  const wantPrefixed = `${FORM_PREFIX}${want}`;
  return actor.items.some(i => {
    const n = (i.name ?? "").trim();
    return n === want || n === wantPrefixed;
  });
}

/** Ensure Garou characters have Shapeshifting Forms + all 5 form items; grant from compendium if missing. */
async function ensureFormsGranted(actor) {
  if (!actor || actor.type !== "character") return;
  if (!isGarouActor(actor)) return;

  const pack = game.packs.get(FEATURES_PACK_KEY);
  if (!pack) return;

  const toGrant = [];
  if (!hasShapeshiftingFormsItem(actor)) {
    const entry = pack.index.find(e => (e.name ?? "").trim() === SHAPESHIFTING_FORMS_NAME);
    if (entry) toGrant.push(entry);
  }
  for (const formName of FORM_NAMES) {
    if (!hasFormItem(actor, formName)) {
      const entry = pack.index.find(e => {
        const n = (e.name ?? "").trim();
        return n === formName || n === `${FORM_PREFIX}${formName}`;
      });
      if (entry) toGrant.push(entry);
    }
  }
  if (toGrant.length === 0) return;

  const seen = new Set();
  for (const entry of toGrant) {
    if (seen.has(entry._id)) continue;
    seen.add(entry._id);
    try {
      const doc = await pack.getDocument(entry._id);
      if (!doc) continue;
      const data = doc.toObject();
      delete data._id;
      await actor.createEmbeddedDocuments("Item", [data]);
    } catch (err) {
      console.warn("[garou] ensureFormsGranted: could not grant", entry.name, err);
    }
  }
}

async function enforceSingleForm(actor, preferredEffectId = null) {
  if (!isGarouActor(actor)) return;

  const formEffects = getFormEffects(actor);
  if (!formEffects.length) return;

  const enabled = formEffects.filter(e => !e.disabled);

  // If exactly one enabled, done
  if (enabled.length === 1) return;

  // Decide which one should be enabled
  let keep = null;

  // If an effect was just enabled, keep that
  if (preferredEffectId) {
    keep = formEffects.find(e => e.id === preferredEffectId) ?? null;
  }

  // Otherwise keep the first enabled (if any)
  if (!keep && enabled.length) keep = enabled[0];

  // Otherwise default to Homid if none enabled
  if (!keep) {
    const homidName = `${FORM_PREFIX}Homid`;
    keep = formEffects.find(e => e.name === homidName) ?? formEffects[0];
  }

  const updates = [];

  for (const e of formEffects) {
    const shouldDisable = e.id !== keep.id;
    if (e.disabled !== shouldDisable) {
      updates.push({ _id: e.id, disabled: shouldDisable });
    }
  }

  if (updates.length) {
    await actor.updateEmbeddedDocuments("ActiveEffect", updates, { [GUARD_OPTION]: true });
  }
}

// ---- Hooks ----

// When any ActiveEffect is updated, and it is a form effect being turned ON, enforce.
Hooks.on("updateActiveEffect", (effect, changed, options) => {
  if (options?.[GUARD_OPTION]) return;

  const actor = effect?.parent;
  if (!(actor instanceof Actor)) return;
  if (!isGarouActor(actor)) return;
  if (!isFormEffect(effect)) return;

  // We only care when something becomes enabled (disabled: false)
  if (changed?.disabled !== false) return;

  // enforce and prefer the one that was just enabled
  enforceSingleForm(actor, effect.id).catch(err => console.error("[garou] enforceSingleForm error:", err));
});

// Safety net: when sheet opens, normalize (helps after imports); also ensure forms are granted
Hooks.on("renderActorSheet", (app) => {
  const actor = app.actor;
  if (!isGarouActor(actor)) return;
  ensureFormsGranted(actor).then(() => enforceSingleForm(actor)).catch(err => console.error("[garou] garou-forms (render) error:", err));
});

Hooks.on("createActor", (actor) => {
  if (actor?.type === "character" && isGarouActor(actor)) {
    ensureFormsGranted(actor).catch(err => console.error("[garou] ensureFormsGranted (createActor):", err));
  }
});

Hooks.on("updateActor", (actor, changed) => {
  if (!changed.items || actor?.type !== "character") return;
  if (!isGarouActor(actor)) return;
  ensureFormsGranted(actor).then(() => enforceSingleForm(actor)).catch(err => console.error("[garou] garou-forms (updateActor):", err));
});

Hooks.on("updateItem", (item, changed, options) => {
  if (item.type !== "class" || (item.actor ?? item.parent)?.type !== "character") return;
  const id = (item.system?.identifier ?? "").toLowerCase();
  const name = (item.name ?? "").toLowerCase();
  if (id !== "garou" && name !== "garou") return;
  const actor = item.actor ?? item.parent;
  if (actor) ensureFormsGranted(actor).catch(err => console.error("[garou] ensureFormsGranted (updateItem):", err));
});

Hooks.once("ready", async () => {
  for (const actor of game.actors?.contents ?? []) {
    if (actor.type !== "character" || !isGarouActor(actor)) continue;
    try {
      await ensureFormsGranted(actor);
      await enforceSingleForm(actor);
    } catch (err) {
      console.error("[garou] garou-forms (ready):", err);
    }
  }
});
