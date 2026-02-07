// scripts/echoes-of-glory-automation.js
// Echoes of Glory (Fianna 11): When you reduce a creature to 0 HP, choose one creature within 30 ft.
// Until end of that creature's next turn: ally → advantage on next save; hostile → disadvantage on next attack.
// 1/short or long rest. Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "echoesOfGlory",
  effectName: "Echoes of Glory",
};

function hasEchoesOfGlory(actor) {
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

function getTokensWithin30Feet(ofToken) {
  if (!canvas?.tokens?.placeables || !ofToken) return [];
  const out = [];
  for (const t of canvas.tokens.placeables) {
    if (!t.actor) continue;
    if (distanceBetween(ofToken, t) > 30) continue;
    out.push(t);
  }
  return out;
}

Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;

  Hooks.on("midi-qol.preTargetDamageApplication", async (workflow) => {
    try {
      const attacker = workflow?.actor;
      if (!attacker || !hasEchoesOfGlory(attacker)) return;
      if (getRemainingUses(attacker) <= 0) return;

      const attackerToken = canvas.tokens?.placeables?.find(t => t.actor === attacker);
      if (!attackerToken) return;

      const damageTargets = Array.from(workflow.damageTargets ?? []);
      let reducedToZero = false;
      for (const dt of damageTargets) {
        const targetActor = dt.token?.actor;
        if (!targetActor) continue;
        const currentHP = Number(targetActor.system?.attributes?.hp?.value ?? 0);
        const damageTotal = Number(dt.damageDetail?.total ?? dt.damage ?? 0);
        if (currentHP - damageTotal <= 0) {
          reducedToZero = true;
          break;
        }
      }
      if (!reducedToZero) return;

      const candidates = getTokensWithin30Feet(attackerToken).filter(t => t.actor?.uuid !== attacker.uuid);
      if (candidates.length === 0) return;
      if (!attacker.isOwner && !game.user.isGM) return;

      const options = candidates.map(t => ({
        uuid: t.actor.uuid,
        name: t.actor.name ?? "Unknown",
        disposition: t.document?.disposition ?? 0,
      }));

      const chosen = await new Promise(resolve => {
        const selectOptions = options.map(o =>
          `<option value="${o.uuid}" data-hostile="${o.disposition < 0}">${o.name}${o.disposition < 0 ? " (hostile)" : " (ally)"}</option>`
        ).join("");
        new Dialog({
          title: "Echoes of Glory",
          content:
            `<p>You reduced a creature to 0 hit points. Choose <b>one creature within 30 feet</b>:</p>` +
            `<p>Until end of that creature's next turn — <b>ally</b>: advantage on next save; <b>hostile</b>: disadvantage on next attack.</p>` +
            `<select id="echoes-target" style="width:100%;margin-top:8px;">${selectOptions}</select>`,
          buttons: {
            ok: {
              icon: '<i class="fas fa-check"></i>',
              label: "Apply",
              callback: (html) => {
                const sel = html[0].querySelector("#echoes-target");
                const opt = sel?.selectedOptions?.[0];
                if (!sel?.value) {
                  resolve(null);
                  return;
                }
                resolve({ uuid: sel.value, hostile: opt?.dataset?.hostile === "true" });
              },
            },
            cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) },
          },
          default: "ok",
          close: () => resolve(null),
        }).render(true);
      });

      if (!chosen) return;

      const doc = await fromUuid(chosen.uuid).catch(() => null);
      const targetActor = doc?.actor ?? doc;
      if (!targetActor?.createEmbeddedDocuments) return;

      const featureItem = getFeatureItem(attacker);
      if (featureItem?.system?.uses?.max) {
        await featureItem.update({ "system.uses.spent": (Number(featureItem.system.uses.spent) || 0) + 1 });
      }

      const combat = game.combat;
      const effectData = {
        name: GAROU.effectName,
        icon: "icons/svg/aura.svg",
        origin: attacker.uuid,
        disabled: false,
        duration: {
          rounds: 2,
          startRound: combat?.round ?? null,
          startTurn: combat?.turn ?? null,
          startTime: game.time.worldTime ?? null,
        },
        flags: {
          [GAROU.scope]: {
            echoesOfGloryAlly: !chosen.hostile,
            echoesOfGloryHostile: !!chosen.hostile,
          },
        },
      };
      await targetActor.createEmbeddedDocuments("ActiveEffect", [effectData]);

      if (chosen.hostile) {
        ui.notifications?.info?.(`Echoes of Glory: ${targetActor.name} has disadvantage on their next attack roll.`);
      } else {
        ui.notifications?.info?.(`Echoes of Glory: ${targetActor.name} has advantage on their next saving throw.`);
      }
    } catch (err) {
      console.error("[garou] Echoes of Glory error:", err);
    }
  });
});

// Ally: advantage on next saving throw, then remove effect
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      const eff = actor.effects.find(e =>
        !e.disabled && (e.name === GAROU.effectName && e.getFlag(GAROU.scope, "echoesOfGloryAlly"))
      );
      if (!eff) return;
      workflow.advantage = true;
      eff.delete().catch(() => {});
    } catch (err) {
      console.error("[garou] Echoes of Glory (ally save) error:", err);
    }
  });
});

// Hostile: disadvantage on next attack roll, then remove effect
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.AttackRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      const eff = actor.effects.find(e =>
        !e.disabled && (e.name === GAROU.effectName && e.getFlag(GAROU.scope, "echoesOfGloryHostile"))
      );
      if (!eff) return;
      workflow.disadvantage = true;
      eff.delete().catch(() => {});
    } catch (err) {
      console.error("[garou] Echoes of Glory (hostile attack) error:", err);
    }
  });
});
