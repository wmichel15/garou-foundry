// Relentless Assault automation (Get of Fenris 6)
// Requires: Midi-QOL

const GAROU = {
  scope: "garou",
  relentlessKey: "relentlessAssault",
  turnFlag: "relentlessAssaultUsedTurn"
};

function hasRelentlessAssault(actor) {
  return actor?.items?.some(
    i => i.getFlag(GAROU.scope, "featureKey") === GAROU.relentlessKey
  );
}

function isRaging(actor) {
  // Adjust this if your Rage effect has a specific name or flag
  return actor.effects.some(
    e => !e.disabled && e.name?.toLowerCase().includes("rage")
  );
}

function getExtraDie(actor) {
  const level = actor.system?.details?.level ?? 0;
  return level >= 14 ? "1d8" : "1d6";
}

function getTurnKey() {
    if (game.combat) return `${game.combat.round}.${game.combat.turn}`;
  // Outside combat, allow it again after a short time step
  return `no-combat.${Math.floor(game.time.worldTime)}`;
}

async function promptRelentlessAssault(actor, targetActor) {
  if (!actor.isOwner) return false;

  return new Promise(resolve => {
    new Dialog({
      title: "Relentless Assault",
      content: `
        <p>You hit <b>${targetActor.name}</b>.</p>
        <p>Did you move at least <b>10 feet straight toward the target</b> this turn?</p>
      `,
      buttons: {
        yes: {
          label: "Yes",
          icon: '<i class="fas fa-check"></i>',
          callback: () => resolve(true)
        },
        no: {
          label: "No",
          icon: '<i class="fas fa-times"></i>',
          callback: () => resolve(false)
        }
      },
      default: "yes",
      close: () => resolve(false)
    }).render(true);
  });
}

// ---- Hook: Add damage once per turn ----
Hooks.on("midi-qol.DamageBonus", async (workflow) => {
  try {
    const actor = workflow.actor;
    if (!actor || !workflow.item) return {};

    // Only melee weapon / natural weapon attacks
    if (!["mwak"].includes(workflow.item.system?.actionType)) return {};

    if (!hasRelentlessAssault(actor)) return {};
    if (!isRaging(actor)) return {};

    // Once per turn guard
    const turnKey = getTurnKey();
    if (actor.getFlag(GAROU.scope, GAROU.turnFlag) === turnKey) return {};

    const targets = Array.from(workflow.hitTargets ?? []);
    if (targets.length !== 1) return {};

    const targetActor = targets[0].actor;
    if (!targetActor) return {};

    const ok = await promptRelentlessAssault(actor, targetActor);
    if (!ok) return {};

    // Mark used for this turn
    await actor.setFlag(GAROU.scope, GAROU.turnFlag, turnKey);

    const die = getExtraDie(actor);
    return {
      damageRoll: die,
      flavor: `Relentless Assault (${die})`
    };
  } catch (err) {
    console.error("[garou] Relentless Assault error:", err);
    return {};
  }
});
