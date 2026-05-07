async function safeExists(path, environment) {
  try {
    return await Tools.Files.exists(path, environment);
  } catch (error) {
    return { exists: false, error: error && error.message ? error.message : String(error) };
  }
}

async function safeRead(path, environment) {
  try {
    const result = await Tools.Files.read(path, environment);
    return {
      ok: true,
      content: result && typeof result.content === "string" ? result.content : String(result && result.content != null ? result.content : "")
    };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : String(error)
    };
  }
}

async function safeShell(command) {
  try {
    const result = await Tools.System.shell(command);
    return {
      ok: true,
      result
    };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : String(error)
    };
  }
}

function parsePsPids(output) {
  const text = String(output || "");
  const lines = text.split(/\r?\n/);
  const pids = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) {
      continue;
    }
    const pid = parts[1];
    if (/^\d+$/.test(pid)) {
      pids.push(pid);
    }
  }
  return pids;
}

async function safeReadResource(resourceKey, outputName) {
  try {
    if (typeof ToolPkg === "undefined" || !ToolPkg || typeof ToolPkg.readResource !== "function") {
      return { ok: false, error: "ToolPkg.readResource unavailable" };
    }
    const path = await ToolPkg.readResource(resourceKey, outputName, true);
    return { ok: true, path: String(path || "") };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : String(error)
    };
  }
}

function tailText(text, maxChars) {
  if (typeof text !== "string") {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(text.length - maxChars);
}

function extractMatchingLines(text, needles, maxLines) {
  if (typeof text !== "string" || !text) {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const matches = [];
  for (const line of lines) {
    if (needles.some((needle) => line.includes(needle))) {
      matches.push(line);
      if (matches.length >= maxLines) {
        break;
      }
    }
  }
  return matches;
}

async function main(params) {
  const input = params && typeof params === "object" ? params : {};
  const maxLogChars = Number(input.maxLogChars || 12000);
  const includeFullLog = input.includeFullLog === true;
  const cleanup = input.cleanup === true;
  const env = "android";
  const baseDir = "/data/user/0/com.ai.assistance.operit/files/toolpkg_qqbot_service";
  const statePath = baseDir + "/service_state.json";
  const logPath = baseDir + "/gateway_service.log";
  const pidPath = baseDir + "/service.pid";
  const lockPath = baseDir + "/start.lock";

  const [stateExists, logExists, pidExists] = await Promise.all([
    safeExists(statePath, env),
    safeExists(logPath, env),
    safeExists(pidPath, env)
  ]);
  const lockExists = await safeExists(lockPath, env);

  const [stateRead, logRead, pidRead] = await Promise.all([
    stateExists.exists ? safeRead(statePath, env) : Promise.resolve({ ok: false, error: "missing" }),
    logExists.exists ? safeRead(logPath, env) : Promise.resolve({ ok: false, error: "missing" }),
    pidExists.exists ? safeRead(pidPath, env) : Promise.resolve({ ok: false, error: "missing" })
  ]);
  const processRead = await safeShell("ps -A | grep -E 'qqbot_gateway_service|python3|python'");
  const processPids = processRead.ok ? parsePsPids(processRead.result && processRead.result.output) : [];
  const processCmdlines = [];
  for (const pid of processPids.slice(0, 12)) {
    const cmdlineRead = await safeShell(`cat /proc/${pid}/cmdline | tr '\\000' ' '`);
    processCmdlines.push({
      pid,
      ok: !!cmdlineRead.ok,
      output: cmdlineRead.ok
        ? String(
            cmdlineRead.result && cmdlineRead.result.output != null
              ? cmdlineRead.result.output
              : cmdlineRead.result
          )
        : "",
      error: cmdlineRead.ok ? "" : cmdlineRead.error
    });
  }
  const cleanupResults = [];
  if (cleanup) {
    for (const pidInfo of processCmdlines) {
      const cmdline = String(pidInfo.output || "");
      if (!cmdline.includes("qqbot_gateway_service.py")) {
        continue;
      }
      const killRead = await safeShell(`kill ${pidInfo.pid}`);
      cleanupResults.push({
        pid: pidInfo.pid,
        ok: !!killRead.ok,
        output: killRead.ok
          ? String(
              killRead.result && killRead.result.output != null
                ? killRead.result.output
                : killRead.result
            )
          : "",
        error: killRead.ok ? "" : killRead.error
      });
    }
    await safeShell(`rmdir ${lockPath} 2>/dev/null`);
  }
  const resourcePathRead = await safeReadResource("qqbot_gateway_service_py", "qqbot_gateway_service.py");
  const resourceFileRead = resourcePathRead.ok && resourcePathRead.path
    ? await safeRead(resourcePathRead.path, env)
    : { ok: false, error: resourcePathRead.ok ? "empty resource path" : resourcePathRead.error };
  const logMatches = logRead.ok
    ? extractMatchingLines(logRead.content, ["READY", "RESUMED", "DISPATCH", "INVALID_SESSION", "RECONNECT", "identify", "HELLO"], 80)
    : [];

  let stateJson = null;
  let stateParseError = "";
  if (stateRead.ok) {
    try {
      stateJson = JSON.parse(stateRead.content);
    } catch (error) {
      stateParseError = error && error.message ? error.message : String(error);
    }
  }

  return {
    success: true,
    baseDir,
    files: {
      state: {
        path: statePath,
        exists: !!stateExists.exists,
        readOk: !!stateRead.ok,
        parseOk: !!stateJson,
        parseError: stateParseError,
        json: stateJson,
        rawTail: stateRead.ok ? tailText(stateRead.content, 1200) : ""
      },
      pid: {
        path: pidPath,
        exists: !!pidExists.exists,
        readOk: !!pidRead.ok,
        content: pidRead.ok ? pidRead.content.trim() : "",
        error: pidRead.ok ? "" : pidRead.error
      },
      lock: {
        path: lockPath,
        exists: !!lockExists.exists
      },
      log: {
        path: logPath,
        exists: !!logExists.exists,
        readOk: !!logRead.ok,
        size: logRead.ok ? logRead.content.length : 0,
        head: logRead.ok ? logRead.content.slice(0, Math.min(logRead.content.length, maxLogChars)) : "",
        tail: logRead.ok ? tailText(logRead.content, 4000) : "",
        full: logRead.ok && includeFullLog ? logRead.content : "",
        matches: logMatches,
        error: logRead.ok ? "" : logRead.error
      },
      process: {
        ok: !!processRead.ok,
        pids: processPids,
        cmdlines: processCmdlines,
        cleanup: cleanupResults,
        output: processRead.ok
          ? String(
              processRead.result && processRead.result.output != null
                ? processRead.result.output
                : processRead.result
            )
          : "",
        error: processRead.ok ? "" : processRead.error
      },
      resource: {
        ok: !!resourcePathRead.ok,
        path: resourcePathRead.ok ? resourcePathRead.path : "",
        readOk: !!resourceFileRead.ok,
        head: resourceFileRead.ok ? resourceFileRead.content.slice(0, 1200) : "",
        error: resourcePathRead.ok
          ? (resourceFileRead.ok ? "" : resourceFileRead.error)
          : resourcePathRead.error
      }
    }
  };
}

exports.main = main;
