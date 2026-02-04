// scripts/oath-of-vengeance.js
// Oath of Vengeance (Black Furies 3): mark Sworn Foe when enemies harm allies/helpless within 30ft;
// while raging, +1 attack and PB damage on first hit vs Sworn Foe, plus auspice riders.
// Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "oathOfVengeance",
  effectName: "Sworn Foe",
  flagKey: "swornFoe",
};

const VALID_AUSPICES = new Set(["ragabash", "theurge", "philodox", "galliard", "ahroun"]);

function getActorAuspiceKey(actor) {
  if (!actor?.items) return null;
  const auspiceItem = actor.items.find(i => {
    const key = i.getFlag(GAROU.scope, "auspice");
    return typeof key === "string" && VALID_AUSPICES.has(key.toLowerCase());
  });
  return auspiceItem ? auspiceItem.getFlag(GAROU.scope, "auspice").toLowerCase() : null;
}

function hasOathOfVengeance(actor) {
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

function isAllyOrHelpless(targetActor, garouActor) {
  if (!targetActor || !garouActor) return false;
  const targetToken = canvas.tokens?.placeables?.find(t => t.actor === targetActor);
  if (!targetToken) return false;
  const disposition = targetToken.document?.disposition ?? 0;
  if (disposition >= 0) return true; // Ally
  const helplessFlag = targetActor.getFlag(GAROU.scope, "helpless");
  return !!helplessFlag; // Helpless (GM can set this flag)
}

function getSwornFoeEffect(targetActor, garouActorUuid) {
  return targetActor?.effects?.find(e => {
    const swornFoe = e.getFlag(GAROU.scope, GAROU.flagKey);
    return e.name === GAROU.effectName && swornFoe?.markedBy === garouActorUuid;
  });
}

async function removeExistingSwornFoeForGarou(garouActorUuid) {
  if (!canvas?.tokens) return;
  const deletions = [];
  for (const t of canvas.tokens.placeables) {
    const a = t.actor;
    if (!a) continue;
    const eff = getSwornFoeEffect(a, garouActorUuid);
    if (eff) deletions.push({ actor: a, effectId: eff.id });
  }
  for (const d of deletions) {
    await MidiQOL.socket().executeAsGM("removeEffects", {
      actorUuid: d.actor.uuid,
      effects: [d.effectId],
    });
  }
}

async function applySwornFoeEffect(targetActor, garouActor) {
  const combat = game.combat;
  const currentTurn = combat?.turn ?? null;
  const currentRound = combat?.round ?? null;
  
  await removeExistingSwornFoeForGarou(garouActor.uuid);
  
  const effectData = {
    name: GAROU.effectName,
    icon: "icons/svg/target.svg",
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
    flags: {
      [GAROU.scope]: {
        [GAROU.flagKey]: {
          markedBy: garouActor.uuid,
          markedAtTurn: currentTurn,
          markedAtRound: currentRound,
          firstHitTriggered: false,
        },
      },
    },
  };
  
  await MidiQOL.socket().executeAsGM("createEffects", {
    actorUuid: targetActor.uuid,
    effects: [effectData],
  });
  
  // Theurge rider: advantage on next save vs spell/supernatural
  const auspiceKey = getActorAuspiceKey(garouActor);
  if (auspiceKey === "theurge") {
    const theurgeEffect = {
      name: "Oath of Vengeance (Theurge)",
      icon: "icons/svg/upgrade.svg",
      origin: garouActor.uuid,
      disabled: false,
      transfer: false,
      flags: {
        [GAROU.scope]: {
          oathOfVengeanceTheurge: { triggered: false },
        },
      },
    };
    await garouActor.createEmbeddedDocuments("ActiveEffect", [theurgeEffect]);
  }
}

async function promptMarkSwornFoe(attackerActor, targetActor, garouActor) {
  if (!garouActor.isOwner && !game.user.isGM) return false;
  
  return new Promise(resolve => {
    new Dialog({
      title: "Oath of Vengeance",
      content: `<p><b>${attackerActor.name}</b> harmed <b>${targetActor.name}</b> within 30 feet of you.</p><p>Mark <b>${attackerActor.name}</b> as your <b>Sworn Foe</b>?</p>`,
      buttons: {
        yes: { icon: '<i class="fas fa-check"></i>', label: "Mark Sworn Foe", callback: () => resolve(true) },
        no:  { icon: '<i class="fas fa-times"></i>', label: "No", callback: () => resolve(false) },
      },
      default: "yes",
      close: () => resolve(false),
    }).render(true);
  });
}

function getBlackFuryTokensWithin30Feet(targetToken) {
  if (!canvas?.scene?.tokens || !targetToken) return [];
  const targetCenter = tokenCenter(targetToken);
  const measure = (other) => canvas.grid.measureDistance(targetCenter, tokenCenter(other));
  const placeables = canvas.tokens?.placeables ?? [];
  return placeables.filter(t => {
    if (!t.actor) return false;
    if (measure(t) > 30) return false;
    return hasOathOfVengeance(t.actor);
  });
}

// ---- Hook: Detect harm to allies/helpless, prompt to mark Sworn Foe ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  
  Hooks.on("midi-qol.preTargetDamageApplication", async (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return;
      const attackerActor = workflow.actor;
      const attackerToken = canvas.tokens?.placeables?.find(t => t.actor === attackerActor);
      if (!attackerToken) return;
      
      const damageTargets = Array.from(workflow.damageTargets ?? []);
      if (damageTargets.length === 0) return;
      
      for (const dt of damageTargets) {
        const targetToken = dt.token;
        const targetActor = targetToken?.actor;
        if (!targetActor) continue;
        
        if (!isAllyOrHelpless(targetActor, attackerActor)) continue;
        
        const blackFuryTokens = getBlackFuryTokensWithin30Feet(targetToken);
        if (blackFuryTokens.length === 0) continue;
        
        for (const bfToken of blackFuryTokens) {
          const garouActor = bfToken.actor;
          if (!garouActor) continue;
          
          const existingSwornFoe = getSwornFoeEffect(attackerActor, garouActor.uuid);
          if (existingSwornFoe) continue; // Already marked
          
          const ok = await promptMarkSwornFoe(attackerActor, targetActor, garouActor);
          if (ok) {
            await applySwornFoeEffect(attackerActor, garouActor);
            ui.notifications?.info?.(`Oath of Vengeance: ${attackerActor.name} marked as Sworn Foe.`);
          }
        }
      }
    } catch (err) {
      console.error("[garou] Oath of Vengeance mark error:", err);
    }
  });
});

