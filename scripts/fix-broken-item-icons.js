/**
 * Fix documents that reference missing dnd5e icons (e.g. clothing-shirt.svg)
 * by replacing with the module's fallback icon. Runs once when the game is ready.
 */

const GAROU_ICON_FALLBACK = "modules/garou/assets/icons/items/feature.svg";
const BROKEN_ICON_PATTERNS = ["clothing-shirt", "inventory/clothing-shirt"];

function hasBrokenIcon(img) {
  if (!img || typeof img !== "string") return false;
  const lower = img.toLowerCase();
  return BROKEN_ICON_PATTERNS.some((p) => lower.includes(p));
}

async function fixDocumentIcon(doc, path) {
  if (!doc?.update) return false;
  try {
    await doc.update({ img: GAROU_ICON_FALLBACK });
    return true;
  } catch (e) {
    console.warn("[garou] Could not fix icon for", path, e);
    return false;
  }
}

async function fixBrokenIcons() {
  let fixed = 0;

  // World actors and their embedded items
  for (const actor of game.actors?.contents ?? []) {
    if (hasBrokenIcon(actor.img)) {
      if (await fixDocumentIcon(actor, `Actor ${actor.name}`)) fixed++;
    }
    for (const item of actor.items ?? []) {
      if (hasBrokenIcon(item.img)) {
        if (await fixDocumentIcon(item, `Item ${item.name} (on ${actor.name})`)) fixed++;
      }
      for (const effect of item.effects ?? []) {
        if (hasBrokenIcon(effect.icon ?? effect.img)) {
          try {
            await effect.update({ icon: GAROU_ICON_FALLBACK });
            fixed++;
          } catch (e) {
            console.warn("[garou] Could not fix effect icon", e);
          }
        }
      }
    }
  }

  // World items (e.g. from Items directory)
  for (const item of game.items?.contents ?? []) {
    if (hasBrokenIcon(item.img)) {
      if (await fixDocumentIcon(item, `Item ${item.name}`)) fixed++;
    }
    for (const effect of item.effects ?? []) {
      if (hasBrokenIcon(effect.icon ?? effect.img)) {
        try {
          await effect.update({ icon: GAROU_ICON_FALLBACK });
          fixed++;
        } catch (e) {
          console.warn("[garou] Could not fix effect icon", e);
        }
      }
    }
  }

  // Journal entries (can have broken image refs in content)
  for (const journal of game.journal?.contents ?? []) {
    let content = journal.pages?.contents ?? [];
    for (const page of content) {
      const img = page.src ?? page.img;
      if (hasBrokenIcon(img)) {
        try {
          await page.update({ src: GAROU_ICON_FALLBACK });
          fixed++;
        } catch (e) {
          console.warn("[garou] Could not fix journal page image", e);
        }
      }
    }
  }

  if (fixed > 0) {
    console.log(`[garou] Fixed ${fixed} document(s) with broken dnd5e icon (clothing-shirt.svg).`);
    ui?.notifications?.info?.(`Garou: Replaced ${fixed} broken icon(s) with fallback.`);
  }
}

function registerFixBrokenIcons() {
  Hooks.on("ready", () => {
    fixBrokenIcons().catch((e) => console.error("[garou] fixBrokenIcons error:", e));
  });
}

registerFixBrokenIcons();
