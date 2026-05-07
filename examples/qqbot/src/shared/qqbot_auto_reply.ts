import {
    JsonObject,
    PACKAGE_VERSION,
    asText,
    firstNonBlank,
    hasOwn,
    parseOptionalBoolean,
    parsePositiveInt,
    safeErrorMessage,
    toBoolean
} from "./qqbot_common";
import {
    readPersistedConfigAsync,
    readConfigSnapshotAsync,
    updatePersistedConfigAsync,
    requireConfiguredSnapshotAsync
} from "./qqbot_state";
import {
    buildServiceStatusAsync,
    ensureQQBotServiceStarted,
    queryQueuedEventsFromServiceAsync,
    removeQueuedEventsFromServiceAsync,
    stopQQBotServiceInternalAsync
} from "./qqbot_service";
import { buildSendMessageBody, openApiRequest } from "./qqbot_openapi";

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

let autoReplyTimerId: ReturnType<typeof setInterval> | null = null;
let autoReplyTickActive = false;
let autoReplyConfigCache: AutoReplyConfig | null = null;
let autoReplyStateCache: AutoReplyStateStore = {
    runtime: {},
    bindings: {},
    records: {}
};

type AutoReplyConfig = typeof DEFAULT_AUTO_REPLY_CONFIG;
type QQReplyHint = {
    msg_id?: string;
    event_id?: string;
    group_openid?: string;
    openid?: string;
};

type AutoReplyEvent = JsonObject & {
    eventId?: string;
    messageId?: string;
    scene?: string;
    timestamp?: string;
    userOpenId?: string;
    groupOpenId?: string;
    content?: string;
    eventType?: string;
    authorId?: string;
    replyHint?: QQReplyHint;
};

type AutoReplyBinding = {
    chatId: string;
    title: string;
    scene: string;
    userOpenId: string;
    groupOpenId: string;
    lastMessageId: string;
    lastProcessedAt: string;
};

type AutoReplyRecord = {
    status: string;
    chatId: string;
    aiResponse?: string;
    updatedAt: string;
    scene: string;
    messageId: string;
    sentScene?: string;
};

type AutoReplyRuntime = JsonObject & {
    running?: boolean;
    status?: string;
    lastPollAt?: string;
    lastError?: string;
    processedCountTotal?: number;
    skippedCountTotal?: number;
    lastProcessedItems?: JsonObject[];
    lastSkippedItems?: JsonObject[];
};

type AutoReplyBindings = Record<string, AutoReplyBinding>;
type AutoReplyRecords = Record<string, AutoReplyRecord>;
type AutoReplyStateStore = {
    runtime: AutoReplyRuntime;
    bindings: AutoReplyBindings;
    records: AutoReplyRecords;
};

type ChatCreationResult = {
    chatId: string;
    createdAt?: number;
};

type ChatFindResult = {
    chat?: {
        id?: string;
        characterCardName?: string;
    } | null;
    matchedCount?: number;
};

type ChatSendMessageResult = {
    chatId: string;
    message: string;
    aiResponse?: string;
    receivedAt?: number;
    sentAt?: number;
};

type QQBotServiceState = JsonObject & {
    botUserId?: string;
};

