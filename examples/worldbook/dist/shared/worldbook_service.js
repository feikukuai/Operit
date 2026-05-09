"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toWorldBookListEntry = toWorldBookListEntry;
exports.listWorldBookEntries = listWorldBookEntries;
exports.getWorldBookEntry = getWorldBookEntry;
exports.createWorldBookEntry = createWorldBookEntry;
exports.updateWorldBookEntry = updateWorldBookEntry;
exports.deleteWorldBookEntry = deleteWorldBookEntry;
exports.toggleWorldBookEntry = toggleWorldBookEntry;
exports.listWorldBookCharacterCards = listWorldBookCharacterCards;
const worldbook_storage_js_1 = require("./worldbook_storage.js");
function generateId() {
    return `wb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function splitKeywords(raw) {
    if (!raw) {
        return [];
    }
    return raw
        .split(/[,，]/)
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 0);
}
function normalizeNumber(value, fallbackValue) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallbackValue;
}
function normalizeInjectTarget(value) {
    return value === "user" ? "user" : "system";
}
async function loadEntries() {
    return await (0, worldbook_storage_js_1.readWorldBookEntries)();
}
async function saveEntries(entries) {
    await (0, worldbook_storage_js_1.writeWorldBookEntries)(entries);
}
function requireEntryId(id) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
        throw new Error("条目 ID 不能为空");
    }
    return normalizedId;
}
function findEntryIndex(entries, id) {
    const targetId = requireEntryId(id);
    const index = entries.findIndex((entry) => entry.id === targetId);
    if (index === -1) {
        throw new Error(`条目不存在: ${targetId}`);
    }
    return index;
}
function toWorldBookListEntry(entry) {
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
async function listWorldBookEntries() {
    const entries = await loadEntries();
    return entries
        .map(toWorldBookListEntry)
        .sort((left, right) => right.priority - left.priority);
}
async function getWorldBookEntry(id) {
    const entries = await loadEntries();
    return entries[findEntryIndex(entries, id)];
}
async function createWorldBookEntry(params) {
    const entries = await loadEntries();
    const now = new Date().toISOString();
    const entry = {
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
async function updateWorldBookEntry(params) {
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
async function deleteWorldBookEntry(id) {
    const entries = await loadEntries();
    const index = findEntryIndex(entries, id);
    const [removed] = entries.splice(index, 1);
    await saveEntries(entries);
    return removed;
}
async function toggleWorldBookEntry(id) {
    const entries = await loadEntries();
    const index = findEntryIndex(entries, id);
    const nextEntry = {
        ...entries[index],
        enabled: !entries[index].enabled,
        updated_at: new Date().toISOString()
    };
    entries[index] = nextEntry;
    await saveEntries(entries);
    return toWorldBookListEntry(nextEntry);
}
async function listWorldBookCharacterCards() {
    const result = await Tools.Chat.listCharacterCards();
    const cards = Array.isArray(result?.cards) ? result.cards : [];
    return cards
        .map((card) => ({
        id: String(card?.id || "").trim(),
        name: String(card?.name || "").trim(),
        description: String(card?.description || "").trim(),
        isDefault: card?.isDefault === true
    }))
        .filter((card) => !!card.id);
}
void (0, worldbook_storage_js_1.ensureWorldBookStorage)();
