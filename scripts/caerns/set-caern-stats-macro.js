/**
 * Macro: Set Caern Rating and Corruption
 * Paste this into a Foundry macro to easily set Caern stats.
 * Usage: Select a Caern token and run the macro.
 */

const actor = canvas.tokens?.controlled[0]?.actor ?? game.user?.character;
if (!actor) {
  ui.notifications.warn("Please select a Caern token or have a character selected.");
} else {
  const flags = actor.getFlag("garou", "caern") ?? {};
  const currentRating = flags.rating ?? 1;
  const currentCorruption = flags.corruption ?? 0;

  new Dialog({
    title: `Set Caern Stats: ${actor.name}`,
    content: `
      <form>
        <div class="form-group">
          <label>Rating (1-5):</label>
          <input type="number" id="rating" min="1" max="5" value="${currentRating}" style="width:100%;">
        </div>
        <div class="form-group">
          <label>Corruption (0-5):</label>
          <input type="number" id="corruption" min="0" max="5" value="${currentCorruption}" style="width:100%;">
        </div>
      </form>
    `,
    buttons: {
      ok: {
        icon: '<i class="fas fa-check"></i>',
        label: "Set",
        callback: (html) => {
          const rating = parseInt(html.find("#rating").val()) || 1;
          const corruption = parseInt(html.find("#corruption").val()) || 0;
          actor.setFlag("garou", "caern.rating", Math.max(1, Math.min(5, rating)));
          actor.setFlag("garou", "caern.corruption", Math.max(0, Math.min(5, corruption)));
          ui.notifications.info(`Set ${actor.name}: Rating ${rating}, Corruption ${corruption}`);
        }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: "Cancel"
      }
    },
    default: "ok"
  }).render(true);
}
