// scripts/command-the-pack-automation.js
// Command the Pack (Silver Fangs 6): bonus action, choose one ally within 30 ft;
// that ally may use their reaction to move half speed (no OA) or make one weapon attack.
// 1/short or long rest. Cannot use while raging.

const GAROU = {
  scope: "garou",
  featureKey: "commandThePack",
  featureName: "Command the Pack",
  effectName: "Command the Pack",
  effectFlag: "commandThePack",
};

function isCommandThePackItem(item) {
  if (!item) return false;
  const name = (item.name ?? "").trim().toLowerCase();
  const flag = item.getFlag(GAROU.scope, "featureKey");
  return flag === GAROU.featureKey || name === "command the pack";
}

function getCommandThePackFeatureItem(actor) {
  return actor?.items?.find(i =>
    i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey ||
    (i.name ?? "").trim().toLowerCase() === "command the pack"
  ) ?? null;
}

function hasCommandThePackUse(featureItem) {
  if (!featureItem?.system?.uses) return false;
  const max = Number(featureItem.system.uses.max) || 0;
  const spent = Number(featureItem.system.uses.spent) || 0;
  return (max - spent) > 0;
}

async function consumeCommandThePackUse(featureItem) {
  if (!featureItem?.system?.uses) return;
  const spent = Number(featureItem.system.uses.spent) || 0;
  await featureItem.update({ "system.uses.spent": spent + 1 });
}

function isRaging(actor) {
  return actor?.effects?.some(e =>
    !e.disabled && (e.name ?? "").toLowerCase().includes("rage")
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

function getAllyTokensWithin30Feet(garouToken) {
  if (!canvas?.scene?.tokens || !garouToken) return [];
  const garouCenter = tokenCenter(garouToken);
  const measure = (other) => canvas.grid.measureDistance(garouCenter, tokenCenter(other));
  const placeables = canvas.tokens?.placeables ?? [];
  const tokens = placeables.filter(t => {
    if (!t.actor) return false;
    return measure(t) <= 30;
  });
  return tokens.filter(t => {
    const disposition = t.document?.disposition ?? 0;
    return disposition >= 0 || t.id === garouToken.id;
  });
}

function isCommandThePackEffect(effect) {
  if (!effect) return false;
  const name = (effect.name ?? "").trim();
  if (name === GAROU.effectName) return true;
  return !!effect.getFlag(GAROU.scope, GAROU.effectFlag);
}

async function removeCommandThePackEffectsFromActor(actor) {
  const toRemove = actor.effects.filter(isCommandThePackEffect);
  if (toRemove.length) await actor.deleteEmbeddedDocuments("ActiveEffect", toRemove.map(e => e.id));
}

async function runCommandThePackFlow(item, actor, token) {
  const featureItem = getCommandThePackFeatureItem(actor);
  if (!featureItem || !hasCommandThePackUse(featureItem)) {
    ui.notifications?.warn?.("Command the Pack: No uses remaining.");
    return true;
  }

  if (isRaging(actor)) {
    ui.notifications?.warn?.("Command the Pack: You cannot use this feature while raging.");
    return true;
  }

  const garouToken = token ?? actor.getActiveTokens?.()?.[0] ?? null;
  if (!garouToken) {
    ui.notifications?.warn?.("Command the Pack: No token on the scene for the user.");
    return true;
  }

  const eligibleTokens = getAllyTokensWithin30Feet(garouToken);
  if (!eligibleTokens.length) {
    ui.notifications?.info?.("Command the Pack: No allies within 30 feet.");
    return true;
  }

  const options = eligibleTokens.map(t => ({
    id: t.id,
    name: t.name || t.actor?.name || "Unknown",
    actorId: t.actor?.id,
  }));

  const selected = await new Promise(resolve => {
    const listHtml = options.map(o =>
      "<label style=\"display: block; margin: 4px 0;\">" +
      "<input type=\"radio\" name=\"command-the-pack-ally\" class=\"command-the-pack-token\" value=\"" + (o.actorId ?? "") + "\" data-token-id=\"" + (o.id ?? "") + "\" /> " +
      (o.name ?? "Unknown") +
      "</label>"
    ).join("");
    const content =
      "<p>Choose <b>one</b> ally within 30 feet who can see or hear you.</p>" +
      "<p><em>That ally may use their reaction to move up to half their speed without provoking opportunity attacks, or make one weapon attack.</em></p>" +
      "<div class=\"form-group\"><label>Ally:</label>" +
      "<div id=\"command-the-pack-token-list\" style=\"max-height: 200px; overflow-y: auto;\">" + listHtml + "</div></div>";
    new Dialog({
      title: GAROU.featureName,
      content,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: "Command the Pack",
          callback: (html) => {
            const radio = html[0].querySelector("input.command-the-pack-token:checked");
            if (!radio) {
              ui.notifications?.warn?.("Select one ally.");
              resolve(null);
              return;
            }
            resolve({ actorId: radio.value, tokenId: radio.dataset.tokenId });
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

  if (!selected) return true;

  await consumeCommandThePackUse(featureItem);

  const allyActor = game.actors.get(selected.actorId);
  if (!allyActor) {
    ui.notifications?.warn?.("Command the Pack: Ally actor not found.");
    return true;
  }

  const effectData = {
    name: GAROU.effectName,
    icon: "icons/svg/target.svg",
    origin: actor.uuid,
    disabled: false,
    transfer: false,
    duration: {
      rounds: 1,
      turns: 0,
      seconds: null,
      startRound: game.combat?.round ?? null,
      startTurn: game.combat?.turn ?? null,
      startTime: game.time.worldTime ?? null,
    },
    flags: {
      [GAROU.scope]: {
        [GAROU.effectFlag]: { sourceActorUuid: actor.uuid },
      },
    },
    description: "You may use your reaction to move up to half your speed without provoking opportunity attacks, or make one weapon attack. Expires at end of your turn.",
  };

  await allyActor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  ui.notifications?.info?.(`Command the Pack: ${allyActor.name} may use their reaction to move (half speed, no OA) or make one weapon attack.`);

  return true;
}

// Intercept item use so we handle the flow and consume use ourselves
Hooks.on("dnd5e.preUseItem", async (item, config, options) => {
  if (!isCommandThePackItem(item)) return false;
  const actor = item.actor ?? item.parent;
  if (!(actor instanceof Actor)) return false;
  if (!actor.isOwner && !game.user.isGM) return false;
  await runCommandThePackFlow(item, actor, null);
  return true;
});

// Expose handler for garou.js single Item.use wrapper (avoids duplicate libWrapper registration)
Hooks.once("ready", () => {
  game.garou = game.garou ?? {};
  game.garou.isCommandThePackItem = isCommandThePackItem;
  game.garou.runCommandThePackFlow = runCommandThePackFlow;
});

// Turn-end: remove Command the Pack effect from the actor whose turn just ended
let _lastCombatStateCmdPack = {};
Hooks.on("updateCombat", (combat, update, options) => {
  const turnChanged = "turn" in update || "round" in update;
  if (!turnChanged || !combat?.combatants?.size) return;
  const key = combat.id;
  const prev = _lastCombatStateCmdPack[key];
  const contents = combat.combatants?.contents ?? [];
  if (prev != null && contents.length) {
    const combatantWhoseTurnEnded = contents[prev.turn];
    if (combatantWhoseTurnEnded?.actor) {
      removeCommandThePackEffectsFromActor(combatantWhoseTurnEnded.actor).catch(() => {});
    }
  }
  _lastCombatStateCmdPack[key] = { round: combat.round, turn: combat.turn };
});
