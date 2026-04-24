import type { ComposeColor, ComposeDslContext, ComposeNode } from "../../../../types/compose-dsl";

interface WorldBookListEntry {
  id: string;
  name: string;
  enabled: boolean;
  always_active?: boolean;
  priority?: number;
  keywords?: string[];
  is_regex?: boolean;
  scan_depth?: number;
}

interface WorldBookDetailEntry extends WorldBookListEntry {
  content?: string;
  case_sensitive?: boolean;
}

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
  const [entries, setEntries] = ctx.useState<WorldBookListEntry[]>("entries", []);
  const [loading, setLoading] = ctx.useState("loading", true);
  const [hasLoadedOnce, setHasLoadedOnce] = ctx.useState("hasLoadedOnce", false);
  const [view, setView] = ctx.useState<"list" | "create" | "edit">("view", "list");
  const [editId, setEditId] = ctx.useState("editId", "");
  const [formName, setFormName] = ctx.useState("formName", "");
  const [formContent, setFormContent] = ctx.useState("formContent", "");
  const [formKeywords, setFormKeywords] = ctx.useState("formKeywords", "");
  const [formIsRegex, setFormIsRegex] = ctx.useState("formIsRegex", false);
  const [formCaseSensitive, setFormCaseSensitive] = ctx.useState("formCaseSensitive", false);
  const [formAlwaysActive, setFormAlwaysActive] = ctx.useState("formAlwaysActive", false);
  const [formEnabled, setFormEnabled] = ctx.useState("formEnabled", true);
  const [formPriority, setFormPriority] = ctx.useState("formPriority", "50");
  const [formScanDepth, setFormScanDepth] = ctx.useState("formScanDepth", "5");

  const colors = ctx.MaterialTheme.colorScheme;
  const { UI } = ctx;

  function resetForm() {
    setEditId("");
    setFormName("");
    setFormContent("");
    setFormKeywords("");
    setFormIsRegex(false);
    setFormCaseSensitive(false);
    setFormAlwaysActive(false);
    setFormEnabled(true);
    setFormPriority("50");
    setFormScanDepth("5");
  }

  async function loadEntries() {
    setLoading(true);
    try {
      const result = parseToolResult<{ success?: boolean; entries?: WorldBookListEntry[] }>(
        await ctx.callTool("worldbook_tools:list_entries", {})
      );
      if (result?.success) {
        setEntries(result.entries || []);
      }
    } catch (error) {
      ctx.showToast(`加载失败: ${String(error)}`);
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  }

  async function doToggle(id: string) {
    try {
      await ctx.callTool("worldbook_tools:toggle_entry", { id });
      ctx.showToast("已切换");
      await loadEntries();
    } catch (error) {
      ctx.showToast(`操作失败: ${String(error)}`);
    }
  }

  async function doDelete(id: string, name: string) {
    try {
      await ctx.callTool("worldbook_tools:delete_entry", { id });
      ctx.showToast(`已删除: ${name}`);
      await loadEntries();
    } catch (error) {
      ctx.showToast(`删除失败: ${String(error)}`);
    }
  }

  async function doEdit(id: string) {
    try {
      const result = parseToolResult<{ success?: boolean; entry?: WorldBookDetailEntry }>(
        await ctx.callTool("worldbook_tools:get_entry", { id })
      );
      if (result?.success && result.entry) {
        const entry = result.entry;
        setEditId(entry.id);
        setFormName(entry.name || "");
        setFormContent(entry.content || "");
        setFormKeywords((entry.keywords || []).join("，"));
        setFormIsRegex(entry.is_regex === true);
        setFormCaseSensitive(entry.case_sensitive === true);
        setFormAlwaysActive(entry.always_active === true);
        setFormEnabled(entry.enabled !== false);
        setFormPriority(String(entry.priority ?? 50));
        setFormScanDepth(String(entry.scan_depth ?? 5));
        setView("edit");
      }
    } catch (error) {
      ctx.showToast(`加载失败: ${String(error)}`);
    }
  }

  function doCreate() {
    resetForm();
    setView("create");
  }

  async function doSave() {
    if (!formName.trim()) {
      ctx.showToast("请输入条目名称");
      return;
    }
    if (!formContent.trim()) {
      ctx.showToast("请输入注入内容");
      return;
    }

    const isEdit = view === "edit" && !!editId;
    const action = isEdit ? "worldbook_tools:update_entry" : "worldbook_tools:create_entry";
    const payload: Record<string, unknown> = {
      name: formName.trim(),
      content: formContent.trim(),
      keywords: formKeywords.trim(),
      is_regex: formIsRegex,
      case_sensitive: formCaseSensitive,
      always_active: formAlwaysActive,
      enabled: formEnabled,
      priority: Number.parseInt(formPriority, 10) || 50,
      scan_depth: Number.parseInt(formScanDepth, 10) || 5
    };

    if (isEdit) {
      payload.id = editId;
    }

    try {
      const result = parseToolResult<{ success?: boolean; message?: string }>(
        await ctx.callTool(action, payload)
      );
      if (result?.success) {
        ctx.showToast(isEdit ? "已更新" : "已创建");
        setView("list");
        resetForm();
        await loadEntries();
        return;
      }
      ctx.showToast(`失败: ${result?.message || "未知结果"}`);
    } catch (error) {
      ctx.showToast(`保存失败: ${String(error)}`);
    }
  }

  function renderTag(label: string, backgroundColor: ComposeColor, textColor: ComposeColor): ComposeNode {
    return UI.Surface(
      {
        containerColor: backgroundColor,
        shape: { cornerRadius: 8 },
        padding: { horizontal: 6, vertical: 2 }
      },
      [
        UI.Text({
          text: label,
          style: "labelSmall",
          color: textColor,
          fontSize: 9
        })
      ]
    );
  }

  function renderSettingRow(
    title: string,
    description: string,
    checked: boolean,
    onCheckedChange: (checked: boolean) => void
  ): ComposeNode {
    return UI.Row(
      {
        fillMaxWidth: true,
        horizontalArrangement: "spaceBetween",
        verticalAlignment: "center"
      },
      [
        UI.Column(
          {
            weight: 1,
            spacing: 2
          },
          [
            UI.Text({
              text: title,
              color: colors.onSurface,
              fontWeight: "bold"
            }),
            UI.Text({
              text: description,
              style: "bodySmall",
              color: colors.onSurfaceVariant
            })
          ]
        ),
        UI.Spacer({ width: 12 }),
        UI.Switch({
          checked,
          onCheckedChange
        })
      ]
    );
  }

  function renderCard(entry: WorldBookListEntry): ComposeNode {
    const keywordText =
      entry.keywords && entry.keywords.length > 0
        ? entry.keywords.join("、")
        : "未设置关键词";
    const infoPills: ComposeNode[] = [
      renderTag(
        keywordText,
        colors.secondaryContainer,
        colors.onSecondaryContainer
      ),
      renderTag(
        entry.always_active ? "常驻注入" : "关键词触发",
        colors.surfaceVariant,
        colors.onSurfaceVariant
      ),
      renderTag(
        `优先级 ${entry.priority ?? 50}`,
        colors.surfaceVariant,
        colors.onSurfaceVariant
      ),
      renderTag(
        `扫描 ${entry.scan_depth ?? 5}`,
        colors.surfaceVariant,
        colors.onSurfaceVariant
      )
    ];

    return UI.Card(
      {
        key: entry.id,
        containerColor: colors.surface,
        elevation: 1,
        fillMaxWidth: true
      },
      [
        UI.Column(
          {
            padding: 12,
            spacing: 8,
            fillMaxWidth: true
          },
          [
            UI.Row(
              {
                fillMaxWidth: true,
                verticalAlignment: "center"
              },
              [
                UI.Surface(
                  {
                    containerColor: entry.enabled
                      ? colors.primaryContainer
                      : colors.surfaceVariant,
                    shape: { cornerRadius: 6 },
                    width: 28,
                    height: 28,
                    padding: 6
                  },
                  [
                    UI.Icon({
                      name: entry.enabled ? "autoAwesome" : "menuBook",
                      tint: entry.enabled ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                      size: 16
                    })
                  ]
                ),
                UI.Spacer({ width: 10 }),
                UI.Column(
                  {
                    weight: 1
                  },
                  [
                    UI.Row(
                      {
                        verticalAlignment: "center"
                      },
                      [
                        UI.Box(
                          {
                            weight: 1
                          },
                          [
                            UI.Text({
                              text: entry.name,
                              style: "bodyMedium",
                              fontWeight: "medium",
                              color: colors.onSurface,
                              maxLines: 1
                            })
                          ]
                        ),
                        entry.always_active
                          ? UI.Row(
                              {
                                verticalAlignment: "center"
                              },
                              [
                                UI.Spacer({ width: 6 }),
                                renderTag("常驻", colors.tertiaryContainer, colors.onTertiaryContainer)
                              ]
                            )
                          : null,
                        entry.is_regex
                          ? UI.Row(
                              {
                                verticalAlignment: "center"
                              },
                              [
                                UI.Spacer({ width: 6 }),
                                renderTag("正则", colors.secondaryContainer, colors.onSecondaryContainer)
                              ]
                            )
                          : null
                      ].filter(Boolean) as ComposeNode[]
                    )
                  ]
                ),
                UI.Switch({
                  checked: entry.enabled,
                  onCheckedChange: () => doToggle(entry.id),
                  modifier: ctx.Modifier.scale(0.8)
                })
              ]
            ),
            UI.Surface(
              {
                fillMaxWidth: true,
                containerColor: colors.surfaceVariant.copy({ alpha: 0.18 }),
                shape: { cornerRadius: 12 },
                padding: { horizontal: 8, vertical: 6 }
              },
              [
                UI.Row(
                  {
                    fillMaxWidth: true,
                    verticalAlignment: "center"
                  },
                  [
                    UI.LazyRow(
                      {
                        weight: 1,
                        spacing: 4
                      },
                      infoPills
                    ),
                    UI.Spacer({ width: 6 }),
                    UI.Icon({
                      name: "arrowForward",
                      size: 14,
                      tint: colors.onSurfaceVariant
                    })
                  ]
                )
              ]
            ),
            UI.Row(
              {
                fillMaxWidth: true,
                spacing: 8
              },
              [
                UI.OutlinedButton(
                  {
                    onClick: () => doEdit(entry.id),
                    weight: 1,
                    fillMaxWidth: true,
                    height: 32
                  },
                  [
                    UI.Text({
                      text: "编辑",
                      style: "labelMedium",
                      fontSize: 12
                    })
                  ]
                ),
                UI.OutlinedButton(
                  {
                    onClick: () => doDelete(entry.id, entry.name),
                    weight: 1,
                    fillMaxWidth: true,
                    height: 32
                  },
                  [
                    UI.Text({
                      text: "删除",
                      style: "labelMedium",
                      fontSize: 12
                    })
                  ]
                )
              ]
            )
          ].filter(Boolean) as ComposeNode[]
        )
      ]
    );
  }

  function renderForm(): ComposeNode {
    const isEdit = view === "edit";
    return UI.Column(
      {
        padding: 12,
        spacing: 12,
        fillMaxWidth: true
      },
      [
        UI.Card(
          {
            containerColor: colors.surfaceVariant,
            shape: { cornerRadius: 18 },
            fillMaxWidth: true
          },
          [
            UI.Column(
              {
                padding: 16,
                spacing: 12,
                fillMaxWidth: true
              },
              [
                UI.Row(
                  {
                    fillMaxWidth: true,
                    horizontalArrangement: "spaceBetween",
                    verticalAlignment: "center"
                  },
                  [
                    UI.Column({ spacing: 4, weight: 1 }, [
                      UI.Text({
                        text: isEdit ? "编辑世界书条目" : "新建世界书条目",
                        style: "titleLarge",
                        fontWeight: "bold",
                        color: colors.onSurface
                      }),
                      UI.Text({
                        text: isEdit
                          ? "修改关键词、启用状态和注入内容。"
                          : "创建一个新的注入规则，并决定它何时生效。",
                        style: "bodySmall",
                        color: colors.onSurfaceVariant
                      })
                    ]),
                    UI.OutlinedButton(
                      {
                        onClick: () => setView("list"),
                        shape: { cornerRadius: 12 }
                      },
                      [
                        UI.Row(
                          {
                            spacing: 6,
                            verticalAlignment: "center"
                          },
                          [
                            UI.Icon({
                              name: "arrowBack",
                              size: 16,
                              tint: colors.onSurface
                            }),
                            UI.Text({
                              text: "返回",
                              color: colors.onSurface,
                              fontWeight: "bold"
                            })
                          ]
                        )
                      ]
                    )
                  ]
                )
              ]
            )
          ]
        ),
        UI.Card(
          {
            containerColor: colors.surface,
            shape: { cornerRadius: 18 },
            fillMaxWidth: true
          },
          [
            UI.Column(
              {
                padding: 16,
                spacing: 12,
                fillMaxWidth: true
              },
              [
                UI.Text({
                  text: "基础信息",
                  style: "titleMedium",
                  fontWeight: "bold",
                  color: colors.onSurface
                }),
                UI.Text({
                  text: "定义条目名称、触发关键词和注入内容。",
                  style: "bodySmall",
                  color: colors.onSurfaceVariant
                }),
                UI.TextField({
                  label: "条目名称",
                  placeholder: "例如：魔法体系",
                  value: formName,
                  onValueChange: setFormName,
                  singleLine: true,
                  fillMaxWidth: true
                }),
                UI.TextField({
                  label: "关键词（逗号分隔）",
                  placeholder: "魔法, 法术",
                  value: formKeywords,
                  onValueChange: setFormKeywords,
                  singleLine: true,
                  fillMaxWidth: true
                }),
                UI.TextField({
                  label: "注入内容",
                  placeholder: "触发时注入到系统提示词...",
                  value: formContent,
                  onValueChange: setFormContent,
                  singleLine: false,
                  minLines: 5,
                  fillMaxWidth: true
                })
              ]
            )
          ]
        ),
        UI.Card(
          {
            containerColor: colors.surface,
            shape: { cornerRadius: 18 },
            fillMaxWidth: true
          },
          [
            UI.Column(
              {
                padding: 16,
                spacing: 12,
                fillMaxWidth: true
              },
              [
                UI.Text({
                  text: "匹配与启用",
                  style: "titleMedium",
                  fontWeight: "bold",
                  color: colors.onSurface
                }),
                renderSettingRow(
                  "启用条目",
                  "关闭后会保留条目，但不会参与注入。",
                  formEnabled,
                  setFormEnabled
                ),
                UI.HorizontalDivider({
                  color: colors.outlineVariant,
                  thickness: 1
                }),
                renderSettingRow(
                  "常驻激活",
                  "无需关键词，始终注入到提示词。",
                  formAlwaysActive,
                  setFormAlwaysActive
                ),
                UI.HorizontalDivider({
                  color: colors.outlineVariant,
                  thickness: 1
                }),
                renderSettingRow(
                  "正则表达式",
                  "将关键词作为正则表达式匹配。",
                  formIsRegex,
                  setFormIsRegex
                ),
                UI.HorizontalDivider({
                  color: colors.outlineVariant,
                  thickness: 1
                }),
                renderSettingRow(
                  "大小写敏感",
                  "匹配关键词时区分大小写。",
                  formCaseSensitive,
                  setFormCaseSensitive
                )
              ]
            )
          ]
        ),
        UI.Card(
          {
            containerColor: colors.surface,
            shape: { cornerRadius: 18 },
            fillMaxWidth: true
          },
          [
            UI.Column(
              {
                padding: 16,
                spacing: 12,
                fillMaxWidth: true
              },
              [
                UI.Text({
                  text: "注入策略",
                  style: "titleMedium",
                  fontWeight: "bold",
                  color: colors.onSurface
                }),
                UI.Text({
                  text: "优先级越高越先参与；扫描深度决定向上读取多少条历史消息。",
                  style: "bodySmall",
                  color: colors.onSurfaceVariant
                }),
                UI.Row(
                  { fillMaxWidth: true, spacing: 12 },
                  [
                    UI.Column(
                      { weight: 1 },
                      [
                        UI.TextField({
                          label: "优先级",
                          placeholder: "50",
                          value: formPriority,
                          onValueChange: setFormPriority,
                          singleLine: true,
                          fillMaxWidth: true
                        })
                      ]
                    ),
                    UI.Column(
                      { weight: 1 },
                      [
                        UI.TextField({
                          label: "扫描深度",
                          placeholder: "5",
                          value: formScanDepth,
                          onValueChange: setFormScanDepth,
                          singleLine: true,
                          fillMaxWidth: true
                        })
                      ]
                    )
                  ]
                ),
                UI.Text({
                  text: "扫描深度：扫描最近 N 条历史消息。0 = 仅当前输入",
                  style: "bodySmall",
                  color: colors.onSurfaceVariant
                })
              ]
            )
          ]
        ),
        UI.Button({
          text: isEdit ? "保存修改" : "创建条目",
          onClick: () => doSave(),
          fillMaxWidth: true,
          shape: { cornerRadius: 14 }
        })
      ]
    );
  }

  const items: ComposeNode[] = [
    UI.Row(
      {
        key: "actions",
        fillMaxWidth: true,
        horizontalArrangement: "end",
        verticalAlignment: "center",
        padding: { horizontal: 4, vertical: 4 }
      },
      [
        UI.FilledTonalButton({
          onClick: doCreate,
          height: 36
        }, [
          UI.Row(
            {
              spacing: 6,
              verticalAlignment: "center"
            },
            [
              UI.Icon({
                name: "add",
                tint: colors.onSecondaryContainer,
                size: 18
              }),
              UI.Text({
                text: "新建条目",
                color: colors.onSecondaryContainer,
                fontWeight: "bold"
              })
            ]
          )
        ])
      ]
    )
  ];

  if (view === "edit" || view === "create") {
    return UI.LazyColumn(
      {
        fillMaxSize: true,
        spacing: 12,
        padding: { horizontal: 12, vertical: 8 }
      },
      [renderForm()]
    );
  }

  if (loading || !hasLoadedOnce) {
    items.push(
      UI.Column(
        {
          key: "loading",
          fillMaxWidth: true,
          horizontalAlignment: "center",
          padding: 32
        },
        [
          UI.CircularProgressIndicator({}),
          UI.Spacer({ height: 8 }),
          UI.Text({
            text: "加载中...",
            color: colors.onSurfaceVariant
          })
        ]
      )
    );
  } else if (entries.length === 0) {
    items.push(
      UI.Card(
        {
          key: "empty",
          fillMaxWidth: true,
          containerColor: colors.surfaceVariant,
          elevation: 0
        },
        [
          UI.Column(
            {
              fillMaxWidth: true,
              horizontalAlignment: "center",
              padding: 24,
              spacing: 8
            },
            [
              UI.Text({
                text: "还没有世界书条目",
                style: "titleMedium",
                color: colors.onSurface
              }),
              UI.Text({
                text: "点击右上角新建，创建第一个条目。",
                style: "bodySmall",
                color: colors.onSurfaceVariant
              }),
              UI.FilledTonalButton({
                onClick: doCreate,
                height: 36
              }, [
                UI.Text({
                  text: "新建第一个条目",
                  color: colors.onSecondaryContainer,
                  fontWeight: "bold"
                })
              ])
            ]
          )
        ]
      )
    );
  } else {
    for (const entry of entries) {
      items.push(renderCard(entry));
    }
  }

  return UI.LazyColumn(
    {
      spacing: 10,
      padding: { horizontal: 12, vertical: 8 },
      fillMaxSize: true,
      onLoad: () => loadEntries()
    },
    items
  );
}
