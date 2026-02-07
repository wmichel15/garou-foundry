// scripts/nothing-left-to-lose-automation.js
// Nothing Left to Lose (Bone Gnawers 17): While raging and bloodied:
// - Resistance to bludgeoning, piercing, slashing from nonmagical attacks
// - Once per turn: +1d8 damage when you hit
// When first activates: gain 1 exhaustion. Ends when Rage ends or no longer bloodied.
// Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "nothingLeftToLose",
};

const BPS_TYPES = new Set(["bludgeoning", "piercing", "slashing"]);

function hasNothingLeftToLose(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function isRaging(actor) {
  return actor?.effects?.some(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
}

function isBloodied(actor) {
  if (!actor?.system?.attributes?.hp) return false;
  const hp = Number(actor.system.attributes.hp.value) ?? 0;
  const max = Number(actor.system.attributes.hp.max) ?? 1;
  return max > 0 && hp <= Math.floor(max / 2);
}

function isActive(actor) {
  return hasNothingLeftToLose(actor) && isRaging(actor) && isBloodied(actor);
}

function getTurnKey() {
  const c = game.combat;
  if (!c) return `${game.time.worldTime}`;
  return `${c.id}-${c.round}-${c.turn}`;
}

function addExhaustion(actor) {
  const current = Number(actor?.system?.attributes?.exhaustion ?? 0) || 0;
  return actor.update({ "system.attributes.exhaustion": Math.min(6, current + 1) });
}

function isNonmagicalBPS(workflow) {
  const item = workflow.item ?? workflow.origin;
  if (!item?.system) return false;
  const props = item.system.properties ?? {};
  const isMagical = props.mgc === true || props.magical === true;
  if (isMagical) return false;
  const parts = item.system.damage?.parts ?? [];
  if (parts.length === 0) return false;
  for (const part of parts) {
    const type = String(part[1] ?? part.damageType ?? "").toLowerCase();
    if (type && !BPS_TYPES.has(type)) return false;
  }
  return parts.some(p => BPS_TYPES.has(String(p[1] ?? "").toLowerCase()));
}

// ---- First activation: when entering (raging + bloodied), add 1 exhaustion ----
Hooks.on("updateActor", async (actor, changed) => {
  if (!actor || actor.type !== "character") return;
  if (!hasNothingLeftToLose(actor)) return;

  const hpChanged = changed.system?.attributes?.hp || changed.actor?.system?.attributes?.hp;
  const effectsChanged = changed.effects;

  if (!hpChanged && !effectsChanged) return;

  const nowActive = isActive(actor);
  const alreadyTriggered = actor.getFlag(GAROU.scope, "nothingLeftToLoseExhaustionApplied");

  if (nowActive && !alreadyTriggered) {
    const isOwner = actor.isOwner || game.user.isGM;
    if (isOwner) {
      await addExhaustion(actor);
      await actor.setFlag(GAROU.scope, "nothingLeftToLoseExhaustionApplied", true);
      ui.notifications?.info?.(`${actor.name}: Nothing Left to Lose activated. You gain 1 level of exhaustion.`);
    }
  }

  if (!nowActive && alreadyTriggered) {
    await actor.unsetFlag(GAROU.scope, "nothingLeftToLoseExhaustionApplied").catch(() => {});
  }
});

// ---- Resistance to nonmagical B/P/S when defender has feature and is active ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;

  Hooks.on("midi-qol.preTargetDamageApplication", async (workflow) => {
    try {
      const defender = workflow?.actor;
      if (!defender) return;
      if (!isActive(defender)) return;
      if (!isNonmagicalBPS(workflow)) return;

      const incoming = Number(workflow.damageTotal ?? 0);
      if (incoming <= 0) return;
      workflow.damageTotal = Math.floor(incoming / 2);
    } catch (err) {
      console.error("[garou] Nothing Left to Lose resistance error:", err);
    }
  });
});

// ---- Once per turn: +1d8 damage on hit ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;

  Hooks.on("midi-qol.DamageBonus", async (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return {};
      const attacker = workflow.actor;
      if (!isActive(attacker)) return {};

      const hitTargets = Array.from(workflow.hitTargets ?? []);
      if (hitTargets.length === 0) return {};

      const turnKey = getTurnKey();
      if (attacker.getFlag(GAROU.scope, "nothingLeftToLoseTurn") === turnKey) return {};

      await attacker.setFlag(GAROU.scope, "nothingLeftToLoseTurn", turnKey);
      return { damageRoll: "1d8", flavor: "Nothing Left to Lose" };
    } catch (err) {
      console.error("[garou] Nothing Left to Lose damage bonus error:", err);
      return {};
    }
  });
});
