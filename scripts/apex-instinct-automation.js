// scripts/apex-instinct-automation.js
// Apex Instinct (Red Talons 3): In natural terrain:
// - Advantage on Wis (Perception) and Wis (Survival)
// - Advantage on initiative rolls
// - Once per turn: hit with melee/natural weapon → add PB damage
// Benefits end when incapacitated. Auspice ribbons: Ragabash, Theurge, Philodox, Galliard, Ahroun.
// Requires: Midi-QOL (optional). Uses libWrapper for initiative advantage.

const GAROU = {
  scope: "garou",
  featureKey: "apexInstinct",
  effectFlag: "apexInstinctActive",
  effectName: "Apex Instinct — In Natural Terrain (Toggle)",
  galliardEffectName: "Apex Instinct (Galliard) — First Attack Advantage",
  turnFlag: "apexInstinctUsedTurn",
  ahrounTurnFlag: "apexInstinctAhrounUsedTurn",
};

const VALID_AUSPICES = new Set(["ragabash", "theurge", "philodox", "galliard", "ahroun"]);
const INCAPACITATED_NAMES = ["unconscious", "stunned", "paralyzed", "incapacitated", "petrified"];

function hasApexInstinct(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function getApexEffect(actor) {
  return actor?.effects?.find(e =>
    !e.disabled && (e.getFlag(GAROU.scope, GAROU.effectFlag) || e.name === GAROU.effectName)
  ) ?? null;
}

function isIncapacitated(actor) {
  if (!actor?.effects) return false;
  return actor.effects.some(e => {
    if (e.disabled) return false;
    const name = (e.name ?? "").toLowerCase();
    return INCAPACITATED_NAMES.some(term => name.includes(term));
  });
}

function isInNaturalTerrain(actor) {
  if (!hasApexInstinct(actor)) return false;
  if (isIncapacitated(actor)) return false;
  return !!getApexEffect(actor);
}

function getActorAuspiceKey(actor) {
  if (!actor?.items) return null;
  const auspiceItem = actor.items.find(i => {
    const key = i.getFlag(GAROU.scope, "auspice");
    return typeof key === "string" && VALID_AUSPICES.has(key.toLowerCase());
  });
  return auspiceItem ? auspiceItem.getFlag(GAROU.scope, "auspice").toLowerCase() : null;
}

function hasApexRider(actor, auspiceKey) {
  return actor?.items?.some(i =>
    i.getFlag(GAROU.scope, "riderFor") === GAROU.featureKey &&
    (i.getFlag(GAROU.scope, "auspice") || "").toLowerCase() === auspiceKey
  );
}

function tokenCenter(t) {
  if (t.center) return { x: t.center.x, y: t.center.y };
  const x = t.x ?? t.document?.x ?? 0;
  const y = t.y ?? t.document?.y ?? 0;
  const w = t.w ?? t.width ?? t.document?.width ?? 1;
  const h = t.h ?? t.height ?? t.document?.height ?? 1;
  return { x: x + w / 2, y: y + h / 2 };
}

function distanceBetween(tokenA, tokenB) {
  if (!tokenA || !tokenB || !canvas?.grid) return Infinity;
  return canvas.grid.measureDistance(tokenCenter(tokenA), tokenCenter(tokenB));
}

function getTurnKey() {
  const c = game.combat;
  if (!c) return `no-combat.${Math.floor(game.time.worldTime ?? 0)}`;
  return `${c.id}-${c.round}-${c.turn}`;
}

function isMeleeOrNaturalWeapon(workflow) {
  if (!workflow?.item) return false;
  const item = workflow.item;
  const actionType = item.system?.actionType ?? "";
  const weaponType = (item.system?.weaponType ?? "").toLowerCase();
  if (["mwak", "msak"].includes(actionType)) return true;
  if (weaponType.includes("natural")) return true;
  const name = (item.name ?? "").toLowerCase();
  if (name.includes("natural weapon") || name.includes("unarmed") || name.includes("claw") || name.includes("bite")) return true;
  return false;
}

// ---- Sync advantage for Perception and Survival when in natural terrain ----
function updateApexSkillAdvantage(actor) {
  if (!actor || actor.type !== "character") return;
  if (!hasApexInstinct(actor)) return;
  const inNatural = isInNaturalTerrain(actor);
  const updates = {};
  updates["flags.midi-qol.advantage.skill.prc"] = inNatural;
  updates["flags.midi-qol.advantage.skill.sur"] = inNatural;
  const auspiceKey = getActorAuspiceKey(actor);
  if (inNatural && auspiceKey === "philodox" && hasApexRider(actor, "philodox")) {
    updates["flags.midi-qol.advantage.ability.check.all"] = true;
  } else {
    if (hasApexRider(actor, "philodox")) updates["flags.midi-qol.advantage.ability.check.all"] = false;
  }
  const current = actor.toObject();
  let changed = false;
  for (const [k, v] of Object.entries(updates)) {
    const parts = k.split(".");
    let cur = current;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] ??= {};
    if (cur[parts[parts.length - 1]] !== v) changed = true;
  }
  if (changed) actor.update(updates).catch(() => {});
}

