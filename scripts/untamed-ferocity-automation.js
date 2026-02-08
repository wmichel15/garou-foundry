// scripts/untamed-ferocity-automation.js
// Untamed Ferocity (Red Talons 11): While raging:
// - Resistance to B/P/S damage from nonmagical weapons
// - Hostile creatures within 5 feet have disadvantage on Concentration checks
// Requires: Midi-QOL.

const GAROU = {
  scope: "garou",
  featureKey: "untamedFerocity",
};

const BPS_TYPES = new Set(["bludgeoning", "piercing", "slashing"]);

function hasUntamedFerocity(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function isRaging(actor) {
  return actor?.effects?.some(e => !e.disabled && (e.name ?? "").toLowerCase().includes("rage"));
}

/** True when the actor has Untamed Ferocity and is raging (B/P/S resistance applies). */
function isRagingWithUntamedFerocity(actor) {
  return hasUntamedFerocity(actor) && isRaging(actor);
}

function isNonmagicalBPS(workflow) {
  const item = workflow.item ?? workflow.origin;
  if (!item?.system) return false;
  const props = item.system.properties ?? {};
  if (props.mgc === true || props.magical === true) return false;
  const parts = item.system.damage?.parts ?? [];
  if (parts.length === 0) return false;
  for (const part of parts) {
    const type = String(part[1] ?? part.damageType ?? "").toLowerCase();
    if (type && !BPS_TYPES.has(type)) return false;
  }
  return parts.some(p => BPS_TYPES.has(String(p[1] ?? "").toLowerCase()));
}

function tokenCenter(t) {
  if (!t) return null;
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

/** True if there is a raging Untamed Ferocity token within 5 feet of the given token. */
function hasRagingTalonWithin5Feet(token) {
  if (!token || !canvas?.tokens?.placeables) return false;
  for (const t of canvas.tokens.placeables) {
    if (!t.actor) continue;
    if (distanceBetween(token, t) > 5) continue;
    if (!isRagingWithUntamedFerocity(t.actor)) continue;
    return true;
  }
  return false;
}

/** True if the roller's token is hostile and within 5 ft of a raging Talon (for concentration disadvantage). */
function shouldImposeConcentrationDisadvantage(rollerToken) {
  if (!rollerToken) return false;
  const disp = rollerToken.document?.disposition ?? 0;
  if (disp >= 0) return false; // not hostile
  return hasRagingTalonWithin5Feet(rollerToken);
}

function isConcentrationCheck(workflow) {
  if (!workflow) return false;
  const name = (workflow.item?.name ?? workflow.origin?.name ?? "").toLowerCase();
  const desc = (workflow.item?.system?.description?.value ?? workflow.origin?.system?.description?.value ?? "").toLowerCase();
  const flavor = (workflow.flavor ?? "").toLowerCase();
  if (name.includes("concentration") || desc.includes("concentration") || flavor.includes("concentration")) return true;
  if (workflow.flags?.["midi-qol"]?.concentrationCheck === true) return true;
  if (workflow.options?.concentration === true) return true;
  return false;
}

// ---- Resistance to nonmagical B/P/S while raging ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;

  Hooks.on("midi-qol.preTargetDamageApplication", async (workflow) => {
    try {
      const defender = workflow?.actor;
      if (!defender) return;
      if (!isRagingWithUntamedFerocity(defender)) return;
      if (!isNonmagicalBPS(workflow)) return;

      const incoming = Number(workflow.damageTotal ?? 0);
      if (incoming <= 0) return;
      workflow.damageTotal = Math.floor(incoming / 2);
    } catch (err) {
      console.error("[garou] Untamed Ferocity resistance error:", err);
    }
  });
});

// ---- Hostiles within 5 ft have disadvantage on Concentration checks ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;

  Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
    try {
      if (!isConcentrationCheck(workflow)) return;
      const actor = workflow?.actor;
      if (!actor) return;
      const token = workflow.token ?? canvas.tokens?.placeables?.find(t => t.actor === actor);
      if (!shouldImposeConcentrationDisadvantage(token)) return;
      workflow.disadvantage = true;
    } catch (err) {
      console.error("[garou] Untamed Ferocity concentration disadvantage error:", err);
    }
  });
});

// Optional: dnd5e may roll concentration without Midi; hook generic roll if available
Hooks.once("ready", () => {
  Hooks.on("dnd5e.rollConcentrationSave", (actor, options) => {
    try {
      const token = canvas.tokens?.placeables?.find(t => t.actor === actor);
      if (!shouldImposeConcentrationDisadvantage(token)) return;
      if (typeof options === "object" && options !== null) options.disadvantage = true;
    } catch (err) {
      console.error("[garou] Untamed Ferocity (dnd5e concentration) error:", err);
    }
  });
});
