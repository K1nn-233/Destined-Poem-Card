import { sha256 } from "./card-bundle.mjs";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
const hash = (value) =>
  sha256(
    Buffer.from(
      typeof value === "string"
        ? value.replace(/\r\n/g, "\n")
        : JSON.stringify(canonical(value)),
    ),
  );

// Only structural information and content digests belong in the tracked baseline.
// Script data / helper variables / workshop presets are deliberately never copied.
export function summarizeCard(card) {
  const data = card.data;
  const entries = data.character_book.entries;
  return {
    name: data.name,
    version: data.character_version,
    world: data.extensions.world,
    greetings: [data.first_mes, ...(data.alternate_greetings ?? [])].map(
      (content, index) => ({
        index,
        characters: content.replace(/\r\n/g, "\n").length,
        sha256: hash(content),
      }),
    ),
    scripts: data.extensions.tavern_helper.scripts.map((script) => ({
      id: script.id,
      name: script.name,
      enabled: script.enabled,
      contentSha256: hash(script.content),
      buttons: script.button,
    })),
    regex: data.extensions.regex_scripts.map(
      ({ replaceString, ...settings }) => ({
        ...settings,
        replacementSha256: hash(replaceString),
      }),
    ),
    worldbook: {
      entries: entries.length,
      enabled: entries.filter((entry) => entry.enabled).length,
      items: entries.map(({ id, content, ...settings }, index) => ({
        name: settings.comment,
        order: index,
        enabled: settings.enabled,
        contentSha256: hash(content),
        settingsSha256: hash(settings),
      })),
    },
  };
}
function keyedItems(items, key) {
  const occurrences = new Map();
  return new Map(
    items.map((item) => {
      const name = String(item[key]);
      const occurrence = occurrences.get(name) ?? 0;
      occurrences.set(name, occurrence + 1);
      return [name + "\0" + occurrence, item];
    }),
  );
}
function compareItems(before, after, key) {
  const previous = keyedItems(before, key),
    current = keyedItems(after, key);
  const added = [],
    removed = [],
    changed = [];
  for (const [identity, item] of current) {
    const old = previous.get(identity);
    if (!old) added.push(item);
    else {
      const fields = [
        ...new Set([...Object.keys(old), ...Object.keys(item)]),
      ].filter(
        (field) =>
          JSON.stringify(canonical(old[field])) !==
          JSON.stringify(canonical(item[field])),
      );
      if (fields.length)
        changed.push({ [key]: item[key], fields, before: old, after: item });
    }
  }
  for (const [identity, item] of previous)
    if (!current.has(identity)) removed.push(item);
  return { added, removed, changed };
}
export function compareSummaries(original, local) {
  return {
    metadata: {
      original: {
        name: original.name,
        version: original.version,
        world: original.world,
      },
      local: { name: local.name, version: local.version, world: local.world },
    },
    greetings: compareItems(original.greetings, local.greetings, "index"),
    scripts: compareItems(original.scripts, local.scripts, "id"),
    regex: compareItems(original.regex, local.regex, "id"),
    worldbook: {
      original: {
        entries: original.worldbook.entries,
        enabled: original.worldbook.enabled,
      },
      local: {
        entries: local.worldbook.entries,
        enabled: local.worldbook.enabled,
      },
      ...compareItems(original.worldbook.items, local.worldbook.items, "name"),
    },
  };
}
