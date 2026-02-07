// scripts/wild-inspiration-automation.js
// Wild Inspiration (Fianna 3): Bonus action, choose one creature within 30 ft; until end of that creature's next turn:
// - +1 to attack rolls and saving throws
// - If the creature reduces an enemy to 0 HP, it gains temp HP = your PB
// Uses: 1/short or long rest. Auspice riders: Ragabash, Theurge, Philodox, Galliard, Ahroun.
// Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "wildInspiration",
  baseEffectName: "Wild Inspiration — Active",
  effectName: "Wild Inspiration",
  flagKey: "wildInspiration",
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

function hasWildInspiration(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function hasWildInspirationRider(actor, auspiceKey) {
  return actor?.items?.some(i =>
    i.getFlag(GAROU.scope, "riderFor") === GAROU.featureKey &&
    (i.getFlag(GAROU.scope, "auspice") || "").toLowerCase() === auspiceKey
  );
}

function getWildInspirationEffect(actor) {
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

function isSaveVsSpellOrSupernatural(workflow) {
  if (!workflow) return false;
  const origin = workflow.origin ?? workflow.item;
  const type = origin?.type ?? "";
  if (type === "spell") return true;
  const desc = (workflow.item?.system?.description?.value ?? origin?.system?.description?.value ?? "").toLowerCase();
  return desc.includes("spell") || desc.includes("supernatural") || desc.includes("magic");
}

async function getSourceActorFromEffect(effect) {
  const origin = effect?.origin;
  if (!origin) return null;
  const doc = await fromUuid(origin).catch(() => null);
  if (!doc) return null;
  if (doc.constructor?.name === "Actor") return doc;
  if (doc.parent?.constructor?.name === "Actor") return doc.parent;
  const sourceUuid = effect.getFlag(GAROU.scope, "sourceActorUuid");
  if (sourceUuid) {
    const a = await fromUuid(sourceUuid).catch(() => null);
    if (a?.constructor?.name === "Actor") return a;
  }
  return game.actors?.contents?.find(a =>
    a.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey && i.name === "Wild Inspiration")
  ) ?? null;
}

function getTokensWithin10Feet(ofToken) {
  if (!canvas?.tokens?.placeables || !ofToken) return [];
  const out = [];
  for (const t of canvas.tokens.placeables) {
    if (!t.actor || t.actor.uuid === ofToken.actor?.uuid) continue;
    if (distanceBetween(ofToken, t) > 10) continue;
    out.push(t);
  }
  return out;
}

// ---- When "Wild Inspiration — Active" effect is created on a target ----
Hooks.on("createActiveEffect", async (effect, options) => {
  try {
    if (!effect?.parent || effect.parent.documentName !== "Actor") return;
    const name = (effect.name ?? "").trim();
    if (name !== GAROU.baseEffectName) return;

    const targetActor = effect.parent;
    const garouActor = await getSourceActorFromEffect(effect);
    if (!garouActor || !hasWildInspiration(garouActor)) return;

    const auspiceKey = getActorAuspiceKey(garouActor);
    if (!auspiceKey) return;

    const flagData = {
      [GAROU.flagKey]: true,
      sourceActorUuid: garouActor.uuid,
      auspiceKey,
    };
    if (auspiceKey === "theurge") flagData.theurgeAdvantageNext = true;
    if (auspiceKey === "philodox") flagData.philodoxAdvantageNext = true;
    await effect.update({
      "flags.-=garou": null,
      [`flags.${GAROU.scope}`]: flagData,
    }).catch(() => {});

    const targetToken = canvas.tokens?.placeables?.find(t => t.actor === targetActor);
    const isOwner = garouActor.isOwner || game.user.isGM;

    if (hasWildInspirationRider(garouActor, "ragabash") && isOwner) {
      new Dialog({
        title: "Wild Inspiration — Ragabash",
        content: `<p><b>${targetActor.name}</b> may immediately move up to 10 feet without provoking opportunity attacks.</p>`,
        buttons: { ok: { icon: '<i class="fas fa-check"></i>', label: "OK", callback: () => {} } },
        default: "ok",
      }).render(true);
    }

    if (hasWildInspirationRider(garouActor, "galliard") && targetToken && isOwner) {
      const nearby = getTokensWithin10Feet(targetToken);
      if (nearby.length > 0) {
        const options = nearby.map(t => `<option value="${t.actor.uuid}">${t.actor.name}</option>`).join("");
        const chosen = await new Promise(resolve => {
          new Dialog({
            title: "Wild Inspiration — Galliard",
            content: `<p>Choose a second creature within 10 feet of <b>${targetActor.name}</b> to also gain Wild Inspiration benefits.</p><select id="wi-galliard-ally" style="width:100%;margin-top:8px;">${options}</select>`,
            buttons: {
              ok: { icon: '<i class="fas fa-check"></i>', label: "Grant", callback: (html) => resolve(html.find("#wi-galliard-ally").val()) },
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
            if (auspiceKey === "philodox") riderFlags.philodoxAdvantageNext = true;
            await allyActor.createEmbeddedDocuments("ActiveEffect", [{
              name: GAROU.effectName,
              icon: "icons/svg/aura.svg",
              origin: garouActor.uuid,
              disabled: false,
              duration: { rounds: 2, turns: 0, seconds: null, startRound: combat?.round ?? null, startTurn: combat?.turn ?? null, startTime: game.time.worldTime ?? null },
              flags: { [GAROU.scope]: riderFlags },
            }]);
            ui.notifications?.info?.(`${allyActor.name} gains Wild Inspiration benefits (Galliard).`);
          }
        }
      }
    }
  } catch (err) {
    console.error("[garou] Wild Inspiration createActiveEffect error:", err);
  }
});

// ---- Base: +1 to attack rolls ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.AttackRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor || !getWildInspirationEffect(actor)) return;
      workflow.attackBonus = (workflow.attackBonus || 0) + 1;
    } catch (err) {
      console.error("[garou] Wild Inspiration attack bonus error:", err);
    }
  });
});

