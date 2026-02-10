/**
 * Sun Whip — when the bonus action "Ignite" activity is used, apply the item's
 * "Sun Whip Ignited" effect to the actor for 1 minute (60 seconds).
 */

const SUN_WHIP_IGNITE_ACTIVITY_ID = "s1u2n3w4i5g6n7i8";
const EFFECT_NAME = "Sun Whip Ignited";

function isSunWhip(item) {
  return item?.name === "Sun Whip" || item?.system?.identifier === "sun-whip";
}

function getUsedActivityId(item, config) {
  const id = config?.consumeAction?.activityId ?? config?.activityId ?? null;
  if (id && item?.system?.activities?.[id]) return id;
  return null;
}

async function applySunWhipIgnitedEffect(actor, item) {
  const sourceEffect = item.effects?.find((e) => e.name === EFFECT_NAME);
  if (!sourceEffect) return;

  const data = sourceEffect.toObject();
  delete data._id;
  data.duration = {
    startTime: null,
    seconds: 60,
    combat: null,
    rounds: null,
    turns: null,
    startRound: null,
    startTurn: null,
  };
  data.disabled = false;
  data.origin = item.uuid;

  await actor.createEmbeddedDocuments("ActiveEffect", [data]);
}

function registerSunWhipIgnite() {
  Hooks.on("dnd5e.useItem", async (item, config, options) => {
    if (!isSunWhip(item)) return;
    const activityId = getUsedActivityId(item, config ?? {});
    if (activityId !== SUN_WHIP_IGNITE_ACTIVITY_ID) return;

    const actor = options?.actor ?? item?.actor ?? item?.parent;
    if (!(actor instanceof Actor)) return;
    if (!actor.isOwner && !game.user?.isGM) return;

    await applySunWhipIgnitedEffect(actor, item);

    await ChatMessage.create({
      user: game.user?.id,
      content: `<p><strong>Sun Whip:</strong> The whip ignites for 1 minute. Undead and shapechangers take an additional 1d8 radiant damage on hits.</p>`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    });
  });
}

registerSunWhipIgnite();