Hooks.on("updateActor", (actor, changed) => {
  if (!changed.effects && !changed.flags) return;
  updateApexSkillAdvantage(actor);
});

Hooks.on("createActiveEffect", (effect) => {
  if (effect.parent?.documentName === "Actor") updateApexSkillAdvantage(effect.parent);
});

Hooks.on("deleteActiveEffect", (effect) => {
  if (effect.parent?.documentName === "Actor") updateApexSkillAdvantage(effect.parent);
});

Hooks.once("ready", () => {
  game.actors?.contents?.forEach(a => {
    if (a.type === "character" && hasApexInstinct(a)) updateApexSkillAdvantage(a);
  });
});

// ---- Advantage on initiative (reroll with advantage and take higher) ----
async function applyInitiativeAdvantage(combat, combatantIds) {
  if (!combat?.combatants) return;
  for (const id of combatantIds) {
    const combatant = combat.combatants.get(id);
    if (!combatant?.actor) continue;
    const actor = combatant.actor;
    if (!isInNaturalTerrain(actor)) continue;
    const initMod = Number(actor.system?.attributes?.init ?? 0) || 0;
    const r1 = await new Roll("1d20").evaluate({ async: true });
    const r2 = await new Roll("1d20").evaluate({ async: true });
    const total = Math.max(r1.total, r2.total) + initMod;
    await combatant.update({ initiative: total });
  }
}

// ---- Galliard: when you roll initiative in natural terrain, one ally within 30 ft gains advantage on first attack ----
async function runApexGalliardInitiativeFlow(actor, token) {
  if (!actor?.isOwner && !game.user.isGM) return;
  const allies = [];
  for (const t of canvas.tokens?.placeables ?? []) {
    if (!t.actor || t.actor.uuid === actor.uuid) continue;
    if (distanceBetween(token, t) > 30) continue;
    const disp = t.document?.disposition ?? 0;
    if (disp >= 0) allies.push(t);
  }
  if (allies.length === 0) return;
  const options = allies.map(t => `<option value="${t.actor.uuid}">${t.actor.name}</option>`).join("");
  const chosen = await new Promise(resolve => {
    new Dialog({
      title: "Apex Instinct — Galliard",
      content: `<p>One ally within 30 feet gains <b>advantage on their first attack roll</b> this combat.</p><select id="apex-galliard-ally" style="width:100%;margin-top:8px;">${options}</select>`,
      buttons: {
        ok: { icon: '<i class="fas fa-check"></i>', label: "Grant", callback: (html) => resolve(html.find("#apex-galliard-ally").val()) },
        skip: { icon: '<i class="fas fa-times"></i>', label: "Skip", callback: () => resolve(null) },
      },
      default: "ok",
      close: () => resolve(null),
    }).render(true);
  });
  if (!chosen) return;
  const doc = await fromUuid(chosen).catch(() => null);
  const allyActor = doc?.actor ?? doc;
  if (!allyActor?.createEmbeddedDocuments) return;
  const effectData = {
    name: GAROU.galliardEffectName,
    icon: "icons/svg/target.svg",
    origin: actor.uuid,
    disabled: false,
    duration: { rounds: 999, seconds: null, startRound: game.combat?.round ?? null, startTurn: null },
    flags: { [GAROU.scope]: { galliardFirstAttackAdvantage: true } },
  };
  await allyActor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  ui.notifications?.info?.(`Apex Instinct (Galliard): ${allyActor.name} has advantage on their first attack roll.`);
}

