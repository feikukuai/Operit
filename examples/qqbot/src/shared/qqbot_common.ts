export type JsonObject = Record<string, unknown>;

export type QQBotConfigureParams = {
    app_id?: string;
    app_secret?: string;
    use_sandbox?: boolean;
    test_connection?: boolean;
    restart_service?: boolean;
};

export type QQBotTestConnectionParams = {
    timeout_ms?: number;
};

export type QQBotServiceStartParams = {
    restart?: boolean;
    timeout_ms?: number;
};

export type QQBotServiceStopParams = {
    timeout_ms?: number;
};

export type QQBotReceiveEventsParams = {
    limit?: number;
    consume?: boolean;
    scene?: string;
    event_type?: string;
    include_raw?: boolean;
    auto_start?: boolean;
};

export type QQBotSendMessageParams = {
    content: string;
    msg_id?: string;
    event_id?: string;
    msg_seq?: number;
    msg_type?: number;
    timeout_ms?: number;
};

export type QQBotSendC2CMessageParams = QQBotSendMessageParams & {
    openid: string;
};

export type QQBotSendGroupMessageParams = QQBotSendMessageParams & {
    group_openid: string;
};

export type QQBotConfigSnapshot = {
    appId: string;
    appSecret: string;
    useSandbox: boolean;
    listenerEnabled: boolean;
};

export type QQBotTokenResponse = {
    accessToken: string;
    expiresIn: number;
    tokenType: string;
};

export type RequestJsonResult = {
    success: boolean;
    statusCode: number;
    contentType: string;
    body: string;
    json: JsonObject;
};

export type EnsureQQBotServiceOptions = {
    restart?: boolean;
    timeout_ms?: number;
    allow_missing_config?: boolean;
    source?: string;
    lifecycle_event?: string;
};

export type HiddenTerminalCommandResultLike = {
    command?: string;
    output?: string;
    exitCode?: number;
    executorKey?: string;
    timedOut?: boolean;
};

export const PACKAGE_VERSION = "0.3.0";
export const DEFAULT_TIMEOUT_MS = 20000;
export const DEFAULT_SERVICE_WAIT_MS = 8000;
export const DEFAULT_RECEIVE_LIMIT = 20;
export const MAX_RECEIVE_LIMIT = 100;
export const SERVICE_POLL_INTERVAL_MS = 200;
export const QQBOT_TOOLPKG_ID = "com.operit.qqbot_bundle";
export const CONFIG_FILE_NAME = "config.json";
export const LOG_FILE_NAME = "gateway_service.log";
export const TERMINAL_SERVICE_RESOURCE_KEY = "qqbot_gateway_service_py";
export const TERMINAL_SERVICE_OUTPUT_FILE_NAME = "qqbot_gateway_service.py";
export const TERMINAL_SESSION_NAME = "qqbot_gateway_service";
export const LOCAL_SERVICE_PORT = 32145;
export const TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
export const API_BASE_URL = "https://api.sgroup.qq.com";
export const SANDBOX_API_BASE_URL = "https://sandbox.api.sgroup.qq.com";
export const DEFAULT_GATEWAY_INTENTS = (1 << 30) | (1 << 12) | (1 << 25) | (1 << 26);

export const ENV_KEYS = {
    appId: "QQBOT_APP_ID",
    appSecret: "QQBOT_APP_SECRET"
};

export function asText(value: unknown): string {
    return String(value == null ? "" : value);
}

export function hasOwn(value: unknown, key: string): boolean {
    return !!value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);
}

export function isObject(value: unknown): value is JsonObject {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

export function firstNonBlank(...values: Array<string | null | undefined>): string {
    for (let index = 0; index < values.length; index += 1) {
        const candidate = values[index];
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }
    return "";
}

export function safeErrorMessage(error: any): string {
    try {
        if (typeof error === "string") {
            return error;
        }
        if (error && typeof error.message === "string" && error.message.trim()) {
            return error.message.trim();
        }
        return String(error == null ? "" : error);
    } catch (_innerError) {
        return "Unknown error";
    }
}

export function parsePositiveInt(value: unknown, fieldName: string, fallbackValue: number): number {
    const raw = asText(value).trim();
    if (!raw) {
        return fallbackValue;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid ${fieldName}: expected positive integer`);
    }
    return parsed;
}

export function parseOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "boolean") {
        return value;
    }
    const raw = asText(value).trim().toLowerCase();
    if (!raw) {
        return undefined;
    }
    if (raw === "true" || raw === "1" || raw === "yes") {
        return true;
    }
    if (raw === "false" || raw === "0" || raw === "no") {
        return false;
    }
    throw new Error(`Invalid ${fieldName}: expected boolean`);
}

export function toBoolean(value: unknown, fallbackValue = false): boolean {
    try {
        const parsed = parseOptionalBoolean(value, "boolean");
        return parsed === undefined ? fallbackValue : parsed;
    } catch (_error) {
        return fallbackValue;
    }
}

export function parseMessageType(value: unknown): number {
    const raw = asText(value).trim();
    if (!raw) {
        return 0;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error("Invalid msg_type: expected non-negative integer");
    }
    return parsed;
}

export function parseMsgSeq(value: unknown): number {
    const raw = asText(value).trim();
    if (!raw) {
        return 1;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("Invalid msg_seq: expected positive integer");
    }
    return parsed;
}

export function parseJsonObject(content: string): JsonObject {
    const trimmed = content.trim();
    if (!trimmed) {
        return {};
    }
    const parsed = JSON.parse(trimmed);
    if (!isObject(parsed)) {
        throw new Error("Expected JSON object");
    }
    return parsed;
}

export function parseJsonArray(content: string): JsonObject[] {
    const trimmed = content.trim();
    if (!trimmed) {
        return [];
    }
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
        throw new Error("Expected JSON array");
    }
    return parsed.filter(isObject);
}

export function toHttpTimeoutSeconds(timeoutMs: number): number {
    return Math.max(1, Math.ceil(timeoutMs / 1000));
}

export function maskSecret(secret: string): string {
    const value = secret.trim();
    if (!value) {
        return "";
    }
    if (value.length <= 6) {
        return `${value.slice(0, 1)}***${value.slice(-1)}`;
    }
    return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

export function shellQuote(value: string): string {
    return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

export function createControlToken(): string {
    const random = Math.random().toString(36).slice(2);
    return `qqbot_${Date.now().toString(36)}_${random}`;
}
