/**
 * Rite of Caern Founding – project-based rite automation.
 * Handles contribution tracking, halt/resume logic, and completion.
 */

import {
  getCaernFlags,
  getSelectedCaernActor,
  logCaernHistory,
  findCaernFoundingStateItem,
  getOrInitFoundingProject,
  setExclusiveCaernState,
} from "./caern-api.js";

const FOUNDING_RITE_ID = "caern-founding";
const TOTAL_REQUIRED = 100;

function isCaernFoundingRite(item) {
  if (!item) return false;
  const name = (item.name ?? "").trim().toLowerCase();
  if (name.includes("caern founding") && name.includes("rite")) return true;
  const desc = (item.system?.description?.value ?? "").toLowerCase();
  if (desc.includes("[garou_rite]") && desc.includes(`id=${FOUNDING_RITE_ID}`)) return true;
  const activities = item.system?.activities ?? {};
  for (const a of Object.values(activities)) {
    const chat = (a?.chatFlavor ?? "").toLowerCase();
    if (chat.includes("[garou_rite_use]") && chat.includes(`id=${FOUNDING_RITE_ID}`)) return true;
  }
  return false;
}

function isContributeActivity(activity) {
  if (!activity) return false;
  const name = (activity.name ?? "").toLowerCase();
  const chat = (activity?.description?.chatFlavor ?? "").toLowerCase();
  return name.includes("contribute") || (chat.includes("action=contribute") && chat.includes(FOUNDING_RITE_ID));
}

function isCheckProgressActivity(activity) {
  if (!activity) return false;
  const name = (activity.name ?? "").toLowerCase();
  const chat = (activity?.description?.chatFlavor ?? "").toLowerCase();
  return name.includes("check progress") || name.includes("check") || (chat.includes("action=check") && chat.includes(FOUNDING_RITE_ID));
}

async function ensureFoundingStateItem(caernActor) {
  const existing = caernActor.items.find(i => {
    const name = (i.name ?? "").toLowerCase();
    const desc = (i.system?.description?.value ?? "").toLowerCase();
    return (name.includes("caern founding") && name.includes("invested")) ||
           (desc.includes("[garou_caern_state]") && desc.includes("parent=caern-founding"));
  });
  if (existing) return existing;
  const stateItemDoc = await findCaernFoundingStateItem();
  if (!stateItemDoc) {
    ui.notifications?.warn?.("Caern Founding state item not found. Ensure it's in the world or compendium.");
    return null;
  }
  await setExclusiveCaernState(caernActor, "caern-founding", stateItemDoc);
  return caernActor.items.find(i => i.name === stateItemDoc.name) ?? null;
}

async function checkWyrmFree(caernActor) {
  const flags = getCaernFlags(caernActor);
  const wyrmFree = flags?.wyrmFree === true || flags?.wyrmInfluence === false;
  if (wyrmFree) return true;
  return new Promise(resolve => {
    new Dialog({
      title: "Wyrm Influence Check",
      content: `<p><strong>${caernActor.name}</strong> may not be free of Wyrm influence.</p><p>The Rite of Caern Founding requires a site completely free of Corruption and Wyrm influence.</p><p>Continue anyway?</p>`,
      buttons: {
        yes: { icon: '<i class="fas fa-check"></i>', label: "Continue", callback: () => resolve(true) },
        no: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(false) },
      },
      default: "no",
      close: () => resolve(false),
    }).render(true);
  });
}

async function contributeGnosisDialog(project, remaining) {
  const defaultAmount = Math.min(1, remaining);
  return new Promise(resolve => {
    new Dialog({
      title: "Contribute Gnosis to Caern Founding",
      content: `
        <form>
          <div class="form-group">
            <label>Current Progress: ${project.progress}/${project.total}</label>
            <p class="notes">Remaining: ${remaining} Gnosis</p>
          </div>
          <div class="form-group">
            <label>Amount to Contribute:</label>
            <input type="number" id="contribute-amount" min="1" max="${remaining}" value="${defaultAmount}" style="width:100%;">
          </div>
          <div class="form-group">
            <label>Note (optional):</label>
            <input type="text" id="contribute-note" placeholder="e.g., 'First contribution'" style="width:100%;">
          </div>
          ${project.halted ? `<p style="color: #ff0000;"><strong>WARNING:</strong> Project is HALTED: ${project.haltedReason || "unknown reason"}. Contribution will not be accepted.</p>` : ""}
        </form>
      `,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: "Contribute",
          callback: (html) => {
            const amount = parseInt(html.find("#contribute-amount").val()) || 0;
            const note = html.find("#contribute-note").val()?.trim() || "";
            resolve({ amount, note });
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => resolve(null)
        }
      },
      default: "ok",
      close: () => resolve(null)
    }).render(true);
  });
}

