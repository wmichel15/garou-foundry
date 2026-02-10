/**
 * Talens are one-time-use items. When a Talen's activity is used, the item
 * is consumed and removed from the actor's inventory.
 * Talens must have flags.garou.talen === true.
 */

const GAROU = { scope: "garou" };
const FLAG_TALEN = "talen";

function isTalen(item) {
  return item?.flags?.[GAROU.scope]?.[FLAG_TALEN] === true;
}

async function transferTalenEffectsToActor(actor, item) {
  const effects = item.effects?.contents ?? [];
  if (effects.length === 0) return;

  for (const eff of effects) {
    const data = eff.toObject();
    delete data._id;
    data.disabled = false;
    data.origin = item.uuid;
    if (!data.duration) data.duration = { startTime: null, seconds: null, combat: null, rounds: 1, turns: null, startRound: null, startTurn: null };
    await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  }
}

function registerTalenConsumption() {
  Hooks.on("dnd5e.useItem", async (item, config, options) => {
    if (!isTalen(item)) return;

    const actor = options?.actor ?? item?.actor ?? item?.parent;
    if (!(actor instanceof Actor)) return;
    if (!actor.isOwner && !game.user?.isGM) return;

    await transferTalenEffectsToActor(actor, item);
    await actor.deleteEmbeddedDocuments("Item", [item.id]);

    if (ui?.notifications) {
      ui.notifications.info(`${item.name} was consumed.`);
    }
  });
}

registerTalenConsumption();
