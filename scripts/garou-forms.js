// scripts/garou-forms.js
// Auto-enforce only one Garou form ActiveEffect enabled at a time.
// Ensures Garou characters have Shapeshifting Forms + 5 form items (grant if missing after creation).

const GAROU_CLASS_IDENTIFIER = "garou";      // your class identifier
const FORM_PREFIX = "Form: ";
const FORM_NAMES = ["Homid", "Glabro", "Crinos", "Hispo", "Lupus"];
const GUARD_OPTION = "garouAutoForms";
const FEATURES_PACK_KEY = "garou.garou-features";
const SHAPESHIFTING_FORMS_NAME = "Shapeshifting Forms";
const GAROU_ITEM_FLAG_SCOPE = "garou";
const LUPUS_NATURAL_WEAPON_FLAG = "lupusNaturalWeapon";
const LUPUS_BITE_ID = "garou-lupus-bite";
const LUPUS_CLAW_ID = "garou-lupus-claw";
const GLABRO_NATURAL_WEAPON_FLAG = "glabroNaturalWeapon";
const GLABRO_BITE_ID = "garou-glabro-bite";
const GLABRO_CLAW_ID = "garou-glabro-claw";
const CRINOS_NATURAL_WEAPON_FLAG = "crinosNaturalWeapon";
const CRINOS_BITE_ID = "garou-crinos-bite";
const CRINOS_CLAW_ID = "garou-crinos-claw";
const HISPO_NATURAL_WEAPON_FLAG = "hispoNaturalWeapon";
const HISPO_BITE_ID = "garou-hispo-bite";
const HISPO_CLAW_ID = "garou-hispo-claw";

// Serialize sync operations per-actor to avoid race conditions
// (rapid form toggles can otherwise create duplicates or double-delete).
const _actorLocks = new Map();

function withActorLock(actor, fn) {
  const key = actor?.uuid ?? actor?.id ?? actor;
  const prev = _actorLocks.get(key) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(fn)
    .finally(() => {
      if (_actorLocks.get(key) === next) _actorLocks.delete(key);
    });
  _actorLocks.set(key, next);
  return next;
}

function isGarouActor(actor) {
  if (!actor || actor.type !== "character") return false;
  // Check if actor has Garou class by identifier (safer than name),
  // but be tolerant of class names like "Garou 1".
  const classes = actor.items?.filter?.(i => i.type === "class") ?? [];
  if (classes.some(c => (c.system?.identifier ?? "").toLowerCase() === GAROU_CLASS_IDENTIFIER)) return true;
  if (classes.some(c => (c.name ?? "").toLowerCase().includes("garou"))) return true;

  // Fallbacks: feature item or form effects present.
  if (hasShapeshiftingFormsItem(actor)) return true;
  if (getFormEffects(actor).length > 0) return true;

  return false;
}

function getGarouLevel(actor) {
  if (!actor || actor.type !== "character") return 0;
  const items = actor.items?.contents ?? actor.items ?? [];
  const classes = items.filter(i => i.type === "class");
  const garouClass = classes.find(c => (c.system?.identifier ?? "").toLowerCase() === GAROU_CLASS_IDENTIFIER || (c.name ?? "").toLowerCase().includes("garou"));
  const levels = Number(garouClass?.system?.levels ?? 0);
  return Number.isFinite(levels) ? levels : 0;
}

function hasEmpoweredNaturalWeapons(actor) {
  return getGarouLevel(actor) >= 5;
}

function isFormEffect(effect) {
  const n = (effect?.name ?? "").trim();
  if (!n.startsWith(FORM_PREFIX)) return false;
  const form = n.slice(FORM_PREFIX.length).trim();
  return FORM_NAMES.includes(form);
}

function getFormEffects(actor) {
  const fromActor = (actor.effects ?? []).filter(isFormEffect);
  const items = Array.isArray(actor.items) ? actor.items : (actor.items?.contents ?? []);
  const fromItems = items.flatMap(i => (i.effects ?? []).filter(isFormEffect));
  return [...fromActor, ...fromItems];
}

function getEnabledFormName(actor) {
  const enabled = getFormEffects(actor).find(e => !e.disabled);
  if (!enabled) return null;
  const n = (enabled.name ?? "").trim();
  if (!n.startsWith(FORM_PREFIX)) return null;
  return n.slice(FORM_PREFIX.length).trim() || null;
}

function isActiveEffect(effect) {
  if (!effect) return false;
  // In Foundry v12/v13 an effect can be "disabled" or "suppressed".
  // Suppressed effects do not apply changes, so treat them as inactive.
  const suppressed = Boolean(effect.suppressed);
  return !effect.disabled && !suppressed;
}

