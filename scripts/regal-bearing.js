// scripts/regal-bearing.js
// Regal Bearing (Silver Fangs 3): when you roll initiative, choose up to PB allies within 30 ft;
// each gets advantage on first attack or save on their first turn, plus auspice rider.
// Requires: Midi-QOL (optional, for advantage/damage hooks). Uses socket for cross-client effect updates.

const GAROU = {
  scope: "garou",
  featureKey: "regalBearing",
  baseEffectName: "Regal Bearing",
  riderEffectPrefix: "Regal Bearing (",
  flagKey: "regalBearing",
};

const VALID_AUSPICES = new Set(["ragabash", "theurge", "philodox", "galliard", "ahroun"]);

function getActorAuspiceKey(actor) {
  if (!actor?.items) return null;
  const auspiceItem = actor.items.find(i => {
    const key = i.getFlag(GAROU.scope, "auspice");
    return typeof key === "string" && VALID_AUSPICES.has(key.toLowerCase());
  });
  return auspiceItem ? auspiceItem.getFlag(GAROU.scope, "auspice").toLowerCase() : null;
}

function hasRegalBearing(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function getRegalBearingFeatureItem(actor) {
  return actor?.items?.find(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey) ?? null;
}

function hasRegalBearingUse(featureItem) {
  if (!featureItem?.system?.uses) return false;
  const max = Number(featureItem.system.uses.max) || 0;
  const spent = Number(featureItem.system.uses.spent) || 0;
  return (max - spent) > 0;
}

async function consumeRegalBearingUse(featureItem) {
  if (!featureItem?.system?.uses) return;
  const spent = Number(featureItem.system.uses.spent) || 0;
  await featureItem.update({ "system.uses.spent": spent + 1 });
}

function tokenCenter(t) {
  if (t.center) return { x: t.center.x, y: t.center.y };
  const x = t.x ?? t.document?.x ?? 0;
  const y = t.y ?? t.document?.y ?? 0;
  const w = t.w ?? t.width ?? t.document?.width ?? 1;
  const h = t.h ?? t.height ?? t.document?.height ?? 1;
  return { x: x + w / 2, y: y + h / 2 };
}

function getAllyTokensWithin30Feet(garouToken, pb) {
  if (!canvas?.scene?.tokens || !garouToken) return [];
  const garouCenter = tokenCenter(garouToken);
  const measure = (other) => canvas.grid.measureDistance(garouCenter, tokenCenter(other));
  const placeables = canvas.tokens?.placeables ?? [];
  const tokens = placeables.filter(t => {
    if (!t.actor) return false;
    return measure(t) <= 30;
  });
  const allies = tokens.filter(t => {
    const disposition = t.document?.disposition ?? 0;
    return disposition >= 0 || t.id === garouToken.id;
  });
  return allies;
}

function isRegalBearingEffect(effect) {
  if (!effect) return false;
  const name = (effect.name ?? "").trim();
  if (name === GAROU.baseEffectName) return true;
  if (name.startsWith(GAROU.riderEffectPrefix) && name.endsWith(")")) return true;
  const flag = effect.getFlag(GAROU.scope, GAROU.flagKey);
  return !!flag;
}

async function removeRegalBearingEffectsFromActor(actor) {
  const toRemove = actor.effects.filter(isRegalBearingEffect);
  if (toRemove.length) await actor.deleteEmbeddedDocuments("ActiveEffect", toRemove.map(e => e.id));
}

function createBaseEffectData(garouActorUuid) {
  return {
    name: GAROU.baseEffectName,
    icon: "icons/svg/target.svg",
    origin: garouActorUuid,
    disabled: false,
    transfer: false,
    duration: {
      rounds: 1,
      turns: 0,
      seconds: null,
      startRound: game.combat?.round ?? null,
      startTurn: game.combat?.turn ?? null,
      startTime: game.time.worldTime ?? null,
    },
    flags: {
      [GAROU.scope]: {
        [GAROU.flagKey]: { triggered: false, sourceActorUuid: garouActorUuid },
      },
    },
  };
}

function createRiderEffectData(auspiceKey, garouActorUuid) {
  const names = {
    ragabash: "Regal Bearing (Ragabash)",
    theurge: "Regal Bearing (Theurge)",
    philodox: "Regal Bearing (Philodox)",
    galliard: "Regal Bearing (Galliard)",
    ahroun: "Regal Bearing (Ahroun)",
  };
  return {
    name: names[auspiceKey] ?? `Regal Bearing (${auspiceKey})`,
    icon: "icons/svg/target.svg",
    origin: garouActorUuid,
    disabled: false,
    transfer: false,
    duration: {
      rounds: 1,
      turns: 0,
      seconds: null,
      startRound: game.combat?.round ?? null,
      startTurn: game.combat?.turn ?? null,
      startTime: game.time.worldTime ?? null,
    },
    flags: {
      [GAROU.scope]: {
        regalBearingRider: { auspice: auspiceKey, sourceActorUuid: garouActorUuid, triggered: false },
      },
    },
  };
}

async function applyRegalBearingToAlly(allyActor, garouActor, auspiceKey) {
  const garouUuid = garouActor.uuid;
  const baseData = createBaseEffectData(garouUuid);
  await allyActor.createEmbeddedDocuments("ActiveEffect", [baseData]);

  if (auspiceKey === "galliard") {
    const pb = Number(garouActor.system?.attributes?.prof ?? 2) || 2;
    const currentTemp = Number(allyActor.system?.attributes?.hp?.temp ?? 0) || 0;
    const newTemp = Math.max(currentTemp, pb);
    await allyActor.update({ "system.attributes.hp.temp": newTemp });
  } else {
    const riderData = createRiderEffectData(auspiceKey, garouUuid);
    await allyActor.createEmbeddedDocuments("ActiveEffect", [riderData]);
  }
}

async function runRegalBearingFlow(garouActor, garouToken, combat) {
  const featureItem = getRegalBearingFeatureItem(garouActor);
  if (!featureItem || !hasRegalBearingUse(featureItem)) return;

  const pb = Number(garouActor.system?.attributes?.prof ?? 2) || 2;
  const eligibleTokens = getAllyTokensWithin30Feet(garouToken, pb * 2);
  if (!eligibleTokens.length) {
    ui.notifications?.info?.("Regal Bearing: No tokens within 30 feet.");
    return;
  }

  const auspiceKey = getActorAuspiceKey(garouActor);
  const maxSelect = Math.min(pb, eligibleTokens.length);
  const options = eligibleTokens.map(t => ({
    id: t.id,
    name: t.name || t.actor?.name || "Unknown",
    actorId: t.actor?.id,
  }));

  const selected = await new Promise(resolve => {
    const content = `
      <p>Choose up to <b>${maxSelect}</b> allies within 30 feet (including yourself).</p>
      <div class="form-group">
        <label>Allies (select up to ${maxSelect}):</label>
        <div id="regal-bearing-token-list" style="max-height: 200px; overflow-y: auto;">
          ${options.map((o, i) => `
            <label style="display: block; margin: 4px 0;">
              <input type="checkbox" class="regal-bearing-token" data-actor-id="${o.actorId}" data-token-id="${o.id}" />
              ${o.name}
            </label>
          `).join("")}
        </div>
      </div>
    `;
    new Dialog({
      title: "Regal Bearing",
      content,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: "Use Regal Bearing",
          callback: (html) => {
            const checked = html[0].querySelectorAll("input.regal-bearing-token:checked");
            if (checked.length > maxSelect) {
              ui.notifications?.warn?.(`Select at most ${maxSelect} allies.`);
              resolve([]);
              return;
            }
            const chosen = Array.from(checked).map(el => ({
              tokenId: el.dataset.tokenId,
              actorId: el.dataset.actorId,
            }));
            resolve(chosen);
          },
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => resolve([]),
        },
      },
      default: "ok",
      close: () => resolve([]),
    }).render(true);
  });

  if (!selected.length) return;

  await consumeRegalBearingUse(featureItem);

  for (const { actorId } of selected) {
    const allyActor = game.actors.get(actorId);
    if (allyActor) await applyRegalBearingToAlly(allyActor, garouActor, auspiceKey ?? "ragabash");
  }

  ui.notifications?.info?.(`Regal Bearing applied to ${selected.length} ally(ies).`);
}

