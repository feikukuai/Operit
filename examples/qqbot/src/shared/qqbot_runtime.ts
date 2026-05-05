type QQBotConfigureParams = {
    app_id?: string;
    app_secret?: string;
    use_sandbox?: boolean;
    callback_host?: string;
    callback_port?: number;
    callback_path?: string;
    public_base_url?: string;
    test_connection?: boolean;
    restart_service?: boolean;
};

type QQBotTestConnectionParams = {
    timeout_ms?: number;
};

type QQBotServiceStartParams = {
    restart?: boolean;
    timeout_ms?: number;
};

type QQBotServiceStopParams = {
    timeout_ms?: number;
};

type QQBotReceiveEventsParams = {
    limit?: number;
    consume?: boolean;
    scene?: string;
    event_type?: string;
    include_raw?: boolean;
    auto_start?: boolean;
};

type QQBotSendMessageParams = {
    content: string;
    msg_id?: string;
    event_id?: string;
    msg_seq?: number;
    msg_type?: number;
    timeout_ms?: number;
};

type QQBotSendC2CMessageParams = QQBotSendMessageParams & {
    openid: string;
};

type QQBotSendGroupMessageParams = QQBotSendMessageParams & {
    group_openid: string;
};

type QQBotConfigSnapshot = {
    appId: string;
    appSecret: string;
    useSandbox: boolean;
    callbackHost: string;
    callbackPort: number;
    callbackPath: string;
    publicBaseUrl: string;
};

type QQBotTokenResponse = {
    accessToken: string;
    expiresIn: number;
    tokenType: string;
};

type EnsureQQBotServiceOptions = {
    restart?: boolean;
    timeout_ms?: number;
    allow_missing_config?: boolean;
    source?: string;
    lifecycle_event?: string;
};

type JsonObject = Record<string, unknown>;

type HiddenTerminalCommandResultLike = {
    command?: string;
    output?: string;
    exitCode?: number;
    executorKey?: string;
    timedOut?: boolean;
};

type HealthProbe = {
    reachable: boolean;
    success: boolean;
    statusCode: number;
    body: string;
    json: JsonObject;
};

const PACKAGE_VERSION = "0.2.0";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_SERVICE_WAIT_MS = 4000;
const DEFAULT_CALLBACK_HOST = "0.0.0.0";
const DEFAULT_CALLBACK_PORT = 9000;
const DEFAULT_CALLBACK_PATH = "/qqbot";
const DEFAULT_RECEIVE_LIMIT = 20;
const MAX_RECEIVE_LIMIT = 100;
const SERVICE_POLL_INTERVAL_MS = 100;
const CONTROL_PATH = "/_operit/qqbot/control";
const STATE_DIRECTORY_NAME = "toolpkg_qqbot_service";
const CONFIG_FILE_NAME = "config.json";
const STATE_FILE_NAME = "service_state.json";
const QUEUE_FILE_NAME = "event_queue.json";
const PID_FILE_NAME = "service.pid";
const TERMINAL_LOG_FILE_NAME = "terminal_service.log";
const TERMINAL_SERVICE_RESOURCE_KEY = "qqbot_terminal_service_py";
const TERMINAL_SERVICE_OUTPUT_FILE_NAME = "qqbot_terminal_service.py";
const TERMINAL_EXECUTOR_KEY = "qqbot_terminal_service";
const APP_PRIVATE_FILES_DIR = "/data/user/0/com.ai.assistance.operit/files";
const TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
const API_BASE_URL = "https://api.sgroup.qq.com";
const SANDBOX_API_BASE_URL = "https://sandbox.api.sgroup.qq.com";

const ENV_KEYS = {
    appId: "QQBOT_APP_ID",
    appSecret: "QQBOT_APP_SECRET"
};

function asText(value: unknown): string {
    return String(value == null ? "" : value);
}

function hasOwn(value: unknown, key: string): boolean {
    return !!value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);
}

