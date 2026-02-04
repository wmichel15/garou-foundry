// scripts/punish-the-guilty-automation.js
// Punish the Guilty (Black Furies 6): While raging, when a creature within 5 feet hits an ally,
// use reaction to make one melee weapon attack or natural weapon attack against that creature.
// Uses: Proficiency bonus per long rest.
// Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "punishTheGuilty",
};

function hasPunishTheGuilty(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function isRaging(actor) {
  return actor?.effects?.some(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
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

function getFeatureItem(actor) {
  return actor?.items?.find(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
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

function getMeleeWeapons(actor) {
  if (!actor?.items) return [];
  return actor.items.filter(item => {
    const type = item.type;
    if (type !== "weapon") return false;
    const actionType = item.system?.actionType;
    // Melee weapon attacks (mwak) or natural weapons
    return actionType === "mwak" || item.system?.properties?.has("nat");
  });
}

async function promptPunishTheGuilty(garouActor, attackerActor, allyActor) {
  const uses = getRemainingUses(garouActor);
  if (uses <= 0) return false;

  // Check if they have reaction available
  if (game.combat && MidiQOL.hasUsedReaction(garouActor) === true) {
    return false; // Already used reaction
  }

  const meleeWeapons = getMeleeWeapons(garouActor);
  if (meleeWeapons.length === 0) {
    ui.notifications.warn(`${garouActor.name} has no melee weapons or natural weapons available for Punish the Guilty.`);
    return false;
  }

  const content = `
    <div style="padding: 10px;">
      <p><strong>Punish the Guilty</strong></p>
      <p>A creature within 5 feet hit your ally <strong>${allyActor.name}</strong>.</p>
      <p>Use your reaction to make one melee weapon attack or natural weapon attack against <strong>${attackerActor.name}</strong>?</p>
      <p><em>Uses remaining: ${uses}</em></p>
      ${meleeWeapons.length > 1 ? `
        <div style="margin-top: 10px;">
          <label for="punish-weapon-select">Select weapon:</label>
          <select id="punish-weapon-select" style="width: 100%; margin-top: 5px;">
            ${meleeWeapons.map(w => `<option value="${w.id}">${w.name}</option>`).join("")}
          </select>
        </div>
      ` : `<input type="hidden" id="punish-weapon-select" value="${meleeWeapons[0].id}" />`}
    </div>
  `;

  return new Promise((resolve) => {
    new Dialog({
      title: "Punish the Guilty",
      content,
      buttons: {
        yes: {
          icon: '<i class="fas fa-check"></i>',
          label: "Use Reaction",
          callback: async (html) => {
            const weaponId = html.find("#punish-weapon-select").val();
            const weapon = meleeWeapons.find(w => w.id === weaponId);
            if (!weapon) {
              resolve(false);
              return;
            }

            // Consume use
            const featureItem = getFeatureItem(garouActor);
            if (featureItem) {
              const uses = featureItem.system?.uses;
              if (uses && uses.max) {
                await featureItem.update({ "system.uses.spent": (Number(uses.spent) || 0) + 1 });
              }
            }

            // Mark reaction as used
            if (game.combat) {
              await MidiQOL.setReactionUsed(garouActor);
            }

            // Execute attack
            const attackerToken = canvas.tokens?.placeables?.find(t => t.actor === attackerActor);
            if (attackerToken && weapon) {
              // Set target first
              game.user.updateTokenTargets(new Set([attackerToken.id]));
              
              // Use the weapon (this will trigger the normal attack flow)
              // Small delay to ensure target is set before attack
              setTimeout(() => {
                weapon.use().catch(err => {
                  console.error("[garou] Punish the Guilty attack execution error:", err);
                  ui.notifications.warn(`Failed to execute attack with ${weapon.name}. Target is set - please click the weapon to attack.`);
                });
              }, 150);
            }

            ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: garouActor }),
              content: `<p><b>Punish the Guilty</b>: ${garouActor.name} strikes back at ${attackerActor.name}!</p>`
            });

            resolve(true);
          }
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => resolve(false)
        }
      },
      default: "yes"
    }).render(true);
  });
}

// Hook: Detect when an ally is hit within 5 feet of a raging Black Fury
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) {
    console.warn("[garou] Punish the Guilty automation requires Midi-QOL module.");
    return;
  }

  Hooks.on("midi-qol.RollComplete", async (workflow) => {
  try {
    if (!workflow?.actor || !workflow?.item) return;
    
    // Only weapon attacks
    const actionType = workflow.item.system?.actionType;
    if (!["mwak", "rwak", "msak", "rsak"].includes(actionType)) return;

    // Must have at least one hit target
    const hitTargets = Array.from(workflow.hitTargets ?? []);
    if (hitTargets.length === 0) return;

    const attacker = workflow.actor;
    const attackerToken = canvas.tokens?.placeables?.find(t => t.actor === attacker);

    // Check all hit targets to see if any are allies
    for (const hitTarget of hitTargets) {
      const allyActor = hitTarget.actor;
      if (!allyActor) continue;

      // Find all Black Furies within 5 feet who are raging
      if (!canvas?.tokens) continue;
      
      for (const token of canvas.tokens.placeables) {
        const garouActor = token.actor;
        if (!garouActor) continue;
        if (!hasPunishTheGuilty(garouActor)) continue;
        if (!isRaging(garouActor)) continue;

        // Check if ally is actually an ally
        if (!isAlly(allyActor, garouActor)) continue;

        // Check distance: attacker must be within 5 feet of Black Fury
        const garouToken = token;
        const distance = distanceBetween(attackerToken, garouToken);
        if (distance > 5) continue;

        // Check uses
        const uses = getRemainingUses(garouActor);
        if (uses <= 0) continue;

        // Check reaction availability
        if (game.combat && MidiQOL.hasUsedReaction(garouActor) === true) continue;

        // Prompt the Black Fury player
        const ok = await promptPunishTheGuilty(garouActor, attacker, allyActor);
        if (ok) {
          // Only trigger once per attack workflow
          return;
        }
      }
    }
  } catch (err) {
    console.error("[garou] Punish the Guilty error:", err);
  }
  });
});