// ---- Base: +1 to saving throws ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor || !getWildInspirationEffect(actor)) return;
      workflow.bonus = (workflow.bonus ?? 0) + 1;
    } catch (err) {
      console.error("[garou] Wild Inspiration save bonus error:", err);
    }
  });
});

// ---- Base: when creature with effect reduces enemy to 0 HP, grant temp HP = source's PB ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.preTargetDamageApplication", async (workflow) => {
    try {
      const attacker = workflow?.actor;
      if (!attacker) return;
      const eff = getWildInspirationEffect(attacker);
      if (!eff) return;

      const sourceUuid = eff.getFlag(GAROU.scope, "sourceActorUuid");
      const sourceActor = sourceUuid ? await fromUuid(sourceUuid).catch(() => null) : null;
      const pb = sourceActor?.system?.attributes?.prof ?? 2;

      const damageTargets = Array.from(workflow.damageTargets ?? []);
      for (const dt of damageTargets) {
        const targetActor = dt.token?.actor;
        if (!targetActor) continue;
        const currentHP = Number(targetActor.system?.attributes?.hp?.value ?? 0);
        const damageTotal = Number(dt.damageDetail?.total ?? dt.damage ?? 0);
        if (currentHP - damageTotal > 0) continue;

        const curTemp = Number(attacker.system?.attributes?.hp?.temp) ?? 0;
        const newTemp = Math.max(curTemp, pb);
        await attacker.update({ "system.attributes.hp.temp": newTemp });
        ui.notifications?.info?.(`${attacker.name} gains ${pb} temporary hit points (Wild Inspiration — reduced an enemy to 0 HP).`);
        return;
      }
    } catch (err) {
      console.error("[garou] Wild Inspiration temp HP on kill error:", err);
    }
  });
});

// ---- Theurge: advantage on next save vs spell/supernatural ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      const eff = getWildInspirationEffect(actor);
      if (!eff || eff.getFlag(GAROU.scope, "auspiceKey") !== "theurge") return;
      if (!eff.getFlag(GAROU.scope, "theurgeAdvantageNext") || !isSaveVsSpellOrSupernatural(workflow)) return;
      workflow.advantage = true;
      eff.update({ [`flags.${GAROU.scope}.theurgeAdvantageNext`]: false }).catch(() => {});
    } catch (err) {
      console.error("[garou] Wild Inspiration Theurge error:", err);
    }
  });
});

// ---- Philodox: advantage on next contested ability check ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.AbilityCheckRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      const eff = getWildInspirationEffect(actor);
      if (!eff || eff.getFlag(GAROU.scope, "auspiceKey") !== "philodox") return;
      if (!eff.getFlag(GAROU.scope, "philodoxAdvantageNext")) return;
      workflow.advantage = true;
      eff.update({ [`flags.${GAROU.scope}.philodoxAdvantageNext`]: false }).catch(() => {});
    } catch (err) {
      console.error("[garou] Wild Inspiration Philodox error:", err);
    }
  });
});

// ---- Ahroun: +2 damage on first successful hit during duration ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.DamageBonus", async (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return {};
      const attacker = workflow.actor;
      const eff = getWildInspirationEffect(attacker);
      if (!eff || eff.getFlag(GAROU.scope, "auspiceKey") !== "ahroun") return {};
      if (eff.getFlag(GAROU.scope, "ahrounUsed")) return {};

      const hitTargets = Array.from(workflow.hitTargets ?? []);
      if (hitTargets.length === 0) return {};

      await eff.update({ [`flags.${GAROU.scope}.ahrounUsed`]: true }).catch(() => {});
      return { damageRoll: String(AHOUN_DAMAGE_BONUS), flavor: "Wild Inspiration (Ahroun)" };
    } catch (err) {
      console.error("[garou] Wild Inspiration Ahroun error:", err);
      return {};
    }
  });
});
