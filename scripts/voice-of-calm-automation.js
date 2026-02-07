// scripts/voice-of-calm-automation.js
// Voice of Calm (Children of Gaia 3): Bonus action, choose one creature within 30 ft; until end of that creature's next turn:
// - Advantage on saves vs frightened or charmed
// - If raging, advantage on next Frenzy/loss-of-control check
// Uses: 1/short or long rest. Auspice riders: Ragabash, Theurge, Philodox, Galliard, Ahroun.
// Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "voiceOfCalm",
  baseEffectName: "Voice of Calm — Base",
  effectName: "Voice of Calm",
  flagKey: "voiceOfCalm",
};

const VALID_AUSPICES = new Set(["ragabash", "theurge", "philodox", "galliard", "ahroun"]);
const AHOUN_DAMAGE_BONUS = 2;

function getActorAuspiceKey(actor) {
  if (!actor?.items) return null;
  const auspiceItem = actor.items.find(i => {
    const key = i.getFlag(GAROU.scope, "auspice");
    return typeof key === "string" && VALID_AUSPICES.has(key.toLowerCase());
  });
  return auspiceItem ? auspiceItem.getFlag(GAROU.scope, "auspice").toLowerCase() : null;
}

function hasVoiceOfCalm(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function hasVoiceOfCalmRider(actor, auspiceKey) {
  return actor?.items?.some(i =>
    i.getFlag(GAROU.scope, "riderFor") === GAROU.featureKey &&
    (i.getFlag(GAROU.scope, "auspice") || "").toLowerCase() === auspiceKey
  );
}

function getVoiceOfCalmEffect(actor) {
  return actor?.effects?.find(e =>
    !e.disabled && (e.name === GAROU.baseEffectName || e.getFlag(GAROU.scope, GAROU.flagKey))
  ) ?? null;
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

function isSaveVsFrightenedOrCharmed(workflow) {
  if (!workflow) return false;
  const name = (workflow.item?.name ?? workflow.origin?.name ?? "").toLowerCase();
  const desc = (workflow.item?.system?.description?.value ?? workflow.origin?.system?.description?.value ?? "").toLowerCase();
  if (name.includes("charm") || name.includes("frighten") || name.includes("fear")) return true;
  if (desc.includes("charmed") || desc.includes("frightened")) return true;
  return false;
}

function isSaveVsSpellOrSupernatural(workflow) {
  if (!workflow) return false;
  const origin = workflow.origin ?? workflow.item;
  const type = origin?.type ?? "";
  if (type === "spell") return true;
  const desc = (workflow.item?.system?.description?.value ?? origin?.system?.description?.value ?? "").toLowerCase();
  if (desc.includes("spell") || desc.includes("supernatural") || desc.includes("magic")) return true;
  return false;
}

// Resolve effect.origin to the Garou actor who used Voice of Calm
async function getSourceActorFromEffect(effect) {
  const origin = effect?.origin;
  if (!origin) return null;
  const doc = await fromUuid(origin).catch(() => null);
  if (!doc) return null;
  if (doc.constructor?.name === "Actor") return doc;
  if (doc.parent?.constructor?.name === "Actor") return doc.parent;
  // Origin may be compendium Item; find an actor who has Voice of Calm and used it (e.g. has this item)
  const itemUuid = doc.uuid ?? origin;
  const garou = game.actors?.contents?.find(a =>
    a.items?.some(i => (i.uuid === itemUuid || (i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey && i.name === "Voice of Calm")))
  );
  return garou ?? null;
}

// Tokens within 10 feet of the given token (excluding self)
function getTokensWithin10Feet(ofToken) {
  if (!canvas?.tokens?.placeables || !ofToken) return [];
  const out = [];
  for (const t of canvas.tokens.placeables) {
    if (!t.actor) continue;
    if (t.actor.uuid === ofToken.actor?.uuid) continue;
    if (distanceBetween(ofToken, t) > 10) continue;
    out.push(t);
  }
  return out;
}

// ---- When "Voice of Calm — Base" effect is created on a target ----
Hooks.on("createActiveEffect", async (effect, options) => {
  try {
    if (!effect?.parent || effect.parent.documentName !== "Actor") return;
    const name = (effect.name ?? "").trim();
    if (name !== GAROU.baseEffectName) return;

    const targetActor = effect.parent;
    const garouActor = await getSourceActorFromEffect(effect);
    if (!garouActor || !hasVoiceOfCalm(garouActor)) return;

    const auspiceKey = getActorAuspiceKey(garouActor);
    if (!auspiceKey) return;

    // Store source and rider on effect for later hooks
    const flagData = {
      [GAROU.flagKey]: true,
      sourceActorUuid: garouActor.uuid,
      auspiceKey,
    };
    if (auspiceKey === "theurge") flagData.theurgeAdvantageNext = true;
    await effect.update({
      "flags.-=garou": null,
      [`flags.${GAROU.scope}`]: flagData,
    }).catch(() => {});

    const targetToken = canvas.tokens?.placeables?.find(t => t.actor === targetActor);
    const garouToken = canvas.tokens?.placeables?.find(t => t.actor === garouActor);
    const isOwner = garouActor.isOwner || game.user.isGM;

    // Ragabash: target may immediately move 10 ft without provoking OA
    if (hasVoiceOfCalmRider(garouActor, "ragabash") && isOwner) {
      new Dialog({
        title: "Voice of Calm — Ragabash",
        content: `<p><b>${targetActor.name}</b> may immediately move up to 10 feet without provoking opportunity attacks.</p>`,
        buttons: {
          ok: { icon: '<i class="fas fa-check"></i>', label: "OK", callback: () => {} },
        },
        default: "ok",
      }).render(true);
    }

    // Galliard: one additional creature within 10 ft of target gains base benefits
    if (hasVoiceOfCalmRider(garouActor, "galliard") && targetToken && isOwner) {
      const nearby = getTokensWithin10Feet(targetToken);
      if (nearby.length > 0) {
        const options = nearby.map(t => `<option value="${t.actor.uuid}">${t.actor.name}</option>`).join("");
        const chosen = await new Promise(resolve => {
          new Dialog({
            title: "Voice of Calm — Galliard",
            content: `<p>One additional creature within 10 feet of <b>${targetActor.name}</b> also gains Voice of Calm benefits.</p><select id="voc-galliard-ally" style="width:100%;margin-top:8px;">${options}</select>`,
            buttons: {
              ok: { icon: '<i class="fas fa-check"></i>', label: "Grant", callback: (html) => resolve(html.find("#voc-galliard-ally").val()) },
              no: { icon: '<i class="fas fa-times"></i>', label: "Skip", callback: () => resolve(null) },
            },
            default: "ok",
            close: () => resolve(null),
          }).render(true);
        });
        if (chosen) {
          const doc = await fromUuid(chosen).catch(() => null);
          const allyActor = doc?.actor ?? doc;
          if (allyActor?.createEmbeddedDocuments) {
            const combat = game.combat;
            const riderFlags = {
              [GAROU.flagKey]: true,
              sourceActorUuid: garouActor.uuid,
              auspiceKey,
              galliardSecondary: true,
            };
            if (auspiceKey === "theurge") riderFlags.theurgeAdvantageNext = true;
            const effectData = {
              name: GAROU.effectName,
              icon: "icons/svg/aura.svg",
              origin: garouActor.uuid,
              disabled: false,
              duration: { rounds: 2, turns: 0, seconds: null, startRound: combat?.round ?? null, startTurn: combat?.turn ?? null, startTime: game.time.worldTime ?? null },
              flags: { [GAROU.scope]: riderFlags },
            };
            await allyActor.createEmbeddedDocuments("ActiveEffect", [effectData]);
            ui.notifications?.info?.(`${allyActor.name} gains Voice of Calm benefits (Galliard).`);
          }
        }
      }
    }
  } catch (err) {
    console.error("[garou] Voice of Calm createActiveEffect error:", err);
  }
});

// ---- Base: advantage on saves vs frightened or charmed ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      if (!getVoiceOfCalmEffect(actor)) return;
      if (!isSaveVsFrightenedOrCharmed(workflow)) return;
      workflow.advantage = true;
    } catch (err) {
      console.error("[garou] Voice of Calm base save advantage error:", err);
    }
  });
});

