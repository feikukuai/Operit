import {
    CONFIG_FILE_NAME,
    ENV_KEYS,
    JsonObject,
    LOG_FILE_NAME,
    PACKAGE_VERSION,
    QQBOT_TOOLPKG_ID,
    QQBotConfigSnapshot,
    API_BASE_URL,
    SANDBOX_API_BASE_URL,
    asText,
    hasOwn,
    isObject,
    maskSecret,
    parseJsonObject,
    parseOptionalBoolean,
    toBoolean
} from "./qqbot_common";

let persistedConfigCache: JsonObject | null = null;

export function getStateDirectoryPath(): string {
    if (typeof getPluginConfigDir !== "function") {
        throw new Error("getPluginConfigDir is unavailable");
    }
    const path = asText(getPluginConfigDir(QQBOT_TOOLPKG_ID)).trim();
    if (!path) {
        throw new Error(`Failed to resolve plugin config dir for ${QQBOT_TOOLPKG_ID}`);
    }
    return path;
}

export function getStateFilePath(name: string): string {
    return `${getStateDirectoryPath()}/${name}`;
}

export function getConfigFilePath(): string {
    return getStateFilePath(CONFIG_FILE_NAME);
}

export function getServiceLogPath(): string {
    return getStateFilePath(LOG_FILE_NAME);
}

export function readEnv(key: string): string {
    if (typeof getEnv !== "function") {
        return "";
    }
    const value = getEnv(key);
    return value == null ? "" : asText(value).trim();
}

export async function writeEnv(key: string, value: string): Promise<void> {
    await Tools.SoftwareSettings.writeEnvironmentVariable(key, value);
}

export async function readTextFileWithTools(path: string): Promise<string> {
    const exists = await Tools.Files.exists(path, "android");
    if (!exists?.exists) {
        return "";
    }
    const result = await Tools.Files.read({ path, environment: "android" });
    return asText(result?.content);
}

export async function writeTextFileWithTools(path: string, content: string): Promise<void> {
    await Tools.Files.write(path, content, false, "android");
}

export async function deleteFileIfExistsAsync(path: string): Promise<void> {
    const exists = await Tools.Files.exists(path, "android");
    if (exists?.exists) {
        await Tools.Files.deleteFile(path, false, "android");
    }
}

export async function readJsonObjectFileAsync(path: string): Promise<JsonObject> {
    const raw = (await readTextFileWithTools(path)).trim();
    if (!raw) {
        return {};
    }
    return parseJsonObject(raw);
}

export async function writeJsonObjectFileAsync(path: string, value: JsonObject): Promise<void> {
    await writeTextFileWithTools(path, JSON.stringify(value));
}

function sanitizePersistedConfig(value: JsonObject): JsonObject {
    const useSandbox = hasOwn(value, "useSandbox") ? toBoolean(value.useSandbox, false) : false;
    const listenerEnabled = hasOwn(value, "listenerEnabled") ? toBoolean(value.listenerEnabled, false) : false;
    const autoReply = hasOwn(value, "autoReply") && isObject(value.autoReply)
        ? { ...(value.autoReply as JsonObject) }
        : {};
    return {
        useSandbox,
        listenerEnabled,
        autoReply
    };
}

export async function readPersistedConfigAsync(): Promise<JsonObject> {
    if (persistedConfigCache) {
        return { ...persistedConfigCache };
    }
    persistedConfigCache = sanitizePersistedConfig(await readJsonObjectFileAsync(getConfigFilePath()));
    return { ...persistedConfigCache };
}

export async function writePersistedConfigAsync(value: JsonObject): Promise<JsonObject> {
    const sanitized = sanitizePersistedConfig(value);
    await writeJsonObjectFileAsync(getConfigFilePath(), sanitized);
    persistedConfigCache = sanitized;
    return { ...sanitized };
}

export async function updatePersistedConfigAsync(patch: JsonObject): Promise<JsonObject> {
    const current = await readPersistedConfigAsync();
    return await writePersistedConfigAsync({ ...current, ...patch });
}

export function readConfigSnapshotFrom(storedConfig: JsonObject, overrides?: JsonObject): QQBotConfigSnapshot {
    const appId =
        overrides && hasOwn(overrides, "appId")
            ? asText(overrides.appId).trim()
            : readEnv(ENV_KEYS.appId);
    const appSecret =
        overrides && hasOwn(overrides, "appSecret")
            ? asText(overrides.appSecret).trim()
            : readEnv(ENV_KEYS.appSecret);
    const useSandboxRaw =
        overrides && hasOwn(overrides, "useSandbox")
            ? overrides.useSandbox
            : storedConfig.useSandbox;
    const parsedUseSandbox = parseOptionalBoolean(useSandboxRaw, "use_sandbox");

    return {
        appId,
        appSecret,
        useSandbox: parsedUseSandbox === true,
        listenerEnabled: toBoolean(storedConfig.listenerEnabled, false)
    };
}

export async function readConfigSnapshotAsync(overrides?: JsonObject): Promise<QQBotConfigSnapshot> {
    return readConfigSnapshotFrom(await readPersistedConfigAsync(), overrides);
}

export async function requireConfiguredSnapshotAsync(overrides?: JsonObject): Promise<QQBotConfigSnapshot> {
    const snapshot = await readConfigSnapshotAsync(overrides);
    if (!snapshot.appId) {
        throw new Error("Missing env: QQBOT_APP_ID");
    }
    if (!snapshot.appSecret) {
        throw new Error("Missing env: QQBOT_APP_SECRET");
    }
    return snapshot;
}

export function buildStatus(snapshot: QQBotConfigSnapshot): JsonObject {
    return {
        packageVersion: PACKAGE_VERSION,
        configured: !!snapshot.appId && !!snapshot.appSecret,
        mode: "websocket_gateway",
        appId: snapshot.appId,
        appSecretMasked: maskSecret(snapshot.appSecret),
        useSandbox: snapshot.useSandbox,
        listenerEnabled: snapshot.listenerEnabled,
        openApiBaseUrl: snapshot.useSandbox ? SANDBOX_API_BASE_URL : API_BASE_URL,
        gatewayApiPath: "/gateway"
    };
}
