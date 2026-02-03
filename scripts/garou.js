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

// Macro name expected by Midi-QOL (shapeshifting-forms feature flag)
const CHOOSE_FORM_MACRO_NAME = "Garou: Choose Form";

// Script for the "Garou: Choose Form" world macro (used by Midi-QOL onUseMacroName).
// Uses DialogV2 (Foundry v12+) to avoid V1 Application deprecation.
function getChooseFormMacroCommand() {
  return `
const FORMS = ["Homid", "Glabro", "Crinos", "Hispo", "Lupus"];
const EFFECT_PREFIX = "Form: ";
const DialogV2 = foundry.applications.api.DialogV2;

function getTargetActor() {
  const w = (typeof args !== "undefined" && args?.length) ? args[0] : null;
  if (w?.actor) return w.actor;
  if (w?.token?.actor) return w.token.actor;
  return (
    canvas?.tokens?.controlled?.[0]?.actor ??
    game.user?.character ??
    null
  );
}

const actor = getTargetActor();
if (!actor) {
  ui.notifications.error(
    "Garou: Choose Form — No actor. Select a token on the canvas first, or assign a character to your user (right-click actor → Assign to User)."
  );
  return;
}

// Form effects can live on the actor or on owned form items (Homid, Glabro, etc.)
function getFormEffects(actor) {
  const fromActor = (actor.effects || []).filter(e =>
    FORMS.some(f => (e.name || "") === EFFECT_PREFIX + f)
  );
  const fromItems = (actor.items || [])
    .filter(i => FORMS.includes((i.name || "").trim()))
    .flatMap(i => (i.effects || []).filter(e =>
      FORMS.some(f => (e.name || "") === EFFECT_PREFIX + f)
    ));
  return [...fromActor, ...fromItems];
}
const formEffects = getFormEffects(actor);

if (!formEffects.length) {
  ui.notifications.warn(
    "Garou: Choose Form — No form effects on " + actor.name + ". " +
    "Add the Shapeshifting Forms feature and the form items (Homid, Glabro, Crinos, Hispo, Lupus) from Garou – Features so the actor has Form: X effects."
  );
  return;
}

const content = '<div class="form-group"><label>Form</label><select name="garou-form">' +
  FORMS.map(f => '<option value="' + f + '">' + f + '</option>').join("") +
  '</select></div>';

await DialogV2.wait({
  window: { title: "Choose Garou Form" },
  content: content,
  rejectClose: false,
  buttons: [
    {
      label: "Shift",
      action: "shift",
      default: true,
      callback: async (event, button) => {
        const el = button.form.elements["garou-form"];
        const chosen = el ? (el.value || "").trim() : "";
        if (!chosen || !FORMS.includes(chosen)) return null;
        const effectName = EFFECT_PREFIX + chosen;
        for (const ef of formEffects) {
          await ef.update({ disabled: ef.name !== effectName });
        }
        if (actor.setFlag) actor.setFlag("garou", "currentForm", effectName);
        ui.notifications.info("Shifted into " + chosen + " form.");
        return effectName;
      }
    },
    { label: "Cancel", action: "cancel" }
  ]
});
`.trim();
}

async function ensureChooseFormMacro() {
  const command = getChooseFormMacroCommand();
  const existing = game.macros?.find(m => m.name === CHOOSE_FORM_MACRO_NAME);

  if (existing) {
    try {
      await existing.update({ command }, { renderSheet: false });
      console.log("Garou: Synced world macro '" + CHOOSE_FORM_MACRO_NAME + "' (DialogV2).");
    } catch (err) {
      console.error("Garou: Failed to update macro '" + CHOOSE_FORM_MACRO_NAME + "':", err);
    }
    return;
  }

  try {
    await Macro.create({
      name: CHOOSE_FORM_MACRO_NAME,
      type: "script",
      scope: "global",
      command,
      img: "icons/svg/dice-target.svg",
      flags: { garou: { autoCreated: true } }
    }, { renderSheet: false });
    console.log("Garou: Created world macro '" + CHOOSE_FORM_MACRO_NAME + "'.");
  } catch (err) {
    console.error("Garou: Failed to create macro '" + CHOOSE_FORM_MACRO_NAME + "':", err);
  }
}

