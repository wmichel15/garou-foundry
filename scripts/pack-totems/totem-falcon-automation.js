/**
 * Pack Totems — when "Gain Individual Trait" or "Activate Pack Trait" is used on a
 * supported totem, apply the corresponding embedded effect to the actor.
 * Supports: Totem of Falcon, Totem of Grandfather Thunder, Totem of Pegasus, Totem of Bear, Totem of Boar, Totem of Fenris, Totem of Griffin, Totem of Rat, Totem of Wendigo, Totem of Chimera, Totem of Cockroach, Totem of Owl, Totem of Unicorn, Totem of Coyote, Totem of Cuckoo, Totem of Fox, Totem of Raven.
 */

const PACK_TOTEM_CONFIG = {
  "totem-falcon": {
    name: "Totem of Falcon",
    "t1f2a3l4c5o6n7i8": {
      effectName: "Falcon Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Falcon — Individual Trait.</strong> You have advantage on Wisdom (Perception) checks relying on sight and cannot be surprised unless incapacitated, until your next long rest.</p>",
    },
    "t1f2a3l4c5o6n9p8": {
      effectName: "Falcon's Guidance",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Falcon — Falcon's Guidance.</strong> For 1 minute (or until the end of the current combat): once per round, one pack member may add +1d4 to an attack roll or ability check made with advantage.</p>",
    },
  },
  "totem-grandfather-thunder": {
    name: "Totem of Grandfather Thunder",
    "g1r2a3n4d5f6t7h8": {
      effectName: "Grandfather Thunder Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Grandfather Thunder — Individual Trait.</strong> You have advantage on Charisma (Intimidation) checks; when you make a Gnosis Roll, you may treat a roll of 9 or lower as a 10. Until your next long rest.</p>",
    },
    "g1r2a3n4d5f6t7h9": {
      effectName: "Grandfather Thunder's Authority",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Grandfather Thunder — Grandfather Thunder's Authority.</strong> For 1 minute, while within 30 feet of the Totem: pack members have advantage on saving throws against fear, charm, and being frightened; once during the duration, one pack member may reroll a failed saving throw (table enforcement).</p>",
    },
  },
  "totem-pegasus": {
    name: "Totem of Pegasus",
    "p1e2g3a4s5u6s7i8": {
      effectName: "Pegasus Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Pegasus — Individual Trait.</strong> Until your next long rest: your speed increases by 10 feet; opportunity attacks against you are made with disadvantage; you ignore nonmagical difficult terrain from natural environments.</p>",
    },
    "p1e2g3a4s5u6s9p8": {
      effectName: "Pegasus' Blessing",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Pegasus — Pegasus' Blessing.</strong> For 1 minute, while within 30 feet of the Totem: pack members may move through allied creatures' spaces without penalty; once during the duration, each pack member may move up to half their speed as a reaction without provoking opportunity attacks (must end on solid ground).</p>",
    },
  },
  "totem-bear": {
    name: "Totem of Bear",
    "b1e2a3r4t5o6t7e8": {
      effectName: "Bear Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Bear — Individual Trait.</strong> Until your next long rest: advantage on Constitution saving throws; when you would be reduced to 0 hit points but not killed outright, you may instead drop to 1 hit point (once per long rest).</p>",
    },
    "b1e2a3r4t5o6t7p8": {
      effectName: "Bear's Presence",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Bear — Bear's Presence.</strong> For 1 minute, while within 20 feet of the Totem: pack members gain temp HP equal to their proficiency bonus at the start of each of their turns; pack members have advantage on saving throws against frightened or stunned.</p>",
    },
  },
  "totem-boar": {
    name: "Totem of Boar",
    "b1o2a3r4t5o6t7e8": {
      effectName: "Boar Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Boar — Individual Trait.</strong> Until your next long rest: when you take damage, +1 to melee damage rolls until end of your next turn (stacks once, max +3); advantage on saving throws against being knocked prone.</p>",
    },
    "b1o2a3r4t5o6t7p8": {
      effectName: "Boar's Charge",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Boar — Boar's Charge.</strong> For 1 minute, while within 20 feet of the Totem: first time each pack member takes damage on their turn, they may move up to 10 feet toward a hostile without provoking opportunity attacks (must end closer to an enemy); once during the duration, one pack member may make a melee attack as a reaction after being hit.</p>",
    },
  },
  "totem-fenris": {
    name: "Totem of Fenris",
    "f1e2n3r4i5s6t7e8": {
      effectName: "Fenris Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Fenris — Individual Trait.</strong> Until your next long rest: when you reduce a hostile creature to 0 hit points, gain temp HP equal to your proficiency bonus; once per turn, when you hit a creature below half its HP maximum, deal additional damage equal to your proficiency bonus.</p>",
    },
    "f1e2n3r4i5s6t7p8": {
      effectName: "Fenris' Hunger",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Fenris — Fenris' Hunger.</strong> For 1 minute, while within 20 feet of the Totem: pack members have advantage on their first attack roll each turn against a creature that has already taken damage this round; once during the duration, when a pack member reduces a hostile to 0 hit points, another pack member may make one weapon attack as a reaction.</p>",
    },
  },
  "totem-griffin": {
    name: "Totem of Griffin",
    "g1r2i3f4f5i6n7t8": {
      effectName: "Griffin Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Griffin — Individual Trait.</strong> Until your next long rest: advantage on Wisdom (Perception) and Wisdom (Insight) checks; you cannot be surprised while conscious; when you roll initiative, you may add +2 to the result.</p>",
    },
    "g1r2i3f4f5i6n7p8": {
      effectName: "Griffin's Watch",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Griffin — Griffin's Watch.</strong> For 1 minute, while within 30 feet of the Totem: pack members have advantage on initiative rolls; the first attack made against each pack member during the duration is made with disadvantage.</p>",
    },
  },
  "totem-rat": {
    name: "Totem of Rat",
    "r1a2t3t4o5t6e7m8": {
      effectName: "Rat Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Rat — Individual Trait.</strong> Until your next long rest: advantage on Dexterity (Stealth) and Dexterity (Sleight of Hand) checks; when you fail a Dexterity or Constitution saving throw, you may reroll the save and take the new result (once per long rest).</p>",
    },
    "r1a2t3t4o5t6p7a8": {
      effectName: "Rat's Cunning",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Rat — Rat's Cunning.</strong> For 1 minute, while within 30 feet of the Totem: pack members may take the Hide action as a bonus action; once during the duration, when a pack member would be reduced to 0 hit points, they may instead drop to 1 hit point and move up to 10 feet without provoking opportunity attacks (must end in cover or concealment if possible).</p>",
    },
  },
  "totem-wendigo": {
    name: "Totem of Wendigo",
    "w1e2n3d4i5g6o7t8": {
      effectName: "Wendigo Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Wendigo — Individual Trait.</strong> Until your next long rest: resistance to cold damage; advantage on saving throws against exhaustion; when you would gain a level of exhaustion, you may ignore that level once per long rest.</p>",
    },
    "w1e2n3d4i5g6o7p8": {
      effectName: "Wendigo's Resolve",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Wendigo — Wendigo's Resolve.</strong> For 1 minute, while within 20 feet of the Totem: pack members gain resistance to cold damage and advantage on Constitution saving throws; once during the duration, when a pack member would drop to 0 hit points, they may instead drop to 1 hit point and gain one level of exhaustion instead.</p>",
    },
  },
  "totem-chimera": {
    name: "Totem of Chimera",
    "c1h2i3m4e5r6a7t8": {
      effectName: "Chimera Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Chimera — Individual Trait.</strong> Until your next long rest: advantage on Intelligence (Investigation) and Wisdom (Insight) checks; once per long rest, when you fail a Gnosis Roll, you may reroll and must use the new result.</p>",
    },
    "c1h2i3m4e5r6a7p8": {
      effectName: "Chimera's Visions",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Chimera — Chimera's Visions.</strong> For 1 minute, while within 30 feet of the Totem: pack members have advantage on saving throws against being charmed or frightened; once during the duration, when a pack member would be deceived by an illusion, disguise, or false information, they may recognize the deception and treat it as revealed (does not dispel).</p>",
    },
  },
  "totem-cockroach": {
    name: "Totem of Cockroach",
    "c1o2c3k4r5o6a7c8": {
      effectName: "Cockroach Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Cockroach — Individual Trait.</strong> Until your next long rest: advantage on saving throws against poison and disease and on Constitution saves to resist environmental effects; once per long rest, when you would gain a level of exhaustion, you may ignore that level.</p>",
    },
    "c1o2c3k4r5o6a7p8": {
      effectName: "Cockroach's Endurance",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Cockroach — Cockroach's Endurance.</strong> For 1 minute, while within 30 feet of the Totem: pack members have advantage on Constitution saving throws and ignore difficult terrain from rubble, debris, filth, or environmental ruin; once during the duration, when a pack member would drop to 0 hit points, they may instead drop to 1 hit point and gain one level of exhaustion.</p>",
    },
  },
  "totem-owl": {
    name: "Totem of Owl",
    "o1w2l3t4o5t6e7m8": {
      effectName: "Owl Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Owl — Individual Trait.</strong> Until your next long rest: advantage on Intelligence (Arcana, History) and Wisdom (Insight) checks; when you roll initiative, you may choose to reroll the result and take either roll.</p>",
    },
    "o1w2l3t4o5t6p7a8": {
      effectName: "Owl's Foresight",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Owl — Owl's Foresight.</strong> For 1 minute, while within 30 feet of the Totem: pack members have advantage on their first saving throw each round; once during the duration, one pack member may treat a failed saving throw as a success.</p>",
    },
  },
  "totem-unicorn": {
    name: "Totem of Unicorn",
    "u1n2i3c4o5r6n7t8": {
      effectName: "Unicorn Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Unicorn — Individual Trait.</strong> Until your next long rest: speed +10 ft; proficiency (or expertise) in Medicine and Survival; advantage on Wisdom (Medicine) and Charisma (Persuasion) checks to calm, heal, or comfort others. Drawback: first attack each combat vs Garou or non-Wyrm humanoid has disadvantage (exceptions apply).</p>",
    },
    "u1n2i3c4o5r6n7p8": {
      effectName: "Unicorn's Grace",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Unicorn — Unicorn's Grace.</strong> For 1 minute, while within 30 feet of the Totem: pack members ignore nonmagical difficult terrain and have advantage on Dexterity saving throws; when a pack member restores hit points to another creature, that creature regains additional HP equal to the healer's proficiency bonus (once per creature per round).</p>",
    },
  },
  "totem-coyote": {
    name: "Totem of Coyote",
    "c1o2y3o4t5e6t7o8": {
      effectName: "Coyote Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Coyote — Individual Trait.</strong> Until your next long rest: advantage on Charisma (Deception) and Charisma (Performance) checks; once per long rest, when you fail an ability check, you may reroll and take the new result; when you succeed on Deception or Sleight of Hand by 5 or more, advantage on your next attack or ability check before end of your next turn.</p>",
    },
    "c1o2y3o4t5e6t7p8": {
      effectName: "Coyote's Chaos",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Coyote — Coyote's Chaos.</strong> For 1 minute, while within 30 feet of the Totem: pack members have advantage on Dexterity (Stealth), Charisma (Deception), and Wisdom (Survival) in urban or wilderness; once during the duration, when a pack member fails a Dexterity or Charisma ability check, they may treat the result as a 10 on the die. Pack can locate one another on the same plane (willing, conscious).</p>",
    },
  },
  "totem-cuckoo": {
    name: "Totem of Cuckoo",
    "c1u2c3k4o5o6t7e8": {
      effectName: "Cuckoo Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Cuckoo — Individual Trait.</strong> Until your next long rest: advantage on Charisma (Deception) and Charisma (Persuasion) checks; once per long rest, when a creature questions your authority, identity, or presence, you may force opposed Wisdom (Insight) vs your Charisma (Deception) — on failure they accept you belong.</p>",
    },
    "c1u2c3k4o5o6t7p8": {
      effectName: "Overlooked Presence",
      durationSeconds: 600,
      chat: "<p><strong>Totem of Cuckoo — Overlooked Presence.</strong> Designate one willing pack member. For up to 10 minutes, while within 30 feet of the Totem: creatures assume the chosen character has permission or valid reason to be present; guards do not challenge unless hostile act, drawing attention, or obviously prohibited. If they draw attention, Charisma (Deception) vs DM DC — success: suspicion fades; failure: effect ends. Only one pack member at a time.</p>",
    },
  },
  "totem-fox": {
    name: "Totem of Fox",
    "f1o2x3t4o5t6e7m8": {
      effectName: "Fox Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Fox — Individual Trait.</strong> Until your next long rest: advantage on Charisma (Deception) and Charisma (Persuasion) checks; once per long rest, when you fail a Charisma-based ability check, you may reroll and take the new result; when you successfully deceive or mislead a creature, advantage on your next Dexterity (Stealth) or Dexterity (Acrobatics) check before end of your next turn.</p>",
    },
    "f1o2x3t4o5t6p7a8": {
      effectName: "Fox's Cunning",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Fox — Fox's Cunning.</strong> For 1 minute, while within 30 feet of the Totem: pack members have advantage on Dexterity (Stealth) and Charisma (Deception) checks; once during the duration, when a hostile creature fails an ability check, saving throw, or attack roll against a pack member, that pack member may immediately move up to 10 feet without provoking opportunity attacks.</p>",
    },
  },
  "totem-raven": {
    name: "Totem of Raven",
    "r1a2v3e4n5t6e7m8": {
      effectName: "Raven Individual Trait",
      durationSeconds: 24 * 60 * 60,
      chat: "<p><strong>Totem of Raven — Individual Trait.</strong> Until your next long rest: advantage on Wisdom (Insight) and Intelligence (Investigation) checks; once per long rest, when you fail a Gnosis Roll, you may treat the result as if you had rolled a 10 on the die.</p>",
    },
    "r1a2v3e4n5t6p7a8": {
      effectName: "Raven's Omens",
      durationSeconds: 60,
      chat: "<p><strong>Totem of Raven — Raven's Omens.</strong> For 1 minute, while within 30 feet of the Totem: pack members have advantage on Dexterity (Stealth) and Charisma (Deception) checks; once during the duration, when a pack member would be surprised, they are not surprised and may immediately move up to 10 feet without provoking opportunity attacks (movement must end in cover or concealment if possible).</p>",
    },
  },
};

