/**
 * Caern API – helpers for Caern actors and state.
 * No hardcoded UUIDs; uses flags and name/tag matching.
 */

const GAROU = { scope: "garou" };
const CAERN_FLAG = "caern";

function getCaernFlags(actor) {
  return actor?.getFlag(GAROU.scope, CAERN_FLAG) ?? null;
}

/**
 * Detect if an actor is a Caern state container.
 * Checks: flags.garou.caern.isCaernActor, biography tag [GAROU_CAERN_ACTOR], or marker item flag.
 */
function isCaernActor(actor) {
  if (!actor) return false;
  const flags = getCaernFlags(actor);
  if (flags?.isCaernActor === true) return true;
  const bio = (actor.system?.details?.biography?.value ?? "").toLowerCase();
  if (bio.includes("[garou_caern_actor]")) return true;
  const hasMarker = actor.items?.some(i => i.getFlag(GAROU.scope, "caernMarker") === true);
  return !!hasMarker;
}

/**
 * Get the currently selected Caern actor.
 * Prefer: selected token's actor if it is a Caern; otherwise show dialog listing all Caern actors in the world.
 */
async function getSelectedCaernActor() {
  const controlled = canvas.tokens?.controlled ?? [];
  if (controlled.length === 1 && controlled[0].actor && isCaernActor(controlled[0].actor)) {
    return controlled[0].actor;
  }
  const caerns = game.actors?.filter(a => a.type === "npc" && isCaernActor(a)) ?? [];
  if (caerns.length === 0) {
    ui.notifications?.warn?.("No Caern actors found in the world. Create one from the Caern Template.");
    return null;
  }
  if (caerns.length === 1) return caerns[0];
  const options = caerns.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
  return new Promise(resolve => {
    new Dialog({
      title: "Choose Caern",
      content: `<p>Select the Caern to apply the rite to:</p><select id="caern-actor-id" style="width:100%;margin-top:8px;">${options}</select>`,
      buttons: {
        ok: { icon: '<i class="fas fa-check"></i>', label: "OK", callback: (html) => {
          const id = html.find("#caern-actor-id").val();
          resolve(game.actors.get(id) ?? null);
        }},
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) },
      },
      default: "ok",
      close: () => resolve(null),
    }).render(true);
  });
}

/**
 * Remove other items on the Caern in the same exclusiveGroup, then add the chosen state item.
 * stateItemDoc: Item document (from world or compendium) to add; we use toObject() for createEmbeddedDocuments.
 */
async function setExclusiveCaernState(caernActor, exclusiveGroup, stateItemDoc) {
  if (!caernActor?.createEmbeddedDocuments || !stateItemDoc) return;
  const group = (exclusiveGroup ?? "").toString().toLowerCase();
  const toRemove = caernActor.items.filter(item => {
    const desc = (item.system?.description?.value ?? "").toLowerCase();
    const match = desc.match(/exclusivegroup\s*=\s*([^\s;]+)/);
    const itemGroup = (match?.[1] ?? "").toLowerCase();
    if (itemGroup && itemGroup === group) return true;
    const name = (item.name ?? "").toLowerCase();
    if (group === "glorious-past" && (name.includes("glorious past —") || name.includes("glorious past -"))) return true;
    if (group === "caern-founding" && (name.includes("caern founding") || name.includes("invested gnosis"))) return true;
    return false;
  });
  if (toRemove.length) {
    await caernActor.deleteEmbeddedDocuments("Item", toRemove.map(i => i.id));
  }
  const data = stateItemDoc.toObject ? stateItemDoc.toObject() : stateItemDoc;
  delete data._id;
  delete data.id;
  await caernActor.createEmbeddedDocuments("Item", [data]);
}

/**
 * Update Caern cooldown for a rite (e.g. perSeason or perMonth).
 * cadenceKey: "perSeason" or "perMonth"
 * riteId: e.g. "glorious-past"
 * data: value to store (e.g. seasonIndex or turnIndex when used)
 */
async function updateCaernCooldown(caernActor, cadenceKey, riteId, data) {
  const flags = getCaernFlags(caernActor) ?? {};
  const rites = flags.rites ?? { cooldowns: { perMonth: {}, perSeason: {}, perTurn: {} } };
  const cooldowns = rites.cooldowns ?? { perMonth: {}, perSeason: {}, perTurn: {} };
  if (!cooldowns[cadenceKey]) cooldowns[cadenceKey] = {};
  cooldowns[cadenceKey][riteId] = data;
  const next = { ...flags, rites: { ...rites, cooldowns } };
  await caernActor.setFlag(GAROU.scope, CAERN_FLAG, next);
}

