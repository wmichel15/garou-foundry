/**
 * Caern rites and state – init and public API.
 * Registers Rite of the Glorious Past and state consume hooks; exposes game.garou.caerns.
 */

import * as api from "./caern-api.js";
import { registerRiteHandler, createMoonBridgeLink, collapseMoonBridgeLink, collapseShroudedGlen } from "./caern-rites.js";
import { registerStateConsumeHooks } from "./caern-states.js";
import { registerCaernSheetUI } from "./caern-sheet-ui.js";
import { registerFoundingHandler, contributeGnosis, checkProgress, completeFounding, setHalted, setWyrmFree } from "./caern-founding.js";

function init() {
  game.garou = game.garou || {};
  game.garou.caerns = {
    isCaernActor: api.isCaernActor,
    getSelectedCaernActor: api.getSelectedCaernActor,
    setExclusiveCaernState: api.setExclusiveCaernState,
    updateCaernCooldown: api.updateCaernCooldown,
    logCaernHistory: api.logCaernHistory,
    findGloriousPastStateItem: api.findGloriousPastStateItem,
    getCaernFlags: api.getCaernFlags,
    GLORIOUS_PAST_STATE_NAMES: api.GLORIOUS_PAST_STATE_NAMES,
    openedBridge: {
      createLink: createMoonBridgeLink,
      collapseLink: collapseMoonBridgeLink,
    },
    shroudedGlen: {
      getDC: api.getShroudedGlenDC,
      isRecognized: api.isActorRecognizedByCaern,
      collapse: collapseShroudedGlen,
    },
    founding: {
      contribute: contributeGnosis,
      check: checkProgress,
      complete: completeFounding,
      setHalted: setHalted,
      setWyrmFree: setWyrmFree,
    },
  };

  registerRiteHandler();
  registerStateConsumeHooks();
  registerCaernSheetUI();
  registerFoundingHandler();
}

Hooks.once("init", init);
Hooks.once("ready", () => {
  if (!game.garou?.caerns) init();
});
