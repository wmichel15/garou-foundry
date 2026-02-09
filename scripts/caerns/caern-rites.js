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
  findBadgersBurrowStateItem,
  getBadgersBurrowRadius,
  getTurnIndex,
  getPerTurnCooldown,
  selectTwoCaerns,
  findOpenedBridgeStateItem,
  generateLinkId,
  findShroudedGlenStateItem,
  getShroudedGlenDC,
  isActorRecognizedByCaern,
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

// ===== Badger's Burrow =====
const BADGERS_BURROW_RITE_ID = "badgers-burrow";

function isBadgersBurrowRite(item) {
  if (!item) return false;
  const name = (item.name ?? "").trim().toLowerCase();
  if (name.includes("badger") && name.includes("burrow") && name.includes("rite")) return true;
  const desc = (item.system?.description?.value ?? "").toLowerCase();
  if (desc.includes("[garou_rite]") && desc.includes(`id=${BADGERS_BURROW_RITE_ID}`)) return true;
  const activities = item.system?.activities ?? {};
  for (const a of Object.values(activities)) {
    const chat = (a?.chatFlavor ?? "").toLowerCase();
    if (chat.includes("[garou_rite_use]") && chat.includes(`id=${BADGERS_BURROW_RITE_ID}`)) return true;
  }
  return false;
}

async function placeBadgersBurrowTemplate(radiusFeet) {
  if (!canvas?.scene) {
    ui.notifications?.warn?.("Badger's Burrow: No active scene.");
    return null;
  }
  const viewCenter = canvas.stage.getBounds();
  const centerX = viewCenter.x + viewCenter.width / 2;
  const centerY = viewCenter.y + viewCenter.height / 2;
  const templateData = {
    t: "circle",
    x: centerX,
    y: centerY,
    distance: radiusFeet,
    direction: 0,
    fillColor: game.user?.color ?? "#FF0000",
    flags: { garou: { badgersBurrow: true } },
  };
  const created = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
  const template = created[0];
  if (template) {
    ui.notifications?.info?.(`Badger's Burrow template placed. You can drag it to reposition.`);
  }
  return template ?? null;
}

async function cleanupBadgersBurrowZone(caernActor) {
  const flags = getCaernFlags(caernActor);
  const active = flags?.rites?.active?.[BADGERS_BURROW_RITE_ID];
  if (!active) return;
  if (active.templateId && active.sceneId) {
    const scene = game.scenes.get(active.sceneId);
    if (scene) {
      const template = scene.templates.get(active.templateId);
      if (template) await template.delete();
    }
  }
  const rites = flags.rites ?? { active: {} };
  const newActive = { ...rites.active };
  delete newActive[BADGERS_BURROW_RITE_ID];
  const nextFlags = { ...flags, rites: { ...rites, active: newActive } };
  if (flags.activeEffectKey?.startsWith("badgers-burrow:")) {
    delete nextFlags.activeEffectKey;
  }
  await caernActor.setFlag("garou", "caern", nextFlags);
  const stateItems = caernActor.items.filter(i => {
    const name = (i.name ?? "").toLowerCase();
    return name.includes("badger") && name.includes("burrow") && name.includes("zone");
  });
  if (stateItems.length) {
    await caernActor.deleteEmbeddedDocuments("Item", stateItems.map(i => i.id));
  }
}