function isFormActive(actor, formName) {
  const want = `${FORM_PREFIX}${formName}`.trim();
  return getFormEffects(actor).some(e => (e.name ?? "").trim() === want && isActiveEffect(e));
}

async function handleFormChange(actor, newForm) {
  if (!actor || actor.type !== "character") return;
  if (!newForm) return;

  // Crinos: attempt to auto-spend 1 Rage use and post a reminder.
  if (newForm === "Crinos") {
    const rageItem = (actor.items?.contents ?? actor.items ?? []).find(
      i => i.type === "feat" && (i.name ?? "").trim() === "Rage"
    );
    if (!rageItem) return;

    const uses = rageItem.system?.uses ?? {};
    const spent = Number(uses.spent ?? 0) || 0;

    // Resolve maximum uses: prefer actor scale if available, otherwise numeric max on the item.
    const scaleMax = Number(getProperty?.(actor, "system.scale.garou.rage") ?? NaN);
    const itemMaxNum = typeof uses.max === "number" ? uses.max : Number(uses.max ?? NaN);
    const max = !Number.isNaN(scaleMax) ? scaleMax : itemMaxNum;

    if (!Number.isFinite(max) || max <= 0) {
      // Can't reliably compute remaining uses; just post a reminder.
      ChatMessage.create?.({
        content: `${actor.name} shifts into Crinos. Remember to spend 1 Rage use.`,
        speaker: ChatMessage.getSpeaker?.({ actor })
      });
      return;
    }

    if (spent < max) {
      try {
        await rageItem.update({ "system.uses.spent": spent + 1 });
        const remaining = Math.max(0, max - spent - 1);
        ChatMessage.create?.({
          content: `${actor.name} shifts into Crinos and spends 1 Rage use (remaining ${remaining}).`,
          speaker: ChatMessage.getSpeaker?.({ actor })
        });
      } catch (err) {
        console.warn("[garou] failed to consume Rage on Crinos shift:", err);
        ChatMessage.create?.({
          content: `${actor.name} shifts into Crinos. Spend 1 Rage use manually.`,
          speaker: ChatMessage.getSpeaker?.({ actor })
        });
      }
    } else {
      ChatMessage.create?.({
        content: `${actor.name} shifts into Crinos but has no Rage uses remaining.`,
        speaker: ChatMessage.getSpeaker?.({ actor })
      });
    }
  }
}

function buildLupusEffectChanges() {
  return [
    {
      key: "system.attributes.movement.walk",
      mode: 5,
      value: "50",
      priority: 50
    },
    {
      key: "flags.dnd5e.skills.ste.adv",
      mode: 5,
      value: "1",
      priority: 50
    },
    {
      key: "flags.dnd5e.skills.prc.adv",
      mode: 5,
      value: "1",
      priority: 50
    }
  ];
}

function buildGlabroEffectChanges() {
  return [
    {
      key: "system.attributes.ac.bonus",
      mode: 2,
      value: "1",
      priority: 50
    },
    {
      key: "flags.dnd5e.abilities.str.check.adv",
      mode: 5,
      value: "1",
      priority: 50
    },
    {
      key: "flags.dnd5e.abilities.cha.check.disadv",
      mode: 5,
      value: "1",
      priority: 50
    }
  ];
}

function buildCrinosEffectChanges() {
  return [
    {
      key: "system.attributes.movement.walk",
      mode: 5,
      value: "40",
      priority: 50
    },
    {
      key: "system.attributes.ac.bonus",
      mode: 2,
      value: "2",
      priority: 50
    },
    {
      key: "flags.dnd5e.abilities.str.save.adv",
      mode: 5,
      value: "1",
      priority: 50
    },
    {
      key: "flags.dnd5e.abilities.con.save.adv",
      mode: 5,
      value: "1",
      priority: 50
    },
    {
      key: "flags.dnd5e.abilities.cha.check.disadv",
      mode: 5,
      value: "1",
      priority: 50
    }
  ];
}

function buildHispoEffectChanges() {
  return [
    {
      key: "system.attributes.movement.walk",
      mode: 5,
      value: "40",
      priority: 50
    }
  ];
}

function isLupusNaturalWeaponItem(item) {
  const flags = item?.flags?.[GAROU_ITEM_FLAG_SCOPE];
  const flagId = flags?.[LUPUS_NATURAL_WEAPON_FLAG];
  const sysId = item?.system?.identifier;
  return (
    flagId === LUPUS_BITE_ID ||
    flagId === LUPUS_CLAW_ID ||
    sysId === LUPUS_BITE_ID ||
    sysId === LUPUS_CLAW_ID
  );
}

