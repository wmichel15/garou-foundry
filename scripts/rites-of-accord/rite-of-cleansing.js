/**
 * Rite of Cleansing – Level 1 Rite of Accord automation.
 * Removes conditions (poisoned/frightened/charmed) or reduces exhaustion on willing targets.
 * 
 * FOUNDRY CONFIGURATION REQUIRED:
 * In the "Perform Rite of Cleansing" activity, set Consumption:
 *   - Type: "Item Uses"
 *   - Target: Gnosis (Feature) item (select from dropdown or use UUID: Item.FvQGHrfaDGaOKRtK)
 *   - Amount: 3
 *   - Consume: "Always" (or "On Use")
 * 
 * The script handles validation gates (Max Gnosis, target, willing, once-per-LR).
 * Foundry automatically consumes 3 uses from the Gnosis (Feature) item.
 */

const GAROU = { scope: "garou" };
const RITE_ID = "cleansing";
const GNOSIS_COST = 3;
const MIN_MAX_GNOSIS = 4;

// Gnosis helpers - source of truth for Max Gnosis
function getGnosisMax(actor) {
  const GNOSIS_BY_LEVEL = { 1: 2, 2: 3, 3: 3, 4: 4, 5: 5, 6: 6, 7: 6, 8: 7, 9: 8, 10: 9, 11: 10, 12: 10, 13: 11, 14: 12, 15: 13, 16: 13, 17: 14, 18: 15, 19: 16, 20: 18 };
  const garouLevel = actor?.system?.classes?.garou?.levels ?? actor?.system?.details?.level ?? 0;
  return GNOSIS_BY_LEVEL[garouLevel] ?? GNOSIS_BY_LEVEL[1];
}

/**
 * Find the actor-owned Gnosis pool item or resource.
 * Returns { type: "item"|"resource", item: Item|null, resourcePath: string|null }
 */
async function findOwnedGnosisPool(actor) {
  if (!actor) return { type: null, item: null, resourcePath: null };
  
  // First try to find owned Gnosis feature item
  const owned = actor.items?.find(i => {
    if (i.type !== "feat") return false;
    const name = (i.name ?? "").toLowerCase();
    if (name === "gnosis (feature)" || (name.includes("gnosis") && !name.includes("spiritual renewal"))) return true;
    const desc = (i.system?.description?.value ?? "").toLowerCase();
    return desc.includes("[garou_gnosis]") || desc.includes("gnosis pool");
  });
  if (owned) return { type: "item", item: owned, resourcePath: null };
  
  // Fallback to resource bar
  const resource = actor.system?.resources?.primary;
  if (resource?.label?.toLowerCase() === "gnosis") {
    return { type: "resource", item: null, resourcePath: "system.resources.primary" };
  }
  
  return { type: null, item: null, resourcePath: null };
}

/**
 * Get current Gnosis value from owned item or resource.
 */
async function getCurrentGnosis(actor) {
  const pool = await findOwnedGnosisPool(actor);
  if (pool.type === "item" && pool.item) {
    const uses = pool.item.system?.uses ?? {};
    const value = Number(uses.value ?? uses.max ?? 0);
    const spent = Number(uses.spent ?? 0);
    return Math.max(0, value - spent);
  }
  if (pool.type === "resource" && pool.resourcePath) {
    const resource = foundry.utils.getProperty(actor, pool.resourcePath);
    if (resource) {
      return Number(resource.value ?? resource.max ?? 0);
    }
  }
  return 0;
}

function isRiteOfCleansing(item) {
  if (!item) return false;
  const name = (item.name ?? "").trim().toLowerCase();
  if (name.includes("rite of cleansing") || (name.includes("cleansing") && name.includes("rite"))) return true;
  const desc = (item.system?.description?.value ?? "").toLowerCase();
  return desc.includes("[garou_rite]") && desc.includes(`id=${RITE_ID}`);
}

// Note: Gnosis spending is handled automatically by Foundry's activity consumption system.
// The activity is configured to consume 3 "Item Uses" from the Gnosis (Feature) item.

function getSelectedTarget() {
  const controlled = canvas.tokens?.controlled ?? [];
  if (controlled.length === 0) {
    ui.notifications?.warn?.("Rite of Cleansing: Please select exactly one target token.");
    return null;
  }
  if (controlled.length > 1) {
    ui.notifications?.warn?.("Rite of Cleansing: Please select only one target token.");
    return null;
  }
  return controlled[0].actor;
}