function getUsedActivityId(item, config) {
  const id = config?.consumeAction?.activityId ?? config?.activityId ?? null;
  if (id && item?.system?.activities?.[id]) return id;
  return null;
}

function getTotemConfig(item) {
  const id = item?.system?.identifier;
  if (id && PACK_TOTEM_CONFIG[id]) return PACK_TOTEM_CONFIG[id];
  const name = item?.name;
  for (const [key, cfg] of Object.entries(PACK_TOTEM_CONFIG)) {
    if (cfg.name === name) return cfg;
  }
  return null;
}

async function applyEffectFromItem(actor, item, effectName, durationSeconds, chatContent) {
  const sourceEffect = item.effects?.find((e) => e.name === effectName);
  if (!sourceEffect) return;

  const data = sourceEffect.toObject();
  delete data._id;
  data.duration = {
    startTime: null,
    seconds: durationSeconds,
    combat: null,
    rounds: null,
    turns: null,
    startRound: null,
    startTurn: null,
  };
  data.disabled = false;
  data.origin = item.uuid;

  await actor.createEmbeddedDocuments("ActiveEffect", [data]);

  if (chatContent) {
    await ChatMessage.create({
      user: game.user?.id,
      content: chatContent,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    });
  }
}

function registerPackTotems() {
  Hooks.on("dnd5e.useItem", async (item, config, options) => {
    const totemConfig = getTotemConfig(item);
    if (!totemConfig) return;
    const activityId = getUsedActivityId(item, config ?? {});
    if (!activityId) return;
    const activityConfig = totemConfig[activityId];
    if (!activityConfig) return;

    const actor = options?.actor ?? item?.actor ?? item?.parent;
    if (!(actor instanceof Actor)) return;
    if (!actor.isOwner && !game.user?.isGM) return;

    await applyEffectFromItem(
      actor,
      item,
      activityConfig.effectName,
      activityConfig.durationSeconds,
      activityConfig.chat
    );
  });
}

registerPackTotems();