function buildLupusWeaponData(kind, actor) {
  const isBite = kind === "bite";
  const id = isBite ? LUPUS_BITE_ID : LUPUS_CLAW_ID;
  const name = isBite ? "Bite (Lupus)" : "Claw (Lupus)";
  const damageDie = isBite ? "1d6" : "1d4";
  const damageType = isBite ? "piercing" : "slashing";

  return {
    name,
    type: "weapon",
    img: "systems/dnd5e/icons/svg/items/feature.svg",
    system: {
      description: {
        value: `<p><strong>${name}</strong></p><p>Natural weapon available while in Lupus form.</p>`,
        chat: `<p><strong>${name}</strong> (Lupus form)</p>`
      },
      identifier: id,
      source: { revision: 1, rules: "2024" },
      quantity: 1,
      weight: 0,
      price: { value: 0, denomination: "gp" },
      weaponType: "simpleM",
      damage: { parts: [[`${damageDie}`, damageType]] },
      properties: hasEmpoweredNaturalWeapons(actor) ? ["mgc"] : [],
      range: {
        value: 5,
        long: null,
        units: "ft"
      },
      proficient: true
    },
    flags: {
      [GAROU_ITEM_FLAG_SCOPE]: {
        naturalWeapon: true,
        [LUPUS_NATURAL_WEAPON_FLAG]: id
      }
    }
  };
}

function isGlabroNaturalWeaponItem(item) {
  const flags = item?.flags?.[GAROU_ITEM_FLAG_SCOPE];
  const flagId = flags?.[GLABRO_NATURAL_WEAPON_FLAG];
  const sysId = item?.system?.identifier;
  return (
    flagId === GLABRO_BITE_ID ||
    flagId === GLABRO_CLAW_ID ||
    sysId === GLABRO_BITE_ID ||
    sysId === GLABRO_CLAW_ID
  );
}

function buildGlabroWeaponData(kind, actor) {
  const isBite = kind === "bite";
  const id = isBite ? GLABRO_BITE_ID : GLABRO_CLAW_ID;
  const name = isBite ? "Bite (Glabro)" : "Claw (Glabro)";
  const damageDie = isBite ? "1d8" : "1d6";
  const damageType = isBite ? "piercing" : "slashing";

  return {
    name,
    type: "weapon",
    img: "systems/dnd5e/icons/svg/items/feature.svg",
    system: {
      description: {
        value: `<p><strong>${name}</strong></p><p>Natural weapon available while in Glabro form.</p>`,
        chat: `<p><strong>${name}</strong> (Glabro form)</p>`
      },
      identifier: id,
      source: { revision: 1, rules: "2024" },
      quantity: 1,
      weight: 0,
      price: { value: 0, denomination: "gp" },
      weaponType: "simpleM",
      damage: { parts: [[`${damageDie}`, damageType]] },
      properties: hasEmpoweredNaturalWeapons(actor) ? ["mgc"] : [],
      range: {
        value: 5,
        long: null,
        units: "ft"
      },
      proficient: true
    },
    flags: {
      [GAROU_ITEM_FLAG_SCOPE]: {
        naturalWeapon: true,
        [GLABRO_NATURAL_WEAPON_FLAG]: id
      }
    }
  };
}

function isCrinosNaturalWeaponItem(item) {
  const flags = item?.flags?.[GAROU_ITEM_FLAG_SCOPE];
  const flagId = flags?.[CRINOS_NATURAL_WEAPON_FLAG];
  const sysId = item?.system?.identifier;
  return (
    flagId === CRINOS_BITE_ID ||
    flagId === CRINOS_CLAW_ID ||
    sysId === CRINOS_BITE_ID ||
    sysId === CRINOS_CLAW_ID
  );
}

function buildCrinosWeaponData(kind, actor) {
  const isBite = kind === "bite";
  const id = isBite ? CRINOS_BITE_ID : CRINOS_CLAW_ID;
  const name = isBite ? "Bite (Crinos)" : "Claw (Crinos)";
  const damageDie = isBite ? "1d12" : "1d10";
  const damageType = isBite ? "piercing" : "slashing";

  return {
    name,
    type: "weapon",
    img: "systems/dnd5e/icons/svg/items/feature.svg",
    system: {
      description: {
        value: `<p><strong>${name}</strong></p><p>Natural weapon available while in Crinos form.</p>`,
        chat: `<p><strong>${name}</strong> (Crinos form)</p>`
      },
      identifier: id,
      source: { revision: 1, rules: "2024" },
      quantity: 1,
      weight: 0,
      price: { value: 0, denomination: "gp" },
      weaponType: "simpleM",
      damage: { parts: [[`${damageDie}`, damageType]] },
      properties: hasEmpoweredNaturalWeapons(actor) ? ["mgc"] : [],
      range: {
        value: 5,
        long: null,
        units: "ft"
      },
      proficient: true
    },
    flags: {
      [GAROU_ITEM_FLAG_SCOPE]: {
        naturalWeapon: true,
        [CRINOS_NATURAL_WEAPON_FLAG]: id
      }
    }
  };
}