async function confirmWilling(targetActor) {
  return new Promise(resolve => {
    new Dialog({
      title: "Rite of Cleansing — Confirm Target",
      content: `<p>Is <strong>${targetActor.name}</strong> willing to receive the Rite of Cleansing?</p>`,
      buttons: {
        yes: { icon: '<i class="fas fa-check"></i>', label: "Yes, willing", callback: () => resolve(true) },
        no: { icon: '<i class="fas fa-times"></i>', label: "No, unwilling", callback: () => resolve(false) },
      },
      default: "yes",
      close: () => resolve(false),
    }).render(true);
  });
}

function hasRecentlyCleansed(targetActor) {
  // Check for DAE effect first
  const effect = targetActor.effects?.find(e => {
    const name = (e.name ?? "").toLowerCase();
    return name.includes("rite of cleansing") && name.includes("recently cleansed");
  });
  if (effect && !effect.disabled) return true;
  
  // Check flag fallback
  const lastApplied = targetActor.getFlag(GAROU.scope, "rites.cleansing.lastApplied");
  if (lastApplied != null) {
    // Check if long rest has occurred (simplified: compare worldTime or rest counter)
    // For now, assume flag needs manual reset or DAE handles it
    return true; // Conservative: if flag exists, assume still active
  }
  return false;
}

async function applyRecentlyCleansedMarker(targetActor) {
  // Try DAE first
  if (game.modules?.get("dae")?.active) {
    const effectData = {
      name: "Rite of Cleansing — Recently Cleansed",
      icon: "icons/magic/defensive/barrier-shield-dome-blue.webp",
      origin: targetActor.uuid,
      disabled: false,
      duration: {
        startTime: game.time.worldTime,
        seconds: null,
        combat: null,
        rounds: null,
        turns: null,
        startRound: null,
        startTurn: null,
      },
      changes: [],
      flags: {
        dae: {
          specialDuration: ["longRest"],
        },
        [GAROU.scope]: {
          cleansingMarker: true,
        },
      },
    };
    try {
      await targetActor.createEmbeddedDocuments("ActiveEffect", [effectData]);
      return;
    } catch (err) {
      console.warn("[garou] Rite of Cleansing: Could not create DAE effect, using flag fallback:", err);
    }
  }
  
  // Fallback: flag with worldTime
  await targetActor.setFlag(GAROU.scope, "rites.cleansing.lastApplied", game.time.worldTime ?? Date.now());
}

async function clearRecentlyCleansedMarker(targetActor) {
  // Remove DAE effect
  const effects = targetActor.effects?.filter(e => {
    const name = (e.name ?? "").toLowerCase();
    return name.includes("rite of cleansing") && name.includes("recently cleansed");
  }) ?? [];
  if (effects.length) {
    await targetActor.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id));
  }
  
  // Clear flag
  await targetActor.unsetFlag(GAROU.scope, "rites.cleansing.lastApplied");
}

async function chooseDCDialog() {
  return new Promise(resolve => {
    new Dialog({
      title: "Rite of Cleansing — Choose Impurity Level",
      content: `<p>What level of impurity are you attempting to cleanse?</p>`,
      buttons: {
        minor: {
          icon: '<i class="fas fa-circle"></i>',
          label: "Minor Impurity (DC 13)",
          callback: () => resolve(13)
        },
        severe: {
          icon: '<i class="fas fa-circle"></i>',
          label: "Severe Impurity (DC 15)",
          callback: () => resolve(15)
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => resolve(null)
        }
      },
      default: "minor",
      close: () => resolve(null),
    }).render(true);
  });
}

async function chooseEffectDialog() {
  return new Promise(resolve => {
    new Dialog({
      title: "Rite of Cleansing — Choose Effect",
      content: `
        <p>Which condition or effect do you remove?</p>
        <p class="notes">Note: Only removes conditions if they are from disease/toxin/supernatural sources (for Poisoned) or supernatural/spiritual sources (for Frightened/Charmed).</p>
      `,
      buttons: {
        poisoned: {
          icon: '<i class="fas fa-skull"></i>',
          label: "Remove Poisoned",
          callback: () => resolve("poisoned")
        },
        frightened: {
          icon: '<i class="fas fa-exclamation-triangle"></i>',
          label: "Remove Frightened",
          callback: () => resolve("frightened")
        },
        charmed: {
          icon: '<i class="fas fa-heart"></i>',
          label: "Remove Charmed",
          callback: () => resolve("charmed")
        },
        exhaustion: {
          icon: '<i class="fas fa-tired"></i>',
          label: "Reduce Exhaustion by 1",
          callback: () => resolve("exhaustion")
        },
        curse: {
          icon: '<i class="fas fa-magic"></i>',
          label: "Cleanse Minor Curse/Corrupting Effect (Manual)",
          callback: () => resolve("curse")
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => resolve(null)
        }
      },
      default: "poisoned",
      close: () => resolve(null),
    }).render(true);
  });
}

