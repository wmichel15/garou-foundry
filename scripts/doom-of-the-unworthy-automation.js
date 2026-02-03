// Doom of the Unworthy automation (Get of Fenris 17)
// Requires: Midi-QOL
// Strategy:
// 1) On hit (DamageBonus hook), prompt and mark workflow for maximize.
// 2) Pre-damage roll complete: rebuild the damage roll with maximize:true.
// Also applies: consume feature use (LR), end Rage, add 1 exhaustion.

const GAROU = {
  scope: "garou",
  featureKey: "doomOfTheUnworthy",
  wfFlag: "doomOfTheUnworthyMaximize"
};

function getFeatureItem(actor) {
  return actor?.items?.find(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey) ?? null;
}

function isRaging(actor) {
  return actor?.effects?.some(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
}

function getHP(actor) {
  return Number(actor?.system?.attributes?.hp?.value ?? 0);
}

function getMaxHP(actor) {
  return Number(actor?.system?.attributes?.hp?.max ?? 0);
}

function getExhaustion(actor) {
  return Number(actor?.system?.attributes?.exhaustion ?? 0);
}

async function promptUse(actor, targetActor) {
  if (!actor?.isOwner) return false;

  return new Promise(resolve => {
    new Dialog({
      title: "Doom of the Unworthy",
      content: `
        <p><b>${targetActor.name}</b> has fewer hit points than you.</p>
        <p>Use <b>Doom of the Unworthy</b> to deal <b>maximum damage</b> on this hit?</p>
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

// ---- Hook 1: On hit, decide whether to maximize ----
// We use DamageBonus because it fires after hit determination and before damage resolution.
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

    // HP comparison: target has fewer HP than you (current HP)
    if (getHP(targetActor) >= getHP(actor)) return {};

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

    // Mark workflow to maximize damage later
    workflow.setFlag(GAROU.scope, GAROU.wfFlag, true);

    // Apply side effects now (they happen when feature is used)
    await endRage(actor);
    await addExhaustion(actor);

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><b>Doom of the Unworthy</b>: your strike lands with absolute finality.</p>`
    });

    return {};
  } catch (err) {
    console.error("[garou] Doom of the Unworthy (DamageBonus) error:", err);
    return {};
  }
});

// ---- Hook 2: Maximize the damage roll right before it resolves ----
// This is the clean part: rebuild Roll(formula) with maximize:true.
Hooks.on("midi-qol.preDamageRollComplete", async (workflow) => {
  try {
    const actor = workflow?.actor;
    if (!actor) return;

    const doMax = await workflow.getFlag(GAROU.scope, GAROU.wfFlag);
    if (!doMax) return;

    // Only if there is a damage roll to rebuild
    const existing = workflow.damageRoll;
    if (!existing) return;

    const formula = existing.formula;
    const data = actor.getRollData?.() ?? {};

    const maxRoll = await (new Roll(formula, data)).evaluate({ maximize: true, async: true });

    workflow.damageRoll = maxRoll;
    workflow.damageTotal = maxRoll.total;

    // Clear the flag so it doesn't leak
    await workflow.unsetFlag(GAROU.scope, GAROU.wfFlag);
  } catch (err) {
    console.error("[garou] Doom of the Unworthy (preDamageRollComplete) error:", err);
  }
});