function isObject(value: unknown): value is JsonObject {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function firstNonBlank(...values: Array<string | null | undefined>): string {
    for (let index = 0; index < values.length; index += 1) {
        const candidate = values[index];
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }
    return "";
}

function safeErrorMessage(error: any): string {
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

function readEnv(key: string): string {
    if (typeof getEnv !== "function") {
        return "";
    }
    const value = getEnv(key);
    return value == null ? "" : asText(value).trim();
}

async function writeEnv(key: string, value: string): Promise<void> {
    await Tools.SoftwareSettings.writeEnvironmentVariable(key, value);
}

function ensureHttpScheme(raw: string): string {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
        return raw;
    }
    return `http://${raw}`;
}

function normalizeBaseUrl(raw: string): string {
    const value = raw.trim();
    if (!value) {
        return "";
    }
    return ensureHttpScheme(value).replace(/\/+$/g, "");
}

function normalizeCallbackPath(raw: string): string {
    const value = raw.trim();
    if (!value) {
        return DEFAULT_CALLBACK_PATH;
    }
    const withoutQuery = value.split("?")[0].split("#")[0].trim();
    if (!withoutQuery) {
        return DEFAULT_CALLBACK_PATH;
    }
    const prefixed = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
    return prefixed.replace(/\/+$/g, "") || DEFAULT_CALLBACK_PATH;
}

function parsePositiveInt(value: unknown, fieldName: string, fallbackValue: number): number {
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

function parsePort(value: unknown, fieldName: string, fallbackValue: number): number {
    const port = parsePositiveInt(value, fieldName, fallbackValue);
    if (port < 1 || port > 65535) {
        throw new Error(`Invalid ${fieldName}: expected value between 1 and 65535`);
    }
    return port;
}

function parseOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
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

function parseMessageType(value: unknown): number {
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

function parseMsgSeq(value: unknown): number {
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

function parseJsonObject(content: string): JsonObject {
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

function parseJsonArray(content: string): JsonObject[] {
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

function toHttpTimeoutSeconds(timeoutMs: number): number {
    return Math.max(1, Math.ceil(timeoutMs / 1000));
}

function maskSecret(secret: string): string {
    const value = secret.trim();
    if (!value) {
        return "";
    }
    if (value.length <= 6) {
        return `${value.slice(0, 1)}***${value.slice(-1)}`;
    }
    return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

function resolveLocalConnectHost(host: string): string {
    const normalized = host.trim().toLowerCase();
    if (!normalized || normalized === "0.0.0.0" || normalized === "::" || normalized === "[::]") {
        return "127.0.0.1";
    }
    return host.trim();
}

function buildControlBaseUrl(host: string, port: number): string {
    return `http://${resolveLocalConnectHost(host)}:${port}${CONTROL_PATH}`;
}

function buildStatus(snapshot: QQBotConfigSnapshot) {
    const publicCallbackUrl = snapshot.publicBaseUrl
        ? `${snapshot.publicBaseUrl}${snapshot.callbackPath}`
        : "";
    const localConnectHost = resolveLocalConnectHost(snapshot.callbackHost);
    return {
        packageVersion: PACKAGE_VERSION,
        configured: !!snapshot.appId && !!snapshot.appSecret,
        appId: snapshot.appId,
        appSecretMasked: maskSecret(snapshot.appSecret),
        useSandbox: snapshot.useSandbox,
        callbackHost: snapshot.callbackHost,
        callbackPort: snapshot.callbackPort,
        callbackPath: snapshot.callbackPath,
        publicBaseUrl: snapshot.publicBaseUrl,
        publicCallbackUrl,
        localCallbackUrl: `http://${localConnectHost}:${snapshot.callbackPort}${snapshot.callbackPath}`,
        openApiBaseUrl: snapshot.useSandbox ? SANDBOX_API_BASE_URL : API_BASE_URL
    };
}

function getStateDirectoryPath(): string {
    return `${APP_PRIVATE_FILES_DIR}/${STATE_DIRECTORY_NAME}`;
}

function getStateFilePath(name: string): string {
    return `${getStateDirectoryPath()}/${name}`;
}

function getPidFilePath(): string {
    return getStateFilePath(PID_FILE_NAME);
}

function getTerminalServiceLogPath(): string {
    return getStateFilePath(TERMINAL_LOG_FILE_NAME);
}

function shellQuote(value: string): string {
    return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function createControlToken(): string {
    const random = Math.random().toString(36).slice(2);
    return `qqbot_${Date.now().toString(36)}_${random}`;
}

async function ensureStateDirectoryExistsAsync(): Promise<void> {
    await Tools.Files.mkdir(getStateDirectoryPath(), true, "android");
}

async function readTextFileWithTools(path: string): Promise<string> {
    await ensureStateDirectoryExistsAsync();
    const exists = await Tools.Files.exists(path, "android");
    if (!exists?.exists) {
        return "";
    }
    const result = await Tools.Files.read({ path, environment: "android" });
    return asText(result?.content);
}

async function writeTextFileWithTools(path: string, content: string): Promise<void> {
    await ensureStateDirectoryExistsAsync();
    await Tools.Files.write(path, content, false, "android");
}

async function deleteFileIfExistsAsync(path: string): Promise<void> {
    const exists = await Tools.Files.exists(path, "android");
    if (exists?.exists) {
        await Tools.Files.deleteFile(path, false, "android");
    }
}

async function readJsonObjectFileAsync(path: string): Promise<JsonObject> {
    const raw = (await readTextFileWithTools(path)).trim();
    if (!raw) {
        return {};
    }
    return parseJsonObject(raw);
}

async function writeJsonObjectFileAsync(path: string, value: JsonObject): Promise<void> {
    await writeTextFileWithTools(path, JSON.stringify(value));
}

async function readJsonArrayFileAsync(path: string): Promise<JsonObject[]> {
    const raw = (await readTextFileWithTools(path)).trim();
    if (!raw) {
        return [];
    }
    return parseJsonArray(raw);
}

async function writeJsonArrayFileAsync(path: string, value: JsonObject[]): Promise<void> {
    await writeTextFileWithTools(path, JSON.stringify(value));
}

async function readPersistedConfigAsync(): Promise<JsonObject> {
    return await readJsonObjectFileAsync(getStateFilePath(CONFIG_FILE_NAME));
}

async function updatePersistedConfigAsync(patch: JsonObject): Promise<JsonObject> {
    const current = await readPersistedConfigAsync();
    const next = { ...current, ...patch };
    await writeJsonObjectFileAsync(getStateFilePath(CONFIG_FILE_NAME), next);
    return next;
}

async function readPersistedStateAsync(): Promise<JsonObject> {
    return await readJsonObjectFileAsync(getStateFilePath(STATE_FILE_NAME));
}

async function updatePersistedStateAsync(patch: JsonObject): Promise<JsonObject> {
    const current = await readPersistedStateAsync();
    const next = { ...current, ...patch };
    await writeJsonObjectFileAsync(getStateFilePath(STATE_FILE_NAME), next);
    return next;
}

async function readQueuedEventsAsync(): Promise<JsonObject[]> {
    return await readJsonArrayFileAsync(getStateFilePath(QUEUE_FILE_NAME));
}

async function writeQueuedEventsAsync(events: JsonObject[]): Promise<void> {
    await writeJsonArrayFileAsync(getStateFilePath(QUEUE_FILE_NAME), events);
}

async function buildQueueSummaryAsync(): Promise<JsonObject> {
    const events = await readQueuedEventsAsync();
    return {
        pendingCount: events.length,
        oldestEventAt: events.length > 0 ? firstNonBlank(asText(events[0].receivedAt), asText(events[0].timestamp)) : "",
        newestEventAt: events.length > 0
            ? firstNonBlank(
                asText(events[events.length - 1].receivedAt),
                asText(events[events.length - 1].timestamp)
            )
            : ""
    };
}

function sanitizeEvent(event: JsonObject, includeRaw: boolean): JsonObject {
    if (includeRaw) {
        return event;
    }
    const clone: JsonObject = { ...event };
    delete clone.rawBody;
    delete clone.rawPayload;
    return clone;
}

function eventMatchesFilter(event: JsonObject, scene: string, eventType: string): boolean {
    if (scene && asText(event.scene).trim().toLowerCase() !== scene) {
        return false;
    }
    if (eventType && asText(event.eventType).trim() !== eventType) {
        return false;
    }
    return true;
}

async function receiveQueuedEventsAsync(params: QQBotReceiveEventsParams = {}) {
    const limit = Math.min(
        MAX_RECEIVE_LIMIT,
        parsePositiveInt(params.limit, "limit", DEFAULT_RECEIVE_LIMIT)
    );
    const consume = parseOptionalBoolean(params.consume, "consume") !== false;
    const includeRaw = parseOptionalBoolean(params.include_raw, "include_raw") === true;
    const scene = asText(params.scene).trim().toLowerCase();
    const eventType = asText(params.event_type).trim();

    const queued = await readQueuedEventsAsync();
    const selected: JsonObject[] = [];
    const remaining: JsonObject[] = [];

    for (let index = 0; index < queued.length; index += 1) {
        const item = queued[index];
        const matches = eventMatchesFilter(item, scene, eventType);
        if (matches && selected.length < limit) {
            selected.push(sanitizeEvent(item, includeRaw));
            if (!consume) {
                remaining.push(item);
            }
            continue;
        }
        remaining.push(item);
    }

    if (consume) {
        await writeQueuedEventsAsync(remaining);
    }

    return {
        consume,
        filter: {
            scene,
            eventType
        },
        returnedCount: selected.length,
        remainingCount: consume ? remaining.length : queued.length,
        events: selected
    };
}

async function clearQueuedEventsInternalAsync(): Promise<{ clearedCount: number }> {
    const events = await readQueuedEventsAsync();
    await writeQueuedEventsAsync([]);
    return { clearedCount: events.length };
}

async function sleepMsAsync(ms: number): Promise<void> {
    await Tools.System.sleep(ms);
}

async function runHiddenTerminalCommand(command: string, timeoutMs: number): Promise<HiddenTerminalCommandResultLike> {
    const result = await Tools.System.terminal.hiddenExec(command, {
        executorKey: TERMINAL_EXECUTOR_KEY,
        timeoutMs
    });
    return result as HiddenTerminalCommandResultLike;
}

async function ensureTerminalPythonAvailable(): Promise<void> {
    const result = await runHiddenTerminalCommand(
        "python3 - <<'PY'\nimport sys\ntry:\n    import cryptography\nexcept Exception as exc:\n    print(f'__PY_ERROR__:{exc}')\n    sys.exit(2)\nprint('__PY_OK__')\nPY",
        15000
    );
    if (Number(result.exitCode || 0) !== 0 || !asText(result.output).includes("__PY_OK__")) {
        throw new Error(
            firstNonBlank(
                asText(result.output).trim(),
                "python3 with cryptography is required for qqbot terminal service"
            )
        );
    }
}

async function readTerminalServiceScriptPath(): Promise<string> {
    return await ToolPkg.readResource(
        TERMINAL_SERVICE_RESOURCE_KEY,
        TERMINAL_SERVICE_OUTPUT_FILE_NAME,
        true
    );
}

async function readPidFileAsync(): Promise<string> {
    return (await readTextFileWithTools(getPidFilePath())).trim();
}

async function clearPidFileAsync(): Promise<void> {
    await deleteFileIfExistsAsync(getPidFilePath());
}

function readConfigSnapshotFrom(storedConfig: JsonObject, overrides?: JsonObject): QQBotConfigSnapshot {
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
    const callbackHost =
        overrides && hasOwn(overrides, "callbackHost")
            ? firstNonBlank(asText(overrides.callbackHost).trim(), DEFAULT_CALLBACK_HOST)
            : firstNonBlank(asText(storedConfig.callbackHost), DEFAULT_CALLBACK_HOST);
    const callbackPort =
        overrides && hasOwn(overrides, "callbackPort")
            ? parsePort(overrides.callbackPort, "callback_port", DEFAULT_CALLBACK_PORT)
            : parsePort(storedConfig.callbackPort, "callback_port", DEFAULT_CALLBACK_PORT);
    const callbackPath =
        overrides && hasOwn(overrides, "callbackPath")
            ? normalizeCallbackPath(asText(overrides.callbackPath))
            : normalizeCallbackPath(asText(storedConfig.callbackPath) || DEFAULT_CALLBACK_PATH);
    const publicBaseUrl =
        overrides && hasOwn(overrides, "publicBaseUrl")
            ? normalizeBaseUrl(asText(overrides.publicBaseUrl))
            : normalizeBaseUrl(asText(storedConfig.publicBaseUrl));
    const parsedUseSandbox = parseOptionalBoolean(useSandboxRaw, "use_sandbox");

    return {
        appId,
        appSecret,
        useSandbox: parsedUseSandbox === true,
        callbackHost,
        callbackPort,
        callbackPath,
        publicBaseUrl
    };
}

async function readConfigSnapshotAsync(overrides?: JsonObject): Promise<QQBotConfigSnapshot> {
    return readConfigSnapshotFrom(await readPersistedConfigAsync(), overrides);
}

async function requireConfiguredSnapshotAsync(overrides?: JsonObject): Promise<QQBotConfigSnapshot> {
    const snapshot = await readConfigSnapshotAsync(overrides);
    if (!snapshot.appId) {
        throw new Error("Missing env: QQBOT_APP_ID");
    }
    if (!snapshot.appSecret) {
        throw new Error("Missing env: QQBOT_APP_SECRET");
    }
    return snapshot;
}

async function requestJson(
    url: string,
    method: "GET" | "POST",
    headers: Record<string, string>,
    body: JsonObject | null,
    timeoutMs: number
): Promise<{
    success: boolean;
    statusCode: number;
    content: string;
    json: JsonObject;
    url: string;
}> {
    const timeoutSeconds = toHttpTimeoutSeconds(timeoutMs);
    const response = await Tools.Net.http({
        url,
        method,
        headers,
        body: body || undefined,
        connect_timeout: Math.min(timeoutSeconds, 10),
        read_timeout: timeoutSeconds + 5,
        validateStatus: false
    });

    const content = asText(response.content);
    let parsed: JsonObject = {};
    try {
        parsed = parseJsonObject(content);
    } catch (_error) {
        parsed = {};
    }

    return {
        success: response.statusCode >= 200 && response.statusCode < 300,
        statusCode: response.statusCode,
        content,
        json: parsed,
        url: asText(response.url)
    };
}

async function readHealthProbeAsync(timeoutMs: number, host: string, port: number): Promise<HealthProbe> {
    const result = await requestJson(
        `${buildControlBaseUrl(host, port)}?action=health`,
        "GET",
        {
            Accept: "application/json"
        },
        null,
        timeoutMs
    ).catch((error: any) => ({
        success: false,
        statusCode: 0,
        content: safeErrorMessage(error),
        json: {},
        url: ""
    }));

    if (result.statusCode === 0 && !result.url) {
        return {
            reachable: false,
            success: false,
            statusCode: 0,
            body: result.content,
            json: {}
        };
    }

    return {
        reachable: true,
        success: result.success,
        statusCode: result.statusCode,
        body: result.content,
        json: result.json
    };
}

async function requestStopByControlTokenAsync(
    host: string,
    port: number,
    controlToken: string,
    timeoutMs: number
): Promise<HealthProbe> {
    const result = await requestJson(
        `${buildControlBaseUrl(host, port)}?action=stop&token=${encodeURIComponent(controlToken)}`,
        "GET",
        {
            Accept: "application/json"
        },
        null,
        timeoutMs
    ).catch((error: any) => ({
        success: false,
        statusCode: 0,
        content: safeErrorMessage(error),
        json: {},
        url: ""
    }));

    if (result.statusCode === 0 && !result.url) {
        return {
            reachable: false,
            success: false,
            statusCode: 0,
            body: result.content,
            json: {}
        };
    }

    return {
        reachable: true,
        success: result.success,
        statusCode: result.statusCode,
        body: result.content,
        json: result.json
    };
}

function buildServiceStatePatch(snapshot: QQBotConfigSnapshot, extra?: JsonObject): JsonObject {
    return {
        packageVersion: PACKAGE_VERSION,
        callbackHost: snapshot.callbackHost,
        callbackPort: snapshot.callbackPort,
        callbackPath: snapshot.callbackPath,
        publicBaseUrl: snapshot.publicBaseUrl,
        publicCallbackUrl: buildStatus(snapshot).publicCallbackUrl,
        localCallbackUrl: buildStatus(snapshot).localCallbackUrl,
        controlPath: CONTROL_PATH,
        ...extra
    };
}

function isServiceConfigMatching(persisted: JsonObject, snapshot: QQBotConfigSnapshot): boolean {
    return (
        asText(persisted.callbackHost).trim() === snapshot.callbackHost &&
        Number(persisted.callbackPort == null ? 0 : persisted.callbackPort) === snapshot.callbackPort &&
        asText(persisted.callbackPath).trim() === snapshot.callbackPath &&
        normalizeBaseUrl(asText(persisted.publicBaseUrl)) === snapshot.publicBaseUrl
    );
}

async function readTerminalServiceLogTailAsync(maxChars: number = 4000): Promise<string> {
    const raw = await readTextFileWithTools(getTerminalServiceLogPath());
    if (!raw) {
        return "";
    }
    return raw.length > maxChars ? raw.slice(raw.length - maxChars) : raw;
}

async function waitForHealthyServiceAsync(timeoutMs: number, snapshot: QQBotConfigSnapshot): Promise<HealthProbe> {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
        const probe = await readHealthProbeAsync(Math.min(1000, timeoutMs), snapshot.callbackHost, snapshot.callbackPort);
        if (probe.reachable && probe.success && probe.json.ok === true) {
            return probe;
        }
        const persisted = await readPersistedStateAsync();
        const lastError = asText(persisted.lastError).trim();
        if (lastError) {
            break;
        }
        await sleepMsAsync(SERVICE_POLL_INTERVAL_MS);
    }
    return await readHealthProbeAsync(Math.min(1000, timeoutMs), snapshot.callbackHost, snapshot.callbackPort);
}

async function waitForServiceStopAsync(timeoutMs: number, host: string, port: number): Promise<HealthProbe> {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
        const probe = await readHealthProbeAsync(Math.min(1000, timeoutMs), host, port);
        if (!probe.reachable || !probe.success || probe.json.ok !== true) {
            return probe;
        }
        await sleepMsAsync(SERVICE_POLL_INTERVAL_MS);
    }
    return await readHealthProbeAsync(Math.min(1000, timeoutMs), host, port);
}

async function killServiceProcessByPidAsync(): Promise<{ killed: boolean; pid: string; output: string }> {
    const pid = await readPidFileAsync();
    if (!pid) {
        return { killed: false, pid: "", output: "" };
    }
    const result = await runHiddenTerminalCommand(
        [
            `if kill ${shellQuote(pid)} >/dev/null 2>&1; then`,
            "  echo '__QQBOT_KILLED__';",
            "else",
            "  echo '__QQBOT_KILL_FAILED__';",
            "fi"
        ].join(" "),
        10000
    );
    const output = asText(result.output);
    await clearPidFileAsync();
    return {
        killed: output.includes("__QQBOT_KILLED__"),
        pid,
        output
    };
}

async function launchTerminalServiceAsync(snapshot: QQBotConfigSnapshot, source: string) {
    await ensureStateDirectoryExistsAsync();
    await ensureTerminalPythonAvailable();
    const scriptPath = await readTerminalServiceScriptPath();
    const controlToken = createControlToken();
    const command = [
        "nohup",
        "python3",
        shellQuote(scriptPath),
        "--state-dir",
        shellQuote(getStateDirectoryPath()),
        "--host",
        shellQuote(snapshot.callbackHost),
        "--port",
        shellQuote(String(snapshot.callbackPort)),
        "--callback-path",
        shellQuote(snapshot.callbackPath),
        "--control-path",
        shellQuote(CONTROL_PATH),
        "--app-secret",
        shellQuote(snapshot.appSecret),
        "--public-base-url",
        shellQuote(snapshot.publicBaseUrl),
        "--source",
        shellQuote(source),
        "--package-version",
        shellQuote(PACKAGE_VERSION),
        "--control-token",
        shellQuote(controlToken),
        `>> ${shellQuote(getTerminalServiceLogPath())} 2>&1 & echo __QQBOT_PID__:$!`
    ].join(" ");

    const result = await runHiddenTerminalCommand(command, 15000);
    const output = asText(result.output);
    const pidMatch = output.match(/__QQBOT_PID__:(\d+)/);
    const pid = pidMatch ? pidMatch[1] : "";

    await updatePersistedStateAsync(
        buildServiceStatePatch(snapshot, {
            running: true,
            startedAt: Date.now(),
            stoppedAt: 0,
            stopReason: "",
            lastError: "",
            lastPacketAt: 0,
            lastEventAt: 0,
            packetCount: 0,
            eventCount: 0,
            controlToken,
            source,
            mode: "terminal",
            pid
        })
    );

    return {
        output,
        pid,
        scriptPath
    };
}

async function buildServiceStatusAsync(timeoutMs: number) {
    const persisted = await readPersistedStateAsync();
    const queue = await buildQueueSummaryAsync();
    const snapshot = await readConfigSnapshotAsync();
    const health = await readHealthProbeAsync(timeoutMs, snapshot.callbackHost, snapshot.callbackPort);
    const pid = await readPidFileAsync();
    const healthy = health.reachable && health.success && health.json.ok === true;

    return {
        healthy,
        healthStatusCode: health.statusCode,
        stateDirectoryPath: getStateDirectoryPath(),
        stateFilePath: getStateFilePath(STATE_FILE_NAME),
        queueFilePath: getStateFilePath(QUEUE_FILE_NAME),
        pidFilePath: getPidFilePath(),
        logFilePath: getTerminalServiceLogPath(),
        persisted,
        runtime: {
            mode: firstNonBlank(asText(persisted.mode), "terminal"),
            pid: firstNonBlank(pid, asText(persisted.pid)),
            startedAt: Number(persisted.startedAt == null ? 0 : persisted.startedAt),
            lastPacketAt: Number(persisted.lastPacketAt == null ? 0 : persisted.lastPacketAt),
            lastEventAt: Number(persisted.lastEventAt == null ? 0 : persisted.lastEventAt),
            packetCount: Number(persisted.packetCount == null ? 0 : persisted.packetCount),
            eventCount: Number(persisted.eventCount == null ? 0 : persisted.eventCount),
            lastError: asText(persisted.lastError),
            source: asText(persisted.source)
        },
        queue,
        configuredHost: snapshot.callbackHost,
        configuredPort: snapshot.callbackPort
    };
}

async function stopQQBotServiceInternalAsync(timeoutMs: number) {
    const persisted = await readPersistedStateAsync();
    const snapshot = await readConfigSnapshotAsync();
    const host = firstNonBlank(asText(persisted.callbackHost), snapshot.callbackHost, DEFAULT_CALLBACK_HOST);
    const port = parsePort(
        firstNonBlank(asText(persisted.callbackPort), asText(snapshot.callbackPort)),
        "callback_port",
        DEFAULT_CALLBACK_PORT
    );
    const controlToken = asText(persisted.controlToken).trim();
    const initialHealth = await readHealthProbeAsync(Math.min(1000, timeoutMs), host, port);

    if (!initialHealth.reachable || !initialHealth.success || initialHealth.json.ok !== true) {
        const killed = await killServiceProcessByPidAsync();
        await updatePersistedStateAsync(
            buildServiceStatePatch(snapshot, {
                running: false,
                stoppedAt: Date.now(),
                stopReason: firstNonBlank(asText(persisted.stopReason), killed.killed ? "killed_by_pid" : "already_stopped"),
                mode: "terminal"
            })
        );
        return {
            success: true,
            alreadyStopped: true,
            packageVersion: PACKAGE_VERSION,
            health: initialHealth,
            killed
        };
    }

    if (!controlToken) {
        throw new Error("QQ Bot service is healthy, but control token is missing from persisted state");
    }

    const stopResponse = await requestStopByControlTokenAsync(host, port, controlToken, Math.min(1500, timeoutMs));
    if (!stopResponse.reachable || !stopResponse.success || stopResponse.json.ok !== true) {
        throw new Error(
            firstNonBlank(
                asText(stopResponse.json.error),
                stopResponse.body,
                "Failed to stop QQ Bot service"
            )
        );
    }

    const afterStop = await waitForServiceStopAsync(timeoutMs, host, port);
    await clearPidFileAsync();
    await updatePersistedStateAsync(
        buildServiceStatePatch(snapshot, {
            running: false,
            stoppedAt: Date.now(),
            stopReason: "control_stop",
            mode: "terminal"
        })
    );

    return {
        success: !afterStop.reachable || !afterStop.success || afterStop.json.ok !== true,
        alreadyStopped: false,
        packageVersion: PACKAGE_VERSION,
        stopResponse,
        afterStop
    };
}

export async function ensureQQBotServiceStarted(options: EnsureQQBotServiceOptions = {}) {
    const timeoutMs = parsePositiveInt(options.timeout_ms, "timeout_ms", DEFAULT_SERVICE_WAIT_MS);
    const source = firstNonBlank(options.source, "manual");
    const allowMissingConfig = parseOptionalBoolean(options.allow_missing_config, "allow_missing_config") === true;
    const shouldRestart = parseOptionalBoolean(options.restart, "restart") === true;
    const snapshot = await readConfigSnapshotAsync();

    if ((!snapshot.appId || !snapshot.appSecret) && allowMissingConfig) {
        return {
            ok: true,
            skipped: true,
            reason: "missing_credentials",
            source,
            lifecycleEvent: firstNonBlank(options.lifecycle_event, source),
            status: buildStatus(snapshot)
        };
    }

    await requireConfiguredSnapshotAsync();

    const persisted = await readPersistedStateAsync();
    const health = await readHealthProbeAsync(
        Math.min(1000, timeoutMs),
        snapshot.callbackHost,
        snapshot.callbackPort
    );

    if (health.reachable && health.success && health.json.ok === true && !shouldRestart) {
        return {
            ok: true,
            started: false,
            source,
            lifecycleEvent: firstNonBlank(options.lifecycle_event, source),
            status: buildStatus(snapshot),
            service: await buildServiceStatusAsync(timeoutMs)
        };
    }

    if (shouldRestart || !isServiceConfigMatching(persisted, snapshot)) {
        try {
            await stopQQBotServiceInternalAsync(timeoutMs);
        } catch (error: any) {
            if (shouldRestart || isServiceConfigMatching(persisted, snapshot)) {
                throw error;
            }
        }
    }

    const launch = await launchTerminalServiceAsync(snapshot, source);
    const afterStart = await waitForHealthyServiceAsync(timeoutMs, snapshot);
    if (!afterStart.reachable || !afterStart.success || afterStart.json.ok !== true) {
        const latestState = await readPersistedStateAsync();
        const logTail = await readTerminalServiceLogTailAsync();
        const startError = firstNonBlank(
            asText(latestState.lastError).trim(),
            asText(afterStart.body).trim(),
            logTail.trim()
        );
        throw new Error(firstNonBlank(startError, "QQ Bot service failed to become healthy"));
    }

    return {
        ok: true,
        started: true,
        source,
        lifecycleEvent: firstNonBlank(options.lifecycle_event, source),
        status: buildStatus(snapshot),
        launch,
        service: await buildServiceStatusAsync(timeoutMs)
    };
}

async function fetchAccessToken(
    snapshot: QQBotConfigSnapshot,
    timeoutMs: number
): Promise<QQBotTokenResponse> {
    const result = await requestJson(
        TOKEN_URL,
        "POST",
        {
            Accept: "application/json",
            "Content-Type": "application/json; charset=utf-8"
        },
        {
            appId: snapshot.appId,
            clientSecret: snapshot.appSecret
        },
        timeoutMs
    );

    const accessToken = firstNonBlank(asText(result.json.access_token), asText(result.json.accessToken));
    const expiresIn = parsePositiveInt(
        firstNonBlank(asText(result.json.expires_in), asText(result.json.expiresIn)),
        "expires_in",
        0
    );
    const code = Number(result.json.code == null ? 0 : result.json.code);
    const message = firstNonBlank(asText(result.json.message), result.success ? "" : `HTTP ${result.statusCode}`);

    if (!result.success || code !== 0 || !accessToken) {
        throw new Error(
            firstNonBlank(message, "Failed to retrieve QQ Bot access token")
        );
    }

    return {
        accessToken,
        expiresIn,
        tokenType: "QQBot"
    };
}

async function openApiRequest(
    snapshot: QQBotConfigSnapshot,
    path: string,
    method: "GET" | "POST",
    body: JsonObject | null,
    timeoutMs: number
) {
    const token = await fetchAccessToken(snapshot, timeoutMs);
    const baseUrl = snapshot.useSandbox ? SANDBOX_API_BASE_URL : API_BASE_URL;
    return await requestJson(
        `${baseUrl}${path}`,
        method,
        {
            Accept: "application/json",
            Authorization: `${token.tokenType} ${token.accessToken}`,
            "X-Union-Appid": snapshot.appId,
            ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {})
        },
        body,
        timeoutMs
    );
}

async function qqbot_configure(params: QQBotConfigureParams = {}): Promise<any> {
    try {
        const before = await readConfigSnapshotAsync();
        const updatedEnvironmentKeys: string[] = [];
        const configPatch: JsonObject = {};
        const updatedConfigFields: string[] = [];

        if (hasOwn(params, "app_id")) {
            await writeEnv(ENV_KEYS.appId, asText(params.app_id).trim());
            updatedEnvironmentKeys.push(ENV_KEYS.appId);
        }
        if (hasOwn(params, "app_secret")) {
            await writeEnv(ENV_KEYS.appSecret, asText(params.app_secret).trim());
            updatedEnvironmentKeys.push(ENV_KEYS.appSecret);
        }
        if (hasOwn(params, "use_sandbox")) {
            configPatch.useSandbox = parseOptionalBoolean(params.use_sandbox, "use_sandbox") === true;
            updatedConfigFields.push("useSandbox");
        }
        if (hasOwn(params, "callback_host")) {
            configPatch.callbackHost = firstNonBlank(asText(params.callback_host).trim(), DEFAULT_CALLBACK_HOST);
            updatedConfigFields.push("callbackHost");
        }
        if (hasOwn(params, "callback_port")) {
            configPatch.callbackPort = parsePort(params.callback_port, "callback_port", DEFAULT_CALLBACK_PORT);
            updatedConfigFields.push("callbackPort");
        }
        if (hasOwn(params, "callback_path")) {
            configPatch.callbackPath = normalizeCallbackPath(asText(params.callback_path));
            updatedConfigFields.push("callbackPath");
        }
        if (hasOwn(params, "public_base_url")) {
            configPatch.publicBaseUrl = normalizeBaseUrl(asText(params.public_base_url));
            updatedConfigFields.push("publicBaseUrl");
        }

        if (updatedConfigFields.length > 0) {
            await updatePersistedConfigAsync(configPatch);
        }

        const after = await readConfigSnapshotAsync();
        const status = buildStatus(after);
        const shouldTest = parseOptionalBoolean(params.test_connection, "test_connection") === true;
        const shouldRestart = parseOptionalBoolean(params.restart_service, "restart_service") === true;
        const listenChanged =
            before.callbackHost !== after.callbackHost ||
            before.callbackPort !== after.callbackPort ||
            before.callbackPath !== after.callbackPath ||
            before.publicBaseUrl !== after.publicBaseUrl;
        const credentialsReady = !!after.appId && !!after.appSecret;

        let serviceResult: any = null;
        if (!credentialsReady) {
            serviceResult = await stopQQBotServiceInternalAsync(DEFAULT_SERVICE_WAIT_MS);
        } else {
            serviceResult = await ensureQQBotServiceStarted({
                restart: shouldRestart || listenChanged,
                timeout_ms: DEFAULT_SERVICE_WAIT_MS,
                source: "qqbot_configure"
            });
        }

        const result: JsonObject = {
            success: true,
            packageVersion: PACKAGE_VERSION,
            updatedEnvironmentKeys,
            updatedConfigFields,
            status,
            service: serviceResult
        };

        if (shouldTest) {
            result.connection = await qqbot_test_connection();
            result.success = !!(result.connection as any).success;
        }

        return result;
    } catch (error: any) {
        return {
            success: false,
            packageVersion: PACKAGE_VERSION,
            error: safeErrorMessage(error)
        };
    }
}

async function qqbot_status(): Promise<any> {
    try {
        const snapshot = await readConfigSnapshotAsync();
        return {
            success: true,
            ...buildStatus(snapshot),
            service: await buildServiceStatusAsync(1200),
            queue: await buildQueueSummaryAsync()
        };
    } catch (error: any) {
        return {
            success: false,
            packageVersion: PACKAGE_VERSION,
            error: safeErrorMessage(error)
        };
    }
}

async function qqbot_service_start(params: QQBotServiceStartParams = {}): Promise<any> {
    try {
        return {
            success: true,
            packageVersion: PACKAGE_VERSION,
            ...(await ensureQQBotServiceStarted({
                restart: parseOptionalBoolean(params.restart, "restart") === true,
                timeout_ms: parsePositiveInt(params.timeout_ms, "timeout_ms", DEFAULT_SERVICE_WAIT_MS),
                source: "qqbot_service_start"
            }))
        };
    } catch (error: any) {
        return {
            success: false,
            packageVersion: PACKAGE_VERSION,
            error: safeErrorMessage(error)
        };
    }
}

async function qqbot_service_stop(params: QQBotServiceStopParams = {}): Promise<any> {
    try {
        const timeoutMs = parsePositiveInt(params.timeout_ms, "timeout_ms", DEFAULT_SERVICE_WAIT_MS);
        const result = await stopQQBotServiceInternalAsync(timeoutMs);
        return {
            ...result,
            service: await buildServiceStatusAsync(1200)
        };
    } catch (error: any) {
        return {
            success: false,
            packageVersion: PACKAGE_VERSION,
            error: safeErrorMessage(error)
        };
    }
}

async function qqbot_receive_events(params: QQBotReceiveEventsParams = {}): Promise<any> {
    try {
        const autoStart = parseOptionalBoolean(params.auto_start, "auto_start") !== false;
        if (autoStart) {
            await ensureQQBotServiceStarted({
                allow_missing_config: false,
                timeout_ms: DEFAULT_SERVICE_WAIT_MS,
                source: "qqbot_receive_events"
            });
        }

        const result = await receiveQueuedEventsAsync(params);
        return {
            success: true,
            packageVersion: PACKAGE_VERSION,
            ...result,
            service: await buildServiceStatusAsync(1200)
        };
    } catch (error: any) {
        return {
            success: false,
            packageVersion: PACKAGE_VERSION,
            error: safeErrorMessage(error)
        };
    }
}

async function qqbot_clear_events(): Promise<any> {
    try {
        const cleared = await clearQueuedEventsInternalAsync();
        return {
            success: true,
            packageVersion: PACKAGE_VERSION,
            ...cleared,
            queue: await buildQueueSummaryAsync()
        };
    } catch (error: any) {
        return {
            success: false,
            packageVersion: PACKAGE_VERSION,
            error: safeErrorMessage(error)
        };
    }
}

async function qqbot_test_connection(params: QQBotTestConnectionParams = {}): Promise<any> {
    try {
        const timeoutMs = parsePositiveInt(params.timeout_ms, "timeout_ms", DEFAULT_TIMEOUT_MS);
        const snapshot = await requireConfiguredSnapshotAsync();
        const token = await fetchAccessToken(snapshot, timeoutMs);
        const me = await openApiRequest(snapshot, "/users/@me", "GET", null, timeoutMs);

        return {
            success: me.success,
            packageVersion: PACKAGE_VERSION,
            accessTokenType: token.tokenType,
            accessTokenExpiresIn: token.expiresIn,
            httpStatus: me.statusCode,
            profile: me.json,
            status: buildStatus(snapshot),
            error: me.success ? "" : firstNonBlank(asText(me.json.message), `HTTP ${me.statusCode}`)
        };
    } catch (error: any) {
        return {
            success: false,
            packageVersion: PACKAGE_VERSION,
            error: safeErrorMessage(error)
        };
    }
}

function buildSendMessageBody(params: QQBotSendMessageParams): JsonObject {
    const content = asText(params.content).trim();
    if (!content) {
        throw new Error("Missing param: content");
    }

    const body: JsonObject = {
        content,
        msg_type: parseMessageType(params.msg_type),
        msg_seq: parseMsgSeq(params.msg_seq)
    };

    const msgId = asText(params.msg_id).trim();
    if (msgId) {
        body.msg_id = msgId;
    }

    const eventId = asText(params.event_id).trim();
    if (eventId) {
        body.event_id = eventId;
    }

    return body;
}

async function qqbot_send_c2c_message(params: QQBotSendC2CMessageParams): Promise<any> {
    try {
        const openid = asText(params.openid).trim();
        if (!openid) {
            throw new Error("Missing param: openid");
        }
        const timeoutMs = parsePositiveInt(params.timeout_ms, "timeout_ms", DEFAULT_TIMEOUT_MS);
        const snapshot = await requireConfiguredSnapshotAsync();
        const body = buildSendMessageBody(params);
        const response = await openApiRequest(
            snapshot,
            `/v2/users/${encodeURIComponent(openid)}/messages`,
            "POST",
            body,
            timeoutMs
        );

        return {
            success: response.success,
            packageVersion: PACKAGE_VERSION,
            scene: "c2c",
            openid,
            requestBody: body,
            httpStatus: response.statusCode,
            response: response.json,
            error: response.success
                ? ""
                : firstNonBlank(asText(response.json.message), `HTTP ${response.statusCode}`)
        };
    } catch (error: any) {
        return {
            success: false,
            packageVersion: PACKAGE_VERSION,
            scene: "c2c",
            error: safeErrorMessage(error)
        };
    }
}

async function qqbot_send_group_message(params: QQBotSendGroupMessageParams): Promise<any> {
    try {
        const groupOpenid = asText(params.group_openid).trim();
        if (!groupOpenid) {
            throw new Error("Missing param: group_openid");
        }
        const timeoutMs = parsePositiveInt(params.timeout_ms, "timeout_ms", DEFAULT_TIMEOUT_MS);
        const snapshot = await requireConfiguredSnapshotAsync();
        const body = buildSendMessageBody(params);
        const response = await openApiRequest(
            snapshot,
            `/v2/groups/${encodeURIComponent(groupOpenid)}/messages`,
            "POST",
            body,
            timeoutMs
        );

        return {
            success: response.success,
            packageVersion: PACKAGE_VERSION,
            scene: "group",
            groupOpenid,
            requestBody: body,
            httpStatus: response.statusCode,
            response: response.json,
            error: response.success
                ? ""
                : firstNonBlank(asText(response.json.message), `HTTP ${response.statusCode}`)
        };
    } catch (error: any) {
        return {
            success: false,
            packageVersion: PACKAGE_VERSION,
            scene: "group",
            error: safeErrorMessage(error)
        };
    }
}

export {
    qqbot_configure,
    qqbot_status,
    qqbot_service_start,
    qqbot_service_stop,
    qqbot_receive_events,
    qqbot_clear_events,
    qqbot_test_connection,
    qqbot_send_c2c_message,
    qqbot_send_group_message
};
