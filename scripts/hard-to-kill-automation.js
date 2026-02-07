// scripts/hard-to-kill-automation.js
// Hard to Kill (Bone Gnawers 11): While raging, advantage on death saving throws.
// When you succeed on a death saving throw, you may immediately stand up from prone without expending movement.
// Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "hardToKill",
};

function hasHardToKill(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function isRaging(actor) {
  return actor?.effects?.some(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
}

function isDeathSave(workflow) {
  if (!workflow) return false;
  const name = (workflow.item?.name ?? workflow.origin?.name ?? "").toLowerCase();
  if (name.includes("death")) return true;
  if (workflow.ability === "death") return true;
  if (workflow.saveType === "death") return true;
  if (workflow.flags?.["midi-qol"]?.deathSave) return true;
  return false;
}

function didDeathSaveSucceed(workflow) {
  const roll = workflow.roll ?? workflow.saveRoll;
  if (!roll) return false;
  const total = roll.total ?? roll._total ?? 0;
  return total >= 10;
}

// ---- While raging: advantage on death saves (via Midi flag) ----
function updateHardToKillFlag(actor) {
  if (!actor || actor.type !== "character") return;
  if (!hasHardToKill(actor)) return;
  const raging = isRaging(actor);
  const current = actor.getFlag("midi-qol", "advantage.deathSave");
  if (current === raging) return;
  actor.setFlag("midi-qol", "advantage.deathSave", raging).catch(() => {});
}

Hooks.on("updateActor", (actor, changed) => {
  if (!changed.effects) return;
  updateHardToKillFlag(actor);
});

Hooks.on("renderActorSheet", (app) => {
  if (app.actor) updateHardToKillFlag(app.actor);
});

Hooks.once("ready", () => {
  game.actors?.contents?.forEach(updateHardToKillFlag);
});

// ---- On successful death save: stand up from prone (remove prone from token) ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;

  Hooks.on("midi-qol.SavingThrowComplete", async (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      if (!hasHardToKill(actor)) return;
      if (!isDeathSave(workflow)) return;
      if (!didDeathSaveSucceed(workflow)) return;

      const tokens = actor.getActiveTokens(true);
      for (const token of tokens) {
        const doc = token.document ?? token;
        const hasProne = doc.hasStatusEffect?.("prone") || (Array.isArray(doc.statusEffects) && doc.statusEffects.some(s => (typeof s === "string" ? s : s?.id) === "prone"));
        if (!hasProne) continue;
        if (typeof doc.toggleStatusEffect === "function") {
          await doc.toggleStatusEffect("prone").catch(() => {});
        } else {
          const statuses = doc.statusEffects;
          const arr = statuses instanceof Set ? Array.from(statuses) : (Array.isArray(statuses) ? statuses : []);
          const next = arr.filter(s => (typeof s === "string" ? s : s?.id) !== "prone");
          if (next.length < arr.length) await doc.update({ statusEffects: next });
        }
      }

      ui.notifications?.info?.(`${actor.name}: Hard to Kill — you may stand up from prone without expending movement.`);
    } catch (err) {
      console.error("[garou] Hard to Kill (stand from prone) error:", err);
    }
  });
});
