// Garou - Shapeshift
// Opens a dialog to choose a Garou form and enables it,
// disabling all other Form: X active effects.
// Use from hotbar (select token first) or from Item Macro (args passed).

const FORM_PREFIX = "Form: ";
const FORM_NAMES = ["Homid", "Glabro", "Crinos", "Hispo", "Lupus"];
const GUARD_OPTION = "garouAutoForms";
const DialogV2 = foundry.applications.api.DialogV2;

// Resolve actor: from scope (Item Macro / Garou module inject actor), then args, then selected token, then assigned character
async function resolveTargetActor() {
  if (typeof actor !== "undefined" && actor instanceof Actor) return actor;
  const w = (typeof args !== "undefined" && args?.length) ? args[0] : null;
  if (w?.actor) return w.actor;
  if (w?.token?.actor) return w.token.actor;
  if (w?.actorUuid) {
    const doc = await fromUuid(w.actorUuid);
    return doc?.actor ?? doc ?? null;
  }
  if (w?.actorId) return game.actors.get(w.actorId);
  return (
    canvas?.tokens?.controlled?.[0]?.actor ??
    game.user?.character ??
    null
  );
}

const targetActor = await resolveTargetActor();
if (!targetActor) {
  ui.notifications.warn(
    "Garou Shapeshift: No actor. Select a token on the canvas first, or assign a character to your user (right-click actor → Assign to User)."
  );
  return;
}

// Form effects can live on the actor or on owned form items (Homid, Glabro, etc.)
function getFormEffects(a) {
  const fromActor = (a.effects || []).filter(e =>
    FORM_NAMES.some(f => (e.name || "").trim() === FORM_PREFIX + f)
  );
  const fromItems = (a.items || [])
    .filter(i => FORM_NAMES.includes((i.name || "").trim()))
    .flatMap(i => (i.effects || []).filter(e =>
      FORM_NAMES.some(f => (e.name || "").trim() === FORM_PREFIX + f)
    ));
  return [...fromActor, ...fromItems];
}

const formEffects = getFormEffects(targetActor);
if (!formEffects.length) {
  ui.notifications.warn(
    "Garou Shapeshift: No form effects on " + targetActor.name + ". " +
    "Add the Shapeshifting Forms feature and the form items (Homid, Glabro, Crinos, Hispo, Lupus) from Garou – Features."
  );
  return;
}

const currentEffect = formEffects.find(e => !e.disabled);
const currentName = currentEffect ? (currentEffect.name || "").replace(FORM_PREFIX, "") : "None";

const content = `
  <p><b>Current form:</b> ${currentName}</p>
  <hr/>
  <div class="form-group">
    <label>Form</label>
    <select name="garou-form">
      ${FORM_NAMES.map(f => `<option value="${f}"${f === currentName ? " selected" : ""}>${f}</option>`).join("")}
    </select>
  </div>
`;

const chosen = await DialogV2.wait({
  window: { title: "Shapeshifting Forms" },
  content,
  rejectClose: false,
  buttons: [
    {
      label: "Shift",
      action: "shift",
      default: true,
      callback: async (event, button) => {
        const el = button.form?.elements?.["garou-form"];
        const value = el ? (el.value || "").trim() : "";
        if (!value || !FORM_NAMES.includes(value)) return null;
        const effectName = FORM_PREFIX + value;
        const desired = formEffects.find(e => (e.name || "").trim() === effectName);
        if (!desired) return null;
        const updates = formEffects.map(e => ({
          _id: e.id,
          disabled: e.id !== desired.id
        }));
        await targetActor.updateEmbeddedDocuments("ActiveEffect", updates, { [GUARD_OPTION]: true });
        if (targetActor.setFlag) targetActor.setFlag("garou", "currentForm", effectName);
        ui.notifications.info("Shifted into " + value + " form.");
        return value;
      }
    },
    { label: "Cancel", action: "cancel" }
  ]
});

// chosen is the returned value from the Shift button; the callback already applied the form change