/**
 * Append an entry to the Caern's history and set updatedAt/updatedBy.
 */
async function logCaernHistory(caernActor, entry) {
  const flags = getCaernFlags(caernActor) ?? {};
  const history = Array.isArray(flags.history) ? [...flags.history] : [];
  history.push({
    at: Date.now(),
    ...(typeof entry === "object" ? entry : { message: String(entry) }),
  });
  const rites = flags.rites ?? { history: [] };
  const riteHistory = Array.isArray(rites.history) ? [...rites.history] : [];
  riteHistory.push({ at: Date.now(), ...(typeof entry === "object" ? entry : { message: String(entry) }) });
  const next = {
    ...flags,
    history: history.slice(-100),
    updatedAt: Date.now(),
    updatedBy: game.user?.id ?? caernActor.id ?? null,
    rites: { ...rites, history: riteHistory.slice(-50) },
  };
  await caernActor.setFlag(GAROU.scope, CAERN_FLAG, next);
}

/**
 * Find a Glorious Past state item by effect key (legacy-of-resolve, ancestral-witness, storied-ground).
 * Searches world items then garou-features pack by name.
 */
const GLORIOUS_PAST_STATE_NAMES = {
  "legacy-of-resolve": "Glorious Past — Legacy of Resolve",
  "ancestral-witness": "Glorious Past — Ancestral Witness",
  "storied-ground": "Glorious Past — Storied Ground",
};

async function findGloriousPastStateItem(effectKey) {
  const name = GLORIOUS_PAST_STATE_NAMES[effectKey];
  if (!name) return null;
  const fromWorld = game.items?.find(i => (i.name ?? "").trim() === name);
  if (fromWorld) return fromWorld;
  const pack = game.packs.get("garou.garou-features");
  if (pack) {
    const index = await pack.getIndex({ fields: ["name"] });
    const entry = index.find(e => (e.name ?? "").trim() === name);
    if (entry) return pack.getDocument(entry._id);
  }
  const giftsPack = game.packs.get("garou.garou-gifts");
  if (giftsPack) {
    const index = await giftsPack.getIndex({ fields: ["name"] });
    const entry = index.find(e => (e.name ?? "").trim() === name);
    if (entry) return giftsPack.getDocument(entry._id);
  }
  return null;
}

/**
 * Find Badger's Burrow state item by name or tag.
 */
async function findBadgersBurrowStateItem() {
  const name = "Badger's Burrow — Zone of Awareness";
  const fromWorld = game.items?.find(i => {
    const itemName = (i.name ?? "").trim();
    if (itemName === name) return true;
    const desc = (i.system?.description?.value ?? "").toLowerCase();
    return desc.includes("[garou_caern_state]") && desc.includes("parent=badgers-burrow") && desc.includes("effect=zone-of-awareness");
  });
  if (fromWorld) return fromWorld;
  const pack = game.packs.get("garou.garou-caern-states");
  if (pack) {
    const index = await pack.getIndex({ fields: ["name"] });
    const entry = index.find(e => (e.name ?? "").trim() === name);
    if (entry) return pack.getDocument(entry._id);
  }
  const featuresPack = game.packs.get("garou.garou-features");
  if (featuresPack) {
    const index = await featuresPack.getIndex({ fields: ["name"] });
    const entry = index.find(e => (e.name ?? "").trim() === name);
    if (entry) return featuresPack.getDocument(entry._id);
  }
  return null;
}

/**
 * Calculate zone radius in feet based on Caern rating.
 */
function getBadgersBurrowRadius(rating) {
  const r = Number(rating) || 1;
  const radiusMap = { 1: 60, 2: 120, 3: 300, 4: 1000, 5: 5280 };
  return radiusMap[r] ?? 60;
}

/**
 * Get current Caern turn index.
 */
function getTurnIndex(caernActor) {
  const flags = getCaernFlags(caernActor);
  return Number(flags?.turnIndex ?? 0);
}

/**
 * Get perTurn cooldown for a rite.
 */
function getPerTurnCooldown(caernActor, riteId) {
  const flags = getCaernFlags(caernActor);
  const cooldowns = flags?.rites?.cooldowns?.perTurn ?? {};
  return cooldowns[riteId];
}