async function runBadgersBurrowFlow(item, actor, token) {
  const caernActor = await getSelectedCaernActor();
  if (!caernActor) return true;

  if (!validateCaern(caernActor)) return true;

  const turnIndex = getTurnIndex(caernActor);
  const lastUsed = getPerTurnCooldown(caernActor, BADGERS_BURROW_RITE_ID);
  if (lastUsed != null && lastUsed === turnIndex) {
    ui.notifications?.warn?.(`Badger's Burrow has already been performed this Caern Turn for ${caernActor.name}.`);
    return true;
  }

  const rating = Number(getCaernFlags(caernActor)?.rating ?? 1);
  const radiusFeet = getBadgersBurrowRadius(rating);

  ui.notifications?.info?.(`Badger's Burrow: Place a circle template with ${radiusFeet} ft radius.`);
  const template = await placeBadgersBurrowTemplate(radiusFeet);
  if (!template) {
    ui.notifications?.warn?.("Badger's Burrow: Template placement cancelled. Rite not applied.");
    return true;
  }

  const stateItemDoc = await findBadgersBurrowStateItem();
  if (!stateItemDoc) {
    ui.notifications?.warn?.("Badger's Burrow state item not found. Ensure the state item is in the world or in the Garou Caern States compendium.");
    if (template) await template.delete();
    return true;
  }

  await setExclusiveCaernState(caernActor, "badgers-burrow", stateItemDoc);

  const flags = getCaernFlags(caernActor) ?? {};
  const rites = flags.rites ?? { active: {}, cooldowns: { perTurn: {} } };
  const active = { ...(rites.active ?? {}) };
  active[BADGERS_BURROW_RITE_ID] = {
    radiusFeet,
    templateId: template.id,
    sceneId: canvas.scene.id,
    center: { x: template.x, y: template.y },
    startedTurnIndex: turnIndex,
    startedAt: Date.now(),
  };
  const nextFlags = {
    ...flags,
    activeEffectKey: `badgers-burrow:zone-of-awareness`,
    rites: { ...rites, active },
  };
  await caernActor.setFlag("garou", "caern", nextFlags);
  await updateCaernCooldown(caernActor, "perTurn", BADGERS_BURROW_RITE_ID, turnIndex);
  await logCaernHistory(caernActor, {
    type: "rite",
    riteId: BADGERS_BURROW_RITE_ID,
    radiusFeet,
    templateId: template.id,
    sceneId: canvas.scene.id,
    appliedBy: actor?.id ?? game.user?.id,
  });

  const content = `
    <p><strong>Badger's Burrow</strong> performed for <strong>${caernActor.name}</strong>.</p>
    <p><em>Zone Radius:</em> ${radiusFeet} ft (Caern Rating ${rating})</p>
    <p><em>Center:</em> Template placed on scene</p>
    <p>Cost: 6 Gnosis (may be shared; if paid in full, the Rite succeeds automatically).</p>
    <p>This zone persists until the end of the current Caern Turn (turnIndex ${turnIndex}).</p>
    <p><strong>Benefits:</strong> Garou tending the Caern have advantage on Perception/Survival to investigate events from within the zone. Creatures trying to hide/bypass notice within the zone do so at disadvantage.</p>
  `;
  await ChatMessage.create({
    user: game.user?.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
  });

  return true;
}

// ===== Rite of the Opened Bridge =====
const OPENED_BRIDGE_RITE_ID = "opened-bridge";

function isOpenedBridgeRite(item) {
  if (!item) return false;
  const name = (item.name ?? "").trim().toLowerCase();
  if (name.includes("opened bridge") && name.includes("rite")) return true;
  const desc = (item.system?.description?.value ?? "").toLowerCase();
  if (desc.includes("[garou_rite]") && desc.includes(`id=${OPENED_BRIDGE_RITE_ID}`)) return true;
  const activities = item.system?.activities ?? {};
  for (const a of Object.values(activities)) {
    const chat = (a?.chatFlavor ?? "").toLowerCase();
    if (chat.includes("[garou_rite_use]") && chat.includes(`id=${OPENED_BRIDGE_RITE_ID}`)) return true;
  }
  return false;
}