function isHispoNaturalWeaponItem(item) {
  const flags = item?.flags?.[GAROU_ITEM_FLAG_SCOPE];
  const flagId = flags?.[HISPO_NATURAL_WEAPON_FLAG];
  const sysId = item?.system?.identifier;
  return (
    flagId === HISPO_BITE_ID ||
    flagId === HISPO_CLAW_ID ||
    sysId === HISPO_BITE_ID ||
    sysId === HISPO_CLAW_ID
  );
}

function buildHispoWeaponData(kind, actor) {
  const isBite = kind === "bite";
  const id = isBite ? HISPO_BITE_ID : HISPO_CLAW_ID;
  const name = isBite ? "Bite (Hispo)" : "Claw (Hispo)";
  const damageDie = isBite ? "1d10" : "1d6";
  const damageType = isBite ? "piercing" : "slashing";

  return {
    name,
    type: "weapon",
    img: "systems/dnd5e/icons/svg/items/feature.svg",
    system: {
      description: {
        value: `<p><strong>${name}</strong></p><p>Natural weapon available while in Hispo form.</p>`,
        chat: `<p><strong>${name}</strong> (Hispo form)</p>`
      },
      identifier: id,
      source: { revision: 1, rules: "2024" },
      quantity: 1,
      weight: 0,
      price: { value: 0, denomination: "gp" },
      weaponType: "simpleM",
      damage: { parts: [[`${damageDie}`, damageType]] },
      properties: hasEmpoweredNaturalWeapons(actor) ? ["mgc"] : [],
      range: {
        value: 5,
        long: null,
        units: "ft"
      },
      proficient: true
    },
    flags: {
      [GAROU_ITEM_FLAG_SCOPE]: {
        naturalWeapon: true,
        [HISPO_NATURAL_WEAPON_FLAG]: id
      }
    }
  };
}

async function syncLupusNaturalWeapons(actor) {
  if (!actor || actor.type !== "character") return;
  if (!isGarouActor(actor)) return;

  await withActorLock(actor, async () => {
    // Don't rely on "exactly one enabled form" ordering; just check if Lupus is active.
    const shouldHave = isFormActive(actor, "Lupus");

    const items = actor.items?.contents ?? actor.items ?? [];
    const existing = items.filter(isLupusNaturalWeaponItem);
    const bites = existing.filter(i => (i.system?.identifier ?? i.flags?.[GAROU_ITEM_FLAG_SCOPE]?.[LUPUS_NATURAL_WEAPON_FLAG]) === LUPUS_BITE_ID);
    const claws = existing.filter(i => (i.system?.identifier ?? i.flags?.[GAROU_ITEM_FLAG_SCOPE]?.[LUPUS_NATURAL_WEAPON_FLAG]) === LUPUS_CLAW_ID);

    if (shouldHave) {
      // Remove duplicates first (keep 1 of each).
      const empowered = hasEmpoweredNaturalWeapons(actor);
      const toDelete = [];
      if (bites.length > 1) toDelete.push(...bites.slice(1).map(i => i.id));
      if (claws.length > 1) toDelete.push(...claws.slice(1).map(i => i.id));
      if (toDelete.length) {
        try {
          await actor.deleteEmbeddedDocuments("Item", toDelete);
        } catch (err) {
          console.warn("[garou] duplicate Lupus weapon cleanup failed (safe to ignore):", err);
        }
      }

      const toCreate = [];
      if (bites.length === 0) toCreate.push(buildLupusWeaponData("bite", actor));
      if (claws.length === 0) toCreate.push(buildLupusWeaponData("claw", actor));
      if (toCreate.length) {
        try {
          await actor.createEmbeddedDocuments("Item", toCreate);
        } catch (err) {
          console.error("[garou] failed creating Lupus natural weapons:", err);
        }
      }

      // Upgrade existing natural weapons to magical once the Garou reaches level 5.
      if (empowered) {
        const toUpdate = [];
        for (const w of [...bites, ...claws]) {
          const props = w.system?.properties ?? [];
          if (!props.includes("mgc")) {
            toUpdate.push({ _id: w.id, "system.properties": [...props, "mgc"] });
          }
        }
        if (toUpdate.length) {
          try {
            await actor.updateEmbeddedDocuments("Item", toUpdate);
          } catch (err) {
            console.warn("[garou] failed to upgrade Lupus natural weapons to magical:", err);
          }
        }
      }
    } else {
      if (existing.length) {
        try {
          await actor.deleteEmbeddedDocuments("Item", existing.map(i => i.id));
        } catch (err) {
          console.warn("[garou] failed deleting Lupus natural weapons (safe to ignore):", err);
        }
      }
    }
  });
}