async function saveProject(caernActor, project) {
  const flags = getCaernFlags(caernActor) ?? {};
  const rites = flags.rites ?? {};
  const projects = { ...(rites.projects ?? {}) };
  projects[FOUNDING_RITE_ID] = project;
  await caernActor.setFlag("garou", "caern", {
    ...flags,
    rites: { ...rites, projects },
  });
}

async function contributeGnosis(siteCaernActor, amount, byActor, note) {
  const project = getOrInitFoundingProject(siteCaernActor);
  
  if (project.completed) {
    ui.notifications?.warn?.("Caern Founding is already complete.");
    return false;
  }

  if (project.halted) {
    ui.notifications?.warn?.(`Caern Founding is halted: ${project.haltedReason || "unknown reason"}. Contribution not accepted.`);
    return false;
  }

  const corruption = Number(getCaernFlags(siteCaernActor)?.corruption ?? 0);
  if (corruption > 0) {
    await setHalted(siteCaernActor, "corruption");
    ui.notifications?.warn?.("Founding halted until corruption is removed; no gnosis lost.");
    return false;
  }

  const remaining = TOTAL_REQUIRED - project.progress;
  const actualAmount = Math.min(amount, remaining);
  if (actualAmount <= 0) {
    ui.notifications?.warn?.("No remaining progress needed.");
    return false;
  }

  const byActorId = byActor?.id ?? game.user?.id ?? null;
  const byActorName = byActor?.name ?? game.users.get(byActorId)?.name ?? "Unknown";

  project.progress = Math.min(project.progress + actualAmount, TOTAL_REQUIRED);
  project.lastContributionAt = Date.now();
  
  // Update contributors
  let contributor = project.contributors.find(c => c.actorId === byActorId);
  if (!contributor) {
    contributor = { actorId: byActorId, actorName: byActorName, totalContributed: 0 };
    project.contributors.push(contributor);
  }
  contributor.totalContributed = (contributor.totalContributed || 0) + actualAmount;

  // Add to contributions log (keep last 50)
  project.contributions.push({
    at: Date.now(),
    byActorId,
    byActorName,
    amount: actualAmount,
    note: note || "",
  });
  if (project.contributions.length > 50) {
    project.contributions = project.contributions.slice(-50);
  }

  await saveProject(siteCaernActor, project);

  // Log history
  await logCaernHistory(siteCaernActor, {
    type: "rite",
    riteId: FOUNDING_RITE_ID,
    action: "contributed",
    amount: actualAmount,
    byActorId,
    byActorName,
    note,
    progress: project.progress,
  });

  // Post chat (recalculate remaining after progress update)
  const remainingAfter = TOTAL_REQUIRED - project.progress;
  await ChatMessage.create({
    user: game.user?.id,
    content: `
      <p><strong>Caern Founding:</strong> +${actualAmount} Gnosis invested at <strong>${siteCaernActor.name}</strong>.</p>
      <p>Progress: ${project.progress}/${TOTAL_REQUIRED} (Remaining: ${remainingAfter})</p>
      ${note ? `<p><em>Note:</em> ${note}</p>` : ""}
    `,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
  });

  // Check for completion
  if (project.progress >= TOTAL_REQUIRED) {
    await completeFounding(siteCaernActor);
  }

  return true;
}

