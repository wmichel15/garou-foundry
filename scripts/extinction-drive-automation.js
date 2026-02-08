// scripts/extinction-drive-automation.js
// Extinction Drive (Red Talons 17): Action, enter state of absolute predation for 1 minute.
// While active: +10 ft speed (effect), advantage on melee/natural attacks, once per turn +1d10 on hit.
// When state ends: gain 2 exhaustion, Rage ends. 1/long rest.
// Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "extinctionDrive",
  effectFlag: "extinctionDriveActive",
  effectName: "Extinction Drive — Active (1 minute)",
  turnFlag: "extinctionDriveUsedTurn",
};

function hasExtinctionDriveEffect(actor) {
  return actor?.effects?.some(
    (e) => !e.disabled && (e.getFlag(GAROU.scope, GAROU.effectFlag) || e.name === GAROU.effectName)
  );
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

function getExhaustion(actor) {
  return Number(actor?.system?.attributes?.exhaustion ?? 0);
}

async function endRage(actor) {
  const rageEffect = actor?.effects?.find((e) => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
  if (rageEffect) await rageEffect.update({ disabled: true });
}

async function addExhaustion(actor, levels = 1) {
  const current = getExhaustion(actor);
  await actor.update({ "system.attributes.exhaustion": Math.min(6, current + levels) });
}

// Consume item use when effect is first applied
Hooks.once("ready", () => {
  Hooks.on("createActiveEffect", async (effect) => {
    try {
      const parent = effect.parent;
      if (!parent?.items) return;
      if (!effect.getFlag(GAROU.scope, GAROU.effectFlag) && effect.name !== GAROU.effectName) return;
      const featureItem = parent.items.find((i) => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
      if (!featureItem?.system?.uses?.max) return;
      const spent = Number(featureItem.system.uses.spent) || 0;
      const max = Number(featureItem.system.uses.max) || 0;
      if (spent >= max) return;
      await featureItem.update({ "system.uses.spent": spent + 1 });
    } catch (err) {
      console.error("[garou] Extinction Drive createActiveEffect error:", err);
    }
  });
});

// When state ends: add 2 exhaustion, end Rage
Hooks.once("ready", () => {
  Hooks.on("deleteActiveEffect", async (effect) => {
    try {
      if (!effect.getFlag(GAROU.scope, GAROU.effectFlag) && effect.name !== GAROU.effectName) return;
      const actor = effect.parent;
      if (!actor?.update) return;
      await addExhaustion(actor, 2);
      await endRage(actor);
    } catch (err) {
      console.error("[garou] Extinction Drive deleteActiveEffect error:", err);
    }
  });
});

// Advantage on melee and natural weapon attack rolls
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.AttackRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor || !hasExtinctionDriveEffect(actor)) return;
      if (!isMeleeOrNaturalWeapon(workflow)) return;
      workflow.advantage = true;
    } catch (err) {
      console.error("[garou] Extinction Drive AttackRoll error:", err);
    }
  });
});

// Once per turn: +1d10 damage on hit
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.DamageBonus", async (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor || !workflow?.item) return {};
      if (!hasExtinctionDriveEffect(actor)) return {};
      if (!isMeleeOrNaturalWeapon(workflow)) return {};
      const turnKey = getTurnKey();
      if (actor.getFlag(GAROU.scope, GAROU.turnFlag) === turnKey) return {};
      const hitTargets = Array.from(workflow.hitTargets ?? []);
      if (hitTargets.length === 0) return {};
      await actor.setFlag(GAROU.scope, GAROU.turnFlag, turnKey);
      return { damageRoll: "1d10", flavor: "Extinction Drive" };
    } catch (err) {
      console.error("[garou] Extinction Drive DamageBonus error:", err);
      return {};
    }
  });
});
