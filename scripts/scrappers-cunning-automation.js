// scripts/scrappers-cunning-automation.js
// Scrapper's Cunning (Bone Gnawers 3): When bloodied (HP <= half max):
// - Advantage on Strength (Athletics) and Dexterity (Acrobatics)
// - Once per turn: +PB damage on melee or natural weapon hit
// Auspice riders: Ragabash, Theurge, Philodox, Galliard, Ahroun.
// Requires: Midi-QOL (optional, for full automation).

const GAROU = {
  scope: "garou",
  featureKey: "scrappersCunning",
};

const VALID_AUSPICES = new Set(["ragabash", "theurge", "philodox", "galliard", "ahroun"]);

function getActorAuspiceKey(actor) {
  if (!actor?.items) return null;
  const auspiceItem = actor.items.find(i => {
    const key = i.getFlag(GAROU.scope, "auspice");
    return typeof key === "string" && VALID_AUSPICES.has(key.toLowerCase());
  });
  return auspiceItem ? auspiceItem.getFlag(GAROU.scope, "auspice").toLowerCase() : null;
}

function hasScrappersCunning(actor) {
  return actor?.items?.some(i => i.getFlag(GAROU.scope, "featureKey") === GAROU.featureKey);
}

function hasScrappersCunningRider(actor, auspiceKey) {
  return actor?.items?.some(i =>
    i.getFlag(GAROU.scope, "riderFor") === GAROU.featureKey &&
    (i.getFlag(GAROU.scope, "auspice") || "").toLowerCase() === auspiceKey
  );
}

function isBloodied(actor) {
  if (!actor?.system?.attributes?.hp) return false;
  const hp = Number(actor.system.attributes.hp.value) ?? 0;
  const max = Number(actor.system.attributes.hp.max) ?? 1;
  return max > 0 && hp <= Math.floor(max / 2);
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

function isMeleeOrNaturalWeapon(workflow) {
  if (!workflow?.item) return false;
  const item = workflow.item;
  const actionType = item.system?.actionType ?? "";
  const weaponType = (item.system?.weaponType ?? "").toLowerCase();
  if (["mwak", "msak"].includes(actionType)) return true;
  if (weaponType.includes("natural")) return true;
  const name = (item.name ?? "").toLowerCase();
  if (name.includes("natural weapon") || name.includes("unarmed") || name.includes("claw") || name.includes("bite")) return true;
  return false;
}

// ---- Keep bloodied-based advantage flags in sync with HP ----
function updateBloodiedFlags(actor) {
  if (!actor || actor.type !== "character") return;
  if (!hasScrappersCunning(actor)) return;

  const bloodied = isBloodied(actor);
  const auspiceKey = getActorAuspiceKey(actor);

  const updates = {};
  if (bloodied) {
    updates[`flags.midi-qol.advantage.skill.ath`] = true;  // Athletics
    updates[`flags.midi-qol.advantage.skill.acr`] = true; // Acrobatics
    if (hasScrappersCunningRider(actor, "philodox")) {
      updates[`flags.midi-qol.advantage.ability.check.all`] = true;
    }
  } else {
    updates[`flags.midi-qol.advantage.skill.ath`] = false;
    updates[`flags.midi-qol.advantage.skill.acr`] = false;
    updates[`flags.midi-qol.advantage.ability.check.all`] = false;
  }

  const current = actor.toObject();
  let changed = false;
  for (const [k, v] of Object.entries(updates)) {
    const parts = k.split(".");
    let cur = current;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] ?? {};
    if (cur[parts[parts.length - 1]] !== v) changed = true;
  }
  if (changed) {
    actor.update(updates).catch(() => {});
  }
}

Hooks.on("updateActor", (actor, changed) => {
  if (!changed.system?.attributes?.hp && !changed.actor?.system?.attributes?.hp) return;
  updateBloodiedFlags(actor);
});

// Apply flags when sheet is rendered (e.g. after import)
Hooks.on("renderActorSheet", (app) => {
  if (app.actor) updateBloodiedFlags(app.actor);
});

Hooks.once("ready", () => {
  game.actors?.contents?.forEach(updateBloodiedFlags);
});

// ---- Base: once per turn +PB damage on melee/natural weapon hit (when bloodied) ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.DamageBonus", async (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return {};
      const attacker = workflow.actor;
      if (!hasScrappersCunning(attacker)) return {};
      if (!isBloodied(attacker)) return {};
      if (!isMeleeOrNaturalWeapon(workflow)) return {};

      const turnKey = getTurnKey();
      if (attacker.getFlag(GAROU.scope, "scrappersCunningBaseTurn") === turnKey) return {};

      const hitTargets = Array.from(workflow.hitTargets ?? []);
      if (hitTargets.length === 0) return {};
      const pb = attacker.system?.attributes?.prof ?? 2;
      await attacker.setFlag(GAROU.scope, "scrappersCunningBaseTurn", turnKey);
      return { damageRoll: String(pb), flavor: "Scrapper's Cunning (bloodied)" };
    } catch (err) {
      console.error("[garou] Scrapper's Cunning base damage error:", err);
      return {};
    }
  });
});

// ---- Ragabash: opportunity attacks against you have disadvantage ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.AttackRoll", (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.targets) return;
      const targets = Array.from(workflow.targets ?? []);
      if (targets.length === 0) return;
      const targetActor = targets[0]?.actor;
      if (!targetActor) return;
      if (!hasScrappersCunning(targetActor)) return;
      if (!isBloodied(targetActor)) return;
      if (!hasScrappersCunningRider(targetActor, "ragabash")) return;
      const isOA = workflow.flags?.["midi-qol"]?.opportunityAttack ?? workflow.item?.flags?.["midi-qol"]?.opportunityAttack ?? false;
      if (!isOA) return;
      workflow.disadvantage = true;
    } catch (err) {
      console.error("[garou] Scrapper's Cunning Ragabash error:", err);
    }
  });
});