async function removeCondition(targetActor, condition) {
  if (condition === "poisoned") {
    await targetActor.toggleCondition("poisoned", { active: false });
  } else if (condition === "frightened") {
    await targetActor.toggleCondition("frightened", { active: false });
  } else if (condition === "charmed") {
    await targetActor.toggleCondition("charmed", { active: false });
  } else if (condition === "exhaustion") {
    const current = Number(targetActor.system?.attributes?.exhaustion ?? 0);
    if (current > 0) {
      await targetActor.update({ "system.attributes.exhaustion": current - 1 });
    } else {
      ui.notifications?.info?.("Target has no exhaustion to reduce.");
    }
  }
}

async function runRiteOfCleansingFlow(item, actor, token) {
  if (!actor) {
    ui.notifications?.warn?.("Rite of Cleansing: No actor found.");
    return true; // Block use
  }

  // Check Max Gnosis requirement (access gate)
  const maxGnosis = getGnosisMax(actor);
  if (maxGnosis < MIN_MAX_GNOSIS) {
    await ChatMessage.create({
      user: game.user?.id,
      content: `<p><strong>Rite of Cleansing</strong> requires Minimum Maximum Gnosis of ${MIN_MAX_GNOSIS}.</p><p>Your Maximum Gnosis is ${maxGnosis}. This rite is not available yet.</p>`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    });
    return true; // Block use
  }

  // Get target - must have exactly one selected token
  const targetActor = getSelectedTarget();
  if (!targetActor) {
    // getSelectedTarget already shows notification
    return true; // Block use
  }

  // Confirm willing
  const willing = await confirmWilling(targetActor);
  if (!willing) {
    ui.notifications?.info?.("Rite of Cleansing cancelled: target is not willing.");
    return true; // Block use
  }

  // Check once per long rest
  if (hasRecentlyCleansed(targetActor)) {
    await ChatMessage.create({
      user: game.user?.id,
      content: `<p><strong>Rite of Cleansing:</strong> <strong>${targetActor.name}</strong> has already benefited from this rite since their last long rest.</p>`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    });
    return true; // Block use
  }

  // Check current Gnosis (Foundry will handle spending, but we validate first)
  const currentGnosis = await getCurrentGnosis(actor);
  if (currentGnosis < GNOSIS_COST) {
    await ChatMessage.create({
      user: game.user?.id,
      content: `<p><strong>Rite of Cleansing:</strong> Insufficient Gnosis. You have ${currentGnosis}, need ${GNOSIS_COST}.</p>`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    });
    return true; // Block use - Foundry won't consume if we return true here
  }

  // Choose DC (must happen before Foundry consumes, so user can cancel)
  const dc = await chooseDCDialog();
  if (!dc) {
    // User cancelled - block use so Foundry doesn't consume Gnosis
    return true;
  }

  // All validation passed - allow Foundry to proceed with consumption
  // Store DC, target, and maxGnosis for post-use processing
  await item.setFlag(GAROU.scope, "cleansingDC", dc);
  await item.setFlag(GAROU.scope, "cleansingTarget", targetActor.id);
  await item.setFlag(GAROU.scope, "cleansingMaxGnosis", maxGnosis);
  
  // Return false to allow Foundry to proceed with consumption and use
  // The roll/effects will be handled in the post-use hook
  return false;
}

/**
 * Execute the rite roll and effects after Foundry has consumed Gnosis.
 * Called from post-use hooks.
 */