function onInitiativeRolled(combat, rolledCombatantIds) {
  if (!game.combat || game.combat.id !== combat.id) return;
  for (const id of rolledCombatantIds) {
    const combatant = combat.combatants.get(id);
    if (!combatant?.actor) continue;
    const actor = combatant.actor;
    if (!hasRegalBearing(actor) || !hasRegalBearingUse(getRegalBearingFeatureItem(actor))) continue;
    const tokenId = combatant.token?.id ?? combatant.tokenId;
    const placeable = canvas.tokens?.placeables?.find(t => t.id === tokenId);
    const token = placeable ?? (tokenId && canvas.scene?.tokens?.get(tokenId));
    if (token) runRegalBearingFlow(actor, token, combat).catch(err => console.error("[garou] Regal Bearing error:", err));
  }
}

// Hook: after initiative is rolled (wrap Combat.prototype.rollInitiative)
Hooks.once("ready", () => {
  if (typeof libWrapper === "undefined") return;
  const CombatClass = CONFIG.Combat?.documentClass;
  if (!CombatClass?.prototype?.rollInitiative) return;
  libWrapper.register(
    "garou",
    "Combat.prototype.rollInitiative",
    async function (wrapped, ids, options = {}) {
      const idArray = Array.isArray(ids) ? ids : [ids];
      const combat = this;
      const result = await wrapped(ids, options);
      onInitiativeRolled(combat, idArray);
      return result;
    },
    "WRAPPER"
  );
});

