// Call "Garou: Choose Form" — use in Item Macro on the item, or as a hotbar macro.
// Activity macro fields (Midi-QOL) often do NOT run for utility activities; use Item Macro or hotbar instead.

const macroName = "Garou: Choose Form";
const a0 = typeof args !== "undefined" && Array.isArray(args) && args.length ? args[0] : {};
const fromThis = typeof this !== "undefined" && this && (this.actor || this.item);
const payload = fromThis
  ? { actor: this.actor || this.item?.actor, token: this.token, item: this.item }
  : {
      actor: a0.actor || a0.workflow?.actor || a0.token?.actor,
      token: a0.token || a0.workflow?.token,
      item: a0.item || a0.workflow?.item,
    };

const macro = game.macros?.find((m) => m.name === macroName);
if (!macro) {
  ui.notifications?.warn(macroName + " macro not found. Create it or let the Garou module load once.");
} else {
  macro.execute(false, [payload]).catch((err) => {
    console.error("Garou: Choose Form macro error", err);
    ui.notifications?.error("Choose Form macro failed. See console.");
  });
}
