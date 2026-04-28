"use strict";
/* METADATA
{
  "name": "account_book_core",
  "display_name": {
    "zh": "记账核心",
    "en": "Account Book Core"
  },
  "description": {
    "zh": "直接对记账数据执行查询、创建、更新、删除和汇总。",
    "en": "Query, create, update, delete, and summarize account-book entries directly."
  },
  "category": "Data",
  "tools": [
    {
      "name": "list_entries",
      "description": {
        "zh": "列出全部账目并返回汇总。",
        "en": "List all entries and return the summary."
      },
      "parameters": []
    },
    {
      "name": "get_entry",
      "description": {
        "zh": "按 id 获取单条账目。",
        "en": "Get a single entry by id."
      },
      "parameters": [
        {
          "name": "id",
          "description": {
            "zh": "账目 id。",
            "en": "Entry id."
          },
          "type": "string",
          "required": true
        }
      ]
    },
    {
      "name": "create_entry",
      "description": {
        "zh": "创建新账目。",
        "en": "Create a new entry."
      },
      "parameters": [
        { "name": "type", "type": "string", "required": false },
        { "name": "title", "type": "string", "required": true },
        { "name": "amount", "type": "number", "required": true },
        { "name": "category", "type": "string", "required": false },
        { "name": "date", "type": "string", "required": false },
        { "name": "note", "type": "string", "required": false }
      ]
    },
    {
      "name": "update_entry",
      "description": {
        "zh": "更新已有账目。",
        "en": "Update an existing entry."
      },
      "parameters": [
        { "name": "id", "type": "string", "required": true },
        { "name": "type", "type": "string", "required": false },
        { "name": "title", "type": "string", "required": false },
        { "name": "amount", "type": "number", "required": false },
        { "name": "category", "type": "string", "required": false },
        { "name": "date", "type": "string", "required": false },
        { "name": "note", "type": "string", "required": false }
      ]
    },
    {
      "name": "delete_entry",
      "description": {
        "zh": "删除账目。",
        "en": "Delete an entry."
      },
      "parameters": [
        {
          "name": "id",
          "description": {
            "zh": "账目 id。",
            "en": "Entry id."
          },
          "type": "string",
          "required": true
        }
      ]
    },
    {
      "name": "get_summary",
      "description": {
        "zh": "获取当前账目汇总。",
        "en": "Get the current summary."
      },
      "parameters": []
    }
  ]
}
*/
Object.defineProperty(exports, "__esModule", { value: true });
const account_book_storage_js_1 = require("../shared/account_book_storage.js");
function requireId(raw) {
    const id = String(raw || "").trim();
    if (!id) {
        throw new Error("Entry id is required.");
    }
    return id;
}
async function listEntries() {
    const entries = await (0, account_book_storage_js_1.loadEntries)();
    return {
        success: true,
        entries,
        summary: (0, account_book_storage_js_1.summarizeEntries)(entries),
        dataFile: account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE,
    };
}
async function getEntry(params) {
    const id = requireId(params?.id);
    const entries = await (0, account_book_storage_js_1.loadEntries)();
    const entry = entries.find((item) => item.id === id) || null;
    if (!entry) {
        return {
            success: false,
            message: `Entry not found: ${id}`,
            entry: null,
            dataFile: account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE,
        };
    }
    return {
        success: true,
        entry,
        dataFile: account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE,
    };
}
async function createEntry(params) {
    const entries = await (0, account_book_storage_js_1.loadEntries)();
    const entry = (0, account_book_storage_js_1.buildEntry)(params || {});
    entries.unshift(entry);
    await (0, account_book_storage_js_1.saveEntries)(entries);
    const nextEntries = await (0, account_book_storage_js_1.loadEntries)();
    return {
        success: true,
        entry,
        entries: nextEntries,
        summary: (0, account_book_storage_js_1.summarizeEntries)(nextEntries),
        dataFile: account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE,
    };
}
async function updateEntryTool(params) {
    const id = requireId(params?.id);
    const entries = await (0, account_book_storage_js_1.loadEntries)();
    const index = entries.findIndex((item) => item.id === id);
    if (index < 0) {
        return {
            success: false,
            message: `Entry not found: ${id}`,
            dataFile: account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE,
        };
    }
    const nextEntry = (0, account_book_storage_js_1.updateEntry)(entries[index], params || {});
    const sanitized = (0, account_book_storage_js_1.sanitizeEntry)(nextEntry);
    if (!sanitized) {
        throw new Error("Updated entry is invalid.");
    }
    entries[index] = sanitized;
    await (0, account_book_storage_js_1.saveEntries)(entries);
    const nextEntries = await (0, account_book_storage_js_1.loadEntries)();
    return {
        success: true,
        entry: nextEntries.find((item) => item.id === id) || sanitized,
        entries: nextEntries,
        summary: (0, account_book_storage_js_1.summarizeEntries)(nextEntries),
        dataFile: account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE,
    };
}
async function deleteEntry(params) {
    const id = requireId(params?.id);
    const entries = await (0, account_book_storage_js_1.loadEntries)();
    const nextEntries = entries.filter((item) => item.id !== id);
    if (nextEntries.length === entries.length) {
        return {
            success: false,
            message: `Entry not found: ${id}`,
            dataFile: account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE,
        };
    }
    await (0, account_book_storage_js_1.saveEntries)(nextEntries);
    return {
        success: true,
        deletedId: id,
        entries: nextEntries,
        summary: (0, account_book_storage_js_1.summarizeEntries)(nextEntries),
        dataFile: account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE,
    };
}
async function getSummary() {
    const entries = await (0, account_book_storage_js_1.loadEntries)();
    return {
        success: true,
        summary: (0, account_book_storage_js_1.summarizeEntries)(entries),
        dataFile: account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE,
    };
}
exports.list_entries = listEntries;
exports.get_entry = getEntry;
exports.create_entry = createEntry;
exports.update_entry = updateEntryTool;
exports.delete_entry = deleteEntry;
exports.get_summary = getSummary;