// ---- Theurge: advantage on next save vs spell or supernatural (one-time) ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      const eff = getVoiceOfCalmEffect(actor);
      if (!eff) return;
      if (eff.getFlag(GAROU.scope, "auspiceKey") !== "theurge") return;
      if (!eff.getFlag(GAROU.scope, "theurgeAdvantageNext")) return;
      if (!isSaveVsSpellOrSupernatural(workflow)) return;
      workflow.advantage = true;
      eff.update({ [`flags.${GAROU.scope}.theurgeAdvantageNext`]: false }).catch(() => {});
    } catch (err) {
      console.error("[garou] Voice of Calm Theurge error:", err);
    }
  });
});

// ---- Philodox: if target fails a save during duration, may reroll once ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.RollComplete", async (workflow) => {
    try {
      if (!workflow?.actor) return;
      const isSave = workflow.saveDC != null || workflow.saveRoll != null || (workflow.item?.type === "save");
      if (!isSave) return;
      const actor = workflow.actor;
      const eff = getVoiceOfCalmEffect(actor);
      if (!eff) return;
      if (eff.getFlag(GAROU.scope, "auspiceKey") !== "philodox") return;
      if (eff.getFlag(GAROU.scope, "philodoxRerollUsed")) return;
      const roll = workflow.roll ?? workflow.saveRoll;
      if (!roll) return;
      const dc = workflow.dc ?? workflow.saveDC;
      if (dc == null) return;
      const failed = roll.total < dc;
      if (!failed) return;
      if (!actor.isOwner && !game.user.isGM) return;

      const ok = await new Promise(resolve => {
        new Dialog({
          title: "Voice of Calm — Philodox",
          content: `<p><b>${actor.name}</b> failed a saving throw while under Voice of Calm.</p><p>Reroll the save and take the new result? (Once per use)</p>`,
          buttons: {
            yes: { icon: '<i class="fas fa-dice"></i>', label: "Reroll", callback: () => resolve(true) },
            no: { icon: '<i class="fas fa-times"></i>', label: "No", callback: () => resolve(false) },
          },
          default: "yes",
          close: () => resolve(false),
        }).render(true);
      });
      if (ok) {
        await eff.update({ [`flags.${GAROU.scope}.philodoxRerollUsed`]: true }).catch(() => {});
        const newRoll = await new Roll(roll.formula).evaluate();
        await newRoll.toMessage({
          flavor: "Voice of Calm (Philodox) — reroll",
          speaker: ChatMessage.getSpeaker({ actor }),
        });
        if (workflow.saveRoll) workflow.saveRoll = newRoll;
        if (workflow.roll) workflow.roll = newRoll;
      }
    } catch (err) {
      console.error("[garou] Voice of Calm Philodox error:", err);
    }
  });
});

// ---- Ahroun: if target attacks during duration, +2 damage ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;

  Hooks.on("midi-qol.DamageBonus", async (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return {};
      const attacker = workflow.actor;
      const eff = getVoiceOfCalmEffect(attacker);
      if (!eff) return {};
      if (eff.getFlag(GAROU.scope, "auspiceKey") !== "ahroun") return {};
      return { damageRoll: String(AHOUN_DAMAGE_BONUS), flavor: "Voice of Calm (Ahroun)" };
    } catch (err) {
      console.error("[garou] Voice of Calm Ahroun error:", err);
      return {};
    }
  });
});
