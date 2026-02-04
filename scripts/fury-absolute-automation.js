// scripts/fury-absolute-automation.js
// Fury Absolute (Black Furies 17): While raging, when you hit your Sworn Foe,
// force Wisdom save (DC = 8 + PB + STR or CON mod). On failed save, target is frightened until end of next turn.
// When used: Rage ends, gain 1 exhaustion, 1/LR.
// Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "furyAbsolute",
  oathScope: "garou",
  oathFeatureKey: "oathOfVengeance",
  oathEffectName: "Sworn Foe",
  oathFlagKey: "swornFoe",
};

function hasFuryAbsolute(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function getFeatureItem(actor) {
  return actor?.items?.find(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey) ?? null;
}

function isRaging(actor) {
  return actor?.effects?.some(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
}

function getSwornFoeEffect(targetActor, garouActorUuid) {
  return targetActor?.effects?.find(e => {
    const swornFoe = e.getFlag(GAROU.oathScope, GAROU.oathFlagKey);
    return e.name === GAROU.oathEffectName && swornFoe?.markedBy === garouActorUuid;
  });
}

function calculateSaveDC(actor) {
  const pb = actor.system?.attributes?.prof ?? 0;
  const strMod = actor.system?.abilities?.str?.mod ?? 0;
  const conMod = actor.system?.abilities?.con?.mod ?? 0;
  return 8 + pb + Math.max(strMod, conMod);
}

function getExhaustion(actor) {
  return Number(actor?.system?.attributes?.exhaustion ?? 0);
}

async function promptUse(actor, targetActor) {
  if (!actor?.isOwner) return false;

  const saveDC = calculateSaveDC(actor);

  return new Promise(resolve => {
    new Dialog({
      title: "Fury Absolute",
      content: `
        <p>You hit your <strong>Sworn Foe</strong> <b>${targetActor.name}</b>.</p>
        <p>Use <b>Fury Absolute</b> to force a Wisdom saving throw (DC ${saveDC})?</p>
        <p>On a failed save, the target is <b>frightened</b> of you until the end of your next turn.</p>
        <hr/>
        <p><em>When used: your Rage ends after the attack and you gain 1 exhaustion.</em></p>
      `,
      buttons: {
        yes: { label: "Yes", icon: '<i class="fas fa-skull"></i>', callback: () => resolve(true) },
        no: { label: "No", icon: '<i class="fas fa-times"></i>', callback: () => resolve(false) }
      },
      default: "yes",
      close: () => resolve(false)
    }).render(true);
  });
}

async function consumeFeatureUse(featureItem) {
  const uses = featureItem?.system?.uses;
  if (!uses?.max) return true; // if no uses configured, allow but recommend fixing item

  const max = Number(uses.max) || 0;
  const spent = Number(uses.spent) || 0;
  if ((max - spent) <= 0) return false;

  await featureItem.update({ "system.uses.spent": spent + 1 });
  return true;
}

async function endRage(actor) {
  const rageEffect = actor.effects.find(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
  if (rageEffect) await rageEffect.update({ disabled: true });
}

async function addExhaustion(actor) {
  const current = getExhaustion(actor);
  await actor.update({ "system.attributes.exhaustion": current + 1 });
}

async function rollWisdomSave(targetActor, saveDC) {
  // Use dnd5e's ability save roll
  const saveData = targetActor.system?.abilities?.wis;
  if (!saveData) return null;

  const rollData = targetActor.getRollData();
  const isProficient = saveData.proficient ?? false;
  const profBonus = isProficient ? (targetActor.system?.attributes?.prof ?? 0) : 0;
  const wisMod = saveData.mod ?? 0;
  
  const formula = `1d20 + ${wisMod}${isProficient ? ` + ${profBonus}` : ""}`;
  const roll = await new Roll(formula, rollData).evaluate({ async: true });
  
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: targetActor }),
    flavor: `Wisdom Save (DC ${saveDC}) - Fury Absolute`,
  });

  return roll.total;
}

async function applyFrightenedEffect(targetActor, garouActor) {
  const combat = game.combat;
  const currentTurn = combat?.turn ?? null;
  const currentRound = combat?.round ?? null;

  const effectData = {
    name: "Frightened (Fury Absolute)",
    icon: "icons/svg/terror.svg",
    origin: garouActor.uuid,
    disabled: false,
    transfer: false,
    duration: {
      rounds: 2, // Until end of next turn (current turn + next turn)
      turns: 0,
      seconds: null,
      startRound: currentRound,
      startTurn: currentTurn,
      startTime: game.time.worldTime ?? null,
    },
    changes: [
      {
        key: "flags.dnd5e.condition.frightened",
        value: "1",
        mode: 5, // Override
        priority: 20,
      },
    ],
    statuses: ["frightened"],
    flags: {
      dnd5e: {
        conditionId: "frightened",
      },
    },
    description: `Frightened of ${garouActor.name} until the end of ${garouActor.name}'s next turn.`,
  };

  await targetActor.createEmbeddedDocuments("ActiveEffect", [effectData]);
}

// Hook: On hit vs Sworn Foe, prompt and apply Fury Absolute
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) {
    console.warn("[garou] Fury Absolute automation requires Midi-QOL module.");
    return;
  }

  Hooks.on("midi-qol.DamageBonus", async (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return {};

      // Must be raging
      if (!isRaging(actor)) return {};

      // Must have feature
      const featureItem = getFeatureItem(actor);
      if (!featureItem) return {};

      // Require single hit target
      const targets = Array.from(workflow.hitTargets ?? []);
      if (targets.length !== 1) return {};

      const targetActor = targets[0]?.actor;
      if (!targetActor) return {};

      // Target must be Sworn Foe
      const swornFoeEffect = getSwornFoeEffect(targetActor, actor.uuid);
      if (!swornFoeEffect) return {};

      // Must have a use available (1/LR)
      const uses = featureItem.system?.uses;
      if (uses?.max) {
        const max = Number(uses.max) || 0;
        const spent = Number(uses.spent) || 0;
        if ((max - spent) <= 0) return {};
      }

      // Prompt player first; only consume use after they confirm
      const ok = await promptUse(actor, targetActor);
      if (!ok) return {};

      // Consume feature use (1/LR)
      const consumed = await consumeFeatureUse(featureItem);
      if (!consumed) return {};

      // Calculate save DC
      const saveDC = calculateSaveDC(actor);

      // Roll Wisdom save for target
      const saveTotal = await rollWisdomSave(targetActor, saveDC);
      const saveFailed = saveTotal === null || saveTotal < saveDC;

      // Apply side effects (they happen when feature is used, regardless of save result)
      await endRage(actor);
      await addExhaustion(actor);

      // On failed save, apply frightened effect
      if (saveFailed) {
        await applyFrightenedEffect(targetActor, actor);
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><b>Fury Absolute</b>: ${targetActor.name} failed the Wisdom save and is <b>frightened</b> of you until the end of your next turn.</p>`
        });
      } else {
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><b>Fury Absolute</b>: ${targetActor.name} succeeded on the Wisdom save.</p>`
        });
      }

      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p><b>Fury Absolute</b>: Your Rage ends and you gain 1 level of exhaustion.</p>`
      });

      return {};
    } catch (err) {
      console.error("[garou] Fury Absolute (DamageBonus) error:", err);
      return {};
    }
  });
});
