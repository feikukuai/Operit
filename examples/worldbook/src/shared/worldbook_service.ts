import {
  ensureWorldBookStorage,
  readWorldBookEntries,
  writeWorldBookEntries
} from "./worldbook_storage.js";

export interface WorldBookEntry {
  id: string;
  name: string;
  content: string;
  keywords: string[];
  is_regex: boolean;
  case_sensitive: boolean;
  always_active: boolean;
  enabled: boolean;
  priority: number;
  scan_depth: number;
  inject_target: "system" | "user";
  character_card_id: string;
  created_at: string;
  updated_at: string;
}

export interface WorldBookListEntry {
  id: string;
  name: string;
  enabled: boolean;
  always_active: boolean;
  priority: number;
  keywords: string[];
  is_regex: boolean;
  scan_depth: number;
  inject_target: "system" | "user";
  character_card_id: string;
}

export interface WorldBookMutationParams {
  id?: string;
  name?: string;
  content?: string;
  keywords?: string;
  is_regex?: boolean;
  case_sensitive?: boolean;
  always_active?: boolean;
  enabled?: boolean;
  priority?: number;
  scan_depth?: number;
  inject_target?: string;
  character_card_id?: string;
}

interface CharacterCardSummary {
  id?: string;
  name?: string;
  description?: string;
  isDefault?: boolean;
}

export interface CharacterCardOption {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
}

function generateId(): string {
  return `wb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function splitKeywords(raw?: string): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(/[,，]/)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
}

function normalizeNumber(value: unknown, fallbackValue: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallbackValue;
}

function normalizeInjectTarget(value: unknown): "system" | "user" {
  return value === "user" ? "user" : "system";
}

async function loadEntries(): Promise<WorldBookEntry[]> {
  return await readWorldBookEntries<WorldBookEntry>();
}

async function saveEntries(entries: WorldBookEntry[]): Promise<void> {
  await writeWorldBookEntries(entries);
}

function requireEntryId(id: string | undefined): string {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    throw new Error("条目 ID 不能为空");
  }
  return normalizedId;
}

function findEntryIndex(entries: WorldBookEntry[], id: string | undefined): number {
  const targetId = requireEntryId(id);
  const index = entries.findIndex((entry) => entry.id === targetId);
  if (index === -1) {
    throw new Error(`条目不存在: ${targetId}`);
  }
  return index;
}

export function toWorldBookListEntry(entry: WorldBookEntry): WorldBookListEntry {
  return {
    id: entry.id,
    name: entry.name,
    enabled: entry.enabled,
    always_active: entry.always_active,
    priority: entry.priority,
    keywords: entry.keywords || [],
    is_regex: entry.is_regex || false,
    scan_depth: entry.scan_depth ?? 0,
    inject_target: entry.inject_target || "system",
    character_card_id: entry.character_card_id || ""
  };
}

export async function listWorldBookEntries(): Promise<WorldBookListEntry[]> {
  const entries = await loadEntries();
  return entries
    .map(toWorldBookListEntry)
    .sort((left, right) => right.priority - left.priority);
}

export async function getWorldBookEntry(id: string): Promise<WorldBookEntry> {
  const entries = await loadEntries();
  return entries[findEntryIndex(entries, id)];
}

export async function createWorldBookEntry(params: WorldBookMutationParams): Promise<WorldBookEntry> {
  const entries = await loadEntries();
  const now = new Date().toISOString();
  const entry: WorldBookEntry = {
    id: generateId(),
    name: String(params.name || ""),
    content: String(params.content || ""),
    keywords: splitKeywords(params.keywords),
    is_regex: params.is_regex === true,
    case_sensitive: params.case_sensitive === true,
    always_active: params.always_active === true,
    enabled: params.enabled !== false,
    priority: normalizeNumber(params.priority, 50),
    scan_depth: normalizeNumber(params.scan_depth, 0),
    inject_target: normalizeInjectTarget(params.inject_target),
    character_card_id: String(params.character_card_id || "").trim(),
    created_at: now,
    updated_at: now
  };

  entries.push(entry);
  await saveEntries(entries);
  return entry;
}

export async function updateWorldBookEntry(params: WorldBookMutationParams): Promise<WorldBookEntry> {
  const entries = await loadEntries();
  const index = findEntryIndex(entries, params.id);
  const nextEntry = { ...entries[index] };

  if (params.name != null) {
    nextEntry.name = String(params.name);
  }
  if (params.content != null) {
    nextEntry.content = String(params.content);
  }
  if (params.keywords != null) {
    nextEntry.keywords = splitKeywords(params.keywords);
  }
  if (params.is_regex != null) {
    nextEntry.is_regex = params.is_regex === true;
  }
  if (params.case_sensitive != null) {
    nextEntry.case_sensitive = params.case_sensitive === true;
  }
  if (params.always_active != null) {
    nextEntry.always_active = params.always_active === true;
  }
  if (params.enabled != null) {
    nextEntry.enabled = params.enabled !== false;
  }
  if (params.priority != null) {
    nextEntry.priority = normalizeNumber(params.priority, nextEntry.priority);
  }
  if (params.scan_depth != null) {
    nextEntry.scan_depth = normalizeNumber(params.scan_depth, nextEntry.scan_depth);
  }
  if (params.inject_target != null) {
    nextEntry.inject_target = normalizeInjectTarget(params.inject_target);
  }
  if (params.character_card_id != null) {
    nextEntry.character_card_id = String(params.character_card_id || "").trim();
  }

  nextEntry.updated_at = new Date().toISOString();
  entries[index] = nextEntry;
  await saveEntries(entries);
  return nextEntry;
}

export async function deleteWorldBookEntry(id: string): Promise<WorldBookEntry> {
  const entries = await loadEntries();
  const index = findEntryIndex(entries, id);
  const [removed] = entries.splice(index, 1);
  await saveEntries(entries);
  return removed;
}

export async function toggleWorldBookEntry(id: string): Promise<WorldBookListEntry> {
  const entries = await loadEntries();
  const index = findEntryIndex(entries, id);
  const nextEntry: WorldBookEntry = {
    ...entries[index],
    enabled: !entries[index].enabled,
    updated_at: new Date().toISOString()
  };
  entries[index] = nextEntry;
  await saveEntries(entries);
  return toWorldBookListEntry(nextEntry);
}

export async function listWorldBookCharacterCards(): Promise<CharacterCardOption[]> {
  const result = await Tools.Chat.listCharacterCards();
  const cards = Array.isArray(result?.cards) ? (result.cards as CharacterCardSummary[]) : [];
  return cards
    .map((card) => ({
      id: String(card?.id || "").trim(),
      name: String(card?.name || "").trim(),
      description: String(card?.description || "").trim(),
      isDefault: card?.isDefault === true
    }))
    .filter((card) => !!card.id);
}

void ensureWorldBookStorage();
