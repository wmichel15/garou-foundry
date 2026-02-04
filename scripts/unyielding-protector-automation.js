// scripts/unyielding-protector-automation.js
// Unyielding Protector (Black Furies 11): When an ally within 10 feet takes damage,
// use reaction to reduce that damage by PB + CON modifier.
// Uses: 1 per short or long rest.
// Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "unyieldingProtector",
};

function hasUnyieldingProtector(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function getFeatureItem(actor) {
  return actor?.items?.find(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey) ?? null;
}

function getRemainingUses(actor) {
  const featureItem = getFeatureItem(actor);
  if (!featureItem) return 0;
  const uses = featureItem.system?.uses;
  if (!uses || !uses.max) return 0;
  const max = Number(uses.max) || 0;
  const spent = Number(uses.spent) || 0;
  return Math.max(0, max - spent);
}

function getReduction(actor) {
  const conMod = actor.system?.abilities?.con?.mod ?? 0;
  const pb = actor.system?.attributes?.prof ?? 0;
  return Math.max(0, conMod + pb);
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

function isAlly(targetActor, garouActor) {
  if (!targetActor || !garouActor) return false;
  if (targetActor.uuid === garouActor.uuid) return false; // Not yourself
  const targetToken = canvas.tokens?.placeables?.find(t => t.actor === targetActor);
  if (!targetToken) return false;
  const garouToken = canvas.tokens?.placeables?.find(t => t.actor === garouActor);
  if (!garouToken) return false;
  const disposition = targetToken.document?.disposition ?? 0;
  return disposition >= 0; // Ally (friendly or neutral)
}

async function promptUse(garouActor, allyActor, reduction) {
  if (!garouActor.isOwner) return false;

  return new Promise(resolve => {
    new Dialog({
      title: "Unyielding Protector",
      content: `<p>An ally <strong>${allyActor.name}</strong> within 10 feet is taking damage.</p><p>Use your reaction to reduce the damage by <b>${reduction}</b>?</p>`,
      buttons: {
        yes: { label: "Yes", icon: '<i class="fas fa-check"></i>', callback: () => resolve(true) },
        no: { label: "No", icon: '<i class="fas fa-times"></i>', callback: () => resolve(false) }
      },
      default: "yes",
      close: () => resolve(false)
    }).render(true);
  });
}

// Midi-QOL hook to modify damage taken by allies
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) {
    console.warn("[garou] Unyielding Protector automation requires Midi-QOL module.");
    return;
  }

  Hooks.on("midi-qol.preTargetDamageApplication", async (workflow) => {
    try {
      // Defender actor is the one taking damage
      const defender = workflow?.actor;
      if (!defender) return;

      // Find all Black Furies within 10 feet who have the feature
      if (!canvas?.tokens) return;

      const defenderToken = canvas.tokens.placeables.find(t => t.actor === defender);
      if (!defenderToken) return;

      // Find eligible Black Furies
      for (const token of canvas.tokens.placeables) {
        const garouActor = token.actor;
        if (!garouActor) continue;
        if (!hasUnyieldingProtector(garouActor)) continue;

        // Check if defender is an ally
        if (!isAlly(defender, garouActor)) continue;

        // Check distance: ally must be within 10 feet of Black Fury
        const distance = distanceBetween(defenderToken, token);
        if (distance > 10) continue;

        // Check uses remaining
        const uses = getRemainingUses(garouActor);
        if (uses <= 0) continue;

        // Check reaction availability (if in combat)
        if (game.combat) {
          const hasReaction = MidiQOL.hasUsedReaction(garouActor) === false;
          if (!hasReaction) continue;
        }

        const featureItem = getFeatureItem(garouActor);
        if (!featureItem) continue;

        const reduction = getReduction(garouActor);
        if (reduction <= 0) continue;

        // Prompt the Black Fury player
        const ok = await promptUse(garouActor, defender, reduction);
        if (!ok) continue;

        // Apply damage reduction
        const incoming = Number(workflow.damageTotal ?? 0);
        workflow.damageTotal = Math.max(0, incoming - reduction);

        // Consume reaction (if in combat)
        if (game.combat) {
          await MidiQOL.setReactionUsed(garouActor);
        }

        // Consume a use from the feature
        const usesData = featureItem.system?.uses;
        if (usesData && usesData.max) {
          await featureItem.update({ "system.uses.spent": (Number(usesData.spent) || 0) + 1 });
        }

        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: garouActor }),
          content: `<p><b>Unyielding Protector</b>: ${garouActor.name} reduces the damage taken by <strong>${defender.name}</strong> by <b>${reduction}</b>.</p>`
        });

        // Only process first eligible Black Fury to avoid multiple prompts
        return;
      }
    } catch (err) {
      console.error("[garou] Unyielding Protector error:", err);
    }
  });
});