// ---- Hook: +1 attack vs Sworn Foe (while raging) ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  
  Hooks.on("midi-qol.AttackRoll", (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return;
      const attacker = workflow.actor;
      if (!hasOathOfVengeance(attacker)) return;
      if (!isRaging(attacker)) return;
      
      const targets = Array.from(workflow.targets ?? []);
      if (targets.length === 0) return;
      const targetToken = targets[0];
      const targetActor = targetToken?.actor;
      if (!targetActor) return;
      
      const swornFoeEff = getSwornFoeEffect(targetActor, attacker.uuid);
      if (!swornFoeEff) return;
      
      workflow.attackBonus = (workflow.attackBonus || 0) + 1;
    } catch (err) {
      console.error("[garou] Oath of Vengeance attack bonus error:", err);
    }
  });
});

// ---- Hook: PB damage on first hit vs Sworn Foe (while raging) ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  
  Hooks.on("midi-qol.DamageBonus", async (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return {};
      const attacker = workflow.actor;
      if (!hasOathOfVengeance(attacker)) return {};
      if (!isRaging(attacker)) return {};
      
      const targets = Array.from(workflow.hitTargets ?? []);
      if (targets.length === 0) return {};
      const targetToken = targets[0];
      const targetActor = targetToken?.actor;
      if (!targetActor) return {};
      
      const swornFoeEff = getSwornFoeEffect(targetActor, attacker.uuid);
      if (!swornFoeEff) return {};
      
      const state = swornFoeEff.getFlag(GAROU.scope, GAROU.flagKey) ?? {};
      if (state.firstHitTriggered) return {};
      
      const pb = Number(attacker.system?.attributes?.prof ?? 2) || 2;
      
      await MidiQOL.socket().executeAsGM("updateEffects", {
        actorUuid: targetActor.uuid,
        updates: [{ _id: swornFoeEff.id, [`flags.${GAROU.scope}.${GAROU.flagKey}.firstHitTriggered`]: true }],
      });
      
      return { damageRoll: String(pb), flavor: "Oath of Vengeance (first hit)" };
    } catch (err) {
      console.error("[garou] Oath of Vengeance PB damage error:", err);
      return {};
    }
  });
});

