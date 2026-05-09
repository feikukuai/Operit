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
        },
        {
          "name": "inject_target",
          "description": {
            "zh": "注入目标，可选 system 或 user，默认 system",
            "en": "Injection target: system or user (default system)"
          },
          "type": "string",
          "required": false
        },
        {
          "name": "character_card_id",
          "description": {
            "zh": "绑定角色卡 ID；填写后仅在对应角色卡会话中生效",
            "en": "Bound character card ID; when set, the entry only works for that character card"
          },
          "type": "string",
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
        },
        {
          "name": "inject_target",
          "description": {
            "zh": "注入目标，可选 system 或 user",
            "en": "Injection target: system or user"
          },
          "type": "string",
          "required": false
        },
        {
          "name": "character_card_id",
          "description": {
            "zh": "绑定角色卡 ID；填写后仅在对应角色卡会话中生效",
            "en": "Bound character card ID; when set, the entry only works for that character card"
          },
          "type": "string",
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
    },
    {
      "name": "list_character_cards_proxy",
      "description": {
        "zh": "通过代理列出所有角色卡，用于世界书 UI 选择角色卡。",
        "en": "List all character cards through a proxy for world book UI selection."
      },
      "parameters": []
    }
  ]
}
*/

import {
  createWorldBookEntry,
  deleteWorldBookEntry,
  getWorldBookEntry,
  listWorldBookCharacterCards,
  listWorldBookEntries,
  toggleWorldBookEntry,
  updateWorldBookEntry,
  type WorldBookMutationParams
} from "../shared/worldbook_service.js";
import { ensureWorldBookStorage } from "../shared/worldbook_storage.js";

async function wrap<TParams>(handler: (params: TParams) => Promise<unknown>, params: TParams) {
  try {
    const result = await handler(params);
    complete(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    complete({ success: false, message: `执行失败: ${message}` });
  }
}

async function listEntries(): Promise<unknown> {
  const entries = await listWorldBookEntries();
  return { success: true, count: entries.length, entries };
}

async function getEntry(params: Pick<WorldBookMutationParams, "id">): Promise<unknown> {
  const entry = await getWorldBookEntry(String(params.id || ""));
  return { success: true, entry };
}

async function createEntry(params: WorldBookMutationParams): Promise<unknown> {
  const entry = await createWorldBookEntry(params);
  return { success: true, message: "条目已创建", entry };
}

async function updateEntry(params: WorldBookMutationParams): Promise<unknown> {
  const entry = await updateWorldBookEntry(params);
  return { success: true, message: "条目已更新", entry };
}

async function deleteEntry(params: Pick<WorldBookMutationParams, "id">): Promise<unknown> {
  const removed = await deleteWorldBookEntry(String(params.id || ""));
  return { success: true, message: `条目已删除: ${removed.name}` };
}

async function toggleEntry(params: Pick<WorldBookMutationParams, "id">): Promise<unknown> {
  const entry = await toggleWorldBookEntry(String(params.id || ""));
  return {
    success: true,
    message: `${entry.name} 已${entry.enabled ? "启用" : "禁用"}`,
    entry
  };
}

async function listCharacterCardsProxy(): Promise<unknown> {
  const cards = await listWorldBookCharacterCards();
  return { success: true, totalCount: cards.length, cards };
}

exports.list_entries = (params: never) => wrap(listEntries as (params: never) => Promise<unknown>, params);
exports.get_entry = (params: Pick<WorldBookMutationParams, "id">) => wrap(getEntry, params);
exports.create_entry = (params: WorldBookMutationParams) => wrap(createEntry, params);
exports.update_entry = (params: WorldBookMutationParams) => wrap(updateEntry, params);
exports.delete_entry = (params: Pick<WorldBookMutationParams, "id">) => wrap(deleteEntry, params);
exports.toggle_entry = (params: Pick<WorldBookMutationParams, "id">) => wrap(toggleEntry, params);
exports.list_character_cards_proxy = (params: never) =>
  wrap(listCharacterCardsProxy as (params: never) => Promise<unknown>, params);

void ensureWorldBookStorage();