// Items that should trigger the Choose Form macro (built into module for all users).
function isChooseFormTriggerItem(item) {
  if (!item) return false;
  const name = (item.name ?? "").trim().toLowerCase();
  const id = (item.system?.identifier ?? "").trim();
  return (
    name.includes("shapeshifting forms") ||
    id === "shapeshifting-forms" ||
    name.includes("choose garou form") ||
    id === "choose-garou-form"
  );
}

// When the user *uses* Shapeshifting Forms or Choose Garou Form, run the form picker.
// We wrap item.use() so we run before Midi-QOL and handle the item ourselves (no workflow, no removeWorkflow noise).
const CHOOSE_FORM_MACRO_ALIASES = ["Garou: Choose Form", "Garou - Shapeshift"];

function runChooseFormForItem(item) {
  if (!item || !isChooseFormTriggerItem(item)) return false;
  const actor = item.actor ?? item.parent;
  if (!(actor instanceof Actor)) return false;
  const macro = CHOOSE_FORM_MACRO_ALIASES.map(name => game.macros?.find(m => m.name === name)).find(Boolean);
  if (!macro) return false;
  const token = actor.getActiveTokens?.()?.[0] ?? null;
  const scope = { actor, token, item };
  macro.execute(scope).catch(err => console.error("Garou: Choose Form macro error", err));
  return true;
}

// Register wrapper in "ready" so CONFIG.Item is set (dnd5e or Midi-QOL). Use CONFIG path so libWrapper can resolve when documentClass is MidiItem.
Hooks.once("ready", () => {
  if (typeof libWrapper === "undefined") {
    console.warn("Garou: lib-wrapper not found. Install the 'libWrapper' module so using Shapeshifting Forms opens the form picker and avoids Midi-QOL workflow.");
    return;
  }
  const ItemClass = CONFIG.Item?.documentClass;
  if (!ItemClass?.prototype?.use) return;
  const target = "CONFIG.Item.documentClass.prototype.use";
  libWrapper.register(
    "garou",
    target,
    function (wrapped, ...args) {
      if (runChooseFormForItem(this)) return Promise.resolve();
      return wrapped.apply(this, args);
    },
    "OVERRIDE"
  );
});

// Fallback when lib-wrapper is not installed: dnd5e.preUseItem (may not run before Midi-QOL macro/rollItem path).
Hooks.on("dnd5e.preUseItem", (item, config, options) => {
  if (runChooseFormForItem(item)) return true;
});

// Built-in: add "Choose Form" button to Shapeshifting Forms / Choose Garou Form item sheets (works for everyone, no Item Macro or Midi-QOL required).
Hooks.on("renderItemSheet", (app, html, data) => {
  if (!app.object?.isItem || !isChooseFormTriggerItem(app.object)) return;
  if (html[0]?.querySelector(".garou-choose-form-trigger")) return; // already added
  const actor = app.object.actor ?? app.object.parent;
  const macro = game.macros?.find(m => m.name === CHOOSE_FORM_MACRO_NAME);
  if (!macro) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "garou-choose-form-trigger";
  btn.innerHTML = '<i class="fas fa-paw"></i> Choose Form';
  btn.title = "Open the Garou form picker dialog";
  btn.style.marginLeft = "0.5em";

  const header = html[0]?.querySelector(".window-header") ?? html[0]?.querySelector(".sheet-header") ?? html[0]?.querySelector("h4")?.parentElement ?? html[0];
  if (header) {
    header.appendChild(btn);
    btn.addEventListener("click", async () => {
      await macro.execute(false, [{ actor, token: actor?.getActiveTokens?.()?.[0] ?? null, item: app.object }]);
    });
  }
});

// Safety net: on ready, create Choose Form world macro if missing, then normalize existing Garou actors once.
Hooks.once("ready", async () => {
  await ensureChooseFormMacro();

  for (const actor of game.actors.contents) {
    if (!actorHasGarouClass(actor)) continue;
    try {
      await enforceSingleDefaultForm(actor);
    } catch (err) {
      console.error("Garou ready enforcement error:", err);
    }
  }
});