async function syncGlabroNaturalWeapons(actor) {
  if (!actor || actor.type !== "character") return;
  if (!isGarouActor(actor)) return;

  await withActorLock(actor, async () => {
    const shouldHave = isFormActive(actor, "Glabro");

    const items = actor.items?.contents ?? actor.items ?? [];
    const existing = items.filter(isGlabroNaturalWeaponItem);
    const bites = existing.filter(i => (i.system?.identifier ?? i.flags?.[GAROU_ITEM_FLAG_SCOPE]?.[GLABRO_NATURAL_WEAPON_FLAG]) === GLABRO_BITE_ID);
    const claws = existing.filter(i => (i.system?.identifier ?? i.flags?.[GAROU_ITEM_FLAG_SCOPE]?.[GLABRO_NATURAL_WEAPON_FLAG]) === GLABRO_CLAW_ID);

    if (shouldHave) {
      const empowered = hasEmpoweredNaturalWeapons(actor);
      const toDelete = [];
      if (bites.length > 1) toDelete.push(...bites.slice(1).map(i => i.id));
      if (claws.length > 1) toDelete.push(...claws.slice(1).map(i => i.id));
      if (toDelete.length) {
        try {
          await actor.deleteEmbeddedDocuments("Item", toDelete);
        } catch (err) {
          console.warn("[garou] duplicate Glabro weapon cleanup failed (safe to ignore):", err);
        }
      }

      const toCreate = [];
      if (bites.length === 0) toCreate.push(buildGlabroWeaponData("bite", actor));
      if (claws.length === 0) toCreate.push(buildGlabroWeaponData("claw", actor));
      if (toCreate.length) {
        try {
          await actor.createEmbeddedDocuments("Item", toCreate);
        } catch (err) {
          console.error("[garou] failed creating Glabro natural weapons:", err);
        }
      }

      if (empowered) {
        const toUpdate = [];
        for (const w of [...bites, ...claws]) {
          const props = w.system?.properties ?? [];
          if (!props.includes("mgc")) {
            toUpdate.push({ _id: w.id, "system.properties": [...props, "mgc"] });
          }
        }
        if (toUpdate.length) {
          try {
            await actor.updateEmbeddedDocuments("Item", toUpdate);
          } catch (err) {
            console.warn("[garou] failed to upgrade Glabro natural weapons to magical:", err);
          }
        }
      }
    } else {
      if (existing.length) {
        try {
          await actor.deleteEmbeddedDocuments("Item", existing.map(i => i.id));
        } catch (err) {
          console.warn("[garou] failed deleting Glabro natural weapons (safe to ignore):", err);
        }
      }
    }
  });
}

async function syncCrinosNaturalWeapons(actor) {
  if (!actor || actor.type !== "character") return;
  if (!isGarouActor(actor)) return;

  await withActorLock(actor, async () => {
    const shouldHave = isFormActive(actor, "Crinos");

    const items = actor.items?.contents ?? actor.items ?? [];
    const existing = items.filter(isCrinosNaturalWeaponItem);
    const bites = existing.filter(i => (i.system?.identifier ?? i.flags?.[GAROU_ITEM_FLAG_SCOPE]?.[CRINOS_NATURAL_WEAPON_FLAG]) === CRINOS_BITE_ID);
    const claws = existing.filter(i => (i.system?.identifier ?? i.flags?.[GAROU_ITEM_FLAG_SCOPE]?.[CRINOS_NATURAL_WEAPON_FLAG]) === CRINOS_CLAW_ID);

    if (shouldHave) {
      const empowered = hasEmpoweredNaturalWeapons(actor);
      const toDelete = [];
      if (bites.length > 1) toDelete.push(...bites.slice(1).map(i => i.id));
      if (claws.length > 1) toDelete.push(...claws.slice(1).map(i => i.id));
      if (toDelete.length) {
        try {
          await actor.deleteEmbeddedDocuments("Item", toDelete);
        } catch (err) {
          console.warn("[garou] duplicate Crinos weapon cleanup failed (safe to ignore):", err);
        }
      }

      const toCreate = [];
      if (bites.length === 0) toCreate.push(buildCrinosWeaponData("bite", actor));
      if (claws.length === 0) toCreate.push(buildCrinosWeaponData("claw", actor));
      if (toCreate.length) {
        try {
          await actor.createEmbeddedDocuments("Item", toCreate);
        } catch (err) {
          console.error("[garou] failed creating Crinos natural weapons:", err);
        }
      }

      if (empowered) {
        const toUpdate = [];
        for (const w of [...bites, ...claws]) {
          const props = w.system?.properties ?? [];
          if (!props.includes("mgc")) {
            toUpdate.push({ _id: w.id, "system.properties": [...props, "mgc"] });
          }
        }
        if (toUpdate.length) {
          try {
            await actor.updateEmbeddedDocuments("Item", toUpdate);
          } catch (err) {
            console.warn("[garou] failed to upgrade Crinos natural weapons to magical:", err);
          }
        }
      }
    } else {
      if (existing.length) {
        try {
          await actor.deleteEmbeddedDocuments("Item", existing.map(i => i.id));
        } catch (err) {
          console.warn("[garou] failed deleting Crinos natural weapons (safe to ignore):", err);
        }
      }
    }
  });
}

