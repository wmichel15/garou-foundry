// Fenrisian Endurance automation (Get of Fenris 11)
// Requires: Midi-QOL

const GAROU = {
  scope: "garou",
  featureKey: "fenrisianEndurance"
};

function hasFeature(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function findFeatureItem(actor) {
  return actor?.items?.find(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey) ?? null;
}

function isRaging(actor) {
  // Adjust if your Rage state uses a specific effect name/flag
  return actor.effects.some(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
}

function getReduction(actor) {
  const conMod = actor.system?.abilities?.con?.mod ?? 0;
  const pb = actor.system?.attributes?.prof ?? 0;
  return Math.max(0, conMod + pb);
}

async function promptUse(actor, reduction) {
  if (!actor.isOwner) return false;

  return new Promise(resolve => {
    new Dialog({
      title: "Fenrisian Endurance",
      content: `<p>Use your reaction to reduce the damage by <b>${reduction}</b>?</p>`,
      buttons: {
        yes: { label: "Yes", icon: '<i class="fas fa-check"></i>', callback: () => resolve(true) },
        no: { label: "No", icon: '<i class="fas fa-times"></i>', callback: () => resolve(false) }
      },
      default: "yes",
      close: () => resolve(false)
    }).render(true);
  });
}

// Midi-QOL hook to modify damage taken
Hooks.on("midi-qol.preTargetDamageApplication", async (workflow) => {
  try {
    // Defender actor is the one taking damage
    const defender = workflow?.actor;
    if (!defender) return;

    if (!hasFeature(defender)) return;
    if (!isRaging(defender)) return;

    // Requires combat/reaction tracking to be meaningful
    if (game.combat) {
      const hasReaction = MidiQOL.hasUsedReaction(defender) === false;
      if (!hasReaction) return;
    }

    const featureItem = findFeatureItem(defender);
    if (!featureItem) return;

    // Must have a use available
    const uses = featureItem.system?.uses;
    if (uses && uses.max) {
      const remaining = (Number(uses.max) || 0) - (Number(uses.spent) || 0);
      if (remaining <= 0) return;
    }

    const reduction = getReduction(defender);
    if (reduction <= 0) return;

    // Compute HP threshold check:
    // We want to trigger only if this damage would put them at <= half max HP.
    const hp = defender.system?.attributes?.hp;
    const currentHP = Number(hp?.value ?? 0);
    const maxHP = Number(hp?.max ?? 0);

    // Total damage being applied to defender in this workflow
    const incoming = Number(workflow.damageTotal ?? 0);
    if (!incoming || maxHP <= 0) return;

    const postHP = currentHP - incoming;
    const halfHP = Math.floor(maxHP / 2);

    if (postHP > halfHP) return;

    const ok = await promptUse(defender, reduction);
    if (!ok) return;

    // Apply damage reduction
    // Reduce the workflow's damage total (can't go below 0)
    workflow.damageTotal = Math.max(0, incoming - reduction);

    // Consume reaction (if in combat)
    if (game.combat) {
      await MidiQOL.setReactionUsed(defender);
    }

    // Consume a use from the feature
    if (uses && uses.max) {
      await featureItem.update({ "system.uses.spent": (Number(uses.spent) || 0) + 1 });
    }

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: defender }),
      content: `<p><b>Fenrisian Endurance</b> reduces the damage by <b>${reduction}</b>.</p>`
    });
  } catch (err) {
    console.error("[garou] Fenrisian Endurance error:", err);
  }
});