async function checkPathstone(caernActor) {
  const flags = getCaernFlags(caernActor);
  if (flags?.pathstone === true) return true;
  return new Promise(resolve => {
    new Dialog({
      title: "Pathstone Check",
      content: `<p><strong>${caernActor.name}</strong> does not have a Pathstone flag set.</p><p>Do you want to continue anyway?</p>`,
      buttons: {
        yes: { icon: '<i class="fas fa-check"></i>', label: "Continue", callback: () => resolve(true) },
        no: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(false) },
      },
      default: "yes",
      close: () => resolve(false),
    }).render(true);
  });
}

async function createMoonBridgeLink(caernA, caernB, appliedBy) {
  const linkId = generateLinkId();
  const createdAt = Date.now();
  const createdBy = appliedBy ?? game.user?.id ?? null;
  const stateItemDoc = await findOpenedBridgeStateItem();
  if (!stateItemDoc) {
    ui.notifications?.warn?.("Opened Bridge state item not found. Ensure the state item is in the world or in the Garou Caern States compendium.");
    return false;
  }

  // Apply state items to both caerns (exclusive group "moon-bridge")
  await setExclusiveCaernState(caernA, "moon-bridge", stateItemDoc);
  await setExclusiveCaernState(caernB, "moon-bridge", stateItemDoc);

  // Update flags on Caern A
  const flagsA = getCaernFlags(caernA) ?? {};
  const linksA = flagsA.links ?? {};
  linksA.moonBridge = {
    linkId,
    otherCaernId: caernB.id,
    otherCaernName: caernB.name,
    createdAt,
    createdBy,
  };
  const ritesA = flagsA.rites ?? { active: {} };
  const activeA = { ...ritesA.active };
  activeA[OPENED_BRIDGE_RITE_ID] = {
    effect: "moon-bridge",
    linkId,
    otherCaernId: caernB.id,
    createdAt,
  };
  await caernA.setFlag("garou", "caern", {
    ...flagsA,
    links: linksA,
    activeEffectKey: "opened-bridge:moon-bridge",
    rites: { ...ritesA, active: activeA },
  });

  // Update flags on Caern B
  const flagsB = getCaernFlags(caernB) ?? {};
  const linksB = flagsB.links ?? {};
  linksB.moonBridge = {
    linkId,
    otherCaernId: caernA.id,
    otherCaernName: caernA.name,
    createdAt,
    createdBy,
  };
  const ritesB = flagsB.rites ?? { active: {} };
  const activeB = { ...ritesB.active };
  activeB[OPENED_BRIDGE_RITE_ID] = {
    effect: "moon-bridge",
    linkId,
    otherCaernId: caernA.id,
    createdAt,
  };
  await caernB.setFlag("garou", "caern", {
    ...flagsB,
    links: linksB,
    activeEffectKey: "opened-bridge:moon-bridge",
    rites: { ...ritesB, active: activeB },
  });

  // Log history on both
  await logCaernHistory(caernA, {
    type: "rite",
    riteId: OPENED_BRIDGE_RITE_ID,
    action: "linkCreated",
    linkedTo: caernB.id,
    linkedToName: caernB.name,
    linkId,
    appliedBy: createdBy,
  });
  await logCaernHistory(caernB, {
    type: "rite",
    riteId: OPENED_BRIDGE_RITE_ID,
    action: "linkCreated",
    linkedTo: caernA.id,
    linkedToName: caernA.name,
    linkId,
    appliedBy: createdBy,
  });

  return true;
}

