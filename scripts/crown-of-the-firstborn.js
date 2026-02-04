// scripts/crown-of-the-firstborn.js
// Crown of the Firstborn (Silver Fangs 17): as an action, assert command for 1 minute.
// Allies within 30 ft: advantage on saves vs frightened/charmed; first miss per round may add 1d6.
// After use: 1 exhaustion, 1/long rest, cannot use while raging.
// Requires: Midi-QOL (optional).

const GAROU = {
  scope: "garou",
  featureKey: "crownOfTheFirstborn",
  featureName: "Crown of the Firstborn",
  effectName: "Crown of the Firstborn",
  effectFlag: "crownOfTheFirstborn",
};

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

function isCrownItem(item) {
  if (!item) return false;
  const name = (item.name ?? "").trim().toLowerCase();
  const flag = item.getFlag(GAROU.scope, "featureKey");
  return flag === GAROU.featureKey || name === "crown of the firstborn";
}

function getCrownFeatureItem(actor) {
  return actor?.items?.find(i =>
    i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey ||
    (i.name ?? "").trim().toLowerCase() === "crown of the firstborn"
  ) ?? null;
}

function hasCrownUse(featureItem) {
  if (!featureItem?.system?.uses) return false;
  const max = Number(featureItem.system.uses.max) || 0;
  const spent = Number(featureItem.system.uses.spent) || 0;
  return (max - spent) > 0;
}

async function consumeCrownUse(featureItem) {
  if (!featureItem?.system?.uses) return;
  const spent = Number(featureItem.system.uses.spent) || 0;
  await featureItem.update({ "system.uses.spent": spent + 1 });
}

function isRaging(actor) {
  return actor?.effects?.some(e =>
    !e.disabled && (e.name ?? "").toLowerCase().includes("rage")
  );
}

function addExhaustion(actor) {
  const current = Number(actor?.system?.attributes?.exhaustion ?? 0) || 0;
  return actor.update({ "system.attributes.exhaustion": current + 1 });
}

function getCrownBearerTokens() {
  const bearers = [];
  for (const actor of game.actors.contents) {
    const eff = actor.effects.find(e =>
      (e.name ?? "").trim() === GAROU.effectName || e.getFlag(GAROU.scope, GAROU.effectFlag)
    );
    if (!eff) continue;
    const token = actor.getActiveTokens()?.[0] ?? canvas.tokens?.placeables?.find(t => t.actor === actor);
    if (token) bearers.push({ actor, token, effect: eff });
  }
  return bearers;
}

function isWithin30FeetOfCrown(actorOrToken) {
  const token = actorOrToken?.document ? actorOrToken : (actorOrToken?.getActiveTokens?.()?.[0] ?? canvas.tokens?.placeables?.find(t => t.actor === actorOrToken));
  if (!token) return false;
  for (const { token: crownToken } of getCrownBearerTokens()) {
    if (distanceBetween(token, crownToken) <= 30) return true;
  }
  return false;
}

function isSaveVsFrightenedOrCharmed(workflow) {
  if (!workflow) return false;
  const name = (workflow.item?.name ?? workflow.origin?.name ?? workflow.spell?.name ?? "").toLowerCase();
  const desc = (workflow.item?.system?.description?.value ?? workflow.origin?.system?.description?.value ?? "").toLowerCase();
  if (name.includes("frighten") || name.includes("fear") || desc.includes("frightened")) return true;
  if (name.includes("charm") || desc.includes("charmed")) return true;
  return false;
}

function getCrownEffectUsedThisRound(effect) {
  const data = effect.getFlag(GAROU.scope, GAROU.effectFlag);
  return data?.usedThisRound ?? {};
}

async function setCrownEffectUsedThisRound(effect, actorId) {
  const data = effect.getFlag(GAROU.scope, GAROU.effectFlag) ?? {};
  const used = { ...(data.usedThisRound ?? {}), [actorId]: true };
  await effect.update({ [`flags.${GAROU.scope}.${GAROU.effectFlag}.usedThisRound`]: used });
}

async function clearCrownEffectUsedThisRound(effect) {
  await effect.update({ [`flags.${GAROU.scope}.${GAROU.effectFlag}.usedThisRound`]: {} });
}

