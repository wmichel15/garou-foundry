// scripts/refuse-to-fall-automation.js
// Refuse to Fall (Bone Gnawers 6): When reduced to 0 HP but not killed outright,
// use your reaction to drop to 1 HP instead. Then: gain 1 exhaustion, 1/long rest.
// Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "refuseToFall",
};

function hasRefuseToFall(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function getFeatureItem(actor) {
  return actor?.items?.find(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey) ?? null;
}

function getRemainingUses(actor) {
  const item = getFeatureItem(actor);
  if (!item?.system?.uses?.max) return 0;
  const max = Number(item.system.uses.max) || 0;
  const spent = Number(item.system.uses.spent) || 0;
  return Math.max(0, max - spent);
}

function addExhaustion(actor) {
  const current = Number(actor?.system?.attributes?.exhaustion ?? 0) || 0;
  return actor.update({ "system.attributes.exhaustion": Math.min(6, current + 1) });
}

Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) {
    console.warn("[garou] Refuse to Fall automation requires Midi-QOL.");
    return;
  }

  Hooks.on("midi-qol.preTargetDamageApplication", async (workflow) => {
    try {
      const defender = workflow?.actor;
      if (!defender) return;
      if (!hasRefuseToFall(defender)) return;

      if (game.combat) {
        if (MidiQOL.hasUsedReaction(defender)) return;
      }

      const featureItem = getFeatureItem(defender);
      if (!featureItem) return;
      if (getRemainingUses(defender) <= 0) return;

      const hp = defender.system?.attributes?.hp;
      const currentHP = Number(hp?.value ?? 0);
      const maxHP = Number(hp?.max ?? 1);
      const incoming = Number(workflow.damageTotal ?? 0);
      if (incoming <= 0 || maxHP <= 0) return;

      const hpAfter = currentHP - incoming;
      if (hpAfter > 0) return;

      // "Not killed outright": in 5e, massive damage = (incoming - currentHP) >= maxHP
      const excessDamage = incoming - currentHP;
      if (excessDamage >= maxHP) return;

      const isOwner = defender.isOwner || game.user.isGM;
      if (!isOwner) return;

      const ok = await new Promise(resolve => {
        new Dialog({
          title: "Refuse to Fall",
          content: `<p>You are being reduced to 0 hit points.</p><p>Use your <b>reaction</b> to drop to <b>1 hit point</b> instead? (You gain 1 exhaustion and cannot use this again until you finish a long rest.)</p>`,
          buttons: {
            yes: { icon: '<i class="fas fa-heart"></i>', label: "Use Reaction", callback: () => resolve(true) },
            no: { icon: '<i class="fas fa-times"></i>', label: "No", callback: () => resolve(false) },
          },
          default: "yes",
          close: () => resolve(false),
        }).render(true);
      });

      if (!ok) return;

      workflow.damageTotal = Math.max(0, currentHP - 1);

      if (game.combat) await MidiQOL.setReactionUsed(defender);

      const uses = featureItem.system?.uses;
      if (uses?.max) {
        await featureItem.update({ "system.uses.spent": (Number(uses.spent) || 0) + 1 });
      }

      await addExhaustion(defender);

      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: defender }),
        content: `<p><b>Refuse to Fall</b>: ${defender.name} drops to 1 hit point instead of 0 and gains 1 level of exhaustion.</p>`,
      });
    } catch (err) {
      console.error("[garou] Refuse to Fall error:", err);
    }
  });
});