function normalizeAutoReplyConfig(raw: JsonObject): AutoReplyConfig {
    const next: AutoReplyConfig = {
        ...DEFAULT_AUTO_REPLY_CONFIG
    };

    if (hasOwn(raw, "enabled")) {
        next.enabled = toBoolean(raw.enabled, DEFAULT_AUTO_REPLY_CONFIG.enabled);
    }

    if (hasOwn(raw, "pollIntervalMs")) {
        next.pollIntervalMs = parsePositiveInt(raw.pollIntervalMs, "pollIntervalMs", DEFAULT_AUTO_REPLY_CONFIG.pollIntervalMs);
    }

    if (hasOwn(raw, "aiTimeoutMs")) {
        next.aiTimeoutMs = parsePositiveInt(raw.aiTimeoutMs, "aiTimeoutMs", DEFAULT_AUTO_REPLY_CONFIG.aiTimeoutMs);
    }

    const c2cEnabled = parseOptionalBoolean(raw.c2cEnabled, "c2cEnabled");
    if (c2cEnabled !== undefined) {
        next.c2cEnabled = c2cEnabled;
    }

    const groupEnabled = parseOptionalBoolean(raw.groupEnabled, "groupEnabled");
    if (groupEnabled !== undefined) {
        next.groupEnabled = groupEnabled;
    }

    if (hasOwn(raw, "chatGroup")) {
        next.chatGroup = firstNonBlank(asText(raw.chatGroup), DEFAULT_AUTO_REPLY_CONFIG.chatGroup);
    }

    if (hasOwn(raw, "characterCardId")) {
        next.characterCardId = asText(raw.characterCardId).trim();
    }

    if (hasOwn(raw, "assistantInstruction")) {
        next.assistantInstruction = firstNonBlank(asText(raw.assistantInstruction), DEFAULT_ASSISTANT_INSTRUCTION);
    }

    return next;
}

async function readAutoReplyConfigAsync(): Promise<AutoReplyConfig> {
    if (autoReplyConfigCache) {
        return autoReplyConfigCache;
    }
    const storedConfig = await readPersistedConfigAsync();
    autoReplyConfigCache = normalizeAutoReplyConfig(
        hasOwn(storedConfig, "autoReply") && typeof storedConfig.autoReply === "object" && storedConfig.autoReply
            ? storedConfig.autoReply as JsonObject
            : {}
    );
    return autoReplyConfigCache;
}

