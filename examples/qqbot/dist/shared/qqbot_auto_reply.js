"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureQQBotAutoReplyLoopStarted = ensureQQBotAutoReplyLoopStarted;
exports.qqbot_auto_reply_configure = qqbot_auto_reply_configure;
exports.qqbot_auto_reply_status = qqbot_auto_reply_status;
exports.qqbot_auto_reply_start = qqbot_auto_reply_start;
exports.qqbot_auto_reply_stop = qqbot_auto_reply_stop;
exports.qqbot_auto_reply_run_once = qqbot_auto_reply_run_once;
exports.onQQBotAutoReplyApplicationCreate = onQQBotAutoReplyApplicationCreate;
exports.onQQBotAutoReplyApplicationForeground = onQQBotAutoReplyApplicationForeground;
exports.onQQBotAutoReplyApplicationTerminate = onQQBotAutoReplyApplicationTerminate;
const qqbot_common_1 = require("./qqbot_common");
const qqbot_state_1 = require("./qqbot_state");
const qqbot_service_1 = require("./qqbot_service");
const qqbot_openapi_1 = require("./qqbot_openapi");
const WaifuMessageProcessor = Java.com.ai.assistance.operit.util.WaifuMessageProcessor;
const DEFAULT_ASSISTANT_INSTRUCTION = [
    "你正在通过 Operit 的 QQ Bot 与真实用户对话。",
    "请直接输出要发回 QQ 的回复正文。",
    "不要解释系统内部过程，不要输出 XML、工具标签或多余前缀。"
].join(" ");
const DEFAULT_AUTO_REPLY_CONFIG = {
    enabled: false,
    pollIntervalMs: 3000,
    aiTimeoutMs: 180000,
    c2cEnabled: true,
    groupEnabled: true,
    chatGroup: "QQ Bot",
    characterCardId: "",
    assistantInstruction: DEFAULT_ASSISTANT_INSTRUCTION
};
let autoReplyTimerId = null;
let autoReplyTickActive = false;
let autoReplyConfigCache = null;
let autoReplyStateCache = {
    runtime: {},
    bindings: {},
    records: {}
};
function normalizeAutoReplyConfig(raw) {
    const next = {
        ...DEFAULT_AUTO_REPLY_CONFIG
    };
    if ((0, qqbot_common_1.hasOwn)(raw, "enabled")) {
        next.enabled = (0, qqbot_common_1.toBoolean)(raw.enabled, DEFAULT_AUTO_REPLY_CONFIG.enabled);
    }
    if ((0, qqbot_common_1.hasOwn)(raw, "pollIntervalMs")) {
        next.pollIntervalMs = (0, qqbot_common_1.parsePositiveInt)(raw.pollIntervalMs, "pollIntervalMs", DEFAULT_AUTO_REPLY_CONFIG.pollIntervalMs);
    }
    if ((0, qqbot_common_1.hasOwn)(raw, "aiTimeoutMs")) {
        next.aiTimeoutMs = (0, qqbot_common_1.parsePositiveInt)(raw.aiTimeoutMs, "aiTimeoutMs", DEFAULT_AUTO_REPLY_CONFIG.aiTimeoutMs);
    }
    const c2cEnabled = (0, qqbot_common_1.parseOptionalBoolean)(raw.c2cEnabled, "c2cEnabled");
    if (c2cEnabled !== undefined) {
        next.c2cEnabled = c2cEnabled;
    }
    const groupEnabled = (0, qqbot_common_1.parseOptionalBoolean)(raw.groupEnabled, "groupEnabled");
    if (groupEnabled !== undefined) {
        next.groupEnabled = groupEnabled;
    }
    if ((0, qqbot_common_1.hasOwn)(raw, "chatGroup")) {
        next.chatGroup = (0, qqbot_common_1.firstNonBlank)((0, qqbot_common_1.asText)(raw.chatGroup), DEFAULT_AUTO_REPLY_CONFIG.chatGroup);
    }
    if ((0, qqbot_common_1.hasOwn)(raw, "characterCardId")) {
        next.characterCardId = (0, qqbot_common_1.asText)(raw.characterCardId).trim();
    }
    if ((0, qqbot_common_1.hasOwn)(raw, "assistantInstruction")) {
        next.assistantInstruction = (0, qqbot_common_1.firstNonBlank)((0, qqbot_common_1.asText)(raw.assistantInstruction), DEFAULT_ASSISTANT_INSTRUCTION);
    }
    return next;
}
async function readAutoReplyConfigAsync() {
    if (autoReplyConfigCache) {
        return autoReplyConfigCache;
    }
    const storedConfig = await (0, qqbot_state_1.readPersistedConfigAsync)();
    autoReplyConfigCache = normalizeAutoReplyConfig((0, qqbot_common_1.hasOwn)(storedConfig, "autoReply") && typeof storedConfig.autoReply === "object" && storedConfig.autoReply
        ? storedConfig.autoReply
        : {});
    return autoReplyConfigCache;
}
async function writeAutoReplyConfigAsync(config) {
    const normalized = normalizeAutoReplyConfig(config);
    await (0, qqbot_state_1.updatePersistedConfigAsync)({
        autoReply: {
            enabled: normalized.enabled,
            pollIntervalMs: normalized.pollIntervalMs,
            aiTimeoutMs: normalized.aiTimeoutMs,
            c2cEnabled: normalized.c2cEnabled,
            groupEnabled: normalized.groupEnabled,
            chatGroup: normalized.chatGroup,
            characterCardId: normalized.characterCardId,
            assistantInstruction: normalized.assistantInstruction
        }
    });
    autoReplyConfigCache = normalized;
    return normalized;
}
async function updateAutoReplyConfigAsync(patch) {
    const current = await readAutoReplyConfigAsync();
    return await writeAutoReplyConfigAsync({
        ...current,
        ...patch
    });
}
async function readAutoReplyStateStoreAsync() {
    return autoReplyStateCache;
}
async function writeAutoReplyStateStoreAsync(store) {
    autoReplyStateCache = store;
    return store;
}
async function readAutoReplyRuntimeAsync() {
    return (await readAutoReplyStateStoreAsync()).runtime;
}
async function updateAutoReplyRuntimeAsync(patch) {
    const store = await readAutoReplyStateStoreAsync();
    const current = store.runtime;
    const next = {
        ...current,
        ...patch
    };
    await writeAutoReplyStateStoreAsync({
        ...store,
        runtime: next
    });
    return next;
}
async function readAutoReplyBindingsAsync() {
    return (await readAutoReplyStateStoreAsync()).bindings;
}
async function writeAutoReplyBindingsAsync(bindings) {
    const store = await readAutoReplyStateStoreAsync();
    await writeAutoReplyStateStoreAsync({
        ...store,
        bindings
    });
}
async function readAutoReplyRecordsAsync() {
    return (await readAutoReplyStateStoreAsync()).records;
}
async function writeAutoReplyRecordsAsync(records) {
    const trimmed = trimRecordMap(records);
    const store = await readAutoReplyStateStoreAsync();
    await writeAutoReplyStateStoreAsync({
        ...store,
        records: trimmed
    });
}
function trimRecordMap(records) {
    const items = Object.keys(records).map((key) => {
        const value = records[key];
        const updatedAt = Number(value?.updatedAt ?? 0);
        return { key, value, updatedAt };
    });
    items.sort((left, right) => right.updatedAt - left.updatedAt);
    const next = {};
    items.slice(0, 200).forEach((item) => {
        next[item.key] = item.value;
    });
    return next;
}
function buildEventKey(event) {
    const direct = (0, qqbot_common_1.firstNonBlank)((0, qqbot_common_1.asText)(event.eventId), (0, qqbot_common_1.asText)(event.messageId));
    if (direct) {
        return direct;
    }
    return [
        (0, qqbot_common_1.asText)(event.scene).trim(),
        (0, qqbot_common_1.asText)(event.timestamp).trim(),
        (0, qqbot_common_1.asText)(event.userOpenId).trim(),
        (0, qqbot_common_1.asText)(event.groupOpenId).trim(),
        (0, qqbot_common_1.asText)(event.content).trim()
    ].join("|");
}
function buildConversationKey(event) {
    const scene = (0, qqbot_common_1.asText)(event.scene).trim().toLowerCase();
    if (scene === "group") {
        return `group:${(0, qqbot_common_1.asText)(event.groupOpenId).trim()}`;
    }
    if (scene === "c2c") {
        return `c2c:${(0, qqbot_common_1.asText)(event.userOpenId).trim()}`;
    }
    return "";
}
function buildChatTitle(event) {
    const scene = (0, qqbot_common_1.asText)(event.scene).trim().toLowerCase();
    if (scene === "group") {
        return `[QQ][群] ${(0, qqbot_common_1.firstNonBlank)((0, qqbot_common_1.asText)(event.groupOpenId), "unknown")}`;
    }
    return `[QQ][私聊] ${(0, qqbot_common_1.firstNonBlank)((0, qqbot_common_1.asText)(event.userOpenId), "unknown")}`;
}
function buildSenderName(event) {
    const scene = (0, qqbot_common_1.asText)(event.scene).trim().toLowerCase();
    const tail = scene === "group"
        ? (0, qqbot_common_1.firstNonBlank)((0, qqbot_common_1.asText)(event.groupOpenId), "group")
        : (0, qqbot_common_1.firstNonBlank)((0, qqbot_common_1.asText)(event.userOpenId), "user");
    if (scene === "group") {
        return `QQ群友 ${tail}`;
    }
    return `QQ用户 ${tail}`;
}
function buildInboundChatMessage(config, event) {
    const scene = (0, qqbot_common_1.asText)(event.scene).trim().toLowerCase();
    const sceneLabel = scene === "group" ? "QQ群消息" : scene === "c2c" ? "QQ私聊消息" : "QQ消息";
    const lines = [
        config.assistantInstruction,
        "",
        `当前收到一条${sceneLabel}。`,
        `eventType: ${(0, qqbot_common_1.asText)(event.eventType).trim()}`,
        `messageId: ${(0, qqbot_common_1.asText)(event.messageId).trim()}`
    ];
    const userOpenId = (0, qqbot_common_1.asText)(event.userOpenId).trim();
    if (userOpenId) {
        lines.push(`userOpenId: ${userOpenId}`);
    }
    const groupOpenId = (0, qqbot_common_1.asText)(event.groupOpenId).trim();
    if (groupOpenId) {
        lines.push(`groupOpenId: ${groupOpenId}`);
    }
    lines.push("");
    lines.push("用户消息如下：");
    lines.push((0, qqbot_common_1.asText)(event.content).trim());
    return lines.join("\n");
}
function sanitizeAiReplyText(raw) {
    return (0, qqbot_common_1.asText)(WaifuMessageProcessor.cleanContentForWaifu(raw)).trim();
}
function summarizeBindings(bindings) {
    const items = Object.keys(bindings).map((key) => {
        const entry = bindings[key];
        return {
            key,
            chatId: entry?.chatId ?? "",
            title: entry?.title ?? "",
            lastMessageId: entry?.lastMessageId ?? "",
            lastProcessedAt: entry?.lastProcessedAt ?? ""
        };
    });
    items.sort((left, right) => String(right.lastProcessedAt).localeCompare(String(left.lastProcessedAt)));
    return {
        totalCount: items.length,
        items: items.slice(0, 10)
    };
}
function summarizeRecords(records) {
    const items = Object.keys(records).map((key) => {
        const entry = records[key];
        return {
            key,
            status: entry?.status ?? "",
            chatId: entry?.chatId ?? "",
            updatedAt: entry?.updatedAt ?? ""
        };
    });
    items.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    return {
        totalCount: items.length,
        items: items.slice(0, 10)
    };
}
async function buildAutoReplyStatusAsync(options = {}) {
    const includeBindings = options.includeBindings !== false;
    const includeRecords = options.includeRecords !== false;
    const config = await readAutoReplyConfigAsync();
    const runtime = await readAutoReplyRuntimeAsync();
    return {
        success: true,
        packageVersion: qqbot_common_1.PACKAGE_VERSION,
        config,
        runtime: {
            ...runtime,
            running: (0, qqbot_common_1.toBoolean)(runtime.running, false) || autoReplyTimerId != null
        },
        ...(includeBindings ? {
            bindings: summarizeBindings(await readAutoReplyBindingsAsync())
        } : {}),
        ...(includeRecords ? {
            records: summarizeRecords(await readAutoReplyRecordsAsync())
        } : {})
    };
}
async function ensureChatServiceReadyAsync() {
    await Tools.Chat.startService({
        initial_mode: "BALL",
        keep_if_exists: true,
        timeout_ms: 20000
    });
}
async function resolveBoundChatIdAsync(config, event) {
    await ensureChatServiceReadyAsync();
    const conversationKey = buildConversationKey(event);
    if (!conversationKey) {
        throw new Error("Unable to resolve conversation key for QQ event");
    }
    const bindings = await readAutoReplyBindingsAsync();
    const existing = bindings[conversationKey];
    const existingChatId = (0, qqbot_common_1.firstNonBlank)(existing?.chatId ?? "");
    if (existingChatId) {
        const findResult = await Tools.Chat.findChat({
            query: existingChatId,
            match: "exact",
            index: 0
        });
        if ((findResult.chat?.id ?? "") === existingChatId) {
            return existingChatId;
        }
    }
    const creation = await Tools.Chat.createNew(config.chatGroup, false, config.characterCardId || undefined);
    const chatId = creation.chatId.trim();
    if (!chatId) {
        throw new Error("Failed to create a chat for QQ auto reply");
    }
    const title = buildChatTitle(event);
    try {
        await Tools.Chat.updateTitle(chatId, title);
    }
    catch (_error) { }
    bindings[conversationKey] = {
        chatId,
        title,
        scene: (0, qqbot_common_1.asText)(event.scene).trim(),
        userOpenId: (0, qqbot_common_1.asText)(event.userOpenId).trim(),
        groupOpenId: (0, qqbot_common_1.asText)(event.groupOpenId).trim(),
        lastMessageId: (0, qqbot_common_1.asText)(event.messageId).trim(),
        lastProcessedAt: new Date().toISOString()
    };
    await writeAutoReplyBindingsAsync(bindings);
    return chatId;
}
async function generateAiReplyAsync(config, event, eventKey) {
    const records = await readAutoReplyRecordsAsync();
    const existing = records[eventKey];
    const existingReply = (0, qqbot_common_1.firstNonBlank)(existing?.aiResponse ?? "");
    if (existing?.status === "chat_done" && existingReply) {
        return {
            chatId: existing.chatId.trim(),
            aiResponse: existingReply
        };
    }
    const chatId = await resolveBoundChatIdAsync(config, event);
    const sendResult = await Tools.Chat.sendMessage(buildInboundChatMessage(config, event), chatId, config.characterCardId || undefined, buildSenderName(event), {
        persist_turn: true,
        notify_reply: false,
        hide_user_message: false,
        disable_warning: true,
        timeout_ms: config.aiTimeoutMs
    });
    const aiResponse = sanitizeAiReplyText((sendResult.aiResponse ?? "").trim());
    if (!aiResponse) {
        throw new Error("AI returned an empty response for QQ auto reply");
    }
    records[eventKey] = {
        status: "chat_done",
        chatId,
        aiResponse,
        updatedAt: new Date().toISOString(),
        scene: (0, qqbot_common_1.asText)(event.scene).trim(),
        messageId: (0, qqbot_common_1.asText)(event.messageId).trim()
    };
    await writeAutoReplyRecordsAsync(records);
    const bindings = await readAutoReplyBindingsAsync();
    const conversationKey = buildConversationKey(event);
    const binding = bindings[conversationKey];
    bindings[conversationKey] = {
        chatId,
        title: (0, qqbot_common_1.firstNonBlank)(binding?.title ?? "", buildChatTitle(event)),
        scene: (0, qqbot_common_1.asText)(event.scene).trim(),
        userOpenId: (0, qqbot_common_1.asText)(event.userOpenId).trim(),
        groupOpenId: (0, qqbot_common_1.asText)(event.groupOpenId).trim(),
        lastMessageId: (0, qqbot_common_1.asText)(event.messageId).trim(),
        lastProcessedAt: new Date().toISOString()
    };
    await writeAutoReplyBindingsAsync(bindings);
    return {
        chatId,
        aiResponse
    };
}
async function sendReplyToQQAsync(event, replyText) {
    const snapshot = await (0, qqbot_state_1.requireConfiguredSnapshotAsync)();
    const scene = (0, qqbot_common_1.asText)(event.scene).trim().toLowerCase();
    const replyHint = event.replyHint;
    const body = (0, qqbot_openapi_1.buildSendMessageBody)({
        content: replyText,
        msg_id: replyHint?.msg_id ?? "",
        event_id: replyHint?.event_id ?? ""
    });
    if (scene === "group") {
        const groupOpenId = (0, qqbot_common_1.firstNonBlank)(replyHint?.group_openid ?? "", (0, qqbot_common_1.asText)(event.groupOpenId));
        if (!groupOpenId) {
            throw new Error("Missing group_openid for QQ group auto reply");
        }
        const response = await (0, qqbot_openapi_1.openApiRequest)(snapshot, `/v2/groups/${encodeURIComponent(groupOpenId)}/messages`, "POST", body, 20000);
        if (!response.success) {
            throw new Error((0, qqbot_common_1.firstNonBlank)((0, qqbot_common_1.asText)(response.json.message), `HTTP ${response.statusCode}`));
        }
        return {
            scene: "group",
            groupOpenId,
            response: response.json
        };
    }
    const openid = (0, qqbot_common_1.firstNonBlank)(replyHint?.openid ?? "", (0, qqbot_common_1.asText)(event.userOpenId));
    if (!openid) {
        throw new Error("Missing openid for QQ C2C auto reply");
    }
    const response = await (0, qqbot_openapi_1.openApiRequest)(snapshot, `/v2/users/${encodeURIComponent(openid)}/messages`, "POST", body, 20000);
    if (!response.success) {
        throw new Error((0, qqbot_common_1.firstNonBlank)((0, qqbot_common_1.asText)(response.json.message), `HTTP ${response.statusCode}`));
    }
    return {
        scene: "c2c",
        openid,
        response: response.json
    };
}
function classifyEvent(config, event, serviceState) {
    const scene = (0, qqbot_common_1.asText)(event.scene).trim().toLowerCase();
    const eventType = (0, qqbot_common_1.asText)(event.eventType).trim();
    const content = (0, qqbot_common_1.asText)(event.content).trim();
    if (!content) {
        return { action: "skip", reason: "empty_content" };
    }
    if (scene === "c2c" && !config.c2cEnabled) {
        return { action: "skip", reason: "c2c_disabled" };
    }
    if (scene === "group" && !config.groupEnabled) {
        return { action: "skip", reason: "group_disabled" };
    }
    if (scene !== "c2c" && scene !== "group") {
        return { action: "skip", reason: "unsupported_scene" };
    }
    const botUserId = (0, qqbot_common_1.asText)(serviceState.botUserId).trim();
    const authorId = (0, qqbot_common_1.asText)(event.authorId).trim();
    if (botUserId && authorId && botUserId === authorId) {
        return { action: "skip", reason: "bot_echo" };
    }
    if (!eventType) {
        return { action: "skip", reason: "missing_event_type" };
    }
    return { action: "process" };
}
async function processSingleEventAsync(config, event) {
    const eventKey = buildEventKey(event);
    if (!eventKey) {
        throw new Error("Unable to build event key for QQ auto reply");
    }
    const generated = await generateAiReplyAsync(config, event, eventKey);
    const aiResponse = typeof generated.aiResponse === "string" ? generated.aiResponse : "";
    const chatId = typeof generated.chatId === "string" ? generated.chatId : "";
    const sendResult = await sendReplyToQQAsync(event, aiResponse.trim());
    const records = await readAutoReplyRecordsAsync();
    records[eventKey] = {
        status: "replied",
        chatId,
        aiResponse,
        updatedAt: new Date().toISOString(),
        scene: (0, qqbot_common_1.asText)(event.scene).trim(),
        messageId: (0, qqbot_common_1.asText)(event.messageId).trim(),
        sentScene: (0, qqbot_common_1.asText)(sendResult.scene)
    };
    await writeAutoReplyRecordsAsync(records);
    return {
        eventKey,
        chatId: chatId.trim(),
        replyPreview: aiResponse.trim().slice(0, 200),
        sendResult
    };
}
async function processAutoReplyQueueOnceAsync(source) {
    const snapshot = await (0, qqbot_state_1.readConfigSnapshotAsync)();
    const config = await readAutoReplyConfigAsync();
    if (!snapshot.listenerEnabled || !config.enabled) {
        return {
            success: true,
            skipped: true,
            reason: !snapshot.listenerEnabled ? "listener_disabled" : "disabled",
            packageVersion: qqbot_common_1.PACKAGE_VERSION
        };
    }
    await (0, qqbot_service_1.ensureQQBotServiceStarted)({
        allow_missing_config: false,
        timeout_ms: 8000,
        source
    });
    const serviceStatus = await (0, qqbot_service_1.buildServiceStatusAsync)({
        includeContacts: false,
        snapshot
    });
    const runtimeState = (serviceStatus.runtime || {});
    const queueResult = await (0, qqbot_service_1.queryQueuedEventsFromServiceAsync)({
        limit: 100,
        consume: false,
        include_raw: true
    }, 8000);
    const queue = Array.isArray(queueResult.events) ? queueResult.events : [];
    if (queue.length === 0) {
        await updateAutoReplyRuntimeAsync({
            running: autoReplyTimerId != null,
            status: "idle",
            lastPollAt: new Date().toISOString(),
            lastError: ""
        });
        return {
            success: true,
            packageVersion: qqbot_common_1.PACKAGE_VERSION,
            processedCount: 0,
            skippedCount: 0,
            queueRemainingCount: 0
        };
    }
    let processedCount = 0;
    let skippedCount = 0;
    const processedItems = [];
    const skippedItems = [];
    let queueRemainingCount = queue.length;
    for (let index = 0; index < queue.length && processedCount < 1; index += 1) {
        const event = queue[index];
        const eventKey = buildEventKey(event);
        const decision = classifyEvent(config, event, runtimeState);
        if (decision.action === "skip") {
            skippedCount += 1;
            skippedItems.push({
                eventKey,
                reason: decision.reason
            });
            if (eventKey) {
                await (0, qqbot_service_1.removeQueuedEventsFromServiceAsync)([eventKey], 8000);
            }
            queueRemainingCount -= 1;
            continue;
        }
        const result = await processSingleEventAsync(config, event);
        processedCount += 1;
        processedItems.push(result);
        if (eventKey) {
            await (0, qqbot_service_1.removeQueuedEventsFromServiceAsync)([eventKey], 8000);
        }
        queueRemainingCount -= 1;
    }
    const currentRuntime = await readAutoReplyRuntimeAsync();
    await updateAutoReplyRuntimeAsync({
        running: autoReplyTimerId != null,
        status: queueRemainingCount > 0 ? "running" : "idle",
        lastPollAt: new Date().toISOString(),
        lastError: "",
        processedCountTotal: Number(currentRuntime.processedCountTotal ?? 0) + processedCount,
        skippedCountTotal: Number(currentRuntime.skippedCountTotal ?? 0) + skippedCount,
        lastProcessedItems: processedItems,
        lastSkippedItems: skippedItems
    });
    return {
        success: true,
        packageVersion: qqbot_common_1.PACKAGE_VERSION,
        processedCount,
        skippedCount,
        processedItems,
        skippedItems,
        queueRemainingCount
    };
}
async function stopAutoReplyLoopInternal(reason, errorText = "") {
    if (autoReplyTimerId != null) {
        clearInterval(autoReplyTimerId);
        autoReplyTimerId = null;
    }
    autoReplyTickActive = false;
    return await updateAutoReplyRuntimeAsync({
        running: false,
        status: reason === "manual_stop" ? "stopped" : "error",
        stoppedAt: new Date().toISOString(),
        stopReason: reason,
        lastError: errorText
    });
}
async function recordAutoReplyTickErrorAsync(errorText) {
    await updateAutoReplyRuntimeAsync({
        running: autoReplyTimerId != null,
        status: "error",
        lastPollAt: new Date().toISOString(),
        lastError: errorText
    });
}
async function tickAutoReplyLoopAsync(source) {
    if (autoReplyTickActive) {
        return;
    }
    autoReplyTickActive = true;
    try {
        await processAutoReplyQueueOnceAsync(source);
    }
    catch (error) {
        const message = (0, qqbot_common_1.safeErrorMessage)(error);
        console.error(`[qqbot_auto_reply] ${message}`);
        await recordAutoReplyTickErrorAsync(message);
    }
    finally {
        autoReplyTickActive = false;
    }
}
async function ensureQQBotAutoReplyLoopStarted(source = "manual_start") {
    const snapshot = await (0, qqbot_state_1.readConfigSnapshotAsync)();
    const config = await readAutoReplyConfigAsync();
    if (!snapshot.listenerEnabled) {
        await updateAutoReplyConfigAsync({
            enabled: false
        });
        await stopAutoReplyLoopInternal("manual_stop");
        return {
            success: true,
            skipped: true,
            reason: "listener_disabled",
            packageVersion: qqbot_common_1.PACKAGE_VERSION,
            status: await buildAutoReplyStatusAsync()
        };
    }
    if (!config.enabled) {
        return {
            success: true,
            skipped: true,
            reason: "disabled",
            packageVersion: qqbot_common_1.PACKAGE_VERSION,
            status: await buildAutoReplyStatusAsync()
        };
    }
    if (autoReplyTimerId != null) {
        return {
            success: true,
            alreadyRunning: true,
            packageVersion: qqbot_common_1.PACKAGE_VERSION,
            status: await buildAutoReplyStatusAsync()
        };
    }
    await (0, qqbot_service_1.ensureQQBotServiceStarted)({
        allow_missing_config: false,
        timeout_ms: 8000,
        source
    });
    autoReplyTimerId = setInterval(() => {
        void tickAutoReplyLoopAsync("interval");
    }, config.pollIntervalMs);
    await updateAutoReplyRuntimeAsync({
        running: true,
        status: "running",
        startSource: source,
        startedAt: new Date().toISOString(),
        stoppedAt: "",
        stopReason: "",
        lastError: "",
        pollIntervalMs: config.pollIntervalMs
    });
    await tickAutoReplyLoopAsync(source);
    return {
        success: true,
        started: true,
        packageVersion: qqbot_common_1.PACKAGE_VERSION,
        status: await buildAutoReplyStatusAsync()
    };
}
async function qqbot_auto_reply_configure(params = {}) {
    try {
        const before = await readAutoReplyConfigAsync();
        const patch = {};
        if ((0, qqbot_common_1.hasOwn)(params, "enabled")) {
            patch.enabled = (0, qqbot_common_1.parseOptionalBoolean)(params.enabled, "enabled") === true;
        }
        if ((0, qqbot_common_1.hasOwn)(params, "poll_interval_ms")) {
            patch.pollIntervalMs = (0, qqbot_common_1.parsePositiveInt)(params.poll_interval_ms, "poll_interval_ms", before.pollIntervalMs);
        }
        if ((0, qqbot_common_1.hasOwn)(params, "ai_timeout_ms")) {
            patch.aiTimeoutMs = (0, qqbot_common_1.parsePositiveInt)(params.ai_timeout_ms, "ai_timeout_ms", before.aiTimeoutMs);
        }
        if ((0, qqbot_common_1.hasOwn)(params, "c2c_enabled")) {
            patch.c2cEnabled = (0, qqbot_common_1.parseOptionalBoolean)(params.c2c_enabled, "c2c_enabled") === true;
        }
        if ((0, qqbot_common_1.hasOwn)(params, "group_enabled")) {
            patch.groupEnabled = (0, qqbot_common_1.parseOptionalBoolean)(params.group_enabled, "group_enabled") === true;
        }
        if ((0, qqbot_common_1.hasOwn)(params, "chat_group")) {
            patch.chatGroup = (0, qqbot_common_1.asText)(params.chat_group).trim();
        }
        if ((0, qqbot_common_1.hasOwn)(params, "character_card_id")) {
            patch.characterCardId = (0, qqbot_common_1.asText)(params.character_card_id).trim();
        }
        if ((0, qqbot_common_1.hasOwn)(params, "assistant_instruction")) {
            patch.assistantInstruction = (0, qqbot_common_1.asText)(params.assistant_instruction).trim();
        }
        let config = await updateAutoReplyConfigAsync(patch);
        const snapshot = await (0, qqbot_state_1.readConfigSnapshotAsync)();
        const startNow = (0, qqbot_common_1.parseOptionalBoolean)(params.start_now, "start_now") === true;
        if (!snapshot.listenerEnabled && config.enabled) {
            config = await updateAutoReplyConfigAsync({
                enabled: false
            });
        }
        if (!config.enabled) {
            await stopAutoReplyLoopInternal("manual_stop");
        }
        else if (autoReplyTimerId != null && config.pollIntervalMs !== before.pollIntervalMs) {
            await stopAutoReplyLoopInternal("restart");
            await ensureQQBotAutoReplyLoopStarted("qqbot_auto_reply_configure");
        }
        else if (startNow || autoReplyTimerId != null) {
            if (autoReplyTimerId == null) {
                await ensureQQBotAutoReplyLoopStarted("qqbot_auto_reply_configure");
            }
        }
        return {
            success: true,
            packageVersion: qqbot_common_1.PACKAGE_VERSION,
            config,
            status: await buildAutoReplyStatusAsync()
        };
    }
    catch (error) {
        return {
            success: false,
            packageVersion: qqbot_common_1.PACKAGE_VERSION,
            error: (0, qqbot_common_1.safeErrorMessage)(error)
        };
    }
}
async function qqbot_auto_reply_status(params = {}) {
    try {
        const summaryOnly = (0, qqbot_common_1.parseOptionalBoolean)(params.summary_only, "summary_only") === true;
        return await buildAutoReplyStatusAsync({
            includeBindings: !summaryOnly,
            includeRecords: !summaryOnly
        });
    }
    catch (error) {
        return {
            success: false,
            packageVersion: qqbot_common_1.PACKAGE_VERSION,
            error: (0, qqbot_common_1.safeErrorMessage)(error)
        };
    }
}
async function qqbot_auto_reply_start() {
    try {
        return await ensureQQBotAutoReplyLoopStarted("qqbot_auto_reply_start");
    }
    catch (error) {
        return {
            success: false,
            packageVersion: qqbot_common_1.PACKAGE_VERSION,
            error: (0, qqbot_common_1.safeErrorMessage)(error)
        };
    }
}
async function qqbot_auto_reply_stop() {
    try {
        await stopAutoReplyLoopInternal("manual_stop");
        return {
            success: true,
            packageVersion: qqbot_common_1.PACKAGE_VERSION,
            status: await buildAutoReplyStatusAsync()
        };
    }
    catch (error) {
        return {
            success: false,
            packageVersion: qqbot_common_1.PACKAGE_VERSION,
            error: (0, qqbot_common_1.safeErrorMessage)(error)
        };
    }
}
async function qqbot_auto_reply_run_once() {
    try {
        return await processAutoReplyQueueOnceAsync("qqbot_auto_reply_run_once");
    }
    catch (error) {
        return {
            success: false,
            packageVersion: qqbot_common_1.PACKAGE_VERSION,
            error: (0, qqbot_common_1.safeErrorMessage)(error)
        };
    }
}
async function onQQBotAutoReplyApplicationCreate() {
    try {
        const snapshot = await (0, qqbot_state_1.readConfigSnapshotAsync)();
        const config = await readAutoReplyConfigAsync();
        if (!snapshot.listenerEnabled) {
            if (config.enabled) {
                await updateAutoReplyConfigAsync({
                    enabled: false
                });
            }
            await stopAutoReplyLoopInternal("manual_stop");
            await (0, qqbot_service_1.stopQQBotServiceInternalAsync)(8000);
        }
        else {
            await (0, qqbot_service_1.ensureQQBotServiceStarted)({
                allow_missing_config: true,
                timeout_ms: 8000,
                source: "application_on_create"
            });
        }
        if (snapshot.listenerEnabled && config.enabled) {
            await ensureQQBotAutoReplyLoopStarted("application_on_create");
        }
        return {
            ok: true,
            listenerEnabled: snapshot.listenerEnabled,
            enabled: snapshot.listenerEnabled && config.enabled
        };
    }
    catch (error) {
        return {
            ok: false,
            error: (0, qqbot_common_1.safeErrorMessage)(error)
        };
    }
}
async function onQQBotAutoReplyApplicationForeground() {
    return await onQQBotAutoReplyApplicationCreate();
}
async function onQQBotAutoReplyApplicationTerminate() {
    try {
        await stopAutoReplyLoopInternal("application_terminate");
        return { ok: true };
    }
    catch (error) {
        return {
            ok: false,
            error: (0, qqbot_common_1.safeErrorMessage)(error)
        };
    }
}