async function syncHispoNaturalWeapons(actor) {
  if (!actor || actor.type !== "character") return;
  if (!isGarouActor(actor)) return;

  await withActorLock(actor, async () => {
    const shouldHave = isFormActive(actor, "Hispo");

    const items = actor.items?.contents ?? actor.items ?? [];
    const existing = items.filter(isHispoNaturalWeaponItem);
    const bites = existing.filter(i => (i.system?.identifier ?? i.flags?.[GAROU_ITEM_FLAG_SCOPE]?.[HISPO_NATURAL_WEAPON_FLAG]) === HISPO_BITE_ID);
    const claws = existing.filter(i => (i.system?.identifier ?? i.flags?.[GAROU_ITEM_FLAG_SCOPE]?.[HISPO_NATURAL_WEAPON_FLAG]) === HISPO_CLAW_ID);

    if (shouldHave) {
      const empowered = hasEmpoweredNaturalWeapons(actor);
      const toDelete = [];
      if (bites.length > 1) toDelete.push(...bites.slice(1).map(i => i.id));
      if (claws.length > 1) toDelete.push(...claws.slice(1).map(i => i.id));
      if (toDelete.length) {
        try {
          await actor.deleteEmbeddedDocuments("Item", toDelete);
        } catch (err) {
          console.warn("[garou] duplicate Hispo weapon cleanup failed (safe to ignore):", err);
        }
      }

      const toCreate = [];
      if (bites.length === 0) toCreate.push(buildHispoWeaponData("bite", actor));
      if (claws.length === 0) toCreate.push(buildHispoWeaponData("claw", actor));
      if (toCreate.length) {
        try {
          await actor.createEmbeddedDocuments("Item", toCreate);
        } catch (err) {
          console.error("[garou] failed creating Hispo natural weapons:", err);
        }
      }

      if (empowered) {
        const toUpdate = [];
        for (const w of [...bites, ...claws]) {
          const props = w.system?.properties ?? [];
          if (!props.includes("mgc")) {
            toUpdate.push({ _id: w.id, "system.properties": [...props, "mgc"] });
          }
        }
        if (toUpdate.length) {
          try {
            await actor.updateEmbeddedDocuments("Item", toUpdate);
          } catch (err) {
            console.warn("[garou] failed to upgrade Hispo natural weapons to magical:", err);
          }
        }
      }
    } else {
      if (existing.length) {
        try {
          await actor.deleteEmbeddedDocuments("Item", existing.map(i => i.id));
        } catch (err) {
          console.warn("[garou] failed deleting Hispo natural weapons (safe to ignore):", err);
        }
      }
    }
  });
}

/** Check if actor has the Shapeshifting Forms feature item (by name). */
function hasShapeshiftingFormsItem(actor) {
  if (!actor?.items) return false;
  return actor.items.some(i => (i.name ?? "").trim() === SHAPESHIFTING_FORMS_NAME);
}

/** Check if actor has a form item (e.g. Homid, Glabro). Match by name or "Form: X". */
function hasFormItem(actor, formName) {
  if (!actor?.items) return false;
  const want = formName.trim();
  const wantPrefixed = `${FORM_PREFIX}${want}`;
  return actor.items.some(i => {
    const n = (i.name ?? "").trim();
    return n === want || n === wantPrefixed;
  });
}

