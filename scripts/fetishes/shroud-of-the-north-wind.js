/**
 * Shroud of the North Wind — when the "Activate" activity is used, apply the item's
 * "Shroud of the North Wind (Active)" effect to the actor for 10 minutes (600 seconds).
 * Activity is limited to once per long rest via the activity's uses.
 */

const SHROUD_ACTIVITY_ID = "s1h2r3o4u5d6n7o8";
const EFFECT_NAME = "Shroud of the North Wind (Active)";

function isShroudOfTheNorthWind(item) {
  return item?.name === "Shroud of the North Wind" || item?.system?.identifier === "shroud-of-the-north-wind";
}

function getUsedActivityId(item, config) {
  const id = config?.consumeAction?.activityId ?? config?.activityId ?? null;
  if (id && item?.system?.activities?.[id]) return id;
  return null;
}

async function applyShroudEffect(actor, item) {
  const sourceEffect = item.effects?.find((e) => e.name === EFFECT_NAME);
  if (!sourceEffect) return;

  const data = sourceEffect.toObject();
  delete data._id;
  data.duration = {
    startTime: null,
    seconds: 600,
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

function registerShroudOfTheNorthWind() {
  Hooks.on("dnd5e.useItem", async (item, config, options) => {
    if (!isShroudOfTheNorthWind(item)) return;
    const activityId = getUsedActivityId(item, config ?? {});
    if (activityId !== SHROUD_ACTIVITY_ID) return;

    const actor = options?.actor ?? item?.actor ?? item?.parent;
    if (!(actor instanceof Actor)) return;
    if (!actor.isOwner && !game.user?.isGM) return;

    await applyShroudEffect(actor, item);

    await ChatMessage.create({
      user: game.user?.id,
      content: `<p><strong>Shroud of the North Wind:</strong> The shroud is active for 10 minutes. You have resistance to cold damage; creatures of your choice within 10 feet have disadvantage on opportunity attacks against you; you ignore difficult terrain from ice, snow, or wind.</p>`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    });
  });
}

registerShroudOfTheNorthWind();
