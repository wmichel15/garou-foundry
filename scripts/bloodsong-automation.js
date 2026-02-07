// scripts/bloodsong-automation.js
// Bloodsong (Fianna 6): While raging, when a creature you can see within 30 feet is reduced to 0 HP,
// choose one: (1) You gain temp HP = PB, or (2) One ally within 30 ft gains advantage on their next attack.
// Once per turn. Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "bloodsong",
  allyAdvantageEffectName: "Bloodsong — Advantage on Next Attack",
};

function hasBloodsong(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function isRaging(actor) {
  return actor?.effects?.some(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
}

function getTurnKey() {
  const c = game.combat;
  if (!c) return `${game.time.worldTime}`;
  return `${c.id}-${c.round}-${c.turn}`;
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
      const damageTargets = Array.from(workflow.damageTargets ?? []);
      for (const dt of damageTargets) {
        const targetToken = dt.token;
        const targetActor = targetToken?.actor;
        if (!targetActor) continue;

        const currentHP = Number(targetActor.system?.attributes?.hp?.value ?? 0);
        const damageTotal = Number(dt.damageDetail?.total ?? dt.damage ?? 0);
        if (currentHP - damageTotal > 0) continue;

        const turnKey = getTurnKey();
        const nearbyTokens = getTokensWithin30Feet(targetToken);

        for (const t of nearbyTokens) {
          const fianna = t.actor;
          if (!hasBloodsong(fianna) || !isRaging(fianna)) continue;
          if (fianna.getFlag(GAROU.scope, "bloodsongTurn") === turnKey) continue;
          if (!fianna.isOwner && !game.user.isGM) continue;

          const pb = Number(fianna.system?.attributes?.prof ?? 2) || 2;
          const alliesWithin30 = getTokensWithin30Feet(t).filter(
            other => other.actor && other.actor.uuid !== fianna.uuid && (other.document?.disposition ?? 0) >= 0
          );

          const choice = await new Promise(resolve => {
            const allyOptions = alliesWithin30.length > 0
              ? alliesWithin30.map(a => `<option value="${a.actor.uuid}">${a.actor.name}</option>`).join("")
              : "";
            const content =
              `<p>A creature within 30 feet was reduced to 0 hit points. <b>Bloodsong</b> (once per turn):</p>` +
              `<p><label><input type="radio" name="bloodsong-choice" value="temp" /> You gain <b>${pb} temporary hit points</b></label></p>` +
              (allyOptions
                ? `<p><label><input type="radio" name="bloodsong-choice" value="ally" /> One ally within 30 ft gains <b>advantage on their next attack roll</b></label></p>` +
                  `<select id="bloodsong-ally" style="width:100%;margin-top:4px;">${allyOptions}</select>`
                : "") +
              `<p><label><input type="radio" name="bloodsong-choice" value="skip" /> Skip</label></p>`;
            new Dialog({
              title: "Bloodsong",
              content,
              buttons: {
                ok: {
                  icon: '<i class="fas fa-check"></i>',
                  label: "Apply",
                  callback: (html) => {
                    const radio = html[0].querySelector("input[name='bloodsong-choice']:checked");
                    if (!radio) {
                      resolve(null);
                      return;
                    }
                    if (radio.value === "ally") {
                      const sel = html[0].querySelector("#bloodsong-ally");
                      resolve({ choice: "ally", allyUuid: sel?.value ?? null });
                    } else if (radio.value === "temp") {
                      resolve({ choice: "temp" });
                    } else {
                      resolve({ choice: "skip" });
                    }
                  },
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) },
              },
              default: "ok",
              close: () => resolve(null),
            }).render(true);
          });

          if (!choice) continue;

          await fianna.setFlag(GAROU.scope, "bloodsongTurn", turnKey);
          if (choice.choice === "skip") return;

          if (choice.choice === "temp") {
            const curTemp = Number(fianna.system?.attributes?.hp?.temp) ?? 0;
            const newTemp = Math.max(curTemp, pb);
            await fianna.update({ "system.attributes.hp.temp": newTemp });
            ui.notifications?.info?.(`Bloodsong: ${fianna.name} gains ${pb} temporary hit points.`);
          } else if (choice.choice === "ally" && choice.allyUuid) {
            const doc = await fromUuid(choice.allyUuid).catch(() => null);
            const allyActor = doc?.actor ?? doc;
            if (allyActor?.createEmbeddedDocuments) {
              await allyActor.createEmbeddedDocuments("ActiveEffect", [{
                name: GAROU.allyAdvantageEffectName,
                icon: "icons/svg/aura.svg",
                origin: fianna.uuid,
                disabled: false,
                duration: { rounds: 999, startRound: game.combat?.round ?? null, startTurn: game.combat?.turn ?? null },
                flags: { [GAROU.scope]: { bloodsongAdvantage: true } },
              }]);
              ui.notifications?.info?.(`Bloodsong: ${allyActor.name} gains advantage on their next attack roll.`);
            }
          }
          return;
        }
      }
    } catch (err) {
      console.error("[garou] Bloodsong error:", err);
    }
  });
});

// Apply Bloodsong "advantage on next attack" and remove effect after use
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.AttackRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      const eff = actor.effects.find(e =>
        !e.disabled && (e.name === GAROU.allyAdvantageEffectName || e.getFlag(GAROU.scope, "bloodsongAdvantage"))
      );
      if (!eff) return;
      workflow.advantage = true;
      eff.delete().catch(() => {});
    } catch (err) {
      console.error("[garou] Bloodsong advantage-on-attack error:", err);
    }
  });
});
