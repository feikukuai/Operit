import type { ComposeDslContext, ComposeNode } from "../../../../types/compose-dsl";
import {
  ensureAccountBookWebServer,
  type AccountBookWebServerResult,
} from "../../shared/account_book_web_runtime.js";

type EnsureServerResult = AccountBookWebServerResult;

function parseToolResult<T>(value: unknown): T | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch (_error) {
      return null;
    }
  }
  return value as T;
}

export default function Screen(ctx: ComposeDslContext): ComposeNode {
  const { UI } = ctx;
  const colors = ctx.MaterialTheme.colorScheme;

  const [initialized, setInitialized] = ctx.useState("initialized", false);
  const [loading, setLoading] = ctx.useState("loading", false);
  const [serverUrl, setServerUrl] = ctx.useState("serverUrl", "");
  const [errorText, setErrorText] = ctx.useState("errorText", "");
  const [reloadToken, setReloadToken] = ctx.useState("reloadToken", "0");
  const [pageLoading, setPageLoading] = ctx.useState("pageLoading", false);
  const [pageProgress, setPageProgress] = ctx.useState("pageProgress", 0);
  const [statusDetail, setStatusDetail] = ctx.useState(
    "statusDetail",
    "正在准备记账本"
  );

  function clampProgress(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  async function ensureServer(forceRestart: boolean): Promise<void> {
    setLoading(true);
    setErrorText("");
    setPageLoading(false);
    setPageProgress(0);
    setStatusDetail("检查运行环境并拉起记账本网页服务");
    try {
      const result = parseToolResult<EnsureServerResult>(
        await ensureAccountBookWebServer({
          force_restart: forceRestart,
        })
      );
      if (!result?.success || !result?.url) {
        const message = result?.message || "本地网页服务启动失败";
        setErrorText(message);
        setStatusDetail(message);
        return;
      }
      setServerUrl(result.url);
      setReloadToken(String(Date.now()));
      setStatusDetail("正在连接网页并准备渲染界面");
      setPageLoading(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorText(message);
      setPageLoading(false);
      setStatusDetail(message);
    } finally {
      setLoading(false);
    }
  }

  const progressValue = clampProgress(pageProgress);
  const overlayDetail = errorText
    ? errorText
    : pageLoading
      ? statusDetail
      : statusDetail;
  const isOverlayVisible = Boolean(errorText) || loading || pageLoading || !serverUrl;

  const loadingOverlay = UI.Box(
    {
      fillMaxSize: true,
      zIndex: 1,
      backgroundBrush: {
        type: "verticalGradient",
        colors: [
          colors.surface.copy({ alpha: 0.96 }),
          colors.surface.copy({ alpha: 0.96 }),
        ],
      },
    },
    UI.Column(
      {
        fillMaxSize: true,
        paddingHorizontal: 24,
        spacing: 14,
        horizontalAlignment: "center",
        verticalArrangement: "center",
      },
      [
        UI.Box(
          {
            width: 88,
            height: 88,
            contentAlignment: "center",
          },
          !errorText
            ? UI.Icon({
                name: "sync",
                size: 34,
                tint: colors.primary,
                spin: true,
                spinDurationMs: 850,
              })
            : UI.Icon({
                name: "error",
                size: 32,
                tint: colors.error,
              })
        ),
        UI.Box(
          {
            width: 300,
            contentAlignment: "center",
          },
          !errorText
            ? UI.LinearProgressIndicator({
                width: 128,
                progress:
                  pageLoading && progressValue > 0
                    ? progressValue / 100
                    : undefined,
              })
            : UI.Spacer({ width: 0, height: 0 })
        ),
        UI.Box(
          {
            width: 300,
            contentAlignment: "center",
          },
          UI.Text({
            text: overlayDetail,
            style: "bodyMedium",
            color: errorText ? colors.error : colors.onSurfaceVariant,
          })
        ),
      ]
    )
  );

  const content = serverUrl
    ? UI.Box(
        {
          fillMaxSize: true,
        },
        [
          UI.WebView({
            key: `account_book_webview_${reloadToken}`,
            fillMaxSize: true,
            url: serverUrl,
            javaScriptEnabled: true,
            domStorageEnabled: true,
            allowFileAccess: true,
            allowContentAccess: true,
            supportZoom: false,
            useWideViewPort: false,
            loadWithOverviewMode: false,
            onPageStarted: () => {
              setPageLoading(true);
              setPageProgress(0);
              setStatusDetail("页面已打开，正在请求资源");
            },
            onProgressChanged: (event) => {
              const nextProgress = clampProgress(Number(event?.progress ?? 0));
              setPageProgress(nextProgress);
              setStatusDetail(
                nextProgress > 0 ? "页面资源加载中" : "正在建立页面连接"
              );
            },
            onPageFinished: () => {
              setPageProgress(100);
              setStatusDetail("正在显示记账页面");
              setPageLoading(false);
            },
            onReceivedError: () => {
              setPageProgress(0);
              setPageLoading(false);
              setErrorText("网页加载失败");
              setStatusDetail("请稍后重试");
            },
          }),
          isOverlayVisible ? loadingOverlay : UI.Spacer({ height: 0 }),
        ]
      )
    : loadingOverlay;

  return UI.Box(
    {
      fillMaxSize: true,
      onLoad: async () => {
        if (!initialized) {
          setInitialized(true);
          await ensureServer(false);
        }
      },
    },
    content
  );
}
