// scripts/relentless-pursuit-automation.js
// Relentless Pursuit (Red Talons 6): While raging, when you hit a creature you may reduce its speed
// by 10 ft until the end of its next turn (20 ft if target is restrained, grappled, or prone). Once per turn.
// Requires: Midi-QOL.

const GAROU = {
  scope: "garou",
  featureKey: "relentlessPursuit",
  turnFlag: "relentlessPursuitUsedTurn",
  effectName: "Relentless Pursuit — Slowed",
};

function hasRelentlessPursuit(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function isRaging(actor) {
  return actor?.effects?.some(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
}

function isRestrainedGrappledOrProne(actor) {
  if (!actor?.effects) return false;
  const terms = ["restrained", "grappled", "prone"];
  return actor.effects.some(e => {
    if (e.disabled) return false;
    const name = (e.name ?? "").toLowerCase();
    return terms.some(t => name.includes(t));
  });
}

function getTurnKey() {
  const c = game.combat;
  if (!c) return `no-combat.${Math.floor(game.time.worldTime ?? 0)}`;
  return `${c.id}-${c.round}-${c.turn}`;
}

async function applyRelentlessPursuit(attacker, targetActor, reduction) {
  const combat = game.combat;
  const effectData = {
    name: `${GAROU.effectName} (${reduction} ft)`,
    icon: "systems/dnd5e/icons/svg/items/feature.svg",
    origin: attacker.uuid,
    disabled: false,
    duration: {
      rounds: 2,
      startRound: combat?.round ?? null,
      startTurn: combat?.turn ?? null,
      seconds: null,
      startTime: game.time.worldTime ?? null,
    },
    changes: [
      {
        key: "system.attributes.movement.walk",
        mode: 0, // ADD
        value: String(-reduction),
        priority: 20,
      },
    ],
    flags: { [GAROU.scope]: { relentlessPursuitSlowed: true } },
  };
  await targetActor.createEmbeddedDocuments("ActiveEffect", [effectData]);
}

Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;

  Hooks.on("midi-qol.preTargetDamageApplication", async (workflow) => {
    try {
      const attacker = workflow?.actor;
      if (!attacker || !hasRelentlessPursuit(attacker) || !isRaging(attacker)) return;

      const turnKey = getTurnKey();
      if (attacker.getFlag(GAROU.scope, GAROU.turnFlag) === turnKey) return;

      const damageTargets = Array.from(workflow.damageTargets ?? []);
      if (damageTargets.length === 0) return;

      let targetDt = damageTargets[0];
      let targetActor = targetDt?.token?.actor;
      if (!targetActor?.createEmbeddedDocuments) return;

      if (damageTargets.length > 1 && (attacker.isOwner || game.user.isGM)) {
        const options = damageTargets.map((dt, i) => {
          const a = dt?.token?.actor;
          const name = a?.name ?? `Target ${i + 1}`;
          return `<option value="${i}">${name}</option>`;
        }).join("");
        const chosen = await new Promise(resolve => {
          new Dialog({
            title: "Relentless Pursuit",
            content: `<p>You hit. Apply <b>Relentless Pursuit</b> to reduce one creature's speed? (Once per turn)</p><select id="rp-target" style="width:100%;margin-top:8px;">${options}</select>`,
            buttons: {
              yes: { icon: '<i class="fas fa-check"></i>', label: "Apply", callback: (html) => resolve(Number(html.find("#rp-target").val())) },
              no: { icon: '<i class="fas fa-times"></i>', label: "No", callback: () => resolve(null) },
            },
            default: "yes",
            close: () => resolve(null),
          }).render(true);
        });
        if (chosen == null) return;
        targetDt = damageTargets[chosen];
        targetActor = targetDt?.token?.actor;
      } else if (damageTargets.length > 1) return;

      const reduction = isRestrainedGrappledOrProne(targetActor) ? 20 : 10;
      const prompt = await new Promise(resolve => {
        new Dialog({
          title: "Relentless Pursuit",
          content: `<p>Reduce <b>${targetActor.name}</b>'s speed by <b>${reduction} feet</b> until the end of its next turn?</p>${reduction === 20 ? "<p><em>Target is restrained, grappled, or prone — reduction increased to 20 ft.</em></p>" : ""}`,
          buttons: {
            yes: { icon: '<i class="fas fa-check"></i>', label: "Yes", callback: () => resolve(true) },
            no: { icon: '<i class="fas fa-times"></i>', label: "No", callback: () => resolve(false) },
          },
          default: "yes",
          close: () => resolve(false),
        }).render(true);
      });
      if (!prompt) return;

      await attacker.setFlag(GAROU.scope, GAROU.turnFlag, turnKey);
      await applyRelentlessPursuit(attacker, targetActor, reduction);
      ui.notifications?.info?.(`Relentless Pursuit: ${targetActor.name}'s speed reduced by ${reduction} ft until end of its next turn.`);
    } catch (err) {
      console.error("[garou] Relentless Pursuit error:", err);
    }
  });
});
