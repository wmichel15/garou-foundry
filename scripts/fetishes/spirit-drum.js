/**
 * Spirit Drum — when the "Beat Drum" activity is used, apply the item's
 * "Spirit Drum (Playing)" effect to the actor for 1 minute (60 seconds), concentration.
 * Activity is limited to once per long rest via the activity's uses.
 */

const SPIRIT_DRUM_ACTIVITY_ID = "s1p2i3r4i5t6d7r8";
const EFFECT_NAME = "Spirit Drum (Playing)";

function isSpiritDrum(item) {
  return item?.name === "Spirit Drum" || item?.system?.identifier === "spirit-drum";
}

function getUsedActivityId(item, config) {
  const id = config?.consumeAction?.activityId ?? config?.activityId ?? null;
  if (id && item?.system?.activities?.[id]) return id;
  return null;
}

async function applySpiritDrumEffect(actor, item) {
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
    concentration: true,
  };
  data.disabled = false;
  data.origin = item.uuid;

  await actor.createEmbeddedDocuments("ActiveEffect", [data]);
}

function registerSpiritDrum() {
  Hooks.on("dnd5e.useItem", async (item, config, options) => {
    if (!isSpiritDrum(item)) return;
    const activityId = getUsedActivityId(item, config ?? {});
    if (activityId !== SPIRIT_DRUM_ACTIVITY_ID) return;

    const actor = options?.actor ?? item?.actor ?? item?.parent;
    if (!(actor instanceof Actor)) return;
    if (!actor.isOwner && !game.user?.isGM) return;

    await applySpiritDrumEffect(actor, item);

    await ChatMessage.create({
      user: game.user?.id,
      content: `<p><strong>Spirit Drum:</strong> You are beating the drum (concentration). For up to 1 minute, allies within 30 feet gain advantage on saving throws against fear and charm, and advantage on their next Gnosis Roll.</p>`,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    });
  });
}

registerSpiritDrum();
