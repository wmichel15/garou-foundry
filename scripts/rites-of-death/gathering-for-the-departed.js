/**
 * Gathering for the Departed – Rite of Death (Level 1) automation.
 * On rite use: participant chooses one benefit until end of next long rest:
 *   (1) Advantage on one Wisdom save vs fear/despair/supernatural dread
 *   (2) Advantage on one Charisma-based check to console/inspire/support
 * Benefits are one-use; effect is removed when used or at long rest.
 *
 * FOUNDRY CONFIGURATION: In the activity, set Consumption to Item Uses (Gnosis).
 * Requires: Midi-QOL (optional, for advantage automation).
 */

const GAROU = { scope: "garou" };
const RITE_ID = "gathering-for-the-departed";
const EFFECT_NAME_PREFIX = "Gathering for the Departed — ";

function isGatheringForTheDeparted(item) {
  if (!item) return false;
  const name = (item.name ?? "").trim().toLowerCase();
  if (name.includes("gathering for the departed")) return true;
  const desc = (item.system?.description?.value ?? "").toLowerCase();
  return desc.includes("[garou_rite]") && desc.includes(`id=${RITE_ID}`);
}

function hasGatheringDepartedEffect(actor) {
  return actor?.effects?.some(e => {
    if (e.disabled) return false;
    const n = (e.name ?? "").trim();
    return n.startsWith(EFFECT_NAME_PREFIX) || e.getFlag(GAROU.scope, "gatheringDepartedBenefit");
  }) ?? false;
}

function getGatheringDepartedEffect(actor, benefitType) {
  return actor?.effects?.find(e => {
    if (e.disabled) return false;
    const flag = e.getFlag(GAROU.scope, "gatheringDepartedBenefit");
    return flag === benefitType;
  }) ?? null;
}

async function removeGatheringDepartedEffects(actor) {
  const toRemove = actor?.effects?.filter(e => {
    if (e.disabled) return false;
    return (e.name ?? "").startsWith(EFFECT_NAME_PREFIX) || e.getFlag(GAROU.scope, "gatheringDepartedBenefit");
  }) ?? [];
  if (toRemove.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", toRemove.map(e => e.id));
  }
}

async function chooseBenefitDialog(actorName) {
  return new Promise(resolve => {
    new Dialog({
      title: "Gathering for the Departed — Choose Benefit",
      content: `
        <p>You participated in the rite. Choose <b>one</b> benefit (until end of your next long rest). Benefits do not stack and expire unused.</p>
        <p class="notes">Wis: advantage on one Wis save vs fear, despair, or supernatural dread. Cha: advantage on one Cha check to console, inspire, or support another creature.</p>
      `,
      buttons: {
        wis: {
          icon: '<i class="fas fa-shield-alt"></i>',
          label: "Advantage on one Wisdom save (fear/despair/dread)",
          callback: () => resolve("wisSave"),
        },
        cha: {
          icon: '<i class="fas fa-hand-holding-heart"></i>',
          label: "Advantage on one Charisma check (console/inspire/support)",
          callback: () => resolve("chaCheck"),
        },
        skip: {
          icon: '<i class="fas fa-minus"></i>',
          label: "Skip benefit",
          callback: () => resolve(null),
        },
      },
      default: "wis",
      close: () => resolve(null),
    }).render(true);
  });
}

async function applyBenefitEffect(actor, benefitType) {
  await removeGatheringDepartedEffects(actor);

  const label = benefitType === "wisSave"
    ? "Advantage on one Wis save (fear/despair/dread)"
    : "Advantage on one Cha check (console/inspire/support)";

  const effectData = {
    name: EFFECT_NAME_PREFIX + label,
    icon: "icons/magic/life/heart-cross-blue.webp",
    origin: actor.uuid,
    disabled: false,
    duration: {
      startTime: game.time.worldTime ?? null,
      seconds: null,
      combat: null,
      rounds: null,
      turns: null,
      startRound: null,
      startTurn: null,
    },
    flags: {
      [GAROU.scope]: { gatheringDepartedBenefit: benefitType },
    },
  };

  if (game.modules?.get("dae")?.active) {
    effectData.flags.dae = { specialDuration: ["longRest"] };
  }

  await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  ui.notifications?.info?.(`Gathering for the Departed: ${actor.name} — ${label}. Until end of next long rest.`);
}

