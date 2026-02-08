/**
 * Rite of the Glorious Past – item use handler.
 * Hooks dnd5e.preUseItem (and Midi-QOL if present); runs Caern selection, validation, cadence, effect choice, and application.
 */

import {
  getCaernFlags,
  getSelectedCaernActor,
  setExclusiveCaernState,
  updateCaernCooldown,
  logCaernHistory,
  findGloriousPastStateItem,
  GLORIOUS_PAST_STATE_NAMES,
} from "./caern-api.js";

const RITE_ID = "glorious-past";
const CADENCE = "season";

function isRiteOfGloriousPast(item) {
  if (!item) return false;
  const name = (item.name ?? "").trim().toLowerCase();
  if (name.includes("glorious past") && name.includes("rite")) return true;
  const desc = (item.system?.description?.value ?? "").toLowerCase();
  if (desc.includes("[garou_rite]") && desc.includes(`id=${RITE_ID}`)) return true;
  const activities = item.system?.activities ?? {};
  for (const a of Object.values(activities)) {
    const chat = (a?.chatFlavor ?? "").toLowerCase();
    if (chat.includes("[garou_rite_use]") && chat.includes(`id=${RITE_ID}`)) return true;
  }
  return false;
}

function validateCaern(caernActor) {
  const flags = getCaernFlags(caernActor);
  const corruption = Number(flags?.corruption ?? 0);
  const rating = Number(flags?.rating ?? 0);
  if (corruption >= 5) {
    ui.notifications?.warn?.("This Caern is Lost (Corruption 5). The Rite cannot be performed here.");
    return false;
  }
  if (rating < 1) {
    ui.notifications?.warn?.("The Caern must have Rating ≥ 1 to perform this Rite.");
    return false;
  }
  return true;
}

function getSeasonIndex(caernActor) {
  const flags = getCaernFlags(caernActor);
  return Number(flags?.seasonIndex ?? 0);
}

function getPerSeasonCooldown(caernActor) {
  const flags = getCaernFlags(caernActor);
  const cooldowns = flags?.rites?.cooldowns?.perSeason ?? {};
  return cooldowns[RITE_ID];
}

async function chooseEffectDialog() {
  const choices = [
    { key: "legacy-of-resolve", label: "Legacy of Resolve (advantage vs supernatural fear in Caern)" },
    { key: "ancestral-witness", label: "Ancestral Witness (next Moot gains benefit)" },
    { key: "storied-ground", label: "Storied Ground (once, ignore Corruption from one missed upkeep)" },
  ];
  const options = choices.map(c => `<option value="${c.key}">${c.label}</option>`).join("");
  return new Promise(resolve => {
    new Dialog({
      title: "Rite of the Glorious Past – Choose Effect",
      content: `<p>Choose the Caern blessing until it is replaced or the Caern is Lost:</p><select id="glorious-past-effect" style="width:100%;margin-top:8px;">${options}</select>`,
      buttons: {
        ok: { icon: '<i class="fas fa-check"></i>', label: "Apply", callback: (html) => {
          resolve(html.find("#glorious-past-effect").val() || null);
        }},
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) },
      },
      default: "ok",
      close: () => resolve(null),
    }).render(true);
  });
}

async function runGloriousPastFlow(item, actor, token) {
  const caernActor = await getSelectedCaernActor();
  if (!caernActor) return true;

  if (!validateCaern(caernActor)) return true;

  const seasonIndex = getSeasonIndex(caernActor);
  const lastUsed = getPerSeasonCooldown(caernActor);
  if (lastUsed != null && lastUsed === seasonIndex) {
    ui.notifications?.warn?.(`Rite of the Glorious Past has already been performed this season for ${caernActor.name}.`);
    return true;
  }

  const effectKey = await chooseEffectDialog();
  if (!effectKey) return true;

  const stateItemDoc = await findGloriousPastStateItem(effectKey);
  if (!stateItemDoc) {
    ui.notifications?.warn?.("Glorious Past state item not found. Ensure the state items are in the world or in the Garou Features compendium.");
    return true;
  }

  await setExclusiveCaernState(caernActor, "glorious-past", stateItemDoc);

  const flags = getCaernFlags(caernActor) ?? {};
  const rites = flags.rites ?? { active: {}, cooldowns: { perMonth: {}, perSeason: {} } };
  const active = { ...(rites.active ?? {}) };
  active[RITE_ID] = {
    effect: effectKey,
    startedAt: Date.now(),
    appliedBy: actor?.id ?? game.user?.id ?? null,
  };
  const nextFlags = {
    ...flags,
    activeEffectKey: `glorious-past:${effectKey}`,
    rites: { ...rites, active },
  };
  await caernActor.setFlag("garou", "caern", nextFlags);
  await updateCaernCooldown(caernActor, "perSeason", RITE_ID, seasonIndex);
  await logCaernHistory(caernActor, {
    type: "rite",
    riteId: RITE_ID,
    effect: effectKey,
    appliedBy: actor?.id ?? game.user?.id,
  });

  const effectLabel = GLORIOUS_PAST_STATE_NAMES[effectKey] ?? effectKey;
  const content = `
    <p><strong>Rite of the Glorious Past</strong> performed for <strong>${caernActor.name}</strong>.</p>
    <p><em>Chosen effect:</em> ${effectLabel}</p>
    <p>Cost: 5 Gnosis (may be shared; if paid in full, the Rite succeeds automatically).</p>
    <p>This effect persists until replaced by another Glorious Past performance or the Caern is Lost.</p>
  `;
  await ChatMessage.create({
    user: game.user?.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
  });

  return true;
}

export function registerRiteHandler() {
  Hooks.on("dnd5e.preUseItem", (item, config, options) => {
    if (!isRiteOfGloriousPast(item)) return;
    runGloriousPastFlow(item, options?.actor ?? item?.actor, options?.token);
    return true; // we handle the rite; suppress default item use
  });
  if (typeof game?.modules?.get("midi-qol")?.api !== "undefined") {
    try {
      Hooks.on("midi-qol.RollComplete", (workflow) => {
        const item = workflow?.item;
        if (item && isRiteOfGloriousPast(item)) {
          const actor = workflow?.actor ?? item?.actor;
          const token = workflow?.token ?? null;
          runGloriousPastFlow(item, actor, token);
        }
      });
    } catch (_) {}
  }
}

export { isRiteOfGloriousPast, runGloriousPastFlow };
