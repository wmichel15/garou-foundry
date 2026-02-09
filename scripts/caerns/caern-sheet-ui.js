/**
 * Caern Actor Sheet UI enhancements.
 * Adds a button to set Rating and Corruption on Caern actor sheets.
 */

import { isCaernActor, getCaernFlags } from "./caern-api.js";

function addCaernStatsButton(app, html, data) {
  const actor = app.object;
  if (!isCaernActor(actor)) {
    console.log("[garou] Caern UI: Actor is not a Caern, skipping button");
    return;
  }

  // Remove any existing button first (in case of re-render)
  html.find(".caern-stats-button").remove();

  const flags = getCaernFlags(actor);
  const rating = flags?.rating ?? 1;
  const corruption = flags?.corruption ?? 0;

  // Try multiple placement strategies for dnd5e NPC sheet
  let buttonPlaced = false;
  
  // Strategy 1: Try header actions (common in dnd5e sheets)
  const headerActions = html.find(".header-actions, .sheet-header .header-details, .window-header .header-actions");
  if (headerActions.length > 0) {
    const button = $(`
      <button type="button" class="caern-stats-button" title="Set Caern Rating and Corruption">
        <i class="fas fa-cog"></i> Caern Stats (R${rating}/C${corruption})
      </button>
    `);
    headerActions.first().append(button);
    buttonPlaced = true;
  }
  
  // Strategy 2: Try window header (top bar)
  if (!buttonPlaced) {
    const windowHeader = html.find(".window-header, .sheet-header");
    if (windowHeader.length > 0) {
      const button = $(`
        <div style="margin: 4px 8px; display: inline-block;">
          <button type="button" class="caern-stats-button" title="Set Caern Rating and Corruption">
            <i class="fas fa-cog"></i> Caern Stats (R${rating}/C${corruption})
          </button>
        </div>
      `);
      windowHeader.append(button);
      buttonPlaced = true;
    }
  }
  
  // Strategy 3: Add at the top of the Features/Items list (most visible)
  if (!buttonPlaced) {
    const featuresList = html.find(".items-list, .inventory-list, .features-list");
    if (featuresList.length > 0) {
      const button = $(`
        <div class="form-group" style="margin: 8px 0; padding: 8px; background: rgba(0,0,0,0.05); border: 2px solid #c9c7b8; border-radius: 4px;">
          <button type="button" class="caern-stats-button" style="width: 100%; padding: 8px; font-weight: bold;">
            <i class="fas fa-cog"></i> Set Caern Stats (Rating: ${rating}, Corruption: ${corruption})
          </button>
        </div>
      `);
      featuresList.first().before(button);
      buttonPlaced = true;
    }
  }
  
  // Strategy 4: Add as a form group at the top of the sheet content
  if (!buttonPlaced) {
    const sheetContent = html.find(".sheet-content, .tab.active, form");
    if (sheetContent.length > 0) {
      const button = $(`
        <div class="form-group" style="margin: 8px 0; padding: 8px; background: rgba(0,0,0,0.05); border: 2px solid #c9c7b8; border-radius: 4px;">
          <button type="button" class="caern-stats-button" style="width: 100%; padding: 8px; font-weight: bold;">
            <i class="fas fa-cog"></i> Set Caern Stats (Rating: ${rating}, Corruption: ${corruption})
          </button>
        </div>
      `);
      sheetContent.first().prepend(button);
      buttonPlaced = true;
    }
  }

  if (!buttonPlaced) {
    console.warn("[garou] Caern UI: Could not find suitable location for button on sheet");
    return;
  }

  // Add click handler
  html.find(".caern-stats-button").on("click", async (event) => {
    event.preventDefault();
    await openCaernStatsDialog(actor);
  });
  
  console.log("[garou] Caern UI: Button added successfully");
}

async function openCaernStatsDialog(actor) {
  const flags = getCaernFlags(actor);
  const currentRating = flags?.rating ?? 1;
  const currentCorruption = flags?.corruption ?? 0;

  return new Promise((resolve) => {
    new Dialog({
      title: `Set Caern Stats: ${actor.name}`,
      content: `
        <form>
          <div class="form-group">
            <label>Rating (1-5):</label>
            <input type="number" id="caern-rating" min="1" max="5" value="${currentRating}" style="width:100%;">
            <p class="notes">Caern power level. Affects area size, rite effects, and other mechanics.</p>
          </div>
          <div class="form-group">
            <label>Corruption (0-5):</label>
            <input type="number" id="caern-corruption" min="0" max="5" value="${currentCorruption}" style="width:100%;">
            <p class="notes">0-4: Functioning. 5: Lost (Caern is destroyed, rites cannot be performed).</p>
          </div>
        </form>
      `,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: "Set",
          callback: async (html) => {
            const rating = parseInt(html.find("#caern-rating").val()) || 1;
            const corruption = parseInt(html.find("#caern-corruption").val()) || 0;
            const clampedRating = Math.max(1, Math.min(5, rating));
            const clampedCorruption = Math.max(0, Math.min(5, corruption));
            
            await actor.setFlag("garou", "caern.rating", clampedRating);
            await actor.setFlag("garou", "caern.corruption", clampedCorruption);
            
            ui.notifications.info(`Set ${actor.name}: Rating ${clampedRating}, Corruption ${clampedCorruption}`);
            
            // Refresh the sheet to update the button text
            actor.sheet?.render(false);
            
            resolve(true);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => resolve(false)
        }
      },
      default: "ok",
      close: () => resolve(false)
    }).render(true);
  });
}

export function registerCaernSheetUI() {
  Hooks.on("renderActorSheet", (app, html, data) => {
    // Only add button to NPC sheets (Caerns are NPC type)
    if (app.object?.type === "npc") {
      addCaernStatsButton(app, html, data);
    }
  });
}
