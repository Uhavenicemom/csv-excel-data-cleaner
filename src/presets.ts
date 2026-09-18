import type { BatchOutputMode, InputDateOrder, OutputDateFormat, PresetSettings } from "./types.ts";

export const MAX_NAMED_PRESETS = 5;
export const PRESET_NAME_LIMIT = 40;
export const PRESET_STORAGE_KEY = "data-cleaner-presets-v1";

export const DEFAULT_PRESET: PresetSettings = {
  removeEmpty: true,
  trimWhitespace: true,
  deduplicate: false,
  validateEmail: true,
  normalizeDates: true,
  inputDateOrder: "DD-MM-YY",
  dateFormat: "DD-MM-YY",
  batchOutputMode: "original"
};

export interface NamedPreset {
  id: string;
  name: string;
  settings: PresetSettings;
}

export interface PresetStore {
  version: 1;
  lastUsed: PresetSettings;
  named: NamedPreset[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isInputDateOrder(value: unknown): value is InputDateOrder {
  return value === "DD-MM-YY" || value === "MM-DD-YY";
}

function isOutputDateFormat(value: unknown): value is OutputDateFormat {
  return isInputDateOrder(value) || value === "YY-MM-DD";
}

function isBatchOutputMode(value: unknown): value is BatchOutputMode {
  return value === "original" || value === "csv" || value === "xlsx";
}

export function normalizePresetSettings(value: unknown): PresetSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_PRESET };
  const candidate = value as Partial<Record<keyof PresetSettings, unknown>>;
  return {
    removeEmpty: typeof candidate.removeEmpty === "boolean" ? candidate.removeEmpty : DEFAULT_PRESET.removeEmpty,
    trimWhitespace: typeof candidate.trimWhitespace === "boolean" ? candidate.trimWhitespace : DEFAULT_PRESET.trimWhitespace,
    deduplicate: typeof candidate.deduplicate === "boolean" ? candidate.deduplicate : DEFAULT_PRESET.deduplicate,
    validateEmail: typeof candidate.validateEmail === "boolean" ? candidate.validateEmail : DEFAULT_PRESET.validateEmail,
    normalizeDates: typeof candidate.normalizeDates === "boolean" ? candidate.normalizeDates : DEFAULT_PRESET.normalizeDates,
    inputDateOrder: isInputDateOrder(candidate.inputDateOrder) ? candidate.inputDateOrder : DEFAULT_PRESET.inputDateOrder,
    dateFormat: isOutputDateFormat(candidate.dateFormat) ? candidate.dateFormat : DEFAULT_PRESET.dateFormat,
    batchOutputMode: isBatchOutputMode(candidate.batchOutputMode) ? candidate.batchOutputMode : DEFAULT_PRESET.batchOutputMode
  };
}

function validNamedPreset(value: unknown): NamedPreset | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { id?: unknown; name?: unknown; settings?: unknown };
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string") return null;
  const name = candidate.name.trim().slice(0, PRESET_NAME_LIMIT);
  if (!candidate.id || !name) return null;
  return { id: candidate.id, name, settings: normalizePresetSettings(candidate.settings) };
}

export function emptyPresetStore(): PresetStore {
  return { version: 1, lastUsed: { ...DEFAULT_PRESET }, named: [] };
}

export function parsePresetStore(serialized: string | null): PresetStore {
  if (!serialized) return emptyPresetStore();
  try {
    const value = JSON.parse(serialized) as { version?: unknown; lastUsed?: unknown; named?: unknown };
    if (value.version !== 1 || !Array.isArray(value.named)) return emptyPresetStore();
    const named = value.named.map(validNamedPreset).filter((preset): preset is NamedPreset => preset !== null);
    const unique = named.filter((preset, index) => named.findIndex((entry) => entry.name.toLowerCase() === preset.name.toLowerCase()) === index);
    return {
      version: 1,
      lastUsed: normalizePresetSettings(value.lastUsed),
      named: unique.slice(0, MAX_NAMED_PRESETS)
    };
  } catch {
    return emptyPresetStore();
  }
}

export function readPresetStore(storage: StorageLike): PresetStore {
  return parsePresetStore(storage.getItem(PRESET_STORAGE_KEY));
}

export function writePresetStore(storage: StorageLike, store: PresetStore): void {
  storage.setItem(PRESET_STORAGE_KEY, JSON.stringify(store));
}

export function upsertNamedPreset(store: PresetStore, nameSource: string, settings: PresetSettings): PresetStore {
  const name = nameSource.trim().slice(0, PRESET_NAME_LIMIT);
  if (!name) throw new Error("Enter a preset name.");
  const matching = store.named.find((preset) => preset.name.toLowerCase() === name.toLowerCase());
  if (!matching && store.named.length >= MAX_NAMED_PRESETS) {
    throw new Error(`You can save up to ${MAX_NAMED_PRESETS} presets. Delete one before adding another.`);
  }
  const nextPreset: NamedPreset = matching
    ? { ...matching, name, settings: { ...settings } }
    : { id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, settings: { ...settings } };
  const named = matching
    ? store.named.map((preset) => preset.id === matching.id ? nextPreset : preset)
    : [...store.named, nextPreset];
  return { version: 1, lastUsed: { ...settings }, named };
}

export function deleteNamedPreset(store: PresetStore, id: string): PresetStore {
  return { ...store, named: store.named.filter((preset) => preset.id !== id) };
}