async function writeAutoReplyConfigAsync(config: JsonObject): Promise<AutoReplyConfig> {
    const normalized = normalizeAutoReplyConfig(config);
    await updatePersistedConfigAsync({
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

async function updateAutoReplyConfigAsync(patch: JsonObject): Promise<AutoReplyConfig> {
    const current = await readAutoReplyConfigAsync();
    return await writeAutoReplyConfigAsync({
        ...current,
        ...patch
    });
}

async function readAutoReplyStateStoreAsync(): Promise<AutoReplyStateStore> {
    return autoReplyStateCache;
}

async function writeAutoReplyStateStoreAsync(store: AutoReplyStateStore): Promise<AutoReplyStateStore> {
    autoReplyStateCache = store;
    return store;
}

async function readAutoReplyRuntimeAsync(): Promise<AutoReplyRuntime> {
    return (await readAutoReplyStateStoreAsync()).runtime;
}

async function updateAutoReplyRuntimeAsync(patch: JsonObject): Promise<AutoReplyRuntime> {
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

async function readAutoReplyBindingsAsync(): Promise<AutoReplyBindings> {
    return (await readAutoReplyStateStoreAsync()).bindings;
}

async function writeAutoReplyBindingsAsync(bindings: AutoReplyBindings): Promise<void> {
    const store = await readAutoReplyStateStoreAsync();
    await writeAutoReplyStateStoreAsync({
        ...store,
        bindings
    });
}

async function readAutoReplyRecordsAsync(): Promise<AutoReplyRecords> {
    return (await readAutoReplyStateStoreAsync()).records;
}

async function writeAutoReplyRecordsAsync(records: AutoReplyRecords): Promise<void> {
    const trimmed = trimRecordMap(records);
    const store = await readAutoReplyStateStoreAsync();
    await writeAutoReplyStateStoreAsync({
        ...store,
        records: trimmed
    });
}

function trimRecordMap(records: AutoReplyRecords): AutoReplyRecords {
    const items = Object.keys(records).map((key) => {
        const value = records[key];
        const updatedAt = Number(value?.updatedAt ?? 0);
        return { key, value, updatedAt };
    });
    items.sort((left, right) => right.updatedAt - left.updatedAt);
    const next: AutoReplyRecords = {};
    items.slice(0, 200).forEach((item) => {
        next[item.key] = item.value;
    });
    return next;
}

function buildEventKey(event: AutoReplyEvent): string {
    const direct = firstNonBlank(asText(event.eventId), asText(event.messageId));
    if (direct) {
        return direct;
    }
    return [
        asText(event.scene).trim(),
        asText(event.timestamp).trim(),
        asText(event.userOpenId).trim(),
        asText(event.groupOpenId).trim(),
        asText(event.content).trim()
    ].join("|");
}

function buildConversationKey(event: AutoReplyEvent): string {
    const scene = asText(event.scene).trim().toLowerCase();
    if (scene === "group") {
        return `group:${asText(event.groupOpenId).trim()}`;
    }
    if (scene === "c2c") {
        return `c2c:${asText(event.userOpenId).trim()}`;
    }
    return "";
}

function buildChatTitle(event: AutoReplyEvent): string {
    const scene = asText(event.scene).trim().toLowerCase();
    if (scene === "group") {
        return `[QQ][群] ${firstNonBlank(asText(event.groupOpenId), "unknown")}`;
    }
    return `[QQ][私聊] ${firstNonBlank(asText(event.userOpenId), "unknown")}`;
}

function buildSenderName(event: AutoReplyEvent): string {
    const scene = asText(event.scene).trim().toLowerCase();
    const tail = scene === "group"
        ? firstNonBlank(asText(event.groupOpenId), "group")
        : firstNonBlank(asText(event.userOpenId), "user");
    if (scene === "group") {
        return `QQ群友 ${tail}`;
    }
    return `QQ用户 ${tail}`;
}

function buildInboundChatMessage(config: AutoReplyConfig, event: AutoReplyEvent): string {
    const scene = asText(event.scene).trim().toLowerCase();
    const sceneLabel = scene === "group" ? "QQ群消息" : scene === "c2c" ? "QQ私聊消息" : "QQ消息";
    const lines = [
        config.assistantInstruction,
        "",
        `当前收到一条${sceneLabel}。`,
        `eventType: ${asText(event.eventType).trim()}`,
        `messageId: ${asText(event.messageId).trim()}`
    ];

    const userOpenId = asText(event.userOpenId).trim();
    if (userOpenId) {
        lines.push(`userOpenId: ${userOpenId}`);
    }
    const groupOpenId = asText(event.groupOpenId).trim();
    if (groupOpenId) {
        lines.push(`groupOpenId: ${groupOpenId}`);
    }

    lines.push("");
    lines.push("用户消息如下：");
    lines.push(asText(event.content).trim());
    return lines.join("\n");
}

function sanitizeAiReplyText(raw: string): string {
    return asText(WaifuMessageProcessor.cleanContentForWaifu(raw)).trim();
}

function summarizeBindings(bindings: AutoReplyBindings): JsonObject {
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

function summarizeRecords(records: AutoReplyRecords): JsonObject {
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

async function buildAutoReplyStatusAsync(options: {
    includeBindings?: boolean;
    includeRecords?: boolean;
} = {}): Promise<JsonObject> {
    const includeBindings = options.includeBindings !== false;
    const includeRecords = options.includeRecords !== false;
    const config = await readAutoReplyConfigAsync();
    const runtime = await readAutoReplyRuntimeAsync();
    return {
        success: true,
        packageVersion: PACKAGE_VERSION,
        config,
        runtime: {
            ...runtime,
            running: toBoolean(runtime.running, false) || autoReplyTimerId != null
        },
        ...(includeBindings ? {
            bindings: summarizeBindings(await readAutoReplyBindingsAsync())
        } : {}),
        ...(includeRecords ? {
            records: summarizeRecords(await readAutoReplyRecordsAsync())
        } : {})
    };
}

async function ensureChatServiceReadyAsync(): Promise<void> {
    await Tools.Chat.startService({
        initial_mode: "BALL",
        keep_if_exists: true,
        timeout_ms: 20000
    });
}

async function resolveBoundChatIdAsync(config: AutoReplyConfig, event: AutoReplyEvent): Promise<string> {
    await ensureChatServiceReadyAsync();

    const conversationKey = buildConversationKey(event);
    if (!conversationKey) {
        throw new Error("Unable to resolve conversation key for QQ event");
    }

    const bindings = await readAutoReplyBindingsAsync();
    const existing = bindings[conversationKey];
    const existingChatId = firstNonBlank(existing?.chatId ?? "");
    if (existingChatId) {
        const findResult = await Tools.Chat.findChat({
            query: existingChatId,
            match: "exact",
            index: 0
        }) as ChatFindResult;
        if ((findResult.chat?.id ?? "") === existingChatId) {
            return existingChatId;
        }
    }

    const creation = await Tools.Chat.createNew(
        config.chatGroup,
        false,
        config.characterCardId || undefined
    ) as ChatCreationResult;
    const chatId = creation.chatId.trim();
    if (!chatId) {
        throw new Error("Failed to create a chat for QQ auto reply");
    }

    const title = buildChatTitle(event);
    try {
        await Tools.Chat.updateTitle(chatId, title);
    } catch (_error) {}

    bindings[conversationKey] = {
        chatId,
        title,
        scene: asText(event.scene).trim(),
        userOpenId: asText(event.userOpenId).trim(),
        groupOpenId: asText(event.groupOpenId).trim(),
        lastMessageId: asText(event.messageId).trim(),
        lastProcessedAt: new Date().toISOString()
    };
    await writeAutoReplyBindingsAsync(bindings);
    return chatId;
}

async function generateAiReplyAsync(config: AutoReplyConfig, event: AutoReplyEvent, eventKey: string): Promise<JsonObject> {
    const records = await readAutoReplyRecordsAsync();
    const existing = records[eventKey];
    const existingReply = firstNonBlank(existing?.aiResponse ?? "");
    if (existing?.status === "chat_done" && existingReply) {
        return {
            chatId: existing.chatId.trim(),
            aiResponse: existingReply
        };
    }

    const chatId = await resolveBoundChatIdAsync(config, event);
    const sendResult = await Tools.Chat.sendMessage(
        buildInboundChatMessage(config, event),
        chatId,
        config.characterCardId || undefined,
        buildSenderName(event),
        {
            persist_turn: true,
            notify_reply: false,
            hide_user_message: false,
            disable_warning: true,
            timeout_ms: config.aiTimeoutMs
        }
    ) as ChatSendMessageResult;
    const aiResponse = sanitizeAiReplyText((sendResult.aiResponse ?? "").trim());
    if (!aiResponse) {
        throw new Error("AI returned an empty response for QQ auto reply");
    }

    records[eventKey] = {
        status: "chat_done",
        chatId,
        aiResponse,
        updatedAt: new Date().toISOString(),
        scene: asText(event.scene).trim(),
        messageId: asText(event.messageId).trim()
    };
    await writeAutoReplyRecordsAsync(records);

    const bindings = await readAutoReplyBindingsAsync();
    const conversationKey = buildConversationKey(event);
    const binding = bindings[conversationKey];
    bindings[conversationKey] = {
        chatId,
        title: firstNonBlank(binding?.title ?? "", buildChatTitle(event)),
        scene: asText(event.scene).trim(),
        userOpenId: asText(event.userOpenId).trim(),
        groupOpenId: asText(event.groupOpenId).trim(),
        lastMessageId: asText(event.messageId).trim(),
        lastProcessedAt: new Date().toISOString()
    };
    await writeAutoReplyBindingsAsync(bindings);

    return {
        chatId,
        aiResponse
    };
}

async function sendReplyToQQAsync(event: AutoReplyEvent, replyText: string): Promise<JsonObject> {
    const snapshot = await requireConfiguredSnapshotAsync();
    const scene = asText(event.scene).trim().toLowerCase();
    const replyHint = event.replyHint;
    const body = buildSendMessageBody({
        content: replyText,
        msg_id: replyHint?.msg_id ?? "",
        event_id: replyHint?.event_id ?? ""
    });

    if (scene === "group") {
        const groupOpenId = firstNonBlank(
            replyHint?.group_openid ?? "",
            asText(event.groupOpenId)
        );
        if (!groupOpenId) {
            throw new Error("Missing group_openid for QQ group auto reply");
        }
        const response = await openApiRequest(
            snapshot,
            `/v2/groups/${encodeURIComponent(groupOpenId)}/messages`,
            "POST",
            body,
            20000
        );
        if (!response.success) {
            throw new Error(firstNonBlank(asText(response.json.message), `HTTP ${response.statusCode}`));
        }
        return {
            scene: "group",
            groupOpenId,
            response: response.json
        };
    }

    const openid = firstNonBlank(
        replyHint?.openid ?? "",
        asText(event.userOpenId)
    );
    if (!openid) {
        throw new Error("Missing openid for QQ C2C auto reply");
    }
    const response = await openApiRequest(
        snapshot,
        `/v2/users/${encodeURIComponent(openid)}/messages`,
        "POST",
        body,
        20000
    );
    if (!response.success) {
        throw new Error(firstNonBlank(asText(response.json.message), `HTTP ${response.statusCode}`));
    }
    return {
        scene: "c2c",
        openid,
        response: response.json
    };
}

function classifyEvent(config: AutoReplyConfig, event: AutoReplyEvent, serviceState: QQBotServiceState): { action: "process" | "skip"; reason?: string } {
    const scene = asText(event.scene).trim().toLowerCase();
    const eventType = asText(event.eventType).trim();
    const content = asText(event.content).trim();

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
    const botUserId = asText(serviceState.botUserId).trim();
    const authorId = asText(event.authorId).trim();
    if (botUserId && authorId && botUserId === authorId) {
        return { action: "skip", reason: "bot_echo" };
    }
    if (!eventType) {
        return { action: "skip", reason: "missing_event_type" };
    }
    return { action: "process" };
}

async function processSingleEventAsync(config: AutoReplyConfig, event: AutoReplyEvent): Promise<JsonObject> {
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
        scene: asText(event.scene).trim(),
        messageId: asText(event.messageId).trim(),
        sentScene: asText(sendResult.scene)
    };
    await writeAutoReplyRecordsAsync(records);

    return {
        eventKey,
        chatId: chatId.trim(),
        replyPreview: aiResponse.trim().slice(0, 200),
        sendResult
    };
}

async function processAutoReplyQueueOnceAsync(source: string): Promise<JsonObject> {
    const snapshot = await readConfigSnapshotAsync();
    const config = await readAutoReplyConfigAsync();
    if (!snapshot.listenerEnabled || !config.enabled) {
        return {
            success: true,
            skipped: true,
            reason: !snapshot.listenerEnabled ? "listener_disabled" : "disabled",
            packageVersion: PACKAGE_VERSION
        };
    }

    await ensureQQBotServiceStarted({
        allow_missing_config: false,
        timeout_ms: 8000,
        source
    });

    const serviceStatus = await buildServiceStatusAsync({
        includeContacts: false,
        snapshot
    });
    const runtimeState = (serviceStatus.runtime || {}) as QQBotServiceState;
    const queueResult = await queryQueuedEventsFromServiceAsync({
        limit: 100,
        consume: false,
        include_raw: true
    }, 8000);
    const queue = Array.isArray(queueResult.events) ? queueResult.events as AutoReplyEvent[] : [];
    if (queue.length === 0) {
        await updateAutoReplyRuntimeAsync({
            running: autoReplyTimerId != null,
            status: "idle",
            lastPollAt: new Date().toISOString(),
            lastError: ""
        });
        return {
            success: true,
            packageVersion: PACKAGE_VERSION,
            processedCount: 0,
            skippedCount: 0,
            queueRemainingCount: 0
        };
    }

    let processedCount = 0;
    let skippedCount = 0;
    const processedItems: JsonObject[] = [];
    const skippedItems: JsonObject[] = [];
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
                await removeQueuedEventsFromServiceAsync([eventKey], 8000);
            }
            queueRemainingCount -= 1;
            continue;
        }

        const result = await processSingleEventAsync(config, event);
        processedCount += 1;
        processedItems.push(result);
        if (eventKey) {
            await removeQueuedEventsFromServiceAsync([eventKey], 8000);
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
        packageVersion: PACKAGE_VERSION,
        processedCount,
        skippedCount,
        processedItems,
        skippedItems,
        queueRemainingCount
    };
}

async function stopAutoReplyLoopInternal(reason: string, errorText = ""): Promise<JsonObject> {
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

async function recordAutoReplyTickErrorAsync(errorText: string): Promise<void> {
    await updateAutoReplyRuntimeAsync({
        running: autoReplyTimerId != null,
        status: "error",
        lastPollAt: new Date().toISOString(),
        lastError: errorText
    });
}

async function tickAutoReplyLoopAsync(source: string): Promise<void> {
    if (autoReplyTickActive) {
        return;
    }
    autoReplyTickActive = true;
    try {
        await processAutoReplyQueueOnceAsync(source);
    } catch (error: unknown) {
        const message = safeErrorMessage(error);
        console.error(`[qqbot_auto_reply] ${message}`);
        await recordAutoReplyTickErrorAsync(message);
    } finally {
        autoReplyTickActive = false;
    }
}

export async function ensureQQBotAutoReplyLoopStarted(source = "manual_start"): Promise<JsonObject> {
    const snapshot = await readConfigSnapshotAsync();
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
            packageVersion: PACKAGE_VERSION,
            status: await buildAutoReplyStatusAsync()
        };
    }
    if (!config.enabled) {
        return {
            success: true,
            skipped: true,
            reason: "disabled",
            packageVersion: PACKAGE_VERSION,
            status: await buildAutoReplyStatusAsync()
        };
    }

    if (autoReplyTimerId != null) {
        return {
            success: true,
            alreadyRunning: true,
            packageVersion: PACKAGE_VERSION,
            status: await buildAutoReplyStatusAsync()
        };
    }

    await ensureQQBotServiceStarted({
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
        packageVersion: PACKAGE_VERSION,
        status: await buildAutoReplyStatusAsync()
    };
}

export async function qqbot_auto_reply_configure(params: JsonObject = {}): Promise<any> {
    try {
        const before = await readAutoReplyConfigAsync();
        const patch: JsonObject = {};

        if (hasOwn(params, "enabled")) {
            patch.enabled = parseOptionalBoolean(params.enabled, "enabled") === true;
        }
        if (hasOwn(params, "poll_interval_ms")) {
            patch.pollIntervalMs = parsePositiveInt(params.poll_interval_ms, "poll_interval_ms", before.pollIntervalMs);
        }
        if (hasOwn(params, "ai_timeout_ms")) {
            patch.aiTimeoutMs = parsePositiveInt(params.ai_timeout_ms, "ai_timeout_ms", before.aiTimeoutMs);
        }
        if (hasOwn(params, "c2c_enabled")) {
            patch.c2cEnabled = parseOptionalBoolean(params.c2c_enabled, "c2c_enabled") === true;
        }
        if (hasOwn(params, "group_enabled")) {
            patch.groupEnabled = parseOptionalBoolean(params.group_enabled, "group_enabled") === true;
        }
        if (hasOwn(params, "chat_group")) {
            patch.chatGroup = asText(params.chat_group).trim();
        }
        if (hasOwn(params, "character_card_id")) {
            patch.characterCardId = asText(params.character_card_id).trim();
        }
        if (hasOwn(params, "assistant_instruction")) {
            patch.assistantInstruction = asText(params.assistant_instruction).trim();
        }

        let config = await updateAutoReplyConfigAsync(patch);
        const snapshot = await readConfigSnapshotAsync();
        const startNow = parseOptionalBoolean(params.start_now, "start_now") === true;

        if (!snapshot.listenerEnabled && config.enabled) {
            config = await updateAutoReplyConfigAsync({
                enabled: false
            });
        }

        if (!config.enabled) {
            await stopAutoReplyLoopInternal("manual_stop");
        } else if (autoReplyTimerId != null && config.pollIntervalMs !== before.pollIntervalMs) {
            await stopAutoReplyLoopInternal("restart");
            await ensureQQBotAutoReplyLoopStarted("qqbot_auto_reply_configure");
        } else if (startNow || autoReplyTimerId != null) {
            if (autoReplyTimerId == null) {
                await ensureQQBotAutoReplyLoopStarted("qqbot_auto_reply_configure");
            }
        }

        return {
            success: true,
            packageVersion: PACKAGE_VERSION,
            config,
            status: await buildAutoReplyStatusAsync()
        };
    } catch (error: unknown) {
        return {
            success: false,
            packageVersion: PACKAGE_VERSION,
            error: safeErrorMessage(error)
        };
    }
}

export async function qqbot_auto_reply_status(params: JsonObject = {}): Promise<any> {
    try {
        const summaryOnly = parseOptionalBoolean(params.summary_only, "summary_only") === true;
        return await buildAutoReplyStatusAsync({
            includeBindings: !summaryOnly,
            includeRecords: !summaryOnly
        });
    } catch (error: unknown) {
        return {
            success: false,
            packageVersion: PACKAGE_VERSION,
            error: safeErrorMessage(error)
        };
    }
}

export async function qqbot_auto_reply_start(): Promise<any> {
    try {
        return await ensureQQBotAutoReplyLoopStarted("qqbot_auto_reply_start");
    } catch (error: unknown) {
        return {
            success: false,
            packageVersion: PACKAGE_VERSION,
            error: safeErrorMessage(error)
        };
    }
}

export async function qqbot_auto_reply_stop(): Promise<any> {
    try {
        await stopAutoReplyLoopInternal("manual_stop");
        return {
            success: true,
            packageVersion: PACKAGE_VERSION,
            status: await buildAutoReplyStatusAsync()
        };
    } catch (error: unknown) {
        return {
            success: false,
            packageVersion: PACKAGE_VERSION,
            error: safeErrorMessage(error)
        };
    }
}

export async function qqbot_auto_reply_run_once(): Promise<any> {
    try {
        return await processAutoReplyQueueOnceAsync("qqbot_auto_reply_run_once");
    } catch (error: unknown) {
        return {
            success: false,
            packageVersion: PACKAGE_VERSION,
            error: safeErrorMessage(error)
        };
    }
}

export async function onQQBotAutoReplyApplicationCreate(): Promise<any> {
    try {
        const snapshot = await readConfigSnapshotAsync();
        const config = await readAutoReplyConfigAsync();
        if (!snapshot.listenerEnabled) {
            if (config.enabled) {
                await updateAutoReplyConfigAsync({
                    enabled: false
                });
            }
            await stopAutoReplyLoopInternal("manual_stop");
            await stopQQBotServiceInternalAsync(8000);
        } else {
            await ensureQQBotServiceStarted({
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
    } catch (error: unknown) {
        return {
            ok: false,
            error: safeErrorMessage(error)
        };
    }
}

export async function onQQBotAutoReplyApplicationForeground(): Promise<any> {
    return await onQQBotAutoReplyApplicationCreate();
}

export async function onQQBotAutoReplyApplicationTerminate(): Promise<any> {
    try {
        await stopAutoReplyLoopInternal("application_terminate");
        return { ok: true };
    } catch (error: unknown) {
        return {
            ok: false,
            error: safeErrorMessage(error)
        };
    }
}
