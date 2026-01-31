// scripts/gnosis-resource.js

const GNOSIS_RESOURCE = "primary"; // primary | secondary | tertiary

function getGnosisMax(actor) {
  // Attempt to read from class scale (preferred)
  const scale = actor.system?.scale?.class?.gnosis;
  if (Number.isFinite(scale)) return scale;

  return null;
}

async function ensureGnosisResource(actor) {
  if (actor.type !== "character") return;

  // Only apply to Garou characters
  const hasGarou = !!actor.system?.classes?.garou;
  if (!hasGarou) return;

  const path = `system.resources.${GNOSIS_RESOURCE}`;
  const current = foundry.utils.getProperty(actor, path) ?? {};

  const max = getGnosisMax(actor);
  const updates = {};

  if (current.label !== "Gnosis") {
    updates[`${path}.label`] = "Gnosis";
  }

  if (max !== null && current.max !== max) {
    updates[`${path}.max`] = max;
  }

  if (current.value === undefined || current.value === null) {
    updates[`${path}.value`] = max ?? 0;
  }

  if (Object.keys(updates).length) {
    await actor.update(updates);
  }
}

Hooks.on("createActor", ensureGnosisResource);

Hooks.on("updateActor", async (actor, changed) => {
  if (!changed.system) return;
  await ensureGnosisResource(actor);
});
