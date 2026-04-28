"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureAccountBookWebServer = ensureAccountBookWebServer;
exports.getAccountBookWebServerStatus = getAccountBookWebServerStatus;
const account_book_storage_js_1 = require("./account_book_storage.js");
const WEB_ASSET_RESOURCE_KEY = "account_book_web_assets";
const SERVER_RUNTIME_RESOURCE_KEY = "account_book_web_server_runtime";
const DEFAULT_PORT = 39321;
const HOST = "127.0.0.1";
const SERVER_TERMINAL_SESSION_NAME = "sidebar_account_book_web_server";
const LINUX_RUNTIME_DIR = "/root/sidebar_account_book_web";
const LINUX_PUBLIC_DIR = `${LINUX_RUNTIME_DIR}/public`;
const LINUX_LOG_PATH = `${LINUX_RUNTIME_DIR}/server.log`;
const LINUX_PID_PATH = `${LINUX_RUNTIME_DIR}/server.pid`;
const LINUX_PACKAGE_JSON_PATH = `${LINUX_RUNTIME_DIR}/package.json`;
const LINUX_SERVER_SCRIPT_PATH = `${LINUX_RUNTIME_DIR}/server.cjs`;
const LINUX_INDEX_HTML_PATH = `${LINUX_PUBLIC_DIR}/index.html`;
const LINUX_WEB_ASSET_ZIP_PATH = "/root/sidebar_account_book_web_assets.zip";
const LINUX_SERVER_RUNTIME_ZIP_PATH = "/root/sidebar_account_book_server_runtime.zip";
const LINUX_WEB_STAGE_DIR = "/root/sidebar_account_book_web_assets_unpack";
const LINUX_SERVER_STAGE_DIR = "/root/sidebar_account_book_server_runtime_unpack";
const LINUX_WEB_STAGE_EXTRACTED_DIR = `${LINUX_WEB_STAGE_DIR}/webapp`;
const LINUX_SERVER_STAGE_EXTRACTED_DIR = `${LINUX_SERVER_STAGE_DIR}/server_runtime`;
function shellQuote(value) {
    return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}