// Single initiative wrapper: advantage for Apex+natural, then Galliard flow
Hooks.once("ready", () => {
  if (typeof libWrapper === "undefined") return;
  const CombatClass = CONFIG.Combat?.documentClass;
  if (!CombatClass?.prototype?.rollInitiative) return;
  libWrapper.register(
    "garou",
    "Combat.prototype.rollInitiative",
    async function (wrapped, ids, options = {}) {
      const idArray = Array.isArray(ids) ? ids : [ids].filter(Boolean);
      const result = await wrapped(ids, options);
      await applyInitiativeAdvantage(this, idArray);
      for (const id of idArray) {
        const combatant = this.combatants?.get(id);
        if (!combatant?.actor) continue;
        const actor = combatant.actor;
        if (!hasApexInstinct(actor) || !hasApexRider(actor, "galliard") || !isInNaturalTerrain(actor)) continue;
        const tokenId = combatant.token?.id ?? combatant.tokenId;
        const token = canvas.tokens?.placeables?.find(t => t.id === tokenId);
        if (token) await runApexGalliardInitiativeFlow(actor, token);
      }
      return result;
    },
    "WRAPPER"
  );
});

// ---- Base: once per turn, hit with melee/natural → add PB damage ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.DamageBonus", async (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor || !workflow?.item) return {};
      if (!isInNaturalTerrain(actor)) return {};
      if (!isMeleeOrNaturalWeapon(workflow)) return {};
      const turnKey = getTurnKey();
      if (actor.getFlag(GAROU.scope, GAROU.turnFlag) === turnKey) return {};
      const hitTargets = Array.from(workflow.hitTargets ?? []);
      if (hitTargets.length === 0) return {};
      await actor.setFlag(GAROU.scope, GAROU.turnFlag, turnKey);
      const pb = actor.system?.attributes?.prof ?? 2;
      return { damageRoll: String(pb), flavor: "Apex Instinct" };
    } catch (err) {
      console.error("[garou] Apex Instinct (base damage) error:", err);
      return {};
    }
  });
});

// ---- Theurge: advantage on saves vs spells/supernatural from civilization ----
function isSaveVsSpellOrSupernatural(workflow) {
  if (!workflow) return false;
  const origin = workflow.origin ?? workflow.item;
  const type = origin?.type ?? "";
  if (type === "spell") return true;
  const desc = (workflow.item?.system?.description?.value ?? origin?.system?.description?.value ?? "").toLowerCase();
  return desc.includes("spell") || desc.includes("supernatural") || desc.includes("magic");
}

Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      if (!isInNaturalTerrain(actor)) return;
      if (!hasApexRider(actor, "theurge")) return;
      if (!isSaveVsSpellOrSupernatural(workflow)) return;
      workflow.advantage = true;
    } catch (err) {
      console.error("[garou] Apex Instinct (Theurge) error:", err);
    }
  });
});

// ---- Galliard: ally with effect gets advantage on first attack, then remove effect ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.AttackRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      const eff = actor.effects.find(e =>
        !e.disabled && (e.name === GAROU.galliardEffectName || e.getFlag(GAROU.scope, "galliardFirstAttackAdvantage"))
      );
      if (!eff) return;
      workflow.advantage = true;
      eff.delete().catch(() => {});
    } catch (err) {
      console.error("[garou] Apex Instinct (Galliard attack) error:", err);
    }
  });
});

// ---- Ahroun: once per turn, reroll one damage die on melee/natural ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.DamageBonus", async (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor || !workflow?.item) return {};
      if (!isInNaturalTerrain(actor)) return {};
      if (!hasApexRider(actor, "ahroun")) return {};
      if (!isMeleeOrNaturalWeapon(workflow)) return {};
      const turnKey = getTurnKey();
      if (actor.getFlag(GAROU.scope, GAROU.ahrounTurnFlag) === turnKey) return {};
      const hitTargets = Array.from(workflow.hitTargets ?? []);
      if (hitTargets.length === 0) return {};
      await actor.setFlag(GAROU.scope, GAROU.ahrounTurnFlag, turnKey);
      return {
        damageRoll: "1d6",
        flavor: "Apex Instinct (Ahroun): reroll one damage die — replace one weapon die with this roll",
      };
    } catch (err) {
      console.error("[garou] Apex Instinct (Ahroun) error:", err);
      return {};
    }
  });
});