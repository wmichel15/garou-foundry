// scripts/urban-adaptation-automation.js
// Urban Adaptation (Glass Walkers 3): In urban/constructed terrain:
// - Ignore nonmagical difficult terrain (manual/GM)
// - Advantage on Dex (Stealth) and Wis (Perception) to detect or avoid creatures
// - +1 AC vs opportunity attacks
// Benefits end when incapacitated. Auspice ribbons: Ragabash, Theurge, Philodox, Galliard, Ahroun.
// Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "urbanAdaptation",
  effectFlag: "urbanAdaptationActive",
  effectName: "Urban Adaptation — In Urban Terrain (Toggle)",
  galliardEffectName: "Urban Adaptation (Galliard) — Next Dex Save",
  turnFlag: "urbanAdaptationAhrounUsedTurn",
};

const VALID_AUSPICES = new Set(["ragabash", "theurge", "philodox", "galliard", "ahroun"]);
const INCAPACITATED_NAMES = ["unconscious", "stunned", "paralyzed", "incapacitated", "petrified"];

function hasUrbanAdaptation(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function getUrbanEffect(actor) {
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

/** True when the actor is in urban terrain (effect on) and not incapacitated. */
function isInUrbanTerrain(actor) {
  if (!hasUrbanAdaptation(actor)) return false;
  if (isIncapacitated(actor)) return false;
  return !!getUrbanEffect(actor);
}

function getActorAuspiceKey(actor) {
  if (!actor?.items) return null;
  const auspiceItem = actor.items.find(i => {
    const key = i.getFlag(GAROU.scope, "auspice");
    return typeof key === "string" && VALID_AUSPICES.has(key.toLowerCase());
  });
  return auspiceItem ? auspiceItem.getFlag(GAROU.scope, "auspice").toLowerCase() : null;
}

function hasUrbanRider(actor, auspiceKey) {
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

// ---- Sync advantage for Stealth and Perception when in urban ----
function updateUrbanSkillAdvantage(actor) {
  if (!actor || actor.type !== "character") return;
  if (!hasUrbanAdaptation(actor)) return;
  const inUrban = isInUrbanTerrain(actor);
  const updates = {};
  updates["flags.midi-qol.advantage.skill.ste"] = inUrban;
  updates["flags.midi-qol.advantage.skill.prc"] = inUrban;
  const auspiceKey = getActorAuspiceKey(actor);
  if (inUrban && auspiceKey === "theurge" && hasUrbanRider(actor, "theurge")) {
    updates["flags.midi-qol.advantage.skill.inv"] = true;
  } else if (!inUrban || auspiceKey !== "theurge") {
    if (hasUrbanRider(actor, "theurge")) updates["flags.midi-qol.advantage.skill.inv"] = false;
  }
  if (inUrban && auspiceKey === "philodox" && hasUrbanRider(actor, "philodox")) {
    updates["flags.midi-qol.advantage.skill.ath"] = true;
  } else if (!inUrban || auspiceKey !== "philodox") {
    if (hasUrbanRider(actor, "philodox")) updates["flags.midi-qol.advantage.skill.ath"] = false;
  }
  const current = actor.toObject();
  let changed = false;
  for (const [k, v] of Object.entries(updates)) {
    const parts = k.split(".");
    let cur = current;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] ??= {};
    if (cur[parts[parts.length - 1]] !== v) {
      cur[parts[parts.length - 1]] = v;
      changed = true;
    }
  }
  if (changed) actor.update(updates).catch(() => {});
}

Hooks.on("updateActor", (actor, changed) => {
  if (!changed.effects && !changed.flags) return;
  updateUrbanSkillAdvantage(actor);
});

Hooks.on("createActiveEffect", (effect) => {
  if (effect.parent?.documentName === "Actor") updateUrbanSkillAdvantage(effect.parent);
});

Hooks.on("deleteActiveEffect", (effect) => {
  if (effect.parent?.documentName === "Actor") updateUrbanSkillAdvantage(effect.parent);
});

Hooks.once("ready", () => {
  game.actors?.contents?.forEach(a => {
    if (a.type === "character" && hasUrbanAdaptation(a)) updateUrbanSkillAdvantage(a);
  });
});

// ---- +1 AC vs opportunity attacks (apply -1 to attacker's roll when attacking someone with urban) ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.AttackRoll", (workflow) => {
    try {
      const isOA = workflow.flags?.["midi-qol"]?.opportunityAttack ?? workflow.item?.flags?.["midi-qol"]?.opportunityAttack ?? false;
      if (!isOA) return;
      const targets = Array.from(workflow.targets ?? []);
      if (targets.length === 0) return;
      const defender = targets[0]?.actor;
      if (!defender || !isInUrbanTerrain(defender)) return;
      workflow.attackBonus = (workflow.attackBonus || 0) - 1;
    } catch (err) {
      console.error("[garou] Urban Adaptation (OA AC) error:", err);
    }
  });
});

// ---- Galliard: grant one ally within 10 ft advantage on next Dex save ----
function isUrbanGalliardGrantItem(item) {
  return item?.getFlag(GAROU.scope, "riderFor") === GAROU.featureKey && (item.getFlag(GAROU.scope, "auspice") || "").toLowerCase() === "galliard";
}

