/* METADATA
{
  "name": "worldbook_tools",
  "display_name": {
    "zh": "世界书工具",
    "en": "World Book Tools"
  },
  "description": {
    "zh": "世界书条目的增删改查工具，支持关键词匹配、正则表达式和常驻激活。",
    "en": "CRUD tools for world book entries with keyword matching, regex support, and always-active mode."
  },
  "category": "Utility",
  "tools": [
    {
      "name": "list_entries",
      "description": {
        "zh": "列出所有世界书条目摘要。",
        "en": "List summaries for all world book entries."
      },
      "parameters": []
    },
    {
      "name": "get_entry",
      "description": {
        "zh": "获取指定世界书条目的完整详情。",
        "en": "Get the full details of a world book entry."
      },
      "parameters": [
        {
          "name": "id",
          "description": {
            "zh": "条目 ID",
            "en": "Entry ID"
          },
          "type": "string",
          "required": true
        }
      ]
    },
    {
      "name": "create_entry",
      "description": {
        "zh": "创建新的世界书条目。",
        "en": "Create a new world book entry."
      },
      "parameters": [
        {
          "name": "name",
          "description": {
            "zh": "条目名称",
            "en": "Entry name"
          },
          "type": "string",
          "required": true
        },
        {
          "name": "content",
          "description": {
            "zh": "注入内容",
            "en": "Injected content"
          },
          "type": "string",
          "required": true
        },
        {
          "name": "keywords",
          "description": {
            "zh": "关键词列表，逗号分隔",
            "en": "Comma-separated keywords"
          },
          "type": "string",
          "required": false
        },
        {
          "name": "is_regex",
          "description": {
            "zh": "关键词是否为正则表达式",
            "en": "Whether keywords are regular expressions"
          },
          "type": "boolean",
          "required": false
        },
        {
          "name": "case_sensitive",
          "description": {
            "zh": "关键词匹配是否大小写敏感",
            "en": "Whether keyword matching is case sensitive"
          },
          "type": "boolean",
          "required": false
        },
        {
          "name": "always_active",
          "description": {
            "zh": "是否常驻激活",
            "en": "Whether the entry is always active"
          },
          "type": "boolean",
          "required": false
        },
        {
          "name": "enabled",
          "description": {
            "zh": "是否启用",
            "en": "Whether the entry is enabled"
          },
          "type": "boolean",
          "required": false
        },
        {
          "name": "priority",
          "description": {
            "zh": "优先级",
            "en": "Priority"
          },
          "type": "number",
          "required": false
        },
        {
          "name": "scan_depth",
          "description": {
            "zh": "扫描深度",
            "en": "Scan depth"
          },
          "type": "number",
          "required": false
        }
      ]
    },
    {
      "name": "update_entry",
      "description": {
        "zh": "更新已有世界书条目。",
        "en": "Update an existing world book entry."
      },
      "parameters": [
        {
          "name": "id",
          "description": {
            "zh": "条目 ID",
            "en": "Entry ID"
          },
          "type": "string",
          "required": true
        },
        {
          "name": "name",
          "description": {
            "zh": "新名称",
            "en": "New name"
          },
          "type": "string",
          "required": false
        },
        {
          "name": "content",
          "description": {
            "zh": "新注入内容",
            "en": "New injected content"
          },
          "type": "string",
          "required": false
        },
        {
          "name": "keywords",
          "description": {
            "zh": "新关键词列表，逗号分隔",
            "en": "New comma-separated keywords"
          },
          "type": "string",
          "required": false
        },
        {
          "name": "is_regex",
          "description": {
            "zh": "关键词是否为正则表达式",
            "en": "Whether keywords are regular expressions"
          },
          "type": "boolean",
          "required": false
        },
        {
          "name": "case_sensitive",
          "description": {
            "zh": "关键词匹配是否大小写敏感",
            "en": "Whether keyword matching is case sensitive"
          },
          "type": "boolean",
          "required": false
        },
        {
          "name": "always_active",
          "description": {
            "zh": "是否常驻激活",
            "en": "Whether the entry is always active"
          },
          "type": "boolean",
          "required": false
        },
        {
          "name": "enabled",
          "description": {
            "zh": "是否启用",
            "en": "Whether the entry is enabled"
          },
          "type": "boolean",
          "required": false
        },
        {
          "name": "priority",
          "description": {
            "zh": "优先级",
            "en": "Priority"
          },
          "type": "number",
          "required": false
        },
        {
          "name": "scan_depth",
          "description": {
            "zh": "扫描深度",
            "en": "Scan depth"
          },
          "type": "number",
          "required": false
        }
      ]
    },
    {
      "name": "delete_entry",
      "description": {
        "zh": "删除世界书条目。",
        "en": "Delete a world book entry."
      },
      "parameters": [
        {
          "name": "id",
          "description": {
            "zh": "条目 ID",
            "en": "Entry ID"
          },
          "type": "string",
          "required": true
        }
      ]
    },
    {
      "name": "toggle_entry",
      "description": {
        "zh": "切换世界书条目的启用状态。",
        "en": "Toggle a world book entry's enabled state."
      },
      "parameters": [
        {
          "name": "id",
          "description": {
            "zh": "条目 ID",
            "en": "Entry ID"
          },
          "type": "string",
          "required": true
        }
      ]
    }
  ]
}
*/
const WORLD_BOOK_DIR = "/sdcard/Download/Operit/worldbook";
const WORLD_BOOK_FILE = `${WORLD_BOOK_DIR}/entries.json`;
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
async function ensureDataDir() {
    try {
        await Tools.Files.mkdir(WORLD_BOOK_DIR, true);
    }
    catch (_error) {
        // Ignore if it already exists or cannot be created until the first write.
    }
}
async function ensureDataFile() {
    await ensureDataDir();
    const existsResult = await Tools.Files.exists(WORLD_BOOK_FILE);
    if (existsResult?.exists) {
        return;
    }
    await Tools.Files.write(WORLD_BOOK_FILE, "[]", false);
}
async function loadEntries() {
    await ensureDataFile();
    try {
        const result = await Tools.Files.read(WORLD_BOOK_FILE);
        if (result?.content) {
            const parsed = JSON.parse(result.content);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }
    }
    catch (_error) {
        // Treat missing or malformed files as an empty data set.
    }
    return [];
}
async function saveEntries(entries) {
    await ensureDataFile();
    await Tools.Files.write(WORLD_BOOK_FILE, JSON.stringify(entries, null, 2));
}
async function wrap(handler, params) {
    try {
        const result = await handler(params);
        complete(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        complete({ success: false, message: `执行失败: ${message}` });
    }
}
async function listEntries() {
    const entries = await loadEntries();
    const summary = entries
        .map((entry) => ({
        id: entry.id,
        name: entry.name,
        enabled: entry.enabled,
        always_active: entry.always_active,
        priority: entry.priority,
        keywords: entry.keywords || [],
        is_regex: entry.is_regex || false,
        scan_depth: entry.scan_depth ?? 5
    }))
        .sort((left, right) => right.priority - left.priority);
    return { success: true, count: summary.length, entries: summary };
}
async function getEntry(params) {
    const entries = await loadEntries();
    const entry = entries.find((item) => item.id === params.id);
    if (!entry) {
        return { success: false, message: `条目不存在: ${params.id}` };
    }
    return { success: true, entry };
}
async function createEntry(params) {
    const entries = await loadEntries();
    const now = new Date().toISOString();
    const entry = {
        id: generateId(),
        name: params.name || "",
        content: params.content || "",
        keywords: splitKeywords(params.keywords),
        is_regex: params.is_regex === true,
        case_sensitive: params.case_sensitive === true,
        always_active: params.always_active === true,
        enabled: params.enabled !== false,
        priority: params.priority ?? 50,
        scan_depth: params.scan_depth ?? 5,
        created_at: now,
        updated_at: now
    };
    entries.push(entry);
    await saveEntries(entries);
    return { success: true, message: "条目已创建", entry };
}
async function updateEntry(params) {
    const entries = await loadEntries();
    const index = entries.findIndex((entry) => entry.id === params.id);
    if (index === -1) {
        return { success: false, message: `条目不存在: ${params.id}` };
    }
    const nextEntry = { ...entries[index] };
    if (params.name != null) {
        nextEntry.name = params.name;
    }
    if (params.content != null) {
        nextEntry.content = params.content;
    }
    if (params.keywords != null) {
        nextEntry.keywords = splitKeywords(params.keywords);
    }
    if (params.is_regex != null) {
        nextEntry.is_regex = params.is_regex;
    }
    if (params.case_sensitive != null) {
        nextEntry.case_sensitive = params.case_sensitive;
    }
    if (params.always_active != null) {
        nextEntry.always_active = params.always_active;
    }
    if (params.enabled != null) {
        nextEntry.enabled = params.enabled;
    }
    if (params.priority != null) {
        nextEntry.priority = params.priority;
    }
    if (params.scan_depth != null) {
        nextEntry.scan_depth = params.scan_depth;
    }
    nextEntry.updated_at = new Date().toISOString();
    entries[index] = nextEntry;
    await saveEntries(entries);
    return { success: true, message: "条目已更新", entry: nextEntry };
}
async function deleteEntry(params) {
    const entries = await loadEntries();
    const index = entries.findIndex((entry) => entry.id === params.id);
    if (index === -1) {
        return { success: false, message: `条目不存在: ${params.id}` };
    }
    const [removed] = entries.splice(index, 1);
    await saveEntries(entries);
    return { success: true, message: `条目已删除: ${removed.name}` };
}
async function toggleEntry(params) {
    const entries = await loadEntries();
    const index = entries.findIndex((entry) => entry.id === params.id);
    if (index === -1) {
        return { success: false, message: `条目不存在: ${params.id}` };
    }
    const nextEnabled = !entries[index].enabled;
    entries[index] = {
        ...entries[index],
        enabled: nextEnabled,
        updated_at: new Date().toISOString()
    };
    await saveEntries(entries);
    return {
        success: true,
        message: `${entries[index].name} 已${nextEnabled ? "启用" : "禁用"}`,
        entry: {
            id: entries[index].id,
            name: entries[index].name,
            enabled: entries[index].enabled
        }
    };
}
exports.list_entries = (params) => wrap(listEntries, params);
exports.get_entry = (params) => wrap(getEntry, params);
exports.create_entry = (params) => wrap(createEntry, params);
exports.update_entry = (params) => wrap(updateEntry, params);
exports.delete_entry = (params) => wrap(deleteEntry, params);
exports.toggle_entry = (params) => wrap(toggleEntry, params);