// ---- Auspice Riders ----

// Ragabash: Once per Rage, when hit Sworn Foe, move 10ft (no OA)
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  
  Hooks.on("midi-qol.DamageBonus", async (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return {};
      const attacker = workflow.actor;
      if (!hasOathOfVengeance(attacker)) return {};
      if (!isRaging(attacker)) return {};
      
      const auspiceKey = getActorAuspiceKey(attacker);
      if (auspiceKey !== "ragabash") return {};
      
      const riderItem = attacker.items.find(i => 
        i.getFlag(GAROU.scope, "riderFor") === GAROU.featureKey &&
        i.getFlag(GAROU.scope, "auspice") === "ragabash"
      );
      if (!riderItem) return {};
      
      const targets = Array.from(workflow.hitTargets ?? []);
      if (targets.length === 0) return {};
      const targetActor = targets[0].actor;
      if (!targetActor) return {};
      
      const swornFoeEff = getSwornFoeEffect(targetActor, attacker.uuid);
      if (!swornFoeEff) return {};
      
      const rageEffect = attacker.effects.find(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
      if (!rageEffect) return {};
      
      const rageState = rageEffect.getFlag(GAROU.scope, "oathOfVengeanceRagabashUsed") ?? false;
      if (rageState) return {};
      
      const ok = await new Promise(resolve => {
        new Dialog({
          title: "Oath of Vengeance — Ragabash",
          content: `<p>You hit your Sworn Foe.</p><p>Move up to <b>10 feet</b> without provoking opportunity attacks?</p>`,
          buttons: {
            yes: { icon: '<i class="fas fa-running"></i>', label: "Move", callback: () => resolve(true) },
            no:  { icon: '<i class="fas fa-times"></i>', label: "No", callback: () => resolve(false) },
          },
          default: "yes",
          close: () => resolve(false),
        }).render(true);
      });
      
      if (ok) {
        await rageEffect.update({ [`flags.${GAROU.scope}.oathOfVengeanceRagabashUsed`]: true });
        ui.notifications?.info?.("Oath of Vengeance (Ragabash): You may move up to 10 feet without provoking opportunity attacks.");
      }
      
      return {};
    } catch (err) {
      console.error("[garou] Oath of Vengeance Ragabash error:", err);
      return {};
    }
  });
});

// Theurge: Advantage on next save vs spell/supernatural (applied when marking, consumed on save)
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  
  Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
    try {
      if (!workflow?.actor) return;
      const actor = workflow.actor;
      
      const theurgeEffect = actor.effects.find(e => 
        e.name === "Oath of Vengeance (Theurge)" && 
        e.getFlag(GAROU.scope, "oathOfVengeanceTheurge")
      );
      if (!theurgeEffect) return;
      
      const state = theurgeEffect.getFlag(GAROU.scope, "oathOfVengeanceTheurge") ?? {};
      if (state.triggered) return;
      
      const item = workflow.item ?? workflow.origin;
      const isSpell = item?.type === "spell";
      const isSupernatural = item?.getFlag(GAROU.scope, "supernatural") || 
                            (item?.name ?? "").toLowerCase().includes("supernatural");
      
      if (!isSpell && !isSupernatural) return;
      
      workflow.advantage = true;
      theurgeEffect.update({ [`flags.${GAROU.scope}.oathOfVengeanceTheurge.triggered`]: true }).catch(() => {});
      theurgeEffect.delete().catch(() => {});
    } catch (err) {
      console.error("[garou] Oath of Vengeance Theurge error:", err);
    }
  });
});