async function executeRiteRollAndEffects(item, actor) {
  const dc = item.getFlag(GAROU.scope, "cleansingDC");
  const targetId = item.getFlag(GAROU.scope, "cleansingTarget");
  const maxGnosis = item.getFlag(GAROU.scope, "cleansingMaxGnosis") ?? getGnosisMax(actor);
  
  if (!dc || !targetId) {
    // No stored data means validation failed or already executed
    return;
  }
  
  // Check if already executed (prevent double-processing from multiple hooks)
  if (item.getFlag(GAROU.scope, "cleansingExecuted")) {
    return;
  }
  
  // Mark as executed
  await item.setFlag(GAROU.scope, "cleansingExecuted", true);
  
  const targetActor = game.actors?.get(targetId);
  if (!targetActor) {
    ui.notifications?.warn?.("Rite of Cleansing: Target actor not found.");
    return;
  }
  
  // Get chat flavor from activity description
  const activityId = Object.keys(item.system?.activities ?? {})[0];
  const chatFlavor = activityId ? item.system.activities[activityId]?.description?.chatFlavor : null;
  
  // Get roll result from Foundry's roll system (stored in flag from dnd5e.rollCheck hook)
  const rollTotal = item.getFlag(GAROU.scope, "cleansingRollResult");
  const rollData = item.getFlag(GAROU.scope, "cleansingRoll");
  
  // If Foundry rolled (via dnd5e.rollCheck hook), use that result
  // Otherwise, create roll manually using Foundry's Roll system with chat flavor
  let rollTotalValue = rollTotal;
  if (rollTotalValue == null) {
    // Foundry may not automatically roll for utility activities, so we create it manually
    // but use Foundry's Roll class to ensure proper formatting
    const rollFormula = `1d20 + ${maxGnosis}`;
    const roll = await new Roll(rollFormula).evaluate({ async: true });
    
    // Extract roll name from activity or use default
    const rollName = activityId && item.system.activities[activityId]?.roll?.name 
      ? item.system.activities[activityId].roll.name
      : "Wisdom Check (Gnosis Roll)";
    
    // Use chat flavor for roll message if available
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: rollName,
      content: chatFlavor ? chatFlavor : undefined,
    });
    rollTotalValue = roll.total;
  }

  const success = rollTotalValue >= dc;
  
  // Clear stored flags
  await item.unsetFlag(GAROU.scope, "cleansingDC");
  await item.unsetFlag(GAROU.scope, "cleansingTarget");
  await item.unsetFlag(GAROU.scope, "cleansingMaxGnosis");
  await item.unsetFlag(GAROU.scope, "cleansingExecuted");
  await item.unsetFlag(GAROU.scope, "cleansingRollResult");
  await item.unsetFlag(GAROU.scope, "cleansingRoll");
  await item.unsetFlag(GAROU.scope, "cleansingRollFormula");

  if (success) {
    // Choose effect
    const effect = await chooseEffectDialog();
    if (!effect) {
      // User cancelled, but gnosis was already spent
      await ChatMessage.create({
        user: game.user?.id,
        content: `<p><strong>Rite of Cleansing:</strong> Success, but effect selection was cancelled. ${GNOSIS_COST} Gnosis was spent.</p>`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      });
      return;
    }

    // Apply effect
    if (effect === "curse") {
      await ChatMessage.create({
        user: game.user?.id,
        content: `<p><strong>Rite of Cleansing:</strong> Successfully cleansed a minor curse or corrupting effect from <strong>${targetActor.name}</strong>.</p><p><em>Note:</em> ST adjudication required for specific effects.</p>`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      });
    } else {
      await removeCondition(targetActor, effect);
      await ChatMessage.create({
        user: game.user?.id,
        content: `<p><strong>Rite of Cleansing:</strong> Successfully removed <strong>${effect}</strong> from <strong>${targetActor.name}</strong>.</p>`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      });
    }

    // Apply lockout marker
    await applyRecentlyCleansedMarker(targetActor);

    // Success summary
    await ChatMessage.create({
      user: game.user?.id,
      content: `
        <div style="border: 2px solid #4a9eff; padding: 8px; background: rgba(74, 158, 255, 0.1);">
          <p><strong>Rite of Cleansing — Success</strong></p>
          <p><strong>Time:</strong> 30 minutes</p>
          <p><strong>Cost:</strong> ${GNOSIS_COST} Gnosis (spent)</p>
          <p><strong>Target:</strong> ${targetActor.name}</p>
          <p><strong>Effect:</strong> ${effect === "curse" ? "Minor curse/effect cleansed (manual)" : effect + " removed"}</p>
          <p class="notes">This rite cannot cure mundane diseases or major curses. Requires focus (water/ash/smoke/soil).</p>
          <p class="notes">Target cannot benefit from this rite again until their next long rest.</p>
        </div>
      `,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    });
  } else {
    // Failure
    await ChatMessage.create({
      user: game.user?.id,
      content: `
        <div style="border: 2px solid #ff6b6b; padding: 8px; background: rgba(255, 107, 107, 0.1);">
          <p><strong>Rite of Cleansing — Failure</strong></p>
          <p><strong>Roll:</strong> ${rollTotalValue} vs DC ${dc}</p>
          <p><strong>Cost:</strong> ${GNOSIS_COST} Gnosis (spent)</p>
          <p><strong>Result:</strong> Gnosis is spent. Condition remains. No worsening.</p>
        </div>
      `,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    });
  }
}

