// scripts/mantle-of-dread-automation.js
// Mantle of Dread (Shadow Lords 3): While raging, creatures of your choice within 10 feet
// suffer -1 to attack rolls against creatures other than you. Auspice riders: Ragabash, Theurge, Philodox, Galliard, Ahroun.
// Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "mantleOfDread",
  effectName: "Mantle of Dread",
  mantleFlag: "mantleOfDread",
  galliardEffectName: "Mantle of Dread (Galliard - advantage on next save)",
};

const VALID_AUSPICES = new Set(["ragabash", "theurge", "philodox", "galliard", "ahroun"]);
const MANTLE_PENALTY = 1;

function getActorAuspiceKey(actor) {
  if (!actor?.items) return null;
  const auspiceItem = actor.items.find(i => {
    const key = i.getFlag(GAROU.scope, "auspice");
    return typeof key === "string" && VALID_AUSPICES.has(key.toLowerCase());
  });
  return auspiceItem ? auspiceItem.getFlag(GAROU.scope, "auspice").toLowerCase() : null;
}

function hasMantleOfDread(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function isRaging(actor) {
  return actor?.effects?.some(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
}

function hasMantleRider(actor, auspiceKey) {
  return actor?.items?.some(i =>
    i.getFlag(GAROU.scope, "riderFor") === GAROU.featureKey &&
    (i.getFlag(GAROU.scope, "auspice") || "").toLowerCase() === auspiceKey
  );
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

// Shadow Lords with Mantle who are raging, within 10 feet of the given token
function getMantleShadowLordsWithin10Feet(ofToken) {
  if (!canvas?.tokens?.placeables || !ofToken) return [];
  const out = [];
  for (const t of canvas.tokens.placeables) {
    const actor = t.actor;
    if (!actor || !hasMantleOfDread(actor) || !isRaging(actor)) continue;
    if (distanceBetween(ofToken, t) > 10) continue;
    out.push({ token: t, actor });
  }
  return out;
}

// Is this token's actor "affected by Mantle" (within 10 ft of a raging Shadow Lord with Mantle)?
function isAffectedByMantle(token) {
  return getMantleShadowLordsWithin10Feet(token).length > 0;
}

// Is the save vs charmed or frightened?
function isSaveVsCharmedOrFrightened(workflow) {
  if (!workflow) return false;
  const name = (workflow.item?.name ?? workflow.origin?.name ?? "").toLowerCase();
  const desc = (workflow.item?.system?.description?.value ?? workflow.origin?.system?.description?.value ?? "").toLowerCase();
  if (name.includes("charm") || name.includes("frighten") || name.includes("fear")) return true;
  if (desc.includes("charmed") || desc.includes("frightened")) return true;
  return false;
}

function getTurnKey() {
  const c = game.combat;
  if (!c) return `${game.time.worldTime}`;
  return `${c.id}-${c.round}-${c.turn}`;
}

// ---- Base: -1 to attack rolls when attacker within 10 ft and target is not the Shadow Lord ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;

  Hooks.on("midi-qol.AttackRoll", (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return;
      const attacker = workflow.actor;
      const attackerToken = canvas.tokens?.placeables?.find(t => t.actor === attacker);
      if (!attackerToken) return;

      const targets = Array.from(workflow.targets ?? []);
      if (targets.length === 0) return;
      const targetToken = targets[0];
      const targetActor = targetToken?.actor;
      if (!targetActor) return;

      const mantleLords = getMantleShadowLordsWithin10Feet(attackerToken);
      for (const { actor: lordActor } of mantleLords) {
        if (targetActor === lordActor) continue; // Attacker is attacking the Shadow Lord - no penalty
        workflow.attackBonus = (workflow.attackBonus || 0) - MANTLE_PENALTY;
        break; // One application
      }
    } catch (err) {
      console.error("[garou] Mantle of Dread base penalty error:", err);
    }
  });
});

// ---- Ragabash: Once per Rage, when a creature misses due to penalty → move 10 ft without OA ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;

  Hooks.on("midi-qol.RollComplete", async (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return;
      const attacker = workflow.actor;
      const attackerToken = canvas.tokens?.placeables?.find(t => t.actor === attacker);
      if (!attackerToken) return;

      const hitTargets = Array.from(workflow.hitTargets ?? []);
      const missed = hitTargets.length === 0 || !(workflow.hitTargets?.get?.(hitTargets[0]?.id)?.hit ?? hitTargets[0]?.hit);
      if (!missed) return;

      const mantleLords = getMantleShadowLordsWithin10Feet(attackerToken);
      for (const { token: lordToken, actor: lordActor } of mantleLords) {
        if (!hasMantleRider(lordActor, "ragabash")) continue;
        if (!lordActor.isOwner && !game.user.isGM) continue;

        const rageFlag = `mantleRagabashUsed_${lordActor.id}`;
        const used = lordActor.getFlag(GAROU.scope, rageFlag);
        if (used) continue;

        const ok = await new Promise(resolve => {
          new Dialog({
            title: "Mantle of Dread — Ragabash",
            content: `<p><b>${attacker.name}</b> missed an attack while within 10 feet of your Mantle.</p><p>Move up to 10 feet without provoking opportunity attacks? (Once per Rage)</p>`,
            buttons: {
              yes: { icon: '<i class="fas fa-shoe-prints"></i>', label: "Move 10 ft", callback: () => resolve(true) },
              no: { icon: '<i class="fas fa-times"></i>', label: "No", callback: () => resolve(false) },
            },
            default: "yes",
            close: () => resolve(false),
          }).render(true);
        });
        if (ok) {
          await lordActor.setFlag(GAROU.scope, rageFlag, true);
          ui.notifications?.info?.(`Mantle of Dread (Ragabash): You may move 10 feet without provoking opportunity attacks.`);
          // Movement would be manual or via token movement - we just grant the narrative permission / could trigger a small move
        }
        return;
      }
    } catch (err) {
      console.error("[garou] Mantle of Dread Ragabash error:", err);
    }
  });
});