// Philodox: Reaction when Sworn Foe attacks someone else, impose disadvantage
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  
  Hooks.on("midi-qol.AttackRoll", async (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return;
      const attacker = workflow.actor;
      
      const targets = Array.from(workflow.targets ?? []);
      if (targets.length === 0) return;
      const targetToken = targets[0];
      const targetActor = targetToken?.actor;
      if (!targetActor) return;
      
      const blackFuryTokens = getBlackFuryTokensWithin30Feet(targetToken);
      for (const bfToken of blackFuryTokens) {
        const garouActor = bfToken.actor;
        if (!garouActor) continue;
        if (garouActor === attacker) continue; // Not attacking someone else
        
        const auspiceKey = getActorAuspiceKey(garouActor);
        if (auspiceKey !== "philodox") continue;
        
        const swornFoeEff = getSwornFoeEffect(attacker, garouActor.uuid);
        if (!swornFoeEff) continue;
        
        const riderItem = garouActor.items.find(i => 
          i.getFlag(GAROU.scope, "riderFor") === GAROU.featureKey &&
          i.getFlag(GAROU.scope, "auspice") === "philodox"
        );
        if (!riderItem) continue;
        
        if (!garouActor.isOwner && !game.user.isGM) continue;
        
        const ok = await new Promise(resolve => {
          new Dialog({
            title: "Oath of Vengeance — Philodox",
            content: `<p>Your Sworn Foe <b>${attacker.name}</b> is attacking <b>${targetActor.name}</b>.</p><p>Use your reaction to impose <b>disadvantage</b> on this attack?</p>`,
            buttons: {
              yes: { icon: '<i class="fas fa-shield-alt"></i>', label: "Impose Disadvantage", callback: () => resolve(true) },
              no:  { icon: '<i class="fas fa-times"></i>', label: "No", callback: () => resolve(false) },
            },
            default: "yes",
            close: () => resolve(false),
          }).render(true);
        });
        
        if (ok) {
          workflow.disadvantage = true;
          ui.notifications?.info?.(`Oath of Vengeance (Philodox): Imposed disadvantage on ${attacker.name}'s attack.`);
        }
      }
    } catch (err) {
      console.error("[garou] Oath of Vengeance Philodox error:", err);
    }
  });
});

// Galliard: When reduce Sworn Foe to 0 HP, ally within 30ft gains PB temp HP
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  
  Hooks.on("midi-qol.preTargetDamageApplication", async (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return;
      const attacker = workflow.actor;
      if (!hasOathOfVengeance(attacker)) return;
      
      const auspiceKey = getActorAuspiceKey(attacker);
      if (auspiceKey !== "galliard") return;
      
      const damageTargets = Array.from(workflow.damageTargets ?? []);
      if (damageTargets.length === 0) return;
      
      for (const dt of damageTargets) {
        const targetActor = dt.token?.actor;
        if (!targetActor) continue;
        
        const swornFoeEff = getSwornFoeEffect(targetActor, attacker.uuid);
        if (!swornFoeEff) continue;
        
        const currentHP = targetActor.system?.attributes?.hp?.value ?? 0;
        const damageTotal = dt.damageDetail?.total ?? 0;
        if (currentHP - damageTotal > 0) continue; // Won't be reduced to 0
        
        const attackerToken = canvas.tokens?.placeables?.find(t => t.actor === attacker);
        if (!attackerToken) continue;
        
        const eligibleTokens = canvas.tokens?.placeables?.filter(t => {
          if (!t.actor) return false;
          if (distanceBetween(attackerToken, t) > 30) return false;
          const disposition = t.document?.disposition ?? 0;
          return disposition >= 0 || t.id === attackerToken.id;
        }) ?? [];
        
        if (eligibleTokens.length === 0) continue;
        
        const options = eligibleTokens.map(t => ({
          id: t.id,
          name: t.name || t.actor?.name || "Unknown",
          actorId: t.actor?.id,
        }));
        
        if (!attacker.isOwner && !game.user.isGM) continue;
        
        const selected = await new Promise(resolve => {
          const listHtml = options.map(o =>
            "<label style=\"display: block; margin: 4px 0;\">" +
            "<input type=\"radio\" name=\"oath-galliard-ally\" value=\"" + (o.actorId ?? "") + "\" /> " +
            (o.name ?? "Unknown") +
            "</label>"
          ).join("");
          const content =
            "<p>You reduced your Sworn Foe to 0 hit points.</p>" +
            "<p>Choose <b>one</b> ally within 30 feet to gain temporary hit points equal to your proficiency bonus.</p>" +
            "<div class=\"form-group\"><label>Ally:</label>" +
            "<div style=\"max-height: 200px; overflow-y: auto;\">" + listHtml + "</div></div>";
          new Dialog({
            title: "Oath of Vengeance — Galliard",
            content,
            buttons: {
              ok: {
                icon: '<i class="fas fa-check"></i>',
                label: "Grant Temp HP",
                callback: (html) => {
                  const radio = html[0].querySelector("input[name='oath-galliard-ally']:checked");
                  if (!radio) {
                    ui.notifications?.warn?.("Select one ally.");
                    resolve(null);
                    return;
                  }
                  resolve({ actorId: radio.value });
                },
              },
              cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: "Cancel",
                callback: () => resolve(null),
              },
            },
            default: "ok",
            close: () => resolve(null),
          }).render(true);
        });
        
        if (selected) {
          const allyActor = game.actors.get(selected.actorId);
          if (allyActor) {
            const pb = Number(attacker.system?.attributes?.prof ?? 2) || 2;
            const currentTemp = Number(allyActor.system?.attributes?.hp?.temp ?? 0) || 0;
            const newTemp = Math.max(currentTemp, pb);
            await allyActor.update({ "system.attributes.hp.temp": newTemp });
            ui.notifications?.info?.(`Oath of Vengeance (Galliard): ${allyActor.name} gains ${pb} temporary hit points.`);
          }
        }
      }
    } catch (err) {
      console.error("[garou] Oath of Vengeance Galliard error:", err);
    }
  });
});