async function onRiteUsed(item, actor) {
  if (!actor || !isGatheringForTheDeparted(item)) return;
  if (!actor.isOwner && !game.user.isGM) return;

  const choice = await chooseBenefitDialog(actor.name);
  if (choice == null) return;

  await applyBenefitEffect(actor, choice);

  const activityId = Object.keys(item.system?.activities ?? {})[0];
  const chatFlavor = activityId ? item.system.activities[activityId]?.description?.chatFlavor : null;

  await ChatMessage.create({
    user: game.user?.id,
    content: chatFlavor
      ? `<div class="garou-rite">${chatFlavor}</div><p><strong>Participant benefit:</strong> ${actor.name} chose ${choice === "wisSave" ? "advantage on one Wisdom save (fear/despair/dread)" : "advantage on one Charisma check (console/inspire/support)"}. Lasts until end of next long rest.</p>`
      : `<p><strong>Gathering for the Departed</strong> — ${actor.name} chose benefit: ${choice === "wisSave" ? "advantage on one Wis save (fear/despair/dread)" : "advantage on one Cha check (console/inspire/support)"}. Until end of next long rest.</p>`,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
  });
}

function registerGatheringForTheDepartedHandler() {
  Hooks.on("dnd5e.useItem", async (item, config, options) => {
    if (!isGatheringForTheDeparted(item)) return;
    const actor = options?.actor ?? item?.actor;
    await onRiteUsed(item, actor);
  });

  if (typeof game?.modules?.get("midi-qol")?.api !== "undefined") {
    Hooks.on("midi-qol.RollComplete", async (workflow) => {
      const item = workflow?.item;
      if (item && isGatheringForTheDeparted(item)) {
        const actor = workflow.actor ?? item?.actor;
        if (actor) await onRiteUsed(item, actor);
      }
    });
  }

  // ---- Advantage on one Wisdom save (then remove effect) ----
  Hooks.once("ready", () => {
    if (!game.modules?.get("midi-qol")?.active) return;
    Hooks.on("midi-qol.SavingThrowRoll", (workflow) => {
      try {
        const actor = workflow?.actor;
        if (!actor) return;
        const eff = getGatheringDepartedEffect(actor, "wisSave");
        if (!eff) return;
        const abil = (workflow.ability ?? workflow.item?.system?.ability ?? "").toLowerCase();
        if (abil !== "wis") return;
        workflow.advantage = true;
        eff.delete().catch(() => {});
      } catch (err) {
        console.error("[garou] Gathering for the Departed (Wis save) error:", err);
      }
    });
  });

  // ---- Advantage on one Charisma check (then remove effect) ----
  Hooks.once("ready", () => {
    if (!game.modules?.get("midi-qol")?.active) return;
    Hooks.on("midi-qol.AbilityCheckRoll", (workflow) => {
      try {
        const actor = workflow?.actor;
        if (!actor) return;
        const eff = getGatheringDepartedEffect(actor, "chaCheck");
        if (!eff) return;
        const abil = (workflow.ability ?? workflow.abilityId ?? "").toLowerCase();
        if (abil !== "cha") return;
        workflow.advantage = true;
        eff.delete().catch(() => {});
      } catch (err) {
        console.error("[garou] Gathering for the Departed (Cha check) error:", err);
      }
    });
  });
}

export { isGatheringForTheDeparted, onRiteUsed };

Hooks.once("init", () => {
  registerGatheringForTheDepartedHandler();
});
