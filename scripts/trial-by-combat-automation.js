// scripts/trial-by-combat-automation.js
// Requires: Midi-QOL. (DAE not required for this approach.)
// Automates: Marking Challenged Foe, +1 damage vs marked, temp HP once when marked foe hits you.

const GAROU = {
  scope: "garou",
  trialKey: "trialByCombat",
  effectName: "Challenged Foe",
  // packKey is only used if you later want to pull an effect/item from a compendium; not needed here.
};

function hasTrialByCombat(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.trialKey);
}

function getChallengedFoeEffect(targetActor, challengerActorUuid) {
  return targetActor?.effects?.find(e => {
    const challengedBy = e.getFlag(GAROU.scope, "challengedBy");
    return e.name === GAROU.effectName && challengedBy === challengerActorUuid;
  });
}

async function removeExistingMarksForChallenger(challengerActorUuid) {
  // Remove any existing "Challenged Foe" effects placed by this challenger on any token actor on the canvas.
  if (!canvas?.tokens) return;

  const deletions = [];
  for (const t of canvas.tokens.placeables) {
    const a = t.actor;
    if (!a) continue;
    const eff = getChallengedFoeEffect(a, challengerActorUuid);
    if (eff) deletions.push({ actor: a, effectId: eff.id });
  }

  for (const d of deletions) {
    await MidiQOL.socket().executeAsGM("removeEffects", {
      actorUuid: d.actor.uuid,
      effects: [d.effectId],
    });
  }
}

async function applyChallengedFoeEffect(targetActor, challengerActor, durationRounds = 1) {
  const effectData = {
    name: GAROU.effectName,
    icon: "icons/svg/target.svg",
    origin: challengerActor.uuid,
    disabled: false,
    transfer: false,
    duration: {
      rounds: durationRounds,
      turns: 0,
      seconds: null,
      startRound: game.combat?.round ?? null,
      startTurn: game.combat?.turn ?? null,
      startTime: game.time.worldTime ?? null,
    },
    flags: {
      [GAROU.scope]: {
        challengedBy: challengerActor.uuid,
        trialByCombat: { triggered: false },
      },
    },
  };

  await MidiQOL.socket().executeAsGM("createEffects", {
    actorUuid: targetActor.uuid,
    effects: [effectData],
  });
}

async function promptUserToMark(workflow) {
  // Only prompt the user who owns the actor.
  const actor = workflow?.actor;
  if (!actor) return false;

  const ownsActor = actor.isOwner;
  if (!ownsActor) return false;

  // Require exactly one hit target; if multiple, just pick the first for now (can expand later).
  const hitTargets = Array.from(workflow.hitTargets ?? []);
  if (hitTargets.length !== 1) return false;

  const targetToken = hitTargets[0];
  const targetActor = targetToken.actor;
  if (!targetActor) return false;

  return new Promise(resolve => {
    new Dialog({
      title: "Trial by Combat",
      content: `<p>Mark <b>${targetActor.name}</b> as your <b>Challenged Foe</b> until the end of your next turn?</p>`,
      buttons: {
        yes: { icon: '<i class="fas fa-check"></i>', label: "Mark", callback: () => resolve(true) },
        no:  { icon: '<i class="fas fa-times"></i>', label: "No",   callback: () => resolve(false) },
      },
      default: "yes",
      close: () => resolve(false),
    }).render(true);
  });
}

// ------------- Hook 1: On-hit prompt to apply mark -------------
Hooks.on("midi-qol.RollComplete", async (workflow) => {
  try {
    if (!workflow?.actor || !workflow?.item) return;

    // Only melee weapon/natural weapon attacks (covers most natural weapons too).
    const actionType = workflow.item.system?.actionType;
    if (!["mwak"].includes(actionType)) return;

    // Must have Trial by Combat feature flagged.
    if (!hasTrialByCombat(workflow.actor)) return;

    // Only if there is at least one hit target.
    if (!workflow.hitTargets || workflow.hitTargets.size < 1) return;

    // Optional: if you want to enforce "while raging" here, add your own rage check.
    // Example placeholder:
    // if (!workflow.actor.effects.some(e => e.name.toLowerCase().includes("rage") && !e.disabled)) return;

    const ok = await promptUserToMark(workflow);
    if (!ok) return;

    const targetActor = Array.from(workflow.hitTargets)[0].actor;
    if (!targetActor) return;

    await removeExistingMarksForChallenger(workflow.actor.uuid);
    await applyChallengedFoeEffect(targetActor, workflow.actor, 1);
  } catch (err) {
    console.error("[garou] Trial by Combat mark error:", err);
  }
});

// ------------- Hook 2: +1 damage vs challenged foe -------------
Hooks.on("midi-qol.DamageBonus", async (workflow) => {
  try {
    if (!workflow?.actor || !workflow?.item) return {};
    if (!hasTrialByCombat(workflow.actor)) return {};

    const targets = Array.from(workflow.hitTargets ?? []);
    if (targets.length !== 1) return {};
    const targetActor = targets[0].actor;
    if (!targetActor) return {};

    const eff = getChallengedFoeEffect(targetActor, workflow.actor.uuid);
    if (!eff) return {};

    // Add +1 damage (typed as "none" so it just appends).
    return { damageRoll: "1", flavor: "Trial by Combat (+1 vs Challenged Foe)" };
  } catch (err) {
    console.error("[garou] Trial by Combat damage bonus error:", err);
    return {};
  }
});

// ------------- Hook 3: Temp HP once when challenged foe hits you -------------
Hooks.on("midi-qol.AttackRollComplete", async (workflow) => {
  try {
    const attacker = workflow?.actor;
    if (!attacker) return;

    // We only care when an attack actually hits at least one target.
    const hitTargets = Array.from(workflow.hitTargets ?? []);
    if (hitTargets.length !== 1) return;

    const defenderToken = hitTargets[0];
    const defender = defenderToken.actor;
    if (!defender) return;

    // Defender must have Trial by Combat.
    if (!hasTrialByCombat(defender)) return;

    // Attacker must be marked as Challenged Foe by this defender.
    const eff = getChallengedFoeEffect(attacker, defender.uuid);
    if (!eff) return;

    const state = eff.getFlag(GAROU.scope, "trialByCombat") ?? {};
    if (state.triggered) return;

    const pb = defender.system?.attributes?.prof ?? 2;

    // Apply temp HP = PB (don’t reduce if they already have more temp HP).
    const currentTemp = defender.system?.attributes?.hp?.temp ?? 0;
    const newTemp = Math.max(currentTemp, pb);

    await MidiQOL.socket().executeAsGM("updateActor", {
      actorUuid: defender.uuid,
      update: { "system.attributes.hp.temp": newTemp },
    });

    // Mark as triggered on the effect.
    await MidiQOL.socket().executeAsGM("updateEffects", {
      actorUuid: attacker.uuid,
      updates: [{ _id: eff.id, [`flags.${GAROU.scope}.trialByCombat.triggered`]: true }],
    });
  } catch (err) {
    console.error("[garou] Trial by Combat temp HP error:", err);
  }
});
