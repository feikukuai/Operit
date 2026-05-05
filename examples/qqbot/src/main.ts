import { ensureQQBotServiceStarted } from "./shared/qqbot_runtime";

export function registerToolPkg() {
  ToolPkg.registerAppLifecycleHook({
    id: "qqbot_app_create",
    event: "application_on_create",
    function: onApplicationCreate,
  });

  ToolPkg.registerAppLifecycleHook({
    id: "qqbot_app_foreground",
    event: "application_on_foreground",
    function: onApplicationForeground,
  });

  return true;
}

async function runAutoStart(source: string, input?: ToolPkg.AppLifecycleHookEvent | unknown): Promise<any> {
  try {
    return await ensureQQBotServiceStarted({
      source,
      allow_missing_config: true,
      timeout_ms: 2500,
      lifecycle_event: (input as any)?.eventName || source,
    });
  } catch (error: any) {
    return {
      ok: false,
      source,
      lifecycleEvent: (input as any)?.eventName || source,
      error: error && error.message ? error.message : String(error),
    };
  }
}

export async function onApplicationCreate(input?: ToolPkg.AppLifecycleHookEvent | unknown): Promise<any> {
  return runAutoStart("application_on_create", input);
}

export async function onApplicationForeground(input?: ToolPkg.AppLifecycleHookEvent | unknown): Promise<any> {
  return runAutoStart("application_on_foreground", input);
}
