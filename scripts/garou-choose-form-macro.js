// Garou: Choose Form (safe for manual + Midi-QOL)
// Paste this into the "Garou: Choose Form" macro in Foundry. Uses DialogV2 (no deprecation).

const _args = typeof args !== "undefined" && Array.isArray(args) ? args : [];
const passed = _args.length ? _args[0] : {};

const FORMS = ["Homid", "Glabro", "Crinos", "Hispo", "Lupus"];
const EFFECT_PREFIX = "Form: ";
const DialogV2 = foundry.applications.api.DialogV2;

async function resolveActor() {
  const a0 = passed;
  if (a0?.actor) return a0.actor;
  if (a0?.workflow?.actor) return a0.workflow.actor;
  if (a0?.token?.actor) return a0.token.actor;

  const uuid = a0?.actorUuid ?? a0?.tokenUuid ?? a0?.uuid;
  if (uuid) {
    const doc = await fromUuid(uuid).catch(() => null);
    if (doc?.actor) return doc.actor;
    if (doc?.documentName === "Actor") return doc;
  }

  return canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
}

// Collect form effects from the actor AND from form items (Homid, Glabro, etc.) on the actor.
// Returns { effect, parent } so we can update effects on either the actor or the item.
function getFormEffects(actor) {
  const wanted = new Set(FORMS.map(f => `${EFFECT_PREFIX}${f}`));
  const result = [];

  for (const e of actor.effects) {
    if (wanted.has(e.name ?? "")) result.push({ effect: e, parent: actor });
  }

  for (const item of actor.items) {
    const name = (item.name ?? "").trim();
    if (!FORMS.includes(name)) continue;
    for (const e of item.effects) {
      if (wanted.has(e.name ?? "")) result.push({ effect: e, parent: item });
    }
  }

  return result;
}

async function applyForm(actor, chosenForm, formEffectsList) {
  if (!formEffectsList.length) return;

  const updatesByParent = new Map();

  for (const { effect, parent } of formEffectsList) {
    if (!updatesByParent.has(parent)) updatesByParent.set(parent, []);
    updatesByParent.get(parent).push({ _id: effect.id, disabled: true });
  }

  if (chosenForm !== "none") {
    const desiredName = `${EFFECT_PREFIX}${chosenForm}`;
    const entry = formEffectsList.find(({ effect }) => effect.name === desiredName);
    if (entry) {
      const list = updatesByParent.get(entry.parent);
      const idx = list.findIndex(u => u._id === entry.effect.id);
      if (idx >= 0) list[idx].disabled = false;
    }
  }

  for (const [parent, updates] of updatesByParent) {
    await parent.updateEmbeddedDocuments("ActiveEffect", updates);
  }

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: chosenForm === "none"
      ? `<p><b>${actor.name}</b> reverts (no form active).</p>`
      : `<p><b>${actor.name}</b> shifts into <b>${chosenForm}</b>.</p>`
  });

  if (actor.sheet?.rendered) actor.sheet.render(true);
}

const actor = await resolveActor();
if (!actor) {
  ui.notifications.error("Garou: Choose Form — No actor found. Select a token or assign a character.");
  return;
}

const formEffectsList = getFormEffects(actor);
if (!formEffectsList.length) {
  ui.notifications.warn(
    "No Garou form effects on this actor. " +
    "Add the form items (Homid, Glabro, Crinos, Hispo, Lupus) from the Garou compendium, or add the Shapeshifting Forms feature so they are granted. " +
    "Expected effect names: " + FORMS.map(f => EFFECT_PREFIX + f).join(", ") + "."
  );
  return;
}

// If a form was passed (e.g. from using a form item's "Shift to This Form" activity), apply it and skip the dialog.
const preSelectedForm = passed.form ?? passed.formName ?? passed.item?.name ?? passed.workflow?.item?.name;
const formName = (typeof preSelectedForm === "string" && preSelectedForm.trim()) || null;
if (formName && FORMS.includes(formName)) {
  await applyForm(actor, formName, formEffectsList);
  return;
}

const buttons = [
  ...FORMS.map((f, i) => ({
    label: f,
    action: f.toLowerCase(),
    default: i === 0,
    callback: async () => { await applyForm(actor, f, formEffectsList); }
  })),
  { label: "Disable All Forms", action: "none", callback: async () => { await applyForm(actor, "none", formEffectsList); } }
];

await DialogV2.wait({
  window: { title: "Choose Garou Form" },
  content: `<p>Select a form. This enables only the chosen <b>Form: &lt;Name&gt;</b> effect and disables the others.</p>`,
  buttons,
  rejectClose: false
});