/**
 * Get the currently selected Caern actors (up to 2).
 * Returns array of 0-2 Caern actors from selected tokens.
 */
function getSelectedCaernActors() {
  const controlled = canvas.tokens?.controlled ?? [];
  const caerns = controlled
    .map(t => t.actor)
    .filter(a => a && isCaernActor(a))
    .slice(0, 2);
  return caerns;
}

/**
 * Prompt user to select TWO Caern actors.
 * Prefer selected tokens if they are caerns; otherwise show dialog.
 */
async function selectTwoCaerns() {
  const selected = getSelectedCaernActors();
  if (selected.length === 2) {
    return { caernA: selected[0], caernB: selected[1] };
  }
  const caerns = game.actors?.filter(a => a.type === "npc" && isCaernActor(a)) ?? [];
  if (caerns.length < 2) {
    ui.notifications?.warn?.("At least two Caern actors are required for Rite of the Opened Bridge.");
    return null;
  }
  const options = caerns.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
  return new Promise(resolve => {
    new Dialog({
      title: "Rite of the Opened Bridge — Select Two Caerns",
      content: `
        <p>Select the two Caerns to link with a Moon Bridge:</p>
        <p><label>Caern A:</label><select id="caern-a-id" style="width:100%;margin-top:4px;">${options}</select></p>
        <p><label>Caern B:</label><select id="caern-b-id" style="width:100%;margin-top:4px;">${options}</select></p>
      `,
      buttons: {
        ok: { icon: '<i class="fas fa-check"></i>', label: "Create Link", callback: (html) => {
          const idA = html.find("#caern-a-id").val();
          const idB = html.find("#caern-b-id").val();
          if (!idA || !idB || idA === idB) {
            ui.notifications?.warn?.("Please select two different Caerns.");
            resolve(null);
            return;
          }
          const caernA = game.actors.get(idA);
          const caernB = game.actors.get(idB);
          resolve(caernA && caernB ? { caernA, caernB } : null);
        }},
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) },
      },
      default: "ok",
      close: () => resolve(null),
    }).render(true);
  });
}

/**
 * Find Opened Bridge state item by name or tag.
 */
async function findOpenedBridgeStateItem() {
  const names = [
    "Rite of the Opened Bridge",
    "Rite of the Opened Bridge(Caern Owned)",
    "Moon Bridge — Linked Caern",
  ];
  for (const name of names) {
    const fromWorld = game.items?.find(i => {
      const itemName = (i.name ?? "").trim();
      if (itemName === name || itemName.includes("Opened Bridge") && itemName.includes("Caern")) return true;
      const desc = (i.system?.description?.value ?? "").toLowerCase();
      return desc.includes("[garou_caern_state]") && desc.includes("parent=opened-bridge") && desc.includes("effect=moon-bridge");
    });
    if (fromWorld) return fromWorld;
  }
  const pack = game.packs.get("garou.garou-caern-states");
  if (pack) {
    const index = await pack.getIndex({ fields: ["name"] });
    for (const name of names) {
      const entry = index.find(e => (e.name ?? "").trim() === name || (e.name ?? "").includes("Opened Bridge"));
      if (entry) return pack.getDocument(entry._id);
    }
  }
  const featuresPack = game.packs.get("garou.garou-features");
  if (featuresPack) {
    const index = await featuresPack.getIndex({ fields: ["name"] });
    for (const name of names) {
      const entry = index.find(e => (e.name ?? "").trim() === name || (e.name ?? "").includes("Opened Bridge"));
      if (entry) return featuresPack.getDocument(entry._id);
    }
  }
  return null;
}

/**
 * Generate a stable link ID for a Moon Bridge.
 */