async function completeFounding(siteCaernActor) {
  const project = getOrInitFoundingProject(siteCaernActor);
  if (project.completed) return;

  project.progress = TOTAL_REQUIRED;
  project.completed = true;
  project.completedAt = Date.now();
  project.halted = false;
  project.haltedReason = null;

  await saveProject(siteCaernActor, project);

  // Convert to Rank 5 Caern
  const flags = getCaernFlags(siteCaernActor) ?? {};
  await siteCaernActor.setFlag("garou", "caern", {
    ...flags,
    rating: 5,
    corruption: 0,
    isFounded: true,
    template: false, // Remove template flag if present
    upkeepRequired: 5, // Appropriate for rating 5
    upkeepPaidThisTurn: 0,
    areaRadiusFeet: 5280, // 1 mile for rating 5
    areaRadiusMiles: 1.0,
  });

  // Log history
  await logCaernHistory(siteCaernActor, {
    type: "rite",
    riteId: FOUNDING_RITE_ID,
    action: "completed",
    completedAt: project.completedAt,
    contributors: project.contributors.map(c => c.actorName).join(", "),
  });

  // Big announcement
  const content = `
    <div style="border: 3px solid #ffd700; padding: 16px; background: rgba(255, 215, 0, 0.1);">
      <h2 style="color: #ffd700; text-align: center;">🌟 A NEW RANK 5 CAERN IS BORN 🌟</h2>
      <p style="text-align: center; font-size: 1.2em;"><strong>${siteCaernActor.name}</strong> has been successfully founded!</p>
      <hr>
      <p><strong>Contributors:</strong> ${project.contributors.map(c => `${c.actorName} (${c.totalContributed})`).join(", ")}</p>
      <p><strong>Reminders:</strong></p>
      <ul>
        <li>Normal upkeep/corruption starts next Caern Turn</li>
        <li>Can host all Caern rites</li>
        <li>May immediately perform Rite of the Opened Bridge (no discount) if requirements are met</li>
      </ul>
    </div>
  `;
  await ChatMessage.create({
    user: game.user?.id,
    content,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
  });

  // Optional: prompt for Opened Bridge
  const doBridge = await new Promise(resolve => {
    new Dialog({
      title: "Perform Rite of the Opened Bridge?",
      content: `<p>Would you like to perform the Rite of the Opened Bridge at this newly founded Caern?</p>`,
      buttons: {
        yes: { icon: '<i class="fas fa-check"></i>', label: "Yes", callback: () => resolve(true) },
        no: { icon: '<i class="fas fa-times"></i>', label: "No", callback: () => resolve(false) },
      },
      default: "no",
      close: () => resolve(false),
    }).render(true);
  });

  if (doBridge && game.garou?.caerns?.openedBridge) {
    ui.notifications?.info?.("Use the Rite of the Opened Bridge item to create a Moon Bridge.");
  }
}

async function checkProgress(siteCaernActor) {
  const project = getOrInitFoundingProject(siteCaernActor);
  const remaining = TOTAL_REQUIRED - project.progress;
  const contributors = project.contributors.map(c => `${c.actorName}: ${c.totalContributed}`).join(", ") || "None yet";
  const lastContrib = project.lastContributionAt
    ? new Date(project.lastContributionAt).toLocaleString()
    : "Never";

  const content = `
    <p><strong>Caern Founding Progress: ${siteCaernActor.name}</strong></p>
    <p><strong>Progress:</strong> ${project.progress}/${project.total} (Remaining: ${remaining})</p>
    ${project.halted ? `<p style="color: #ff0000;"><strong>STATUS: HALTED</strong> — ${project.haltedReason || "unknown reason"}</p>` : `<p><strong>STATUS:</strong> Active</p>`}
    <p><strong>Last Contribution:</strong> ${lastContrib}</p>
    <p><strong>Contributors:</strong> ${contributors}</p>
    ${project.completed ? `<p style="color: #00ff00;"><strong>COMPLETED:</strong> ${new Date(project.completedAt).toLocaleString()}</p>` : ""}
  `;
  await ChatMessage.create({
    user: game.user?.id,
    content,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
  });
}

async function setHalted(siteCaernActor, reason) {
  const project = getOrInitFoundingProject(siteCaernActor);
  if (project.completed) return;
  if (project.halted && project.haltedReason === reason) return; // Already halted for this reason

  project.halted = true;
  project.haltedReason = reason;
  await saveProject(siteCaernActor, project);

  await ChatMessage.create({
    user: game.user?.id,
    content: `<p><strong>Caern Founding HALTED</strong> at <strong>${siteCaernActor.name}</strong>.</p><p><em>Reason:</em> ${reason}</p><p>No gnosis is lost, but contributions cannot continue until the issue is resolved.</p>`,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
  });
}

async function setResumed(siteCaernActor) {
  const project = getOrInitFoundingProject(siteCaernActor);
  if (!project.halted) return;

  project.halted = false;
  project.haltedReason = null;
  await saveProject(siteCaernActor, project);

  await ChatMessage.create({
    user: game.user?.id,
    content: `<p><strong>Caern Founding may continue</strong> at <strong>${siteCaernActor.name}</strong>.</p>`,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
  });
}

async function setWyrmFree(siteCaernActor, wyrmFree) {
  await siteCaernActor.setFlag("garou", "caern.wyrmFree", wyrmFree);
  ui.notifications?.info?.(`Set ${siteCaernActor.name} wyrmFree flag to ${wyrmFree}`);
}

