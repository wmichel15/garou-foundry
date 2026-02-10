/**
 * Fetish automation – enforces access (Min Max Gnosis), rage, Force DC / fail-by-5+,
 * Appease consumption, Spirit Attention limit, and rest-clear of spirit refusal.
 * Requires [GAROU_FETISH] tag in item description; two activities per fetish (Force + Appease).
 */

const GAROU = { scope: "garou" };
const FETISH_TAG = "[GAROU_FETISH]";
const FLAG_SPIRIT_REFUSED_PREFIX = "fetishSpiritRefused.";
const FLAG_PENDING_FORCE = "fetishPendingForce";
const FLAG_FETISH_ID = "fetishId";

// —— Gnosis helpers (same logic as Rite of Cleansing) ——
function getGnosisMax(actor) {
  const GNOSIS_BY_LEVEL = { 1: 2, 2: 3, 3: 3, 4: 4, 5: 5, 6: 6, 7: 6, 8: 7, 9: 8, 10: 9, 11: 10, 12: 10, 13: 11, 14: 12, 15: 13, 16: 13, 17: 14, 18: 15, 19: 16, 20: 18 };
  const garouLevel = actor?.system?.classes?.garou?.levels ?? actor?.system?.details?.level ?? 0;
  return GNOSIS_BY_LEVEL[garouLevel] ?? GNOSIS_BY_LEVEL[1];
}

async function findOwnedGnosisPool(actor) {
  if (!actor) return { type: null, item: null, resourcePath: null };
  const owned = actor.items?.find(i => {
    if (i.type !== "feat") return false;
    const name = (i.name ?? "").toLowerCase();
    if (name === "gnosis (feature)" || (name.includes("gnosis") && !name.includes("spiritual renewal"))) return true;
    const desc = (i.system?.description?.value ?? "").toLowerCase();
    return desc.includes("[garou_gnosis]") || desc.includes("gnosis pool");
  });
  if (owned) return { type: "item", item: owned, resourcePath: null };
  const resource = actor.system?.resources?.primary;
  if (resource?.label?.toLowerCase() === "gnosis") {
    return { type: "resource", item: null, resourcePath: "system.resources.primary" };
  }
  return { type: null, item: null, resourcePath: null };
}

async function getCurrentGnosis(actor) {
  const pool = await findOwnedGnosisPool(actor);
  if (pool.type === "item" && pool.item) {
    const uses = pool.item.system?.uses ?? {};
    const value = Number(uses.value ?? uses.max ?? 0);
    const spent = Number(uses.spent ?? 0);
    return Math.max(0, value - spent);
  }
  if (pool.type === "resource" && pool.resourcePath) {
    const resource = foundry.utils.getProperty(actor, pool.resourcePath);
    if (resource) return Number(resource.value ?? resource.max ?? 0);
  }
  return 0;
}

// —— Fetish detection and parsing ——
function isFetish(item) {
  if (!item) return false;
  const desc = (item.system?.description?.value ?? "").toLowerCase();
  return desc.includes(FETISH_TAG.toLowerCase());
}