// ---- Theurge: advantage on saves vs poison and disease (when bloodied) ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;
      if (!hasScrappersCunning(actor)) return;
      if (!isBloodied(actor)) return;
      if (!hasScrappersCunningRider(actor, "theurge")) return;
      const name = (workflow.item?.name ?? workflow.origin?.name ?? "").toLowerCase();
      const desc = (workflow.item?.system?.description?.value ?? workflow.origin?.system?.description?.value ?? "").toLowerCase();
      const isPoisonOrDisease = name.includes("poison") || name.includes("disease") || desc.includes("poison") || desc.includes("disease");
      if (!isPoisonOrDisease) return;
      workflow.advantage = true;
    } catch (err) {
      console.error("[garou] Scrapper's Cunning Theurge error:", err);
    }
  });
});

// ---- Galliard: when you first become bloodied, one ally within 30 ft gains temp HP = PB ----
Hooks.on("updateActor", async (actor, changed) => {
  if (!changed.system?.attributes?.hp && !changed.actor?.system?.attributes?.hp) return;
  if (!actor || actor.type !== "character") return;
  if (!hasScrappersCunning(actor)) return;
  if (!hasScrappersCunningRider(actor, "galliard")) return;
  if (!isBloodied(actor)) return;

  const alreadyTriggered = actor.getFlag(GAROU.scope, "scrappersCunningGalliardTriggered");
  if (alreadyTriggered) return;

  const token = canvas.tokens?.placeables?.find(t => t.actor === actor);
  if (!token) return;

  const allies = [];
  for (const t of canvas.tokens?.placeables ?? []) {
    if (!t.actor || t.actor.uuid === actor.uuid) continue;
    if (distanceBetween(token, t) > 30) continue;
    const disp = t.document?.disposition ?? 0;
    if (disp >= 0) allies.push(t);
  }
  if (allies.length === 0) return;
  if (!actor.isOwner && !game.user.isGM) return;

  await actor.setFlag(GAROU.scope, "scrappersCunningGalliardTriggered", true);

  const options = allies.map(t => `<option value="${t.actor.uuid}">${t.actor.name}</option>`).join("");
  const pb = actor.system?.attributes?.prof ?? 2;
  const chosen = await new Promise(resolve => {
    new Dialog({
      title: "Scrapper's Cunning — Galliard",
      content: `<p>You just became bloodied. One ally within 30 feet gains <b>${pb} temporary hit points</b>.</p><select id="sc-galliard-ally" style="width:100%;margin-top:8px;">${options}</select>`,
      buttons: {
        ok: { icon: '<i class="fas fa-check"></i>', label: "Grant", callback: (html) => resolve(html.find("#sc-galliard-ally").val()) },
        no: { icon: '<i class="fas fa-times"></i>', label: "Skip", callback: () => resolve(null) },
      },
      default: "ok",
      close: () => resolve(null),
    }).render(true);
  });

  if (chosen) {
    const doc = await fromUuid(chosen).catch(() => null);
    const allyActor = doc?.actor ?? doc;
    if (allyActor?.update) {
      const curTemp = Number(allyActor.system?.attributes?.hp?.temp) ?? 0;
      const newTemp = Math.max(curTemp, pb);
      await allyActor.update({ "system.attributes.hp.temp": newTemp });
      ui.notifications?.info?.(`${allyActor.name} gains ${pb} temporary hit points (Scrapper's Cunning — Galliard).`);
    }
  }
});

// Reset Galliard "first become bloodied" when no longer bloodied
Hooks.on("updateActor", (actor, changed) => {
  if (!changed.system?.attributes?.hp && !changed.actor?.system?.attributes?.hp) return;
  if (!hasScrappersCunning(actor) || !hasScrappersCunningRider(actor, "galliard")) return;
  if (isBloodied(actor)) return;
  if (actor.getFlag(GAROU.scope, "scrappersCunningGalliardTriggered")) {
    actor.unsetFlag(GAROU.scope, "scrappersCunningGalliardTriggered").catch(() => {});
  }
});

// ---- Ahroun: once per turn reroll one damage die on melee/natural (when bloodied) ----
Hooks.once("ready", () => {
  if (!game.modules?.get("midi-qol")?.active) return;
  Hooks.on("midi-qol.DamageBonus", async (workflow) => {
    try {
      if (!workflow?.actor || !workflow?.item) return {};
      const attacker = workflow.actor;
      if (!hasScrappersCunning(attacker)) return {};
      if (!isBloodied(attacker)) return {};
      if (!hasScrappersCunningRider(attacker, "ahroun")) return {};
      if (!isMeleeOrNaturalWeapon(workflow)) return {};

      const turnKey = getTurnKey();
      if (attacker.getFlag(GAROU.scope, "scrappersCunningAhrounTurn") === turnKey) return {};

      const hitTargets = Array.from(workflow.hitTargets ?? []);
      if (hitTargets.length === 0) return {};

      await attacker.setFlag(GAROU.scope, "scrappersCunningAhrounTurn", turnKey);
      // Add 1d6: player replaces one weapon damage die with this roll (reroll one die)
      return { damageRoll: "1d6", flavor: "Scrapper's Cunning (Ahroun): reroll one damage die — replace one weapon die with this roll" };
    } catch (err) {
      console.error("[garou] Scrapper's Cunning Ahroun error:", err);
      return {};
    }
  });
});
