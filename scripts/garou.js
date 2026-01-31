// Garou Module - Default Form Automation (Foundry v13 + dnd5e)

const GAROU_CLASS_NAME = "Garou";
const FORM_PREFIX = "Form: ";
const DEFAULT_FORM = "Homid";
const BASE_MOVEMENT_EFFECT_NAME = "Garou Base Movement";

const FORM_NAMES = ["Homid", "Glabro", "Crinos", "Hispo", "Lupus"];

function actorHasGarouClass(actor) {
  const classes = actor.items.filter(i => i.type === "class");
  return classes.some(c => (c.name ?? "").trim() === GAROU_CLASS_NAME);
}

function getGarouFormEffects(actor) {
  const wanted = new Set(FORM_NAMES.map(f => `${FORM_PREFIX}${f}`));
  return actor.effects.filter(e => wanted.has(e.name));
}

async function enforceSingleDefaultForm(actor) {
  if (!actor) return;
  if (!actorHasGarouClass(actor)) return;

  const formEffects = getGarouFormEffects(actor);
  if (!formEffects.length) return;

  const enabled = formEffects.filter(e => !e.disabled);
  if (enabled.length === 1) return;

  const updates = [];

  // disable all forms
  for (const e of formEffects) {
    updates.push({ _id: e.id, disabled: true });
  }

  // enable default form
  const defaultName = `${FORM_PREFIX}${DEFAULT_FORM}`;
  const defaultEffect = formEffects.find(e => e.name === defaultName) ?? formEffects[0];
  updates.push({ _id: defaultEffect.id, disabled: false });

  // keep base movement enabled (optional)
  const baseMove = actor.effects.find(e => e.name === BASE_MOVEMENT_EFFECT_NAME);
  if (baseMove) updates.push({ _id: baseMove.id, disabled: false });

  // IMPORTANT: set a guard flag so our own updates don't re-trigger
  await actor.updateEmbeddedDocuments("ActiveEffect", updates, { garouAuto: true });
}

// ---- Hooks ----

// When a relevant Item is added (like the class or Shapeshifting Forms), enforce.
Hooks.on("createItem", async (item, options, userId) => {
  if (options?.garouAuto) return;

  const actor = item.parent;
  if (!(actor instanceof Actor)) return;

  const name = (item.name ?? "").toLowerCase();
  const isRelevant =
    (item.type === "class" && item.name?.trim() === GAROU_CLASS_NAME) ||
    (item.type === "feat" && name.includes("shapeshifting forms"));

  if (!isRelevant) return;

  try {
    await enforceSingleDefaultForm(actor);
  } catch (err) {
    console.error("Garou createItem enforcement error:", err);
  }
});

// When form effects get transferred onto the Actor, enforce.
Hooks.on("createActiveEffect", async (effect, options, userId) => {
  if (options?.garouAuto) return;

  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;

  // Only react to Garou form effects or base movement effect
  const n = effect.name ?? "";
  if (!n.startsWith(FORM_PREFIX) && n !== BASE_MOVEMENT_EFFECT_NAME) return;

  try {
    await enforceSingleDefaultForm(actor);
  } catch (err) {
    console.error("Garou createActiveEffect enforcement error:", err);
  }
});

// Safety net: on ready, normalize existing actors once.
Hooks.once("ready", async () => {
  for (const actor of game.actors.contents) {
    try {
      await enforceSingleDefaultForm(actor);
    } catch (err) {
      console.error("Garou ready enforcement error:", err);
    }
  }
});
// --- Breed detection + default form mapping ---

const BREED_PREFIX = "Breed:";
const BREED_TO_DEFAULT_FORM = {
  "Homid": "Homid",
  "Lupus": "Lupus",
  "Metis": "Crinos"
};

function getBreedName(actor) {
  // Find an owned feature that starts with "Breed:"
  const breedItem = actor.items.find(i =>
    (i.type === "feat" || i.type === "classFeature") &&
    i.name?.trim().startsWith(BREED_PREFIX)
  );

  if (!breedItem) return null;

  // Extract "Homid" from "Breed: Homid"
  const raw = breedItem.name.trim().slice(BREED_PREFIX.length).trim();
  return raw || null;
}

function getDefaultFormFromBreed(actor) {
  const breed = getBreedName(actor);
  if (!breed) return null;
  return BREED_TO_DEFAULT_FORM[breed] ?? null;
}
async function enforceSingleDefaultForm(actor) {
  if (!actor || !actorHasGarouClass(actor)) return;

  const formEffects = getGarouFormEffects(actor);
  if (!formEffects.length) return;

  // If exactly one enabled already, do nothing
  const enabled = formEffects.filter(e => !e.disabled);
  if (enabled.length === 1) return;

  // Prefer breed default, fallback to Homid
  const breedDefault = getDefaultFormFromBreed(actor);
  const chosenForm = breedDefault ?? DEFAULT_FORM; // DEFAULT_FORM can still be "Homid"

  const updates = formEffects.map(e => ({ _id: e.id, disabled: true }));

  const desiredName = `${FORM_PREFIX}${chosenForm}`;
  const desiredEffect = formEffects.find(e => e.name === desiredName);

  if (desiredEffect) {
    updates.push({ _id: desiredEffect.id, disabled: false });
  } else {
    // fallback: enable first form effect if missing
    updates.push({ _id: formEffects[0].id, disabled: false });
  }

  const baseMove = actor.effects.find(e => e.name === BASE_MOVEMENT_EFFECT_NAME);
  if (baseMove) updates.push({ _id: baseMove.id, disabled: false });

  await actor.updateEmbeddedDocuments("ActiveEffect", updates, { garouAuto: true });
}