async function runContributeGnosisFlow(item, actor, token) {
  const siteCaernActor = await getSelectedCaernActor();
  if (!siteCaernActor) return true;

  // Ensure state item exists
  await ensureFoundingStateItem(siteCaernActor);

  const project = getOrInitFoundingProject(siteCaernActor);
  const remaining = TOTAL_REQUIRED - project.progress;

  if (project.completed) {
    ui.notifications?.info?.("Caern Founding is already complete.");
    return true;
  }

  if (project.halted) {
    ui.notifications?.warn?.(`Caern Founding is halted: ${project.haltedReason || "unknown reason"}.`);
    return true;
  }

  // Check corruption
  const corruption = Number(getCaernFlags(siteCaernActor)?.corruption ?? 0);
  if (corruption > 0) {
    await setHalted(siteCaernActor, "corruption");
    return true;
  }

  // Check wyrm free
  const wyrmOk = await checkWyrmFree(siteCaernActor);
  if (!wyrmOk) return true;

  // Show contribution dialog
  const contribution = await contributeGnosisDialog(project, remaining);
  if (!contribution) return true;

  const { amount, note } = contribution;
  if (amount > remaining) {
    const proceed = await new Promise(resolve => {
      new Dialog({
        title: "Amount Exceeds Remaining",
        content: `<p>You entered ${amount}, but only ${remaining} remains. Clamp to ${remaining}?</p>`,
        buttons: {
          yes: { label: "Yes", callback: () => resolve(true) },
          no: { label: "No", callback: () => resolve(false) },
        },
        default: "yes",
      }).render(true);
    });
    if (!proceed) return true;
  }

  await contributeGnosis(siteCaernActor, amount, actor, note);
  return true;
}

async function runCheckProgressFlow(item, actor, token) {
  const siteCaernActor = await getSelectedCaernActor();
  if (!siteCaernActor) return true;
  await checkProgress(siteCaernActor);
  return true;
}

export function registerFoundingHandler() {
  Hooks.on("dnd5e.preUseItem", (item, config, options) => {
    if (!isCaernFoundingRite(item)) return;
    const activity = config?.activity;
    if (isContributeActivity(activity)) {
      runContributeGnosisFlow(item, options?.actor ?? item?.actor, options?.token);
      return true;
    }
    if (isCheckProgressActivity(activity)) {
      runCheckProgressFlow(item, options?.actor ?? item?.actor, options?.token);
      return true;
    }
    // Default to contribute if activity not specified
    runContributeGnosisFlow(item, options?.actor ?? item?.actor, options?.token);
    return true;
  });

  if (typeof game?.modules?.get("midi-qol")?.api !== "undefined") {
    try {
      Hooks.on("midi-qol.RollComplete", (workflow) => {
        const item = workflow?.item;
        if (!item || !isCaernFoundingRite(item)) return;
        const activity = workflow?.activity;
        if (isContributeActivity(activity)) {
          runContributeGnosisFlow(item, workflow?.actor ?? item?.actor, workflow?.token);
        } else if (isCheckProgressActivity(activity)) {
          runCheckProgressFlow(item, workflow?.actor ?? item?.actor, workflow?.token);
        }
      });
    } catch (_) {}
  }

  // Auto-halt/resume on corruption changes
  let _lastCaernCorruptionFounding = {};
  Hooks.on("updateActor", async (actor, update, options) => {
    if (actor.type !== "npc") return;
    const flags = getCaernFlags(actor);
    if (!flags?.isCaernActor) return;

    const project = flags?.rites?.projects?.[FOUNDING_RITE_ID];
    if (!project || project.completed) return;

    const prevCorruption = _lastCaernCorruptionFounding[actor.id] ?? flags.corruption;
    const newCorruption = update.flags?.garou?.caern?.corruption ?? flags.corruption;
    
    if (prevCorruption != null && newCorruption != null) {
      if (prevCorruption === 0 && newCorruption > 0 && !project.halted) {
        await setHalted(actor, "corruption");
      } else if (prevCorruption > 0 && newCorruption === 0 && project.halted && project.haltedReason === "corruption") {
        await setResumed(actor);
      }
    }
    _lastCaernCorruptionFounding[actor.id] = newCorruption;
  });

  // Check on ready for existing halted projects
  Hooks.once("ready", async () => {
    for (const actor of game.actors?.filter(a => a.type === "npc") ?? []) {
      const flags = getCaernFlags(actor);
      if (!flags?.isCaernActor) continue;
      const project = flags?.rites?.projects?.[FOUNDING_RITE_ID];
      if (!project || project.completed) continue;
      const corruption = Number(flags?.corruption ?? 0);
      if (corruption > 0 && (!project.halted || project.haltedReason !== "corruption")) {
        await setHalted(actor, "corruption");
      }
    }
  });
}

export {
  contributeGnosis,
  checkProgress,
  completeFounding,
  setHalted,
  setWyrmFree,
  isCaernFoundingRite,
};