// Turn-end: remove Regal Bearing effects from the actor whose turn just ended
let _lastCombatState = {};
Hooks.on("updateCombat", (combat, update, options) => {
  const turnChanged = "turn" in update || "round" in update;
  if (!turnChanged || !combat?.combatants?.size) return;
  const key = combat.id;
  const prev = _lastCombatState[key];
  const contents = combat.combatants?.contents ?? [];
  if (prev != null && contents.length) {
    const prevTurnIndex = prev.turn;
    const combatantWhoseTurnEnded = contents[prevTurnIndex];
    if (combatantWhoseTurnEnded) {
      const actor = combatantWhoseTurnEnded.actor;
      if (actor) removeRegalBearingEffectsFromActor(actor).catch(() => {});
    }
  }
  _lastCombatState[key] = { round: combat.round, turn: combat.turn };
});

// ---- Midi-QOL: advantage on first attack or save (base Regal Bearing) ----
function getRegalBearingBaseEffect(actor) {
  return actor?.effects?.find(e => e.name === GAROU.baseEffectName && e.getFlag(GAROU.scope, GAROU.flagKey));
}

function grantBaseAdvantageAndMarkTriggered(actor) {
  const eff = getRegalBearingBaseEffect(actor);
  if (!eff) return false;
  const state = eff.getFlag(GAROU.scope, GAROU.flagKey) ?? {};
  if (state.triggered) return false;
  eff.update({ [`flags.${GAROU.scope}.${GAROU.flagKey}.triggered`]: true }).catch(() => {});
  return true;
}

Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.AttackRoll", (workflow) => {
    try {
      if (!workflow?.actor) return;
      if (!grantBaseAdvantageAndMarkTriggered(workflow.actor)) return;
      workflow.advantage = true;
    } catch (err) {
      console.error("[garou] Regal Bearing attack advantage error:", err);
    }
  });

  Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
    try {
      if (!workflow?.actor) return;
      if (!grantBaseAdvantageAndMarkTriggered(workflow.actor)) return;
      workflow.advantage = true;
    } catch (err) {
      console.error("[garou] Regal Bearing save advantage error:", err);
    }
  });

  // Ahroun rider: +2 damage on first successful weapon attack
  Hooks.on("midi-qol.DamageBonus", (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return {};
      const actor = workflow.actor;
      const riderEff = actor.effects.find(e =>
        (e.name ?? "").startsWith("Regal Bearing (Ahroun)") && e.getFlag(GAROU.scope, "regalBearingRider"));
      if (!riderEff) return {};
      const state = riderEff.getFlag(GAROU.scope, "regalBearingRider") ?? {};
      if (state.triggered) return {};
      const actionType = workflow.item?.system?.actionType;
      if (actionType !== "mwak" && actionType !== "rwak") return {};
      riderEff.update({ "flags.garou.regalBearingRider.triggered": true }).catch(() => {});
      return { damageRoll: "2", flavor: "Regal Bearing (Battle Standard)" };
    } catch (err) {
      console.error("[garou] Regal Bearing Ahroun damage error:", err);
      return {};
    }
  });
});
