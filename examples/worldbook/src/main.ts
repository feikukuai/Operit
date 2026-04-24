import worldbookManagerScreen from "./ui/worldbook_manager/index.ui.js";

const WORLD_BOOK_DIR = "/sdcard/Download/Operit/worldbook";
const WORLD_BOOK_FILE = "/sdcard/Download/Operit/worldbook/entries.json";
const WORLDBOOK_ROUTE = "toolpkg:com.operit.worldbook:ui:worldbook_manager";

interface WorldBookEntry {
  id: string;
  name: string;
  content: string;
  keywords?: string[];
  is_regex?: boolean;
  case_sensitive?: boolean;
  always_active?: boolean;
  enabled?: boolean;
  priority?: number;
  scan_depth?: number;
}

function matchesEntry(entry: WorldBookEntry, text: string): boolean {
  if (!entry.keywords || entry.keywords.length === 0) {
    return false;
  }

  for (const keyword of entry.keywords) {
    if (!keyword) {
      continue;
    }
    try {
      if (entry.is_regex) {
        if (new RegExp(keyword, entry.case_sensitive ? "g" : "gi").test(text)) {
          return true;
        }
        continue;
      }
      if (entry.case_sensitive) {
        if (text.includes(keyword)) {
          return true;
        }
      } else if (text.toLowerCase().includes(keyword.toLowerCase())) {
        return true;
      }
    } catch (_error) {
      // Ignore malformed regex entries instead of breaking prompt assembly.
    }
  }

  return false;
}

function buildInjection(entries: WorldBookEntry[]): string {
  const parts = ["<worldbook>"];
  for (const entry of entries) {
    parts.push(`<entry name="${entry.name}">`);
    parts.push(entry.content);
    parts.push("</entry>");
  }
  parts.push("</worldbook>");
  return parts.join("\n");
}

async function ensureWorldBookFile(): Promise<void> {
  await Tools.Files.mkdir(WORLD_BOOK_DIR, true);
  const existsResult = await Tools.Files.exists(WORLD_BOOK_FILE);
  if (existsResult?.exists) {
    return;
  }
  await Tools.Files.write(WORLD_BOOK_FILE, "[]", false);
}

async function readEnabledEntries(): Promise<WorldBookEntry[]> {
  try {
    await ensureWorldBookFile();
    const fileResult = await Tools.Files.read(WORLD_BOOK_FILE);
    if (!fileResult?.content) {
      return [];
    }

    const parsed = JSON.parse(fileResult.content);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const enabledEntries = parsed.filter((entry) => entry && entry.enabled !== false) as WorldBookEntry[];
    enabledEntries.sort((left, right) => (right.priority || 50) - (left.priority || 50));
    return enabledEntries;
  } catch (_error) {
    return [];
  }
}

export async function systemPromptHook(
  event: ToolPkg.SystemPromptComposeHookEvent
) {
  const stage = event.eventName || event.event;
  if (stage !== "after_compose_system_prompt") {
    return null;
  }

  const enabledEntries = await readEnabledEntries();
  const hitEntries = enabledEntries.filter((entry) => entry.always_active);
  if (hitEntries.length === 0) {
    return null;
  }

  const currentPrompt = event.eventPayload?.systemPrompt || "";
  return { systemPrompt: `${currentPrompt}\n${buildInjection(hitEntries)}` };
}

export async function finalizeHook(
  event: ToolPkg.PromptFinalizeHookEvent
) {
  const stage = event.eventName || event.event;
  if (stage !== "before_finalize_prompt") {
    return null;
  }

  const enabledEntries = await readEnabledEntries();
  const keywordEntries = enabledEntries.filter((entry) => !entry.always_active);
  if (keywordEntries.length === 0) {
    return null;
  }

  const payload = event.eventPayload || {};
  const history = (payload.preparedHistory || payload.chatHistory || []) as ToolPkg.PromptTurn[];

  const hitEntries: WorldBookEntry[] = [];
  for (const entry of keywordEntries) {
    const texts: string[] = [];
    if (payload.rawInput) {
      texts.push(payload.rawInput);
    }
    if (payload.processedInput && payload.processedInput !== payload.rawInput) {
      texts.push(payload.processedInput);
    }

    const depth = entry.scan_depth != null ? entry.scan_depth : 5;
    if (depth > 0) {
      const startIndex = Math.max(0, history.length - depth);
      for (let index = startIndex; index < history.length; index += 1) {
        const turn = history[index];
        if (turn?.content) {
          texts.push(turn.content);
        }
      }
    }

    const scanText = texts.join("\n");
    if (scanText && matchesEntry(entry, scanText)) {
      hitEntries.push(entry);
    }
  }

  if (hitEntries.length === 0) {
    return null;
  }

  const injection = `\n${buildInjection(hitEntries)}`;
  const nextHistory: ToolPkg.PromptTurn[] = [];
  let injected = false;

  for (const turn of history) {
    if (!injected && turn.kind === "SYSTEM") {
      nextHistory.push({
        ...turn,
        content: `${turn.content}${injection}`
      });
      injected = true;
      continue;
    }
    nextHistory.push(turn);
  }

  if (!injected) {
    nextHistory.unshift({
      kind: "SYSTEM",
      content: injection
    });
  }

  return { preparedHistory: nextHistory };
}

export function registerToolPkg() {
  ToolPkg.registerUiRoute({
    id: "worldbook_manager",
    route: WORLDBOOK_ROUTE,
    runtime: "compose_dsl",
    screen: worldbookManagerScreen,
    params: {},
    title: {
      zh: "世界书管理",
      en: "World Book Manager"
    }
  });

  ToolPkg.registerNavigationEntry({
    id: "worldbook_manager_toolbox",
    route: WORLDBOOK_ROUTE,
    surface: "toolbox",
    title: {
      zh: "世界书管理",
      en: "World Book Manager"
    },
    icon: "Book",
    order: 210
  });

  ToolPkg.registerSystemPromptComposeHook({
    id: "worldbook_always_active",
    function: systemPromptHook
  });

  ToolPkg.registerPromptFinalizeHook({
    id: "worldbook_keyword_inject",
    function: finalizeHook
  });

  return true;
}