function generateLinkId() {
  return `moon-bridge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Find Shrouded Glen state item by name or tag.
 */
async function findShroudedGlenStateItem() {
  const name = "Shrouded Glen — Caern Shroud";
  const fromWorld = game.items?.find(i => {
    const itemName = (i.name ?? "").trim();
    if (itemName === name) return true;
    const desc = (i.system?.description?.value ?? "").toLowerCase();
    return desc.includes("[garou_caern_state]") && desc.includes("parent=shrouded-glen") && desc.includes("effect=shroud");
  });
  if (fromWorld) return fromWorld;
  const pack = game.packs.get("garou.garou-caern-states");
  if (pack) {
    const index = await pack.getIndex({ fields: ["name"] });
    const entry = index.find(e => (e.name ?? "").trim() === name || (e.name ?? "").includes("Shrouded Glen"));
    if (entry) return pack.getDocument(entry._id);
  }
  const featuresPack = game.packs.get("garou.garou-features");
  if (featuresPack) {
    const index = await featuresPack.getIndex({ fields: ["name"] });
    const entry = index.find(e => (e.name ?? "").trim() === name || (e.name ?? "").includes("Shrouded Glen"));
    if (entry) return featuresPack.getDocument(entry._id);
  }
  return null;
}

/**
 * Calculate Shrouded Glen DC based on Caern rating and corruption.
 * Returns null if corruption >= 5 (shroud collapsed).
 */
function getShroudedGlenDC(caernActor) {
  const flags = getCaernFlags(caernActor);
  const rating = Number(flags?.rating ?? 1);
  const corruption = Number(flags?.corruption ?? 0);
  if (corruption >= 5) return null; // Shroud collapsed
  const baseDC = { 1: 14, 2: 15, 3: 16, 4: 17, 5: 18 }[rating] ?? 14;
  let dc = baseDC;
  if (corruption >= 3 && corruption < 5) {
    dc -= 2;
  }
  return dc;
}

/**
 * Check if an actor is recognized by a Caern (stub implementation).
 * For now: checks flags.garou.caernRecognition or gnosis contribution flags.
 */
function isActorRecognizedByCaern(actor, caernActor) {
  if (!actor || !caernActor) return false;
  const recognition = actor.getFlag("garou", "caernRecognition");
  if (Array.isArray(recognition)) {
    return recognition.includes(caernActor.id) || recognition.includes(caernActor.name);
  }
  // Check if actor contributed gnosis (future: check flags.garou.gnosisContributions)
  // For now, default to false (not recognized)
  return false;
}

/**
 * Find Caern Founding state item by name or tag.
 */
async function findCaernFoundingStateItem() {
  const name = "Caern Founding — Invested Gnosis";
  const fromWorld = game.items?.find(i => {
    const itemName = (i.name ?? "").trim();
    if (itemName === name) return true;
    const desc = (i.system?.description?.value ?? "").toLowerCase();
    return desc.includes("[garou_caern_state]") && desc.includes("parent=caern-founding") && desc.includes("effect=invested-gnosis");
  });
  if (fromWorld) return fromWorld;
  const pack = game.packs.get("garou.garou-caern-states");
  if (pack) {
    const index = await pack.getIndex({ fields: ["name"] });
    const entry = index.find(e => (e.name ?? "").trim() === name || (e.name ?? "").includes("Caern Founding"));
    if (entry) return pack.getDocument(entry._id);
  }
  const featuresPack = game.packs.get("garou.garou-features");
  if (featuresPack) {
    const index = await featuresPack.getIndex({ fields: ["name"] });
    const entry = index.find(e => (e.name ?? "").trim() === name || (e.name ?? "").includes("Caern Founding"));
    if (entry) return featuresPack.getDocument(entry._id);
  }
  return null;
}

/**
 * Get or initialize the Caern Founding project record on a site actor.
 */
function getOrInitFoundingProject(caernActor) {
  const flags = getCaernFlags(caernActor) ?? {};
  const rites = flags.rites ?? {};
  const projects = rites.projects ?? {};
  if (!projects["caern-founding"]) {
    projects["caern-founding"] = {
      progress: 0,
      total: 100,
      halted: false,
      haltedReason: null,
      startedAt: Date.now(),
      lastContributionAt: null,
      contributors: [],
      contributions: [],
      completed: false,
      completedAt: null,
    };
  }
  return projects["caern-founding"];
}

export {
  GAROU,
  CAERN_FLAG,
  getCaernFlags,
  isCaernActor,
  getSelectedCaernActor,
  setExclusiveCaernState,
  updateCaernCooldown,
  logCaernHistory,
  findGloriousPastStateItem,
  GLORIOUS_PAST_STATE_NAMES,
  findBadgersBurrowStateItem,
  getBadgersBurrowRadius,
  getTurnIndex,
  getPerTurnCooldown,
  selectTwoCaerns,
  findOpenedBridgeStateItem,
  generateLinkId,
  findShroudedGlenStateItem,
  getShroudedGlenDC,
  isActorRecognizedByCaern,
  findCaernFoundingStateItem,
  getOrInitFoundingProject,
};
