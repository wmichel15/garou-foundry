// Garou Module - Default Form Automation (Foundry v13 + dnd5e)

const GAROU_CLASS_NAME = "Garou";
const FORM_PREFIX = "Form: ";
const DEFAULT_FORM = "Homid";
const BASE_MOVEMENT_EFFECT_NAME = "Garou Base Movement";

const FORM_NAMES = ["Homid", "Glabro", "Crinos", "Hispo", "Lupus"];

// --- Breed detection + default form mapping ---
const BREED_PREFIX = "Breed:";
const BREED_TO_DEFAULT_FORM = {
  "Homid": "Homid",
  "Lupus": "Lupus",
  "Metis": "Crinos"
};

function actorHasGarouClass(actor) {
  const classes = actor?.items?.filter(i => i.type === "class") ?? [];
  return classes.some(c => (c.name ?? "").trim() === GAROU_CLASS_NAME);
}

function getGarouFormEffects(actor) {
  const wanted = new Set(FORM_NAMES.map(f => `${FORM_PREFIX}${f}`));
  return actor?.effects?.filter(e => wanted.has(e.name)) ?? [];
}

function getBreedName(actor) {
  // In dnd5e, "feat" is the correct container for most features.
  const breedItem = actor?.items?.find(i =>
    i.type === "feat" &&
    (i.name ?? "").trim().startsWith(BREED_PREFIX)
  );
  if (!breedItem) return null;

  // Extract "Homid" from "Breed: Homid"
  const raw = (breedItem.name ?? "").trim().slice(BREED_PREFIX.length).trim();
  return raw || null;
}

function getDefaultFormForActor(actor) {
  const breed = getBreedName(actor);
  if (breed && BREED_TO_DEFAULT_FORM[breed]) return BREED_TO_DEFAULT_FORM[breed];
  return DEFAULT_FORM;
}

/**
 * Ensure exactly one Garou form effect is enabled.
 * Preference order:
 * 1) If exactly one form effect is enabled already: do nothing.
 * 2) Else, enable the breed's default form (if present), else DEFAULT_FORM.
 * Also keeps "Garou Base Movement" enabled if present.
 */
async function enforceSingleDefaultForm(actor) {
  if (!actor) return;
  if (!actorHasGarouClass(actor)) return;

  const formEffects = getGarouFormEffects(actor);
  if (!formEffects.length) return;

  const enabled = formEffects.filter(e => !e.disabled);
  if (enabled.length === 1) return;

  const chosenForm = getDefaultFormForActor(actor);
  const desiredName = `${FORM_PREFIX}${chosenForm}`;
  const desiredEffect = formEffects.find(e => e.name === desiredName) ?? formEffects[0];

  const updates = [];

  // Disable all forms
  for (const e of formEffects) {
    updates.push({ _id: e.id, disabled: true });
  }

  // Enable chosen form
  updates.push({ _id: desiredEffect.id, disabled: false });

  // Keep base movement enabled (optional)
  const baseMove = actor.effects.find(e => e.name === BASE_MOVEMENT_EFFECT_NAME);
  if (baseMove) updates.push({ _id: baseMove.id, disabled: false });

  // Guard: prevent our own updates from re-triggering hooks
  await actor.updateEmbeddedDocuments("ActiveEffect", updates, { garouAuto: true });
}

// ---- Hooks ----

// When an Item is added to an Actor, enforce if relevant.
Hooks.on("createItem", async (item, options) => {
  if (options?.garouAuto) return;

  const actor = item.parent;
  if (!(actor instanceof Actor)) return;

  const name = (item.name ?? "").toLowerCase();
  const isRelevant =
    (item.type === "class" && (item.name ?? "").trim() === GAROU_CLASS_NAME) ||
    (item.type === "feat" && (name.includes("shapeshifting forms") || name.startsWith("breed:")));

  if (!isRelevant) return;

  try {
    await enforceSingleDefaultForm(actor);
  } catch (err) {
    console.error("Garou createItem enforcement error:", err);
  }
});

// When an ActiveEffect is created on an Actor, enforce if it’s a Garou form/base move effect.
Hooks.on("createActiveEffect", async (effect, options) => {
  if (options?.garouAuto) return;

  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;

  const n = effect.name ?? "";
  const isRelevant = n.startsWith(FORM_PREFIX) || n === BASE_MOVEMENT_EFFECT_NAME;
  if (!isRelevant) return;

  try {
    await enforceSingleDefaultForm(actor);
  } catch (err) {
    console.error("Garou createActiveEffect enforcement error:", err);
  }
});

// Safety net: on ready, normalize existing Garou actors once.
Hooks.once("ready", async () => {
  for (const actor of game.actors.contents) {
    if (!actorHasGarouClass(actor)) continue;
    try {
      await enforceSingleDefaultForm(actor);
    } catch (err) {
      console.error("Garou ready enforcement error:", err);
    }
  }
});