// Ahroun: Once per turn, add PB to damage of first hit vs Sworn Foe
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  
  Hooks.on("midi-qol.DamageBonus", async (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return {};
      const attacker = workflow.actor;
      if (!hasOathOfVengeance(attacker)) return {};
      if (!isRaging(attacker)) return {};
      
      const auspiceKey = getActorAuspiceKey(attacker);
      if (auspiceKey !== "ahroun") return {};
      
      const targets = Array.from(workflow.hitTargets ?? []);
      if (targets.length === 0) return {};
      const targetActor = targets[0].actor;
      if (!targetActor) return {};
      
      const swornFoeEff = getSwornFoeEffect(targetActor, attacker.uuid);
      if (!swornFoeEff) return {};
      
      const turnKey = game.combat ? `${game.combat.round}.${game.combat.turn}` : `no-combat.${Math.floor(game.time.worldTime)}`;
      const usedThisTurn = attacker.getFlag(GAROU.scope, "oathOfVengeanceAhrounTurn") === turnKey;
      if (usedThisTurn) return {};
      
      const pb = Number(attacker.system?.attributes?.prof ?? 2) || 2;
      await attacker.setFlag(GAROU.scope, "oathOfVengeanceAhrounTurn", turnKey);
      
      return { damageRoll: String(pb), flavor: "Oath of Vengeance (Ahroun)" };
    } catch (err) {
      console.error("[garou] Oath of Vengeance Ahroun error:", err);
      return {};
    }
  });
});

// ---- Turn-end cleanup: remove Sworn Foe effect when duration expires (until end of next turn) ----
let _lastCombatStateOath = {};
Hooks.on("updateCombat", (combat, update, options) => {
  const turnChanged = "turn" in update || "round" in update;
  if (!turnChanged || !combat?.combatants?.size) return;
  const key = combat.id;
  const prev = _lastCombatStateOath[key];
  const contents = combat.combatants?.contents ?? [];
  if (prev != null && contents.length) {
    const combatantWhoseTurnEnded = contents[prev.turn];
    if (combatantWhoseTurnEnded?.actor) {
      const garouActor = combatantWhoseTurnEnded.actor;
      if (hasOathOfVengeance(garouActor)) {
        const swornFoeEffs = [];
        for (const t of canvas.tokens?.placeables ?? []) {
          const a = t.actor;
          if (!a) continue;
          const eff = getSwornFoeEffect(a, garouActor.uuid);
          if (eff) {
            const state = eff.getFlag(GAROU.scope, GAROU.flagKey) ?? {};
            const markedAtRound = state.markedAtRound ?? null;
            const markedAtTurn = state.markedAtTurn ?? null;
            if (markedAtRound !== null && markedAtTurn !== null) {
              const currentRound = combat.round;
              const currentTurn = combat.turn;
              // Expires at end of next turn: marked on turn X → expires at end of turn X+1
              const roundsSinceMarked = currentRound - markedAtRound;
              const turnsSinceMarked = currentTurn - markedAtTurn;
              // Expired if: different round (roundsSinceMarked >= 1), or same round but 2+ turns later (turnsSinceMarked > 1)
              if (roundsSinceMarked >= 1 || (roundsSinceMarked === 0 && turnsSinceMarked > 1)) {
                swornFoeEffs.push({ actor: a, effectId: eff.id });
              }
            }
          }
        }
        for (const { actor, effectId } of swornFoeEffs) {
          actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]).catch(() => {});
        }
      }
    }
  }
  _lastCombatStateOath[key] = { round: combat.round, turn: combat.turn };
});