// Reset Ragabash "once per Rage" when rage ends
Hooks.on("updateActor", (actor, changed) => {
  if (!changed.effects) return;
  if (!hasMantleOfDread(actor) || !hasMantleRider(actor, "ragabash")) return;
  const hasRage = actor.effects?.some(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
  if (hasRage) return;
  const flag = `mantleRagabashUsed_${actor.id}`;
  if (actor.getFlag(GAROU.scope, flag)) actor.unsetFlag(GAROU.scope, flag).catch(() => {});
});

// ---- Theurge: While Mantle active, advantage on saves vs charmed or frightened ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;

  Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      if (!hasMantleOfDread(actor)) return;
      if (!isRaging(actor)) return;
      if (!hasMantleRider(actor, "theurge")) return;
      if (!isSaveVsCharmedOrFrightened(workflow)) return;
      workflow.advantage = true;
    } catch (err) {
      console.error("[garou] Mantle of Dread Theurge error:", err);
    }
  });
});

// ---- Philodox: Once per Rage, when creature affected by Mantle targets an ally → reaction impose disadvantage ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;

  Hooks.on("midi-qol.AttackRoll", async (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return;
      const attacker = workflow.actor;
      const attackerToken = canvas.tokens?.placeables?.find(t => t.actor === attacker);
      if (!attackerToken) return;
      if (!isAffectedByMantle(attackerToken)) return;

      const targets = Array.from(workflow.targets ?? []);
      if (targets.length === 0) return;
      const targetToken = targets[0];
      const targetActor = targetToken?.actor;
      if (!targetActor) return;

      const mantleLords = getMantleShadowLordsWithin10Feet(attackerToken);
      for (const { token: lordToken, actor: lordActor } of mantleLords) {
        if (targetActor.uuid === lordActor.uuid) continue;
        const disposition = targetToken.document?.disposition ?? 0;
        if (disposition < 0) continue; // target is enemy, not ally of the Lord
        if (!hasMantleRider(lordActor, "philodox")) continue;
        if (!lordActor.isOwner && !game.user.isGM) continue;
        if (game.combat && MidiQOL.hasUsedReaction(lordActor)) continue;

        const rageFlag = `mantlePhilodoxUsed_${lordActor.id}`;
        if (lordActor.getFlag(GAROU.scope, rageFlag)) continue;

        const ok = await new Promise(resolve => {
          new Dialog({
            title: "Mantle of Dread — Philodox",
            content: `<p>A creature affected by your Mantle is attacking <b>${targetActor.name}</b>.</p><p>Use your reaction to impose <b>disadvantage</b> on this attack?</p>`,
            buttons: {
              yes: { icon: '<i class="fas fa-shield-alt"></i>', label: "Impose Disadvantage", callback: () => resolve(true) },
              no: { icon: '<i class="fas fa-times"></i>', label: "No", callback: () => resolve(false) },
            },
            default: "yes",
            close: () => resolve(false),
          }).render(true);
        });
        if (ok) {
          await lordActor.setFlag(GAROU.scope, rageFlag, true);
          if (game.combat) await MidiQOL.setReactionUsed(lordActor);
          workflow.disadvantage = true;
        }
        return;
      }
    } catch (err) {
      console.error("[garou] Mantle of Dread Philodox error:", err);
    }
  });
});