async function runCrownFlow(item, actor) {
  const featureItem = getCrownFeatureItem(actor);
  if (!featureItem || !hasCrownUse(featureItem)) {
    ui.notifications?.warn?.("Crown of the Firstborn: No uses remaining.");
    return true;
  }
  if (isRaging(actor)) {
    ui.notifications?.warn?.("Crown of the Firstborn: You cannot use this feature while raging.");
    return true;
  }

  await consumeCrownUse(featureItem);
  await addExhaustion(actor);

  const effectData = {
    name: GAROU.effectName,
    icon: "icons/svg/crown.svg",
    origin: actor.uuid,
    disabled: false,
    transfer: false,
    duration: {
      rounds: 10,
      turns: 0,
      seconds: null,
      startRound: game.combat?.round ?? null,
      startTurn: game.combat?.turn ?? null,
      startTime: game.time.worldTime ?? null,
    },
    flags: {
      [GAROU.scope]: {
        [GAROU.effectFlag]: { sourceActorUuid: actor.uuid, usedThisRound: {} },
      },
    },
    description: "Allies within 30 feet gain advantage on saves vs frightened/charmed. First miss per round may add 1d6 to the roll.",
  };

  await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  ui.notifications?.info?.("Crown of the Firstborn: Active for 1 minute. You gain 1 exhaustion.");
  return true;
}

// ---- Item use ----
Hooks.on("dnd5e.preUseItem", async (item, config, options) => {
  if (!isCrownItem(item)) return false;
  const actor = item.actor ?? item.parent;
  if (!(actor instanceof Actor)) return false;
  if (!actor.isOwner && !game.user.isGM) return false;
  await runCrownFlow(item, actor);
  return true;
});

// Expose handler for garou.js single Item.use wrapper (avoids duplicate libWrapper registration)
Hooks.once("ready", () => {
  game.garou = game.garou ?? {};
  game.garou.isCrownItem = isCrownItem;
  game.garou.runCrownFlow = runCrownFlow;
});

// ---- Round reset: clear usedThisRound on all Crown effects ----
Hooks.on("updateCombat", (combat, update, options) => {
  if (!("round" in update)) return;
  for (const actor of game.actors.contents) {
    for (const eff of actor.effects) {
      if ((eff.name ?? "").trim() === GAROU.effectName || eff.getFlag(GAROU.scope, GAROU.effectFlag)) {
        clearCrownEffectUsedThisRound(eff).catch(() => {});
      }
    }
  }
});

// ---- Midi: advantage on saves vs frightened/charmed for allies in aura ----
Hooks.once("ready", () => {
  if (!game.modules.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      if (!isWithin30FeetOfCrown(actor)) return;
      if (!isSaveVsFrightenedOrCharmed(workflow)) return;
      workflow.advantage = true;
    } catch (err) {
      console.error("[garou] Crown advantage error:", err);
    }
  });
});

// ---- Midi: first miss per round - add 1d6 (prompt, roll, chat) ----
Hooks.once("ready", () => {
  if (!game.modules.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.RollComplete", async (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return;
      const actionType = workflow.item?.system?.actionType;
      if (actionType !== "mwak" && actionType !== "rwak" && actionType !== "msak" && actionType !== "rsak") return;
      const hitTargets = Array.from(workflow.hitTargets ?? []);
      // Miss = no targets hit, or first target (if any) was not hit
      const missed = hitTargets.length === 0 || !(hitTargets[0]?.hit ?? workflow.hitTargets?.get?.(hitTargets[0]?.id)?.hit);
      if (!missed) return;
      const attacker = workflow.actor;
      if (!isWithin30FeetOfCrown(attacker)) return;
      const bearers = getCrownBearerTokens();
      if (bearers.length === 0) return;
      const crownEffect = bearers[0].effect;
      const used = getCrownEffectUsedThisRound(crownEffect);
      if (used[attacker.id]) return;

      const ok = await new Promise(resolve => {
        new Dialog({
          title: GAROU.featureName,
          content: `<p><b>${attacker.name}</b> missed an attack while within 30 ft of the Crown.</p><p>Add <b>1d6</b> to the roll (first time this round)?</p>`,
          buttons: {
            yes: { icon: '<i class="fas fa-dice"></i>', label: "Add 1d6", callback: () => resolve(true) },
            no:  { icon: '<i class="fas fa-times"></i>', label: "No", callback: () => resolve(false) },
          },
          default: "yes",
          close: () => resolve(false),
        }).render(true);
      });

      if (!ok) return;

      await setCrownEffectUsedThisRound(crownEffect, attacker.id);
      const roll = await new Roll("1d6").evaluate();
      const attackTotal = workflow.roll?.total ?? workflow.roll?._total ?? 0;
      const newTotal = attackTotal + roll.total;
      await roll.toMessage({
        flavor: `${GAROU.featureName}: add 1d6 to missed attack. New total: ${attackTotal} + ${roll.total} = ${newTotal}`,
        speaker: ChatMessage.getSpeaker({ actor: attacker }),
      });
    } catch (err) {
      console.error("[garou] Crown 1d6 miss error:", err);
    }
  });
});
