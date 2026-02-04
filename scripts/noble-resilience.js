// scripts/noble-resilience.js
// Noble Resilience (Silver Fangs 11): when you fail a saving throw, you may reroll and take the new result.
// 1/long rest. If the reroll succeeds, you gain advantage on your next saving throw before end of your next turn.
// Requires: Midi-QOL (optional, for save workflow hooks).

const GAROU = {
  scope: "garou",
  featureKey: "nobleResilience",
  featureName: "Noble Resilience",
  advantageEffectName: "Noble Resilience (advantage on next save)",
  advantageFlag: "nobleResilienceAdvantage",
};

function isNobleResilienceItem(item) {
  if (!item) return false;
  const name = (item.name ?? "").trim().toLowerCase();
  const flag = item.getFlag(GAROU.scope, "featureKey");
  return flag === GAROU.featureKey || name === "noble resilience";
}

function getNobleResilienceFeatureItem(actor) {
  return actor?.items?.find(i =>
    i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey ||
    (i.name ?? "").trim().toLowerCase() === "noble resilience"
  ) ?? null;
}

function hasNobleResilienceUse(featureItem) {
  if (!featureItem?.system?.uses) return false;
  const max = Number(featureItem.system.uses.max) || 0;
  const spent = Number(featureItem.system.uses.spent) || 0;
  return (max - spent) > 0;
}

async function consumeNobleResilienceUse(featureItem) {
  if (!featureItem?.system?.uses) return;
  const spent = Number(featureItem.system.uses.spent) || 0;
  await featureItem.update({ "system.uses.spent": spent + 1 });
}

function isNobleResilienceAdvantageEffect(effect) {
  if (!effect) return false;
  const name = (effect.name ?? "").trim();
  if (name === GAROU.advantageEffectName) return true;
  return !!effect.getFlag(GAROU.scope, GAROU.advantageFlag);
}

async function removeNobleResilienceAdvantageFromActor(actor) {
  const toRemove = actor.effects.filter(isNobleResilienceAdvantageEffect);
  if (toRemove.length) await actor.deleteEmbeddedDocuments("ActiveEffect", toRemove.map(e => e.id));
}

async function promptUseNobleResilience(actor) {
  if (!actor?.isOwner && !game.user.isGM) return false;
  return new Promise(resolve => {
    new Dialog({
      title: GAROU.featureName,
      content: `
        <p>You <b>failed</b> the saving throw.</p>
        <p>Use <b>Noble Resilience</b> to reroll and take the new result? (1/long rest)</p>
        <p><em>If the reroll succeeds, you gain advantage on your next saving throw before the end of your next turn.</em></p>
      `,
      buttons: {
        yes: { icon: '<i class="fas fa-dice"></i>', label: "Reroll", callback: () => resolve(true) },
        no:  { icon: '<i class="fas fa-times"></i>', label: "No",   callback: () => resolve(false) },
      },
      default: "yes",
      close: () => resolve(false),
    }).render(true);
  });
}

function getSaveDC(workflow) {
  if (workflow.saveDC != null) return Number(workflow.saveDC);
  if (workflow.dc != null) return Number(workflow.dc);
  const item = workflow.item ?? workflow.origin ?? workflow.spell;
  if (item?.system?.save?.dc) return Number(item.system.save.dc);
  return null;
}

function didSaveFail(workflow) {
  const dc = getSaveDC(workflow);
  if (dc == null) return null;
  const roll = workflow.roll ?? workflow.saveRoll;
  if (!roll) return null;
  const total = typeof roll.total === "number" ? roll.total : (roll.roll ?? roll)?._total;
  if (typeof total !== "number") return null;
  return total < dc;
}

async function doRerollAndMaybeGrantAdvantage(actor, featureItem, workflow) {
  const formula = workflow.roll?.formula ?? workflow.saveRoll?.formula ?? "1d20";
  const dc = getSaveDC(workflow);
  let roll;
  try {
    roll = await new Roll(formula).evaluate();
  } catch (e) {
    console.warn("[garou] Noble Resilience reroll formula error:", e);
    roll = await new Roll("1d20").evaluate();
  }
  await roll.toMessage({
    flavor: `${GAROU.featureName} reroll`,
    speaker: ChatMessage.getSpeaker({ actor }),
  });
  const total = roll.total;
  const rerollSucceeded = dc != null && total >= dc;
  if (rerollSucceeded) {
    const effectData = {
      name: GAROU.advantageEffectName,
      icon: "icons/svg/upgrade.svg",
      origin: actor.uuid,
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
          [GAROU.advantageFlag]: { sourceActorUuid: actor.uuid },
        },
      },
      description: "Advantage on your next saving throw before the end of your next turn.",
    };
    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    ui.notifications?.info?.(`${GAROU.featureName}: Reroll succeeded. Advantage on your next save before end of your next turn.`);
  }
}

// When a saving throw completes and fails, offer Noble Resilience reroll
Hooks.once("ready", () => {
  if (!game.modules.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.SavingThrowComplete", async (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      const featureItem = getNobleResilienceFeatureItem(actor);
      if (!featureItem || !hasNobleResilienceUse(featureItem)) return;
      const failed = didSaveFail(workflow);
      if (failed !== true) return;
      const ok = await promptUseNobleResilience(actor);
      if (!ok) return;
      await consumeNobleResilienceUse(featureItem);
      await doRerollAndMaybeGrantAdvantage(actor, featureItem, workflow);
    } catch (err) {
      console.error("[garou] Noble Resilience error:", err);
    }
  });

  // Grant advantage on next save when actor has the Noble Resilience advantage effect
  Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      const eff = actor.effects.find(e => isNobleResilienceAdvantageEffect(e));
      if (!eff) return;
      workflow.advantage = true;
      actor.deleteEmbeddedDocuments("ActiveEffect", [eff.id]).catch(() => {});
    } catch (err) {
      console.error("[garou] Noble Resilience advantage error:", err);
    }
  });
});

// Turn-end: remove Noble Resilience (advantage on next save) effect
let _lastCombatStateNoble = {};
Hooks.on("updateCombat", (combat, update, options) => {
  const turnChanged = "turn" in update || "round" in update;
  if (!turnChanged || !combat?.combatants?.size) return;
  const key = combat.id;
  const prev = _lastCombatStateNoble[key];
  const contents = combat.combatants?.contents ?? [];
  if (prev != null && contents.length) {
    const combatantWhoseTurnEnded = contents[prev.turn];
    if (combatantWhoseTurnEnded?.actor) {
      removeNobleResilienceAdvantageFromActor(combatantWhoseTurnEnded.actor).catch(() => {});
    }
  }
  _lastCombatStateNoble[key] = { round: combat.round, turn: combat.turn };
});