function parseFetishTag(item) {
  const desc = item?.system?.description?.value ?? "";
  const match = desc.match(/\[GAROU_FETISH]\s*([^\[]*)/i);
  if (!match) return null;
  const block = match[1].trim();
  const out = { id: null, rating: 1, minGnosis: 3, activation: "action", rageOk: false };
  for (const part of block.split(";")) {
    const [key, val] = part.split("=").map(s => s?.trim() ?? "");
    if (key === "id") out.id = val;
    else if (key === "rating") out.rating = Math.max(1, Math.min(5, parseInt(val, 10) || 1));
    else if (key === "minGnosis") out.minGnosis = Math.max(3, Math.min(11, parseInt(val, 10) || 3));
    else if (key === "activation") out.activation = val || "action";
    else if (key === "rageOk" && (val === "1" || val === "true")) out.rageOk = true;
  }
  return out;
}

function getActivityById(item, activityId) {
  const activities = item?.system?.activities ?? {};
  if (activityId && activities[activityId]) return activities[activityId];
  return null;
}

function getUsedActivityId(item, config) {
  const id = config?.consumeAction?.activityId ?? config?.activityId ?? null;
  if (id && item?.system?.activities?.[id]) return id;
  const ids = Object.keys(item?.system?.activities ?? {});
  return ids[0] ?? null;
}

function isForceActivity(activity) {
  if (!activity) return false;
  const name = (activity.name ?? "").toLowerCase();
  const hasForceInName = name.includes("force") && name.includes("spirit");
  const targets = activity.consumption?.targets ?? [];
  const consumesGnosis = targets.some(t => (t?.type === "itemUses" && Number(t?.value) > 0));
  return hasForceInName && !consumesGnosis;
}

function isAppeaseActivity(activity) {
  if (!activity) return false;
  const targets = activity.consumption?.targets ?? [];
  return targets.some(t => t?.type === "itemUses" && Number(t?.value) >= 1);
}

function activityHasDuration(activity) {
  if (!activity?.duration) return false;
  const units = (activity.duration.units ?? "").toLowerCase();
  return units !== "inst" && units !== "instantaneous" && units !== "";
}

function isRaging(actor) {
  if (!actor) return false;
  const effects = actor.effects ?? [];
  for (const e of effects) {
    if (e.disabled) continue;
    const name = (e.name ?? "").toLowerCase();
    if (name.includes("rage")) return true;
    if (e.getFlag?.(GAROU.scope, "rage") === true) return true;
  }
  return false;
}

function getSpiritRefusedFlagKey(item) {
  const id = item?.id ?? item?.uuid ?? "unknown";
  return FLAG_SPIRIT_REFUSED_PREFIX + id;
}

function hasSpiritRefused(actor, item) {
  if (!actor) return false;
  const key = getSpiritRefusedFlagKey(item);
  return actor.getFlag(GAROU.scope, key) === true;
}

function countActiveFetishEffects(actor) {
  if (!actor?.effects) return 0;
  return actor.effects.filter(e => !e.disabled && e.getFlag?.(GAROU.scope, FLAG_FETISH_ID)).length;
}

async function spiritAttentionDialog(actor, itemName) {
  const effects = (actor.effects ?? []).filter(e => !e.disabled && e.getFlag?.(GAROU.scope, FLAG_FETISH_ID));
  if (effects.length === 0) return null;
  return new Promise(resolve => {
    const buttons = {};
    effects.forEach(e => {
      buttons[e.id] = {
        icon: '<i class="fas fa-times"></i>',
        label: e.name || "Active Fetish effect",
        callback: () => resolve(e.id),
      };
    });
    buttons.cancel = {
      icon: '<i class="fas fa-ban"></i>',
      label: "Cancel",
      callback: () => resolve(null),
    };
    new Dialog({
      title: "Spirit Attention limit",
      content: `<p>You're at your Spirit Attention limit. End one active Fetish effect to activate <strong>${itemName}</strong>, or cancel.</p>`,
      buttons,
      default: "cancel",
      close: () => resolve(null),
    }).render(true);
  });
}

async function postFetishFailure(actor, item, failBy5OrMore) {
  const key = getSpiritRefusedFlagKey(item);
  if (failBy5OrMore) {
    await actor.setFlag(GAROU.scope, key, true);
    await ChatMessage.create({
      user: game.user?.id,
      content: `<p><strong>Fetish (${item.name}):</strong> The spirit refuses further activation until you complete a short or long rest.</p>`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    });
  } else {
    await ChatMessage.create({
      user: game.user?.id,
      content: `<p><strong>Fetish (${item.name}):</strong> Did not activate. No Gnosis spent.</p>`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    });
  }
}

function clearPendingForce(actor) {
  return actor.unsetFlag(GAROU.scope, FLAG_PENDING_FORCE);
}

// —— preUseItem: access, rage, spirit refused, Spirit Attention, store pending Force ——
async function runFetishPreUse(item, actor, config) {
  const meta = parseFetishTag(item);
  if (!meta) return false;

  const activityId = getUsedActivityId(item, config);
  const activity = getActivityById(item, activityId);
  const isForce = activity ? isForceActivity(activity) : false;
  const isAppease = activity ? isAppeaseActivity(activity) : false;

  // Access: Max Gnosis >= minGnosis
  const maxGnosis = getGnosisMax(actor);
  if (maxGnosis < meta.minGnosis) {
    await ChatMessage.create({
      user: game.user?.id,
      content: `<p><strong>${item.name}:</strong> Requires Minimum Max Gnosis ${meta.minGnosis}. Your Max Gnosis is ${maxGnosis}.</p>`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    });
    return true;
  }

  // Rage (unless fetish allows)
  if (!meta.rageOk && isRaging(actor)) {
    await ChatMessage.create({
      user: game.user?.id,
      content: `<p><strong>${item.name}:</strong> Cannot activate a Fetish while raging.</p>`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    });
    return true;
  }

  // Spirit refused (Force only)
  if (isForce && hasSpiritRefused(actor, item)) {
    await ChatMessage.create({
      user: game.user?.id,
      content: `<p><strong>${item.name}:</strong> The spirit refuses until you complete a short or long rest.</p>`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    });
    return true;
  }

  // Spirit Attention (only if this activation has a duration)
  const hasDuration = activity ? activityHasDuration(activity) : false;
  if (hasDuration) {
    const wisValue = Number(actor.system?.abilities?.wis?.value ?? 10);
    const wisMod = Math.max(1, Math.floor((wisValue - 10) / 2));
    const activeCount = countActiveFetishEffects(actor);
    if (activeCount >= wisMod) {
      const endEffectId = await spiritAttentionDialog(actor, item.name);
      if (endEffectId == null) {
        await ChatMessage.create({
          user: game.user?.id,
          content: `<p><strong>${item.name}:</strong> Spirit Attention limit reached (${activeCount} active; max ${wisMod}). Activation cancelled.</p>`,
          type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        });
        return true;
      }
      const eff = actor.effects.get(endEffectId);
      if (eff) await actor.deleteEmbeddedDocuments("ActiveEffect", [eff.id]);
    }
  }

  // Appease: optional Gnosis check
  if (isAppease) {
    const current = await getCurrentGnosis(actor);
    if (current < 1) {
      await ChatMessage.create({
        user: game.user?.id,
        content: `<p><strong>${item.name}:</strong> Insufficient Gnosis (need 1).</p>`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      });
      return true;
    }
  }

  // Force: store pending for rollCheck
  if (isForce) {
    await actor.setFlag(GAROU.scope, FLAG_PENDING_FORCE, {
      itemId: item.id ?? item.uuid,
      itemName: item.name,
      activityId,
      rating: meta.rating,
    });
  }

  return false;
}

// —— Hooks ——
function registerFetishAutomation() {
  Hooks.on("dnd5e.preUseItem", async (item, config, options) => {
    if (!isFetish(item)) return;
    const actor = options?.actor ?? item?.actor ?? item?.parent;
    if (!(actor instanceof Actor)) return;
    const shouldBlock = await runFetishPreUse(item, actor, config ?? {});
    return !!shouldBlock;
  });

  Hooks.on("dnd5e.rollCheck", async (roll, config, options) => {
    const actor = options?.actor ?? options?.actorId ? game.actors.get(options.actorId) : null;
    if (!actor) return;
    const pending = actor.getFlag(GAROU.scope, FLAG_PENDING_FORCE);
    if (!pending || typeof pending !== "object") return;

    const item = options?.item ?? (pending.itemId ? actor.items.get(pending.itemId) ?? null : null);
    if (!item || !isFetish(item)) {
      await clearPendingForce(actor);
      return;
    }

    const rating = pending.rating ?? parseFetishTag(item)?.rating ?? 1;
    const dc = 10 + rating;
    const total = roll.total;
    const success = total >= dc;
    const failBy5OrMore = !success && total < dc - 5;

    await clearPendingForce(actor);

    if (success) {
      // Allow effect to apply; optional chat can be added in useItem
      return;
    }

    await postFetishFailure(actor, item, failBy5OrMore);
    // Prevent the item's normal success path (e.g. don't apply effect). Foundry may still show the roll;
    // we've posted our own message. We cannot "cancel" the use after the roll, but the effect is typically
    // applied in useItem – we can block that by not creating effects. The item use already proceeded;
    // for utility activities without automatic effect application, we're fine.
  });

  Hooks.on("dnd5e.useItem", async (item, config, options) => {
    if (!isFetish(item)) return;
    const actor = options?.actor ?? item?.actor ?? item?.parent;
    if (!(actor instanceof Actor)) return;
    const activityId = getUsedActivityId(item, config ?? {});
    const activity = getActivityById(item, activityId);
    if (activity && isAppeaseActivity(activity)) {
      await ChatMessage.create({
        user: game.user?.id,
        content: `<p><strong>${item.name}:</strong> Fetish activated (spirit appeased).</p>`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      });
    }
  });

  Hooks.on("dnd5e.restCompleted", async (actor) => {
    if (!actor) return;
    const garouFlags = actor.flags?.[GAROU.scope] ?? {};
    const keys = Object.keys(garouFlags);
    const toUnset = keys.filter(k => k.startsWith(FLAG_SPIRIT_REFUSED_PREFIX));
    for (const k of toUnset) {
      await actor.unsetFlag(GAROU.scope, k);
    }
  });

  if (typeof game?.modules?.get("midi-qol")?.api !== "undefined") {
    Hooks.on("midi-qol.RollComplete", async (workflow) => {
      const item = workflow?.item;
      const actor = workflow?.actor;
      if (!item || !actor || !isFetish(item)) return;
      const pending = actor.getFlag(GAROU.scope, FLAG_PENDING_FORCE);
      if (!pending || typeof pending !== "object") return;
      const roll = workflow.roll ?? workflow.damageRoll ?? workflow.attackRoll;
      if (!roll || typeof roll.total !== "number") return;
      const rating = pending.rating ?? parseFetishTag(item)?.rating ?? 1;
      const dc = 10 + rating;
      const total = roll.total;
      const success = total >= dc;
      const failBy5OrMore = !success && total < dc - 5;
      await clearPendingForce(actor);
      if (!success) await postFetishFailure(actor, item, failBy5OrMore);
    });
  }
}

Hooks.once("init", () => {
  registerFetishAutomation();
});