function bashCommand(script) {
    return `bash -lc ${shellQuote(`set -e\n${script}`)}`;
}
function toPort(raw) {
    const value = Number(raw ?? DEFAULT_PORT);
    if (!Number.isInteger(value) || value < 1024 || value > 65535) {
        throw new Error("Port must be an integer between 1024 and 65535.");
    }
    return value;
}
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
function buildServerUrl(port) {
    return `http://${HOST}:${port}`;
}
async function ensureServerTerminalSession() {
    const session = await Tools.System.terminal.create(SERVER_TERMINAL_SESSION_NAME);
    const sessionId = String(session?.sessionId || "").trim();
    if (!sessionId) {
        throw new Error("Failed to access server terminal session for account book web server.");
    }
    return sessionId;
}
async function execServerCommand(command, timeoutMs) {
    const sessionId = await ensureServerTerminalSession();
    return await Tools.System.terminal.exec(sessionId, command, timeoutMs);
}
async function resolveResourceZip(resourceKey, outputName) {
    const resourcePath = await ToolPkg.readResource(resourceKey, outputName);
    const normalized = String(resourcePath || "").trim();
    if (!normalized) {
        throw new Error(`Missing bundled resource: ${resourceKey}`);
    }
    return normalized;
}
async function deleteLinuxPathIfExists(path) {
    const exists = await Tools.Files.exists(path, "linux");
    if (exists?.exists) {
        await Tools.Files.deleteFile(path, true, "linux");
    }
}
async function replaceLinuxPath(sourcePath, destinationPath) {
    await deleteLinuxPathIfExists(destinationPath);
    await Tools.Files.move(sourcePath, destinationPath, "linux");
}
async function prepareLinuxRuntime() {
    const webAssetZip = await resolveResourceZip(WEB_ASSET_RESOURCE_KEY, "sidebar_account_book_web_assets.zip");
    const serverRuntimeZip = await resolveResourceZip(SERVER_RUNTIME_RESOURCE_KEY, "sidebar_account_book_server_runtime.zip");
    await Tools.Files.copy(webAssetZip, LINUX_WEB_ASSET_ZIP_PATH, false, "android", "linux");
    await Tools.Files.copy(serverRuntimeZip, LINUX_SERVER_RUNTIME_ZIP_PATH, false, "android", "linux");
    await deleteLinuxPathIfExists(LINUX_WEB_STAGE_DIR);
    await deleteLinuxPathIfExists(LINUX_SERVER_STAGE_DIR);
    await Tools.Files.mkdir(LINUX_WEB_STAGE_DIR, true, "linux");
    await Tools.Files.mkdir(LINUX_SERVER_STAGE_DIR, true, "linux");
    await Tools.Files.mkdir(LINUX_RUNTIME_DIR, true, "linux");
    await Tools.Files.mkdir(account_book_storage_js_1.ACCOUNT_BOOK_DATA_DIR, true, "linux");
    await Tools.Files.unzip(LINUX_SERVER_RUNTIME_ZIP_PATH, LINUX_SERVER_STAGE_DIR, "linux");
    await Tools.Files.unzip(LINUX_WEB_ASSET_ZIP_PATH, LINUX_WEB_STAGE_DIR, "linux");
    await replaceLinuxPath(`${LINUX_SERVER_STAGE_EXTRACTED_DIR}/package.json`, LINUX_PACKAGE_JSON_PATH);
    await replaceLinuxPath(`${LINUX_SERVER_STAGE_EXTRACTED_DIR}/server.cjs`, LINUX_SERVER_SCRIPT_PATH);
    await replaceLinuxPath(LINUX_WEB_STAGE_EXTRACTED_DIR, LINUX_PUBLIC_DIR);
    const exists = await Tools.Files.exists(account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE, "linux");
    if (!exists?.exists) {
        await Tools.Files.write(account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE, "[]", false, "linux");
    }
    await deleteLinuxPathIfExists(LINUX_WEB_STAGE_DIR);
    await deleteLinuxPathIfExists(LINUX_SERVER_STAGE_DIR);
    return { webAssetZip, serverRuntimeZip };
}
async function verifyLinuxRuntimeLayout() {
    const packageJsonExists = await Tools.Files.exists(LINUX_PACKAGE_JSON_PATH, "linux");
    if (!packageJsonExists?.exists) {
        throw new Error(`Linux runtime package.json is missing: ${LINUX_PACKAGE_JSON_PATH}`);
    }
    const serverScriptExists = await Tools.Files.exists(LINUX_SERVER_SCRIPT_PATH, "linux");
    if (!serverScriptExists?.exists) {
        throw new Error(`Linux runtime server.cjs is missing: ${LINUX_SERVER_SCRIPT_PATH}`);
    }
    const indexExists = await Tools.Files.exists(LINUX_INDEX_HTML_PATH, "linux");
    if (!indexExists?.exists) {
        throw new Error(`Linux runtime index.html is missing: ${LINUX_INDEX_HTML_PATH}`);
    }
}
async function readLinuxLogTail() {
    try {
        const exists = await Tools.Files.exists(LINUX_LOG_PATH, "linux");
        if (!exists?.exists) {
            return null;
        }
        const result = await Tools.Files.read({ path: LINUX_LOG_PATH, environment: "linux" });
        const content = String(result?.content || "").trim();
        if (!content) {
            return null;
        }
        const lines = content.split(/\r?\n/);
        return lines.slice(-20).join("\n");
    }
    catch (_error) {
        return null;
    }
}
async function readRuntimeDependencyState() {
    const packageJsonResult = await Tools.Files.read({
        path: LINUX_PACKAGE_JSON_PATH,
        environment: "linux",
    });
    const packageJsonText = String(packageJsonResult?.content || "").trim();
    if (!packageJsonText) {
        throw new Error(`Linux runtime package.json is empty: ${LINUX_PACKAGE_JSON_PATH}`);
    }
    let packageJson;
    try {
        packageJson = JSON.parse(packageJsonText);
    }
    catch (error) {
        throw new Error(`Linux runtime package.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const dependenciesRaw = packageJson && typeof packageJson === "object"
        ? packageJson.dependencies
        : undefined;
    const dependencies = dependenciesRaw && typeof dependenciesRaw === "object"
        ? Object.entries(dependenciesRaw)
            .map(([name, version]) => ({
            name: String(name || "").trim(),
            version: String(version || "").trim(),
        }))
            .filter((dependency) => dependency.name && dependency.version)
        : [];
    const missing = [];
    for (const dependency of dependencies) {
        const installed = await Tools.Files.exists(`${LINUX_RUNTIME_DIR}/node_modules/${dependency.name}/package.json`, "linux");
        if (!installed?.exists) {
            missing.push(dependency);
        }
    }
    return { missing };
}
async function installRuntimeDependencies() {
    const dependencyState = await readRuntimeDependencyState();
    if (dependencyState.missing.length === 0) {
        return {
            exitCode: 0,
            output: "All production dependencies are already installed.",
            missingDependencies: [],
            skipped: true,
        };
    }
    const command = bashCommand([
        `cd ${shellQuote(LINUX_RUNTIME_DIR)}`,
        [
            "pnpm add --prod --reporter=append-only",
            ...dependencyState.missing.map((dependency) => shellQuote(`${dependency.name}@${dependency.version}`)),
        ].join(" "),
    ].join("\n"));
    const result = await execServerCommand(command, 120000);
    return {
        ...result,
        missingDependencies: dependencyState.missing.map((dependency) => dependency.name),
        skipped: false,
    };
}
async function readHealth(port) {
    try {
        const result = await Tools.Net.httpGet(`${buildServerUrl(port)}/api/health`);
        const parsed = JSON.parse(String(result?.content || "{}"));
        if (result?.statusCode >= 200 && result?.statusCode < 300 && parsed?.ok) {
            return {
                ok: true,
                data: parsed,
                statusCode: result?.statusCode,
            };
        }
        return {
            ok: false,
            data: parsed,
            statusCode: result?.statusCode,
            output: String(result?.content || ""),
        };
    }
    catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
async function waitForHealth(port, attempts = 20) {
    for (let index = 0; index < attempts; index += 1) {
        const health = await readHealth(port);
        if (health.ok) {
            return true;
        }
        await sleep(500);
    }
    return false;
}
async function stopServerIfRequested(forceRestart) {
    if (!forceRestart) {
        return;
    }
    const command = bashCommand([
        `if [ -f ${shellQuote(LINUX_PID_PATH)} ]; then`,
        `  pid="$(cat ${shellQuote(LINUX_PID_PATH)})"`,
        `  if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then kill "$pid" >/dev/null 2>&1 || true; fi`,
        `  rm -f ${shellQuote(LINUX_PID_PATH)}`,
        "fi",
    ].join("\n"));
    await execServerCommand(command, 4000);
    await sleep(500);
}
async function startServer(port) {
    const sessionId = await ensureServerTerminalSession();
    const command = bashCommand([
        `mkdir -p ${shellQuote(account_book_storage_js_1.ACCOUNT_BOOK_DATA_DIR)}`,
        `cd ${shellQuote(LINUX_RUNTIME_DIR)}`,
        `if [ -f ${shellQuote(LINUX_PID_PATH)} ]; then`,
        `  pid="$(cat ${shellQuote(LINUX_PID_PATH)})"`,
        `  if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then kill "$pid" >/dev/null 2>&1 || true; fi`,
        `  rm -f ${shellQuote(LINUX_PID_PATH)}`,
        "fi",
        `nohup node server.cjs --host ${HOST} --port ${port} --data-file ${shellQuote(account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE)} >> ${shellQuote(LINUX_LOG_PATH)} 2>&1 &`,
        `echo $! > ${shellQuote(LINUX_PID_PATH)}`,
        `cat ${shellQuote(LINUX_PID_PATH)}`,
    ].join("\n"));
    await execServerCommand(command, 15000);
    return sessionId;
}
async function ensureAccountBookWebServer(params) {
    const port = toPort(params?.port);
    const url = buildServerUrl(port);
    if (!params?.force_restart) {
        const health = await readHealth(port);
        if (health.ok) {
            return {
                success: true,
                status: "running",
                url,
                port,
                runtimeDir: LINUX_RUNTIME_DIR,
                logPath: LINUX_LOG_PATH,
                dataFile: account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE,
                packageJson: LINUX_PACKAGE_JSON_PATH,
                health: health.data,
            };
        }
    }
    await stopServerIfRequested(Boolean(params?.force_restart));
    const resources = await prepareLinuxRuntime();
    await verifyLinuxRuntimeLayout();
    const installResult = await installRuntimeDependencies();
    const dependencyState = await readRuntimeDependencyState();
    if (dependencyState.missing.length > 0) {
        throw new Error(`Runtime dependencies are still missing after install: ${dependencyState.missing
            .map((dependency) => dependency.name)
            .join(", ")}`);
    }
    const sessionId = await startServer(port);
    const started = await waitForHealth(port);
    if (!started) {
        return {
            success: false,
            status: "failed",
            message: "Web server did not become healthy in time.",
            url,
            port,
            sessionId,
            runtimeDir: LINUX_RUNTIME_DIR,
            logPath: LINUX_LOG_PATH,
            dataFile: account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE,
            packageJson: LINUX_PACKAGE_JSON_PATH,
            installExitCode: installResult?.exitCode,
            installOutput: String(installResult?.output || ""),
            missingDependencies: installResult?.missingDependencies,
            webAssetZip: resources.webAssetZip,
            serverRuntimeZip: resources.serverRuntimeZip,
            logTail: await readLinuxLogTail(),
        };
    }
    const health = await readHealth(port);
    return {
        success: true,
        status: "started",
        url,
        port,
        sessionId,
        runtimeDir: LINUX_RUNTIME_DIR,
        logPath: LINUX_LOG_PATH,
        dataFile: account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE,
        packageJson: LINUX_PACKAGE_JSON_PATH,
        installExitCode: installResult?.exitCode,
        installOutput: String(installResult?.output || ""),
        missingDependencies: installResult?.missingDependencies,
        webAssetZip: resources.webAssetZip,
        serverRuntimeZip: resources.serverRuntimeZip,
        health: health.ok ? health.data : null,
    };
}
async function getAccountBookWebServerStatus(params) {
    const port = toPort(params?.port);
    const url = buildServerUrl(port);
    const health = await readHealth(port);
    return {
        success: true,
        status: health.ok ? "running" : "stopped",
        url,
        port,
        runtimeDir: LINUX_RUNTIME_DIR,
        logPath: LINUX_LOG_PATH,
        dataFile: account_book_storage_js_1.ACCOUNT_BOOK_DATA_FILE,
        packageJson: LINUX_PACKAGE_JSON_PATH,
        health: health.ok ? health.data : null,
        diagnostic: health.ok ? undefined : health,
        logTail: health.ok ? undefined : await readLinuxLogTail(),
    };
}
