"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemPromptHook = systemPromptHook;
exports.finalizeHook = finalizeHook;
exports.registerToolPkg = registerToolPkg;
const index_ui_js_1 = __importDefault(require("./ui/worldbook_manager/index.ui.js"));
const WORLD_BOOK_DIR = "/sdcard/Download/Operit/worldbook";
const WORLD_BOOK_FILE = "/sdcard/Download/Operit/worldbook/entries.json";
const WORLDBOOK_ROUTE = "toolpkg:com.operit.worldbook:ui:worldbook_manager";
function matchesEntry(entry, text) {
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
            }
            else if (text.toLowerCase().includes(keyword.toLowerCase())) {
                return true;
            }
        }
        catch (_error) {
            // Ignore malformed regex entries instead of breaking prompt assembly.
        }
    }
    return false;
}
function buildInjection(entries) {
    const parts = ["<worldbook>"];
    for (const entry of entries) {
        parts.push(`<entry name="${entry.name}">`);
        parts.push(entry.content);
        parts.push("</entry>");
    }
    parts.push("</worldbook>");
    return parts.join("\n");
}
async function ensureWorldBookFile() {
    await Tools.Files.mkdir(WORLD_BOOK_DIR, true);
    const existsResult = await Tools.Files.exists(WORLD_BOOK_FILE);
    if (existsResult?.exists) {
        return;
    }
    await Tools.Files.write(WORLD_BOOK_FILE, "[]", false);
}
async function readEnabledEntries() {
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
        const enabledEntries = parsed.filter((entry) => entry && entry.enabled !== false);
        enabledEntries.sort((left, right) => (right.priority || 50) - (left.priority || 50));
        return enabledEntries;
    }
    catch (_error) {
        return [];
    }
}
async function systemPromptHook(event) {
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
async function finalizeHook(event) {
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
    const history = (payload.preparedHistory || payload.chatHistory || []);
    const hitEntries = [];
    for (const entry of keywordEntries) {
        const texts = [];
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
    const nextHistory = [];
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
function registerToolPkg() {
    ToolPkg.registerUiRoute({
        id: "worldbook_manager",
        route: WORLDBOOK_ROUTE,
        runtime: "compose_dsl",
        screen: index_ui_js_1.default,
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
