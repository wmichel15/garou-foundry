// Midi-QOL Activity Macro: call "Garou: Choose Form" when this activity is used.
// Use this for:
//   - Shapeshifting Forms feat → "Choose Form" activity (opens the form picker dialog).
//   - Homid / Glabro / Crinos / Hispo / Lupus form items → "Shift to This Form" activity (applies that form directly, no dialog).
// Paste this into the activity's Midi-QOL macro field.

const macro = game.macros.find(m => m.name === "Garou: Choose Form");
if (macro) {
  const macroArgs = typeof args !== "undefined" && Array.isArray(args) ? args : [];
  await macro.execute(false, macroArgs);
}
