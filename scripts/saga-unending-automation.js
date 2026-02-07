// scripts/saga-unending-automation.js
// Saga Unending (Fianna 17): Action, begin a saga for 1 minute.
// While active: allies within 30 ft +1 attack; hostiles within 30 ft disadvantage on first save.
// When saga ends: gain 1 exhaustion, Rage ends. 1/long rest.
// Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "sagaUnending",
  effectFlag: "sagaUnendingActive",
  effectName: "Saga Unending — Aura (30 ft)",
};

function hasSagaEffect(actor) {
  return actor?.effects?.some(
    (e) => !e.disabled && (e.getFlag(GAROU.scope, GAROU.effectFlag) || e.name === GAROU.effectName)
  );
}

function getSagaEffect(actor) {
  return actor?.effects?.find(
    (e) => !e.disabled && (e.getFlag(GAROU.scope, GAROU.effectFlag) || e.name === GAROU.effectName)
  ) ?? null;
}

function getSagaBearerTokens() {
  if (!canvas?.tokens?.placeables) return [];
  return canvas.tokens.placeables.filter((t) => t.actor && hasSagaEffect(t.actor));
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

function isWithin30FeetOfSagaBearer(token) {
  if (!token) return false;
  for (const sagaToken of getSagaBearerTokens()) {
    if (distanceBetween(token, sagaToken) <= 30) return true;
  }
  return false;
}

function isAllyOfSagaBearer(token) {
  const disp = token?.document?.disposition ?? 0;
  return disp >= 0; // friendly or neutral
}

function isHostileToSagaBearer(token) {
  const disp = token?.document?.disposition ?? 0;
  return disp === -1;
}

function getExhaustion(actor) {
  return Number(actor?.system?.attributes?.exhaustion ?? 0);
}

async function endRage(actor) {
  const rageEffect = actor?.effects?.find((e) => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
  if (rageEffect) await rageEffect.update({ disabled: true });
}

async function addExhaustion(actor) {
  const current = getExhaustion(actor);
  await actor.update({ "system.attributes.exhaustion": Math.min(5, current + 1) });
}

// Consume item use when saga effect is first applied (from the item's activity)
Hooks.once("ready", () => {
  Hooks.on("createActiveEffect", async (effect, options, userId) => {
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
      console.error("[garou] Saga Unending createActiveEffect error:", err);
    }
  });
});

// When saga effect ends: add 1 exhaustion, end Rage
Hooks.once("ready", () => {
  Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
    try {
      if (!effect.getFlag(GAROU.scope, GAROU.effectFlag) && effect.name !== GAROU.effectName) return;
      const actor = effect.parent;
      if (!actor?.update) return;
      await addExhaustion(actor);
      await endRage(actor);
    } catch (err) {
      console.error("[garou] Saga Unending deleteActiveEffect error:", err);
    }
  });
});

// Allies within 30 ft of saga bearer: +1 to attack rolls
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.AttackRoll", (workflow) => {
    try {
      const token = workflow.token;
      const actor = workflow.actor;
      if (!token || !actor) return;
      if (!isWithin30FeetOfSagaBearer(token)) return;
      if (!isAllyOfSagaBearer(token)) return;
      // Don't grant +1 to the saga bearer themselves (they're not their own ally for this)
      const sagaTokens = getSagaBearerTokens();
      if (sagaTokens.some((t) => t.actor === actor)) return;
      workflow.attackBonus = (workflow.attackBonus || 0) + 1;
    } catch (err) {
      console.error("[garou] Saga Unending AttackRoll error:", err);
    }
  });
});

// Hostiles within 30 ft: disadvantage on first saving throw during the saga
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.SavingThrowRoll", async (workflow) => {
    try {
      const token = workflow.token;
      const actor = workflow.actor;
      if (!token || !actor) return;
      if (!isWithin30FeetOfSagaBearer(token)) return;
      if (!isHostileToSagaBearer(token)) return;
      const sagaTokens = getSagaBearerTokens();
      if (sagaTokens.length === 0) return;
      const sagaActor = sagaTokens[0].actor;
      const sagaEffect = getSagaEffect(sagaActor);
      if (!sagaEffect) return;
      const used = sagaEffect.getFlag(GAROU.scope, "sagaHostilesFirstSaveUsed") ?? [];
      const list = Array.isArray(used) ? [...used] : [];
      if (list.includes(actor.uuid)) return;
      workflow.disadvantage = true;
      list.push(actor.uuid);
      await sagaEffect.update({ [`flags.${GAROU.scope}.sagaHostilesFirstSaveUsed`]: list });
    } catch (err) {
      console.error("[garou] Saga Unending SavingThrowRoll error:", err);
    }
  });
});