async function collapseMoonBridgeLink(caern, reason) {
  const flags = getCaernFlags(caern);
  const link = flags?.links?.moonBridge;
  if (!link) return false;

  const otherCaernId = link.otherCaernId;
  const otherCaern = game.actors.get(otherCaernId);
  if (!otherCaern) {
    console.warn(`[garou] Opened Bridge: Other Caern ${otherCaernId} not found`);
  }

  // Remove state items from both caerns
  const stateItemsA = caern.items.filter(i => {
    const name = (i.name ?? "").toLowerCase();
    const desc = (i.system?.description?.value ?? "").toLowerCase();
    return (name.includes("opened bridge") || name.includes("moon bridge")) ||
           (desc.includes("[garou_caern_state]") && desc.includes("parent=opened-bridge"));
  });
  if (stateItemsA.length) {
    await caern.deleteEmbeddedDocuments("Item", stateItemsA.map(i => i.id));
  }

  if (otherCaern) {
    const stateItemsB = otherCaern.items.filter(i => {
      const name = (i.name ?? "").toLowerCase();
      const desc = (i.system?.description?.value ?? "").toLowerCase();
      return (name.includes("opened bridge") || name.includes("moon bridge")) ||
             (desc.includes("[garou_caern_state]") && desc.includes("parent=opened-bridge"));
    });
    if (stateItemsB.length) {
      await otherCaern.deleteEmbeddedDocuments("Item", stateItemsB.map(i => i.id));
    }
  }

  // Clear flags on both caerns
  const flagsA = getCaernFlags(caern) ?? {};
  const linksA = { ...(flagsA.links ?? {}) };
  delete linksA.moonBridge;
  const ritesA = flagsA.rites ?? { active: {} };
  const activeA = { ...ritesA.active };
  delete activeA[OPENED_BRIDGE_RITE_ID];
  const nextFlagsA = { ...flagsA, links: linksA, rites: { ...ritesA, active: activeA } };
  if (flagsA.activeEffectKey?.startsWith("opened-bridge:")) {
    delete nextFlagsA.activeEffectKey;
  }
  await caern.setFlag("garou", "caern", nextFlagsA);

  if (otherCaern) {
    const flagsB = getCaernFlags(otherCaern) ?? {};
    const linksB = { ...(flagsB.links ?? {}) };
    delete linksB.moonBridge;
    const ritesB = flagsB.rites ?? { active: {} };
    const activeB = { ...ritesB.active };
    delete activeB[OPENED_BRIDGE_RITE_ID];
    const nextFlagsB = { ...flagsB, links: linksB, rites: { ...ritesB, active: activeB } };
    if (flagsB.activeEffectKey?.startsWith("opened-bridge:")) {
      delete nextFlagsB.activeEffectKey;
    }
    await otherCaern.setFlag("garou", "caern", nextFlagsB);
  }

  // Log history
  await logCaernHistory(caern, {
    type: "rite",
    riteId: OPENED_BRIDGE_RITE_ID,
    action: "linkCollapsed",
    reason,
    linkId: link.linkId,
  });
  if (otherCaern) {
    await logCaernHistory(otherCaern, {
      type: "rite",
      riteId: OPENED_BRIDGE_RITE_ID,
      action: "linkCollapsed",
      reason,
      linkId: link.linkId,
    });
  }

  // Post chat message
  const otherName = otherCaern ? otherCaern.name : `Caern ${otherCaernId}`;
  await ChatMessage.create({
    user: game.user?.id,
    content: `<p><strong>Moon Bridge collapsed</strong> between <strong>${caern.name}</strong> and <strong>${otherName}</strong>.</p><p><em>Reason:</em> ${reason}</p>`,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
  });

  return true;
}