export function registerRiteOfCleansingHandler() {
  // Hook item use - validate gates before Foundry consumes Gnosis
  Hooks.on("dnd5e.preUseItem", async (item, config, options) => {
    if (!isRiteOfCleansing(item)) return;
    
    const actor = options?.actor ?? item?.actor;
    if (!actor) return;
    
    // Run validation flow - if it returns true, block use (Foundry won't consume)
    // If validation passes, return false to allow Foundry to proceed with consumption
    const shouldBlock = await runRiteOfCleansingFlow(item, actor, options?.token);
    
    // If validation passed, modify the activity roll formula to use Max Gnosis
    if (!shouldBlock) {
      const maxGnosis = getGnosisMax(actor);
      const activityId = Object.keys(item.system?.activities ?? {})[0];
      if (activityId && item.system.activities[activityId]) {
        // Store original formula and modify to use Max Gnosis
        const activity = item.system.activities[activityId];
        if (activity.roll?.formula) {
          // Replace @abilities.wis.mod with Max Gnosis value
          const modifiedFormula = `1d20 + ${maxGnosis}`;
          // Store modified formula in flag for later use
          await item.setFlag(GAROU.scope, "cleansingRollFormula", modifiedFormula);
          // Temporarily modify the activity roll formula
          await item.update({
            [`system.activities.${activityId}.roll.formula`]: modifiedFormula
          });
        }
      }
    }
    
    return shouldBlock ? true : false; // true = block, false = allow Foundry to handle
  });

  // Hook to intercept ability check rolls and modify formula
  Hooks.on("dnd5e.preRollCheck", async (roll, config, options) => {
    const item = options?.item;
    if (!item || !isRiteOfCleansing(item)) return;
    
    const actor = options?.actor ?? item?.actor;
    if (!actor) return;
    
    // Check if we have a stored roll formula
    const storedFormula = item.getFlag(GAROU.scope, "cleansingRollFormula");
    if (storedFormula && roll.formula) {
      // Modify the roll formula
      roll.formula = storedFormula;
      // Update the roll's data
      roll._formula = storedFormula;
    }
  });

  // Hook to capture roll result from Foundry's roll system
  Hooks.on("dnd5e.rollCheck", async (roll, config, options) => {
    const item = options?.item;
    if (!item || !isRiteOfCleansing(item)) return;
    
    const actor = options?.actor ?? item?.actor;
    if (!actor) return;
    
    // Store the roll result for use in executeRiteRollAndEffects
    await item.setFlag(GAROU.scope, "cleansingRollResult", roll.total);
    await item.setFlag(GAROU.scope, "cleansingRoll", roll.toJSON());
  });

  // Hook after item use to execute effects (Foundry has already consumed Gnosis)
  // Note: Utility activities may not automatically roll, so we'll handle roll in executeRiteRollAndEffects
  Hooks.on("dnd5e.useItem", async (item, config, options) => {
    if (!isRiteOfCleansing(item)) return;
    
    const actor = options?.actor ?? item?.actor;
    if (!actor) return;
    
    // Execute roll and effects (roll will be handled by Foundry if configured, or manually if needed)
    await executeRiteRollAndEffects(item, actor);
  });

  // Midi-QOL hook (if present) - execute after Midi processes the item
  if (typeof game?.modules?.get("midi-qol")?.api !== "undefined") {
    try {
      Hooks.on("midi-qol.RollComplete", async (workflow) => {
        const item = workflow?.item;
        if (item && isRiteOfCleansing(item)) {
          const actor = workflow.actor;
          if (actor) {
            await executeRiteRollAndEffects(item, actor);
          }
        }
      });
    } catch (_) {}
  }

  // Clear lockout markers on long rest (DAE handles this automatically, but clear flags too)
  Hooks.on("dnd5e.restCompleted", async (actor, data) => {
    if (data.longRest) {
      await clearRecentlyCleansedMarker(actor);
    }
  });
}

export { isRiteOfCleansing, runRiteOfCleansingFlow };

// Auto-register on init
Hooks.once("init", () => {
  registerRiteOfCleansingHandler();
});
