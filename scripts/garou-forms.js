// scripts/garou-forms.js
// Auto-enforce only one Garou form ActiveEffect enabled at a time.

const GAROU_CLASS_IDENTIFIER = "garou";      // your class identifier
const FORM_PREFIX = "Form: ";
const FORM_NAMES = ["Homid", "Glabro", "Crinos", "Hispo", "Lupus"];
const GUARD_OPTION = "garouAutoForms";

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

// Safety net: when sheet opens, normalize (helps after imports)
Hooks.on("renderActorSheet", (app) => {
  const actor = app.actor;
  if (!isGarouActor(actor)) return;
  enforceSingleForm(actor).catch(err => console.error("[garou] enforceSingleForm (render) error:", err));
});