async function runOpenedBridgeFlow(item, actor, token) {
  const selection = await selectTwoCaerns();
  if (!selection) return true;
  const { caernA, caernB } = selection;

  if (caernA.id === caernB.id) {
    ui.notifications?.warn?.("Please select two different Caerns.");
    return true;
  }

  // Validate both caerns
  if (!validateCaern(caernA) || !validateCaern(caernB)) return true;

  // Check pathstones (soft check)
  const pathstoneA = await checkPathstone(caernA);
  if (!pathstoneA) return true;
  const pathstoneB = await checkPathstone(caernB);
  if (!pathstoneB) return true;

  // Check if either caern already has a moon bridge
  const flagsA = getCaernFlags(caernA);
  const flagsB = getCaernFlags(caernB);
  if (flagsA?.links?.moonBridge || flagsB?.links?.moonBridge) {
    const hasLink = await new Promise(resolve => {
      new Dialog({
        title: "Existing Moon Bridge",
        content: `<p>One or both Caerns already have a Moon Bridge link. Creating a new link will replace the existing one.</p><p>Continue?</p>`,
        buttons: {
          yes: { icon: '<i class="fas fa-check"></i>', label: "Replace", callback: () => resolve(true) },
          no: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(false) },
        },
        default: "no",
        close: () => resolve(false),
      }).render(true);
    });
    if (!hasLink) return true;
    // Collapse existing links first (collapseMoonBridgeLink handles both sides)
    if (flagsA?.links?.moonBridge) {
      await collapseMoonBridgeLink(caernA, "Replaced by new Moon Bridge");
    } else if (flagsB?.links?.moonBridge) {
      await collapseMoonBridgeLink(caernB, "Replaced by new Moon Bridge");
    }
  }

  const success = await createMoonBridgeLink(caernA, caernB, actor?.id ?? game.user?.id);
  if (!success) return true;

  // Post chat summary
  const content = `
    <p><strong>Moon Bridge established</strong> between <strong>${caernA.name}</strong> and <strong>${caernB.name}</strong>.</p>
    <p><strong>Cost:</strong> 12 Gnosis must be invested at EACH Caern (may be shared by multiple Garou).</p>
    <p><strong>Travel:</strong> Takes 1 minute, one-way per use. Entry/exit only within each Caern's area of influence.</p>
    <p><strong>Limitations:</strong></p>
    <ul>
      <li>Collapses immediately if either Caern is lost or corruption reaches 5</li>
      <li>Corruption 4+ can be strained but possible</li>
      <li>Not for forced/hostile transport</li>
    </ul>
  `;
  await ChatMessage.create({
    user: game.user?.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
  });

  return true;
}

// Hook into Caern turn advancement: cleanup Badger's Burrow zones when turnIndex changes
let _lastCaernTurnIndices = {};
let _lastCaernCorruption = {};

Hooks.on("updateActor", async (actor, update, options) => {
  if (actor.type !== "npc") return;
  const flags = actor.getFlag("garou", "caern");
  if (!flags?.isCaernActor && !flags?.turnIndex) return;

  // Badger's Burrow cleanup on turn advancement
  const prevTurnIndex = _lastCaernTurnIndices[actor.id] ?? flags.turnIndex;
  const newTurnIndex = update.flags?.garou?.caern?.turnIndex ?? flags.turnIndex;
  if (prevTurnIndex != null && newTurnIndex != null && newTurnIndex > prevTurnIndex) {
    await cleanupBadgersBurrowZone(actor);
  }
  _lastCaernTurnIndices[actor.id] = newTurnIndex;

  // Moon Bridge collapse on corruption >= 5
  const prevCorruption = _lastCaernCorruption[actor.id] ?? flags.corruption;
  const newCorruption = update.flags?.garou?.caern?.corruption ?? flags.corruption;
  if (prevCorruption != null && newCorruption != null && newCorruption >= 5 && prevCorruption < 5) {
    if (flags.links?.moonBridge) {
      await collapseMoonBridgeLink(actor, `Corruption reached 5 (${actor.name})`);
    }
    if (flags.rites?.active?.[SHROUDED_GLEN_RITE_ID]) {
      await collapseShroudedGlen(actor, `Corruption reached 5 (${actor.name})`);
    }
  }
  _lastCaernCorruption[actor.id] = newCorruption;
});

// ===== Rite of the Shrouded Glen =====
const SHROUDED_GLEN_RITE_ID = "shrouded-glen";