// Reset Philodox once per Rage when rage ends
Hooks.on("updateActor", (actor, changed) => {
  if (!changed.effects) return;
  if (!hasMantleOfDread(actor) || !hasMantleRider(actor, "philodox")) return;
  const hasRage = actor.effects?.some(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
  if (hasRage) return;
  const flag = `mantlePhilodoxUsed_${actor.id}`;
  if (actor.getFlag(GAROU.scope, flag)) actor.unsetFlag(GAROU.scope, flag).catch(() => {});
});

// ---- Galliard: When Mantle first activates, one ally within 30 ft gains advantage on next save ----
function getAllyTokensWithin30Feet(garouToken) {
  if (!canvas?.tokens?.placeables || !garouToken) return [];
  const placeables = canvas.tokens.placeables;
  const allies = [];
  for (const t of placeables) {
    if (!t.actor || t.actor.uuid === garouToken.actor?.uuid) continue;
    if (distanceBetween(garouToken, t) > 30) continue;
    const disposition = t.document?.disposition ?? 0;
    if (disposition >= 0) allies.push(t);
  }
  return allies;
}

Hooks.on("updateActor", async (actor, changed) => {
  if (!changed.effects || actor.type !== "character") return;
  if (!hasMantleOfDread(actor)) return;
  if (!hasMantleRider(actor, "galliard")) return;

  const effects = actor.effects ?? [];
  const nowRaging = effects.some(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
  const alreadyTriggered = actor.getFlag(GAROU.scope, "mantleGalliardTriggered");
  if (!nowRaging || alreadyTriggered) return;

  const lordToken = canvas.tokens?.placeables?.find(t => t.actor === actor);
  if (!lordToken) return;

  const allies = getAllyTokensWithin30Feet(lordToken);
  if (allies.length === 0) return;

  if (!actor.isOwner && !game.user.isGM) return;

  const allyOptions = allies.map(t => `<option value="${t.actor.uuid}">${t.actor.name}</option>`).join("");
  const content = `<p>Mantle of Dread just activated. Choose one ally within 30 feet to gain <b>advantage on their next saving throw</b>.</p><select id="mantle-galliard-ally" style="width:100%;margin-top:8px;">${allyOptions}</select>`;
  const chosen = await new Promise(resolve => {
    new Dialog({
      title: "Mantle of Dread — Galliard",
      content,
      buttons: {
        ok: { icon: '<i class="fas fa-check"></i>', label: "Grant", callback: (html) => resolve(html.find("#mantle-galliard-ally").val()) },
        no: { icon: '<i class="fas fa-times"></i>', label: "Skip", callback: () => resolve(null) },
      },
      default: "ok",
      close: () => resolve(null),
    }).render(true);
  });
  await actor.setFlag(GAROU.scope, "mantleGalliardTriggered", true);

  if (chosen) {
    const doc = await fromUuid(chosen).catch(() => null);
    const allyActor = doc?.actor ?? doc;
    if (allyActor?.createEmbeddedDocuments) {
      const combat = game.combat;
      const effectData = {
        name: GAROU.galliardEffectName,
        icon: "icons/svg/aura.svg",
        origin: actor.uuid,
        disabled: false,
        duration: { rounds: 999, turns: 0, seconds: null, startRound: combat?.round ?? null, startTurn: combat?.turn ?? null, startTime: game.time.worldTime ?? null },
        flags: { [GAROU.scope]: { mantleGalliardAdvantage: true } },
      };
      await allyActor.createEmbeddedDocuments("ActiveEffect", [effectData]);
      ui.notifications?.info?.(`${allyActor.name} gains advantage on their next saving throw (Mantle of Dread — Galliard).`);
    }
  }
});

// Apply Galliard advantage and remove effect on first save
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
    const actor = workflow?.actor;
    if (!actor) return;
    const eff = actor.effects.find(e => e.name === GAROU.galliardEffectName && e.getFlag(GAROU.scope, "mantleGalliardAdvantage"));
    if (!eff) return;
    workflow.advantage = true;
    eff.delete().catch(() => {});
  });
});

// Reset Galliard "first activates" when rage ends
Hooks.on("updateActor", (actor, changed) => {
  if (!changed.effects) return;
  if (!hasMantleOfDread(actor) || !hasMantleRider(actor, "galliard")) return;
  const hasRage = actor.effects?.some(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
  if (hasRage) return;
  if (actor.getFlag(GAROU.scope, "mantleGalliardTriggered")) actor.unsetFlag(GAROU.scope, "mantleGalliardTriggered").catch(() => {});
});

// ---- Ahroun: Once per turn, when you hit a creature affected by Mantle → extra damage PB ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;

  Hooks.on("midi-qol.DamageBonus", async (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return {};
      const attacker = workflow.actor;
      if (!hasMantleOfDread(attacker)) return {};
      if (!isRaging(attacker)) return {};
      if (!hasMantleRider(attacker, "ahroun")) return {};

      const turnKey = getTurnKey();
      if (attacker.getFlag(GAROU.scope, "mantleAhrounTurn") === turnKey) return {};

      const targets = Array.from(workflow.hitTargets ?? []);
      if (targets.length === 0) return {};
      const targetToken = targets[0];
      if (!targetToken || !isAffectedByMantle(targetToken)) return {};

      const pb = attacker.system?.attributes?.prof ?? 2;
      await attacker.setFlag(GAROU.scope, "mantleAhrounTurn", turnKey);
      return { damageRoll: String(pb), flavor: "Mantle of Dread (Ahroun)" };
    } catch (err) {
      console.error("[garou] Mantle of Dread Ahroun error:", err);
      return {};
    }
  });
});