/** Ensure Garou characters have Shapeshifting Forms + all 5 form items; grant from compendium if missing. */
async function ensureFormsGranted(actor) {
  if (!actor || actor.type !== "character") return;
  if (!isGarouActor(actor)) return;

  const pack = game.packs.get(FEATURES_PACK_KEY);
  if (!pack) return;

  const toGrant = [];
  if (!hasShapeshiftingFormsItem(actor)) {
    const entry = pack.index.find(e => (e.name ?? "").trim() === SHAPESHIFTING_FORMS_NAME);
    if (entry) toGrant.push(entry);
  }
  for (const formName of FORM_NAMES) {
    if (!hasFormItem(actor, formName)) {
      const entry = pack.index.find(e => {
        const n = (e.name ?? "").trim();
        return n === formName || n === `${FORM_PREFIX}${formName}`;
      });
      if (entry) toGrant.push(entry);
    }
  }
  if (toGrant.length === 0) return;

  const seen = new Set();
  for (const entry of toGrant) {
    if (seen.has(entry._id)) continue;
    seen.add(entry._id);
    try {
      const doc = await pack.getDocument(entry._id);
      if (!doc) continue;
      const data = doc.toObject();
      delete data._id;
      await actor.createEmbeddedDocuments("Item", [data]);
    } catch (err) {
      console.warn("[garou] ensureFormsGranted: could not grant", entry.name, err);
    }
  }
}

async function enforceSingleForm(actor, preferredEffectId = null) {
  if (!isGarouActor(actor)) return;

  const formEffects = getFormEffects(actor);
  if (!formEffects.length) return;

  const enabled = formEffects.filter(isActiveEffect);

  function effectFormName(eff) {
    const n = (eff?.name ?? "").trim();
    if (!n.startsWith(FORM_PREFIX)) return null;
    return n.slice(FORM_PREFIX.length).trim() || null;
  }

  function effectScore(eff) {
    // Prefer "real" form effects (ones that actually apply mechanics),
    // since some worlds have duplicate "Form: X" effects with no changes.
    const changes = eff?.changes ?? eff?.data?.changes ?? [];
    const changeCount = Array.isArray(changes) ? changes.length : 0;
    const hasMove = Array.isArray(changes) && changes.some(c => c?.key === "system.attributes.movement.walk");
    const hasFlags = Array.isArray(changes) && changes.some(c => (c?.key ?? "").startsWith("flags.dnd5e.skills."));
    const fromItem = eff?.parent instanceof Item;
    return (changeCount * 10) + (hasMove ? 1000 : 0) + (hasFlags ? 100 : 0) + (fromItem ? 1 : 0);
  }

  // Determine which form we want active.
  let targetForm = null;
  if (preferredEffectId) {
    const pref = formEffects.find(e => e.uuid === preferredEffectId);
    targetForm = effectFormName(pref);
  }
  if (!targetForm && enabled.length) targetForm = effectFormName(enabled[0]);
  if (!targetForm) targetForm = "Homid";

  // Among all effects of that form (even disabled), keep the "best" one.
  const candidates = formEffects.filter(e => effectFormName(e) === targetForm);
  let keep = candidates.sort((a, b) => effectScore(b) - effectScore(a))[0] ?? null;
  if (!keep) keep = formEffects[0];

  const keepForm = effectFormName(keep);

  // If we're keeping Lupus, Glabro, Crinos, or Hispo, ensure their mechanical changes are present
  // so they can apply the correct bonuses on older actors.
  if (keepForm === "Lupus" || keepForm === "Glabro" || keepForm === "Crinos" || keepForm === "Hispo") {
    const desired =
      keepForm === "Lupus"
        ? buildLupusEffectChanges()
        : keepForm === "Glabro"
        ? buildGlabroEffectChanges()
        : keepForm === "Crinos"
        ? buildCrinosEffectChanges()
        : buildHispoEffectChanges();
    const current = Array.isArray(keep.changes) ? keep.changes : [];
    const sameShape =
      current.length === desired.length &&
      desired.every((dc, i) =>
        current[i]?.key === dc.key &&
        String(current[i]?.value) === String(dc.value) &&
        Number(current[i]?.priority ?? 0) === Number(dc.priority ?? 0)
      );
    if (!sameShape) {
      try {
        await keep.update({ changes: desired }, { [GUARD_OPTION]: true });
      } catch (err) {
        console.warn("[garou] could not normalize form effect changes for", keepForm, ":", err);
      }
    }
  }

  /** @type {Map<any, any[]>} */
  const updatesByParent = new Map();

  for (const e of formEffects) {
    const shouldDisable = e.uuid !== keep.uuid;
    const nextDisabled = shouldDisable;
    if (e.disabled !== nextDisabled) {
      const parent = e.parent;
      if (!parent) continue;
      const arr = updatesByParent.get(parent) ?? [];
      arr.push({ _id: e.id, disabled: nextDisabled });
      updatesByParent.set(parent, arr);
    }
  }

  if (updatesByParent.size) {
    for (const [parent, updates] of updatesByParent.entries()) {
      await parent.updateEmbeddedDocuments("ActiveEffect", updates, { [GUARD_OPTION]: true });
    }
  }
}