function isShroudedGlenRite(item) {
  if (!item) return false;
  const name = (item.name ?? "").trim().toLowerCase();
  if (name.includes("shrouded glen") && name.includes("rite")) return true;
  const desc = (item.system?.description?.value ?? "").toLowerCase();
  if (desc.includes("[garou_rite]") && desc.includes(`id=${SHROUDED_GLEN_RITE_ID}`)) return true;
  const activities = item.system?.activities ?? {};
  for (const a of Object.values(activities)) {
    const chat = (a?.chatFlavor ?? "").toLowerCase();
    if (chat.includes("[garou_rite_use]") && chat.includes(`id=${SHROUDED_GLEN_RITE_ID}`)) return true;
  }
  return false;
}

async function collapseShroudedGlen(caernActor, reason) {
  const flags = getCaernFlags(caernActor);
  if (!flags?.rites?.active?.[SHROUDED_GLEN_RITE_ID]) return false;

  // Remove state item
  const stateItems = caernActor.items.filter(i => {
    const name = (i.name ?? "").toLowerCase();
    const desc = (i.system?.description?.value ?? "").toLowerCase();
    return (name.includes("shrouded glen") && name.includes("shroud")) ||
           (desc.includes("[garou_caern_state]") && desc.includes("parent=shrouded-glen"));
  });
  if (stateItems.length) {
    await caernActor.deleteEmbeddedDocuments("Item", stateItems.map(i => i.id));
  }

  // Clear flags
  const rites = flags.rites ?? { active: {} };
  const active = { ...rites.active };
  delete active[SHROUDED_GLEN_RITE_ID];
  const nextFlags = { ...flags, rites: { ...rites, active } };
  if (flags.activeEffectKey?.startsWith("shrouded-glen:")) {
    delete nextFlags.activeEffectKey;
  }
  await caernActor.setFlag("garou", "caern", nextFlags);

  // Log history
  await logCaernHistory(caernActor, {
    type: "rite",
    riteId: SHROUDED_GLEN_RITE_ID,
    action: "shroudCollapsed",
    reason,
  });

  // Post chat message
  await ChatMessage.create({
    user: game.user?.id,
    content: `<p><strong>Shrouded Glen collapses</strong> for <strong>${caernActor.name}</strong>.</p><p><em>Reason:</em> ${reason}</p>`,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
  });

  return true;
}

async function runShroudedGlenFlow(item, actor, token) {
  const caernActor = await getSelectedCaernActor();
  if (!caernActor) return true;

  if (!validateCaern(caernActor)) return true;

  const corruption = Number(getCaernFlags(caernActor)?.corruption ?? 0);
  if (corruption >= 5) {
    ui.notifications?.warn?.("This Caern is Lost (Corruption 5). The Rite cannot be performed here.");
    return true;
  }

  const stateItemDoc = await findShroudedGlenStateItem();
  if (!stateItemDoc) {
    ui.notifications?.warn?.("Shrouded Glen state item not found. Ensure the state item is in the world or in the Garou Caern States compendium.");
    return true;
  }

  // Apply state item (exclusive group "shrouded-glen")
  await setExclusiveCaernState(caernActor, "shrouded-glen", stateItemDoc);

  // Update flags
  const flags = getCaernFlags(caernActor) ?? {};
  const rites = flags.rites ?? { active: {} };
  const active = { ...rites.active };
  active[SHROUDED_GLEN_RITE_ID] = {
    effect: "shroud",
    startedAt: Date.now(),
    appliedBy: actor?.id ?? game.user?.id ?? null,
  };
  await caernActor.setFlag("garou", "caern", {
    ...flags,
    activeEffectKey: "shrouded-glen:shroud",
    rites: { ...rites, active },
  });

  // Log history
  await logCaernHistory(caernActor, {
    type: "rite",
    riteId: SHROUDED_GLEN_RITE_ID,
    effect: "shroud",
    appliedBy: actor?.id ?? game.user?.id,
  });

  // Calculate DC for chat message
  const rating = Number(flags?.rating ?? 1);
  const dc = getShroudedGlenDC(caernActor);
  const dcText = dc ? `DC ${dc}` : "DC collapsed";

  // Post chat summary
  const content = `
    <p><strong>Caern ${caernActor.name} is now Shrouded</strong></p>
    <p><strong>Cost:</strong> 10 Gnosis (may be shared; if paid in full, the Rite succeeds automatically).</p>
    <p><strong>Search DC:</strong> ${dcText} (Rating ${rating}${corruption >= 3 ? `, Corruption ${corruption} reduces DC by 2` : ""})</p>
    <p><strong>DC Table:</strong> Rating 1=DC 14, 2=DC 15, 3=DC 16, 4=DC 17, 5=DC 18. At Corruption 3+, DC -2. At Corruption 5, shroud collapses.</p>
    <p><strong>Divination:</strong> Fails unless 6th level or higher.</p>
    <p><strong>Affected:</strong> Non-Garou and unrecognized Garou attempting to locate, track, or deliberately travel to the Caern.</p>
  `;
  await ChatMessage.create({
    user: game.user?.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
  });

  return true;
}