async function runUrbanGalliardGrantFlow(item, actor) {
  const token = canvas.tokens?.placeables?.find(t => t.actor === actor);
  if (!token) {
    ui.notifications?.warn?.("Urban Adaptation (Galliard): No token on canvas.");
    return false;
  }
  if (!isInUrbanTerrain(actor)) {
    ui.notifications?.warn?.("Urban Adaptation (Galliard): You must be in an urban environment.");
    return false;
  }
  const allies = [];
  for (const t of canvas.tokens.placeables ?? []) {
    if (!t.actor || t.actor.uuid === actor.uuid) continue;
    if (distanceBetween(token, t) > 10) continue;
    const disp = t.document?.disposition ?? 0;
    if (disp >= 0) allies.push(t);
  }
  if (allies.length === 0) {
    ui.notifications?.warn?.("Urban Adaptation (Galliard): No ally within 10 feet.");
    return false;
  }
  const options = allies.map(t => `<option value="${t.actor.uuid}">${t.actor.name}</option>`).join("");
  const chosen = await new Promise(resolve => {
    new Dialog({
      title: "Urban Adaptation — Galliard",
      content: `<p>One ally within 10 feet gains <b>advantage on their next Dexterity saving throw</b>.</p><select id="ua-galliard-ally" style="width:100%;margin-top:8px;">${options}</select>`,
      buttons: {
        ok: { icon: '<i class="fas fa-check"></i>', label: "Grant", callback: (html) => resolve(html.find("#ua-galliard-ally").val()) },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) },
      },
      default: "ok",
      close: () => resolve(null),
    }).render(true);
  });
  if (!chosen) return false;
  const doc = await fromUuid(chosen).catch(() => null);
  const allyActor = doc?.actor ?? doc;
  if (!allyActor?.createEmbeddedDocuments) return false;
  const effectData = {
    name: GAROU.galliardEffectName,
    icon: "icons/svg/aura.svg",
    origin: actor.uuid,
    disabled: false,
    duration: { rounds: 999, seconds: null, startRound: null, startTurn: null },
    flags: { [GAROU.scope]: { galliardNextDexSave: true } },
  };
  await allyActor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  ui.notifications?.info?.(`Urban Adaptation (Galliard): ${allyActor.name} has advantage on their next Dexterity saving throw.`);
  return true;
}

Hooks.on("dnd5e.preUseItem", async (item, config, options) => {
  if (!isUrbanGalliardGrantItem(item)) return false;
  const actor = item.actor ?? item.parent;
  if (!(actor instanceof Actor)) return false;
  if (!actor.isOwner && !game.user.isGM) return false;
  const handled = await runUrbanGalliardGrantFlow(item, actor);
  return handled;
});

// ---- Galliard: advantage on next Dex save, then remove effect ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      const eff = actor.effects.find(e =>
        !e.disabled && (e.name === GAROU.galliardEffectName || e.getFlag(GAROU.scope, "galliardNextDexSave"))
      );
      if (!eff) return;
      const abil = workflow.ability ?? workflow.item?.system?.ability ?? "";
      if (abil.toLowerCase() !== "dex") return;
      workflow.advantage = true;
      eff.delete().catch(() => {});
    } catch (err) {
      console.error("[garou] Urban Adaptation (Galliard save) error:", err);
    }
  });
});

// ---- Ahroun: once per turn, move 10+ ft before hit → add PB to damage (in urban) ----
async function promptMoved10Feet(actor, targetActor) {
  if (!actor?.isOwner) return false;
  return new Promise(resolve => {
    new Dialog({
      title: "Urban Adaptation — Ahroun",
      content: `<p>You hit <b>${targetActor?.name ?? "a creature"}</b>.</p><p>Did you move at least <b>10 feet</b> before this attack this turn?</p>`,
      buttons: {
        yes: { label: "Yes", icon: '<i class="fas fa-check"></i>', callback: () => resolve(true) },
        no: { label: "No", icon: '<i class="fas fa-times"></i>', callback: () => resolve(false) },
      },
      default: "yes",
      close: () => resolve(false),
    }).render(true);
  });
}

Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.DamageBonus", async (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor || !workflow?.item) return {};
      if (!hasUrbanAdaptation(actor) || !hasUrbanRider(actor, "ahroun")) return {};
      if (!isInUrbanTerrain(actor)) return {};
      const turnKey = getTurnKey();
      if (actor.getFlag(GAROU.scope, GAROU.turnFlag) === turnKey) return {};
      const hitTargets = Array.from(workflow.hitTargets ?? []);
      if (hitTargets.length === 0) return {};
      const targetActor = hitTargets[0]?.actor;
      const ok = await promptMoved10Feet(actor, targetActor);
      if (!ok) return {};
      await actor.setFlag(GAROU.scope, GAROU.turnFlag, turnKey);
      const pb = actor.system?.attributes?.prof ?? 2;
      return { damageRoll: String(pb), flavor: "Urban Adaptation (Ahroun)" };
    } catch (err) {
      console.error("[garou] Urban Adaptation (Ahroun) error:", err);
      return {};
    }
  });
});