// ---- Hooks ----

// When any form ActiveEffect is updated, enforce "only one" and sync Lupus weapons.
Hooks.on("updateActiveEffect", async (effect, changed, options) => {
  const parent = effect?.parent;
  // Effect can be embedded on Actor OR on an owned Item (transfer effect).
  const actor = parent instanceof Actor ? parent : (parent instanceof Item ? parent.parent : null);
  if (!(actor instanceof Actor)) return;
  if (!isGarouActor(actor)) return;
  if (!isFormEffect(effect)) return;

  // Only care about toggles that can affect application.
  const touchesDisabled = Object.prototype.hasOwnProperty.call(changed ?? {}, "disabled");
  const touchesSuppressed = Object.prototype.hasOwnProperty.call(changed ?? {}, "suppressed");
  if (!touchesDisabled && !touchesSuppressed) return;

  try {
    // If a form was just enabled, prefer it; otherwise just normalize.
    // Skip enforcement on guarded updates to avoid redundant loops,
    // but still sync Lupus weapons in case the shift macro uses the same guard option.
    if (!options?.[GUARD_OPTION]) {
      if (changed.disabled === false) await enforceSingleForm(actor, effect.uuid);
      else await enforceSingleForm(actor);
    }
    if (changed.disabled === false) {
      const newForm = getEnabledFormName(actor);
      await handleFormChange(actor, newForm);
    }
    await syncLupusNaturalWeapons(actor);
    await syncGlabroNaturalWeapons(actor);
    await syncCrinosNaturalWeapons(actor);
    await syncHispoNaturalWeapons(actor);
  } catch (err) {
    console.error("[garou] form update error:", err);
  }
});

// If a form effect is deleted, resync Lupus weapons (and normalize if needed).
Hooks.on("deleteActiveEffect", async (effect, options) => {
  if (options?.[GUARD_OPTION]) return;
  const parent = effect?.parent;
  const actor = parent instanceof Actor ? parent : (parent instanceof Item ? parent.parent : null);
  if (!(actor instanceof Actor)) return;
  if (!isGarouActor(actor)) return;
  if (!isFormEffect(effect)) return;
  try {
    await enforceSingleForm(actor);
    await syncLupusNaturalWeapons(actor);
    await syncGlabroNaturalWeapons(actor);
    await syncCrinosNaturalWeapons(actor);
    await syncHispoNaturalWeapons(actor);
  } catch (err) {
    console.error("[garou] form delete error:", err);
  }
});

// Safety net: when sheet opens, normalize (helps after imports); also ensure forms are granted
Hooks.on("renderActorSheet", (app) => {
  const actor = app.actor;
  if (!isGarouActor(actor)) return;
  ensureFormsGranted(actor)
    .then(() => enforceSingleForm(actor))
    .then(() => syncLupusNaturalWeapons(actor))
    .then(() => syncGlabroNaturalWeapons(actor))
    .then(() => syncCrinosNaturalWeapons(actor))
    .then(() => syncHispoNaturalWeapons(actor))
    .catch(err => console.error("[garou] garou-forms (render) error:", err));
});

Hooks.on("createActor", (actor) => {
  if (actor?.type === "character" && isGarouActor(actor)) {
    ensureFormsGranted(actor).catch(err => console.error("[garou] ensureFormsGranted (createActor):", err));
  }
});

Hooks.on("updateActor", (actor, changed) => {
  if (!changed.items || actor?.type !== "character") return;
  if (!isGarouActor(actor)) return;
  ensureFormsGranted(actor).then(() => enforceSingleForm(actor)).catch(err => console.error("[garou] garou-forms (updateActor):", err));
});

Hooks.on("updateItem", (item, changed, options) => {
  if (item.type !== "class" || (item.actor ?? item.parent)?.type !== "character") return;
  const id = (item.system?.identifier ?? "").toLowerCase();
  const name = (item.name ?? "").toLowerCase();
  if (id !== "garou" && name !== "garou") return;
  const actor = item.actor ?? item.parent;
  if (actor) ensureFormsGranted(actor).catch(err => console.error("[garou] ensureFormsGranted (updateItem):", err));
});

Hooks.once("ready", async () => {
  for (const actor of game.actors?.contents ?? []) {
    if (actor.type !== "character" || !isGarouActor(actor)) continue;
    try {
      await ensureFormsGranted(actor);
      await enforceSingleForm(actor);
      await syncLupusNaturalWeapons(actor);
      await syncGlabroNaturalWeapons(actor);
      await syncCrinosNaturalWeapons(actor);
      await syncHispoNaturalWeapons(actor);
    } catch (err) {
      console.error("[garou] garou-forms (ready):", err);
    }
  }
});