// Also check on ready for any existing corruption >= 5
Hooks.once("ready", async () => {
  for (const actor of game.actors?.filter(a => a.type === "npc") ?? []) {
    const flags = getCaernFlags(actor);
    if (!flags?.isCaernActor) continue;
    if (flags.corruption >= 5 && flags.links?.moonBridge) {
      await collapseMoonBridgeLink(actor, `Corruption already at 5 (${actor.name})`);
    }
    if (flags.corruption >= 5 && flags.rites?.active?.[SHROUDED_GLEN_RITE_ID]) {
      await collapseShroudedGlen(actor, `Corruption already at 5 (${actor.name})`);
    }
  }
});

export function registerRiteHandler() {
  Hooks.on("dnd5e.preUseItem", (item, config, options) => {
    if (isRiteOfGloriousPast(item)) {
      runGloriousPastFlow(item, options?.actor ?? item?.actor, options?.token);
      return true;
    }
    if (isBadgersBurrowRite(item)) {
      runBadgersBurrowFlow(item, options?.actor ?? item?.actor, options?.token);
      return true;
    }
    if (isOpenedBridgeRite(item)) {
      runOpenedBridgeFlow(item, options?.actor ?? item?.actor, options?.token);
      return true;
    }
    if (isShroudedGlenRite(item)) {
      runShroudedGlenFlow(item, options?.actor ?? item?.actor, options?.token);
      return true;
    }
  });
  if (typeof game?.modules?.get("midi-qol")?.api !== "undefined") {
    try {
      Hooks.on("midi-qol.RollComplete", (workflow) => {
        const item = workflow?.item;
        if (!item) return;
        if (isRiteOfGloriousPast(item)) {
          const actor = workflow?.actor ?? item?.actor;
          const token = workflow?.token ?? null;
          runGloriousPastFlow(item, actor, token);
        } else if (isBadgersBurrowRite(item)) {
          const actor = workflow?.actor ?? item?.actor;
          const token = workflow?.token ?? null;
          runBadgersBurrowFlow(item, actor, token);
        } else if (isOpenedBridgeRite(item)) {
          const actor = workflow?.actor ?? item?.actor;
          const token = workflow?.token ?? null;
          runOpenedBridgeFlow(item, actor, token);
        } else if (isShroudedGlenRite(item)) {
          const actor = workflow?.actor ?? item?.actor;
          const token = workflow?.token ?? null;
          runShroudedGlenFlow(item, actor, token);
        }
      });
    } catch (_) {}
  }
}

export {
  isRiteOfGloriousPast,
  runGloriousPastFlow,
  isBadgersBurrowRite,
  runBadgersBurrowFlow,
  isOpenedBridgeRite,
  runOpenedBridgeFlow,
  createMoonBridgeLink,
  collapseMoonBridgeLink,
  isShroudedGlenRite,
  runShroudedGlenFlow,
  collapseShroudedGlen,
};
