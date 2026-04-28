"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Screen;
const i18n_1 = require("../../i18n");
function parseToolResult(value) {
    if (!value) {
        return null;
    }
    if (typeof value === "string") {
        try {
            return JSON.parse(value);
        }
        catch (_error) {
            return null;
        }
    }
    return value;
}
function resolveText() {
    const rawLocale = getLang();
    const locale = String(rawLocale || "").trim().toLowerCase();
    const preferredLocale = locale.startsWith("en") ? "en-US" : "zh-CN";
    return (0, i18n_1.resolveWorldBookI18n)(preferredLocale);
}
function Screen(ctx) {
    const [entries, setEntries] = ctx.useState("entries", []);
    const [loading, setLoading] = ctx.useState("loading", true);
    const [hasLoadedOnce, setHasLoadedOnce] = ctx.useState("hasLoadedOnce", false);
    const [view, setView] = ctx.useState("view", "list");
    const [editId, setEditId] = ctx.useState("editId", "");
    const [formName, setFormName] = ctx.useState("formName", "");
    const [formContent, setFormContent] = ctx.useState("formContent", "");
    const [formKeywords, setFormKeywords] = ctx.useState("formKeywords", "");
    const [formIsRegex, setFormIsRegex] = ctx.useState("formIsRegex", false);
    const [formCaseSensitive, setFormCaseSensitive] = ctx.useState("formCaseSensitive", false);
    const [formAlwaysActive, setFormAlwaysActive] = ctx.useState("formAlwaysActive", false);
    const [formEnabled, setFormEnabled] = ctx.useState("formEnabled", true);
    const [formPriority, setFormPriority] = ctx.useState("formPriority", "50");
    const [formScanDepth, setFormScanDepth] = ctx.useState("formScanDepth", "0");
    const [formInjectTarget, setFormInjectTarget] = ctx.useState("formInjectTarget", "system");
    const [formCharacterCardId, setFormCharacterCardId] = ctx.useState("formCharacterCardId", "");
    const [showCardPicker, setShowCardPicker] = ctx.useState("showCardPicker", false);
    const [loadingCards, setLoadingCards] = ctx.useState("loadingCards", false);
    const [availableCards, setAvailableCards] = ctx.useState("availableCards", []);
    const t = resolveText();
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
        setFormScanDepth("0");
        setFormInjectTarget("system");
        setFormCharacterCardId("");
        setShowCardPicker(false);
        setLoadingCards(false);
        setAvailableCards([]);
    }
    async function loadEntries() {
        setLoading(true);
        try {
            const result = parseToolResult(await ctx.callTool("worldbook_tools:list_entries", {}));
            if (result?.success) {
                setEntries(result.entries || []);
            }
        }
        catch (error) {
            ctx.showToast(`${t.toastLoadFailedPrefix}${String(error)}`);
        }
        finally {
            setLoading(false);
            setHasLoadedOnce(true);
        }
    }
    async function doToggle(id) {
        try {
            await ctx.callTool("worldbook_tools:toggle_entry", { id });
            ctx.showToast(t.toastToggleDone);
            await loadEntries();
        }
        catch (error) {
            ctx.showToast(`${t.toastActionFailedPrefix}${String(error)}`);
        }
    }
    async function doDelete(id, name) {
        try {
            await ctx.callTool("worldbook_tools:delete_entry", { id });
            ctx.showToast(`${t.toastDeletedPrefix}${name}`);
            await loadEntries();
        }
        catch (error) {
            ctx.showToast(`${t.toastDeleteFailedPrefix}${String(error)}`);
        }
    }
    async function doEdit(id) {
        try {
            const result = parseToolResult(await ctx.callTool("worldbook_tools:get_entry", { id }));
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
                setFormScanDepth(String(entry.scan_depth ?? 0));
                setFormInjectTarget(entry.inject_target || "system");
                setFormCharacterCardId(entry.character_card_id || "");
                setShowCardPicker(false);
                setLoadingCards(false);
                setAvailableCards([]);
                setView("edit");
            }
        }
        catch (error) {
            ctx.showToast(`${t.toastLoadFailedPrefix}${String(error)}`);
        }
    }
    async function loadCardPicker() {
        if (showCardPicker) {
            setShowCardPicker(false);
            setLoadingCards(false);
            return;
        }
        setShowCardPicker(true);
        setLoadingCards(true);
        try {
            const result = parseToolResult(await ctx.callTool("worldbook_tools:list_character_cards_proxy", {}));
            if (result?.success) {
                const cards = Array.isArray(result.cards) ? result.cards : [];
                setAvailableCards(cards);
                setLoadingCards(false);
                return;
            }
            ctx.showToast(result?.message || t.toastRoleCardLoadFailed);
            setAvailableCards([]);
            setLoadingCards(false);
            setShowCardPicker(false);
        }
        catch (error) {
            ctx.showToast(`${t.toastRoleCardLoadFailedPrefix}${String(error)}`);
            setAvailableCards([]);
            setLoadingCards(false);
            setShowCardPicker(false);
        }
    }
    function doPickCard(cardId) {
        setFormCharacterCardId(cardId || "");
        setShowCardPicker(false);
        setLoadingCards(false);
    }
    function doClearCardBinding() {
        setFormCharacterCardId("");
        setShowCardPicker(false);
        setLoadingCards(false);
    }
    function getSelectedCardLabel() {
        if (!formCharacterCardId) {
            return t.dropdownNoCharacterCard;
        }
        const matchedCard = availableCards.find((card) => card.id === formCharacterCardId);
        if (matchedCard?.name) {
            return matchedCard.name;
        }
        return formCharacterCardId;
    }
    function toggleCardPicker() {
        return loadCardPicker();
    }
    function doCreate() {
        resetForm();
        setView("create");
    }
    async function doSave() {
        if (!formName.trim()) {
            ctx.showToast(t.toastNameRequired);
            return;
        }
        if (!formContent.trim()) {
            ctx.showToast(t.toastContentRequired);
            return;
        }
        const isEdit = view === "edit" && !!editId;
        const action = isEdit ? "worldbook_tools:update_entry" : "worldbook_tools:create_entry";
        const payload = {
            name: formName.trim(),
            content: formContent.trim(),
            keywords: formKeywords.trim(),
            is_regex: formIsRegex,
            case_sensitive: formCaseSensitive,
            always_active: formAlwaysActive,
            enabled: formEnabled,
            priority: Number.parseInt(formPriority, 10) || 50,
            scan_depth: Number.parseInt(formScanDepth, 10) || 0,
            inject_target: formInjectTarget,
            character_card_id: formCharacterCardId.trim()
        };
        if (isEdit) {
            payload.id = editId;
        }
        try {
            const result = parseToolResult(await ctx.callTool(action, payload));
            if (result?.success) {
                ctx.showToast(isEdit ? t.toastUpdated : t.toastCreated);
                setView("list");
                resetForm();
                await loadEntries();
                return;
            }
            ctx.showToast(`${t.toastFailedPrefix}${result?.message || t.toastUnknownResult}`);
        }
        catch (error) {
            ctx.showToast(`${t.toastSaveFailedPrefix}${String(error)}`);
        }
    }
    function renderTag(label, backgroundColor, textColor) {
        return UI.Box({
            modifier: ctx.Modifier.clip({ cornerRadius: 8 }).background(backgroundColor)
        }, [
            UI.Text({
                text: label,
                style: "labelSmall",
                color: textColor,
                fontSize: 9,
                maxLines: 1,
                padding: { horizontal: 6, vertical: 2 }
            })
        ]);
    }
    function renderHeaderTag(label, backgroundColor, textColor) {
        return UI.Surface({
            shape: { cornerRadius: 8 },
            containerColor: backgroundColor
        }, [
            UI.Text({
                text: label,
                style: "labelSmall",
                color: textColor,
                fontSize: 9,
                padding: { horizontal: 6, vertical: 2 }
            })
        ]);
    }
    function renderSettingRow(title, description, checked, onCheckedChange) {
        return UI.Row({
            fillMaxWidth: true,
            horizontalArrangement: "spaceBetween",
            verticalAlignment: "center"
        }, [
            UI.Column({
                weight: 1,
                spacing: 2
            }, [
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
            ]),
            UI.Spacer({ width: 12 }),
            UI.Switch({
                checked,
                onCheckedChange
            })
        ]);
    }
    function renderCard(entry) {
        const keywordText = entry.keywords && entry.keywords.length > 0 ? entry.keywords.join("、") : t.keywordEmpty;
        const infoPills = [
            renderTag(keywordText, colors.secondaryContainer.copy({ alpha: 0.6 }), colors.onSecondaryContainer),
            renderTag(entry.always_active ? t.tagAlwaysActive : t.tagKeywordTrigger, colors.secondaryContainer.copy({ alpha: 0.6 }), colors.onSecondaryContainer),
            renderTag(t.tagPriority(entry.priority ?? 50), colors.secondaryContainer.copy({ alpha: 0.6 }), colors.onSecondaryContainer),
            renderTag(t.tagScanDepth(entry.scan_depth ?? 0), colors.secondaryContainer.copy({ alpha: 0.6 }), colors.onSecondaryContainer),
            entry.inject_target === "user"
                ? renderTag(t.tagInjectUser, colors.tertiaryContainer.copy({ alpha: 0.7 }), colors.onTertiaryContainer)
                : renderTag(t.tagInjectSystem, colors.tertiaryContainer.copy({ alpha: 0.7 }), colors.onTertiaryContainer),
            entry.character_card_id
                ? renderTag(t.tagCharacterCard(entry.character_card_id), colors.primaryContainer.copy({ alpha: 0.7 }), colors.onPrimaryContainer)
                : null
        ].filter(Boolean);
        return UI.Card({
            key: entry.id,
            containerColor: colors.surface,
            elevation: 1,
            modifier: ctx.Modifier.fillMaxWidth().clickable(() => doEdit(entry.id))
        }, [
            UI.Column({
                padding: 12,
                fillMaxWidth: true
            }, [
                UI.Row({
                    fillMaxWidth: true,
                    verticalAlignment: "center"
                }, [
                    UI.Box({
                        width: 28,
                        height: 28,
                        contentAlignment: "center",
                        modifier: ctx.Modifier
                            .clip({ cornerRadius: 6 })
                            .background(colors.primaryContainer)
                    }, [
                        UI.Icon({
                            name: "extension",
                            tint: colors.onPrimaryContainer,
                            size: 16
                        })
                    ]),
                    UI.Spacer({ width: 10 }),
                    UI.Column({
                        weight: 1
                    }, [
                        UI.Row({
                            verticalAlignment: "center"
                        }, [
                            UI.Text({
                                text: entry.name,
                                style: "bodyMedium",
                                fontWeight: "medium",
                                maxLines: 1,
                                overflow: "ellipsis",
                                weight: 1,
                                weightFill: false
                            }),
                            entry.always_active ? UI.Spacer({ width: 6 }) : null,
                            entry.always_active
                                ? renderHeaderTag(t.tagPinned, colors.primary.copy({ alpha: 0.1 }), colors.primary)
                                : null,
                            entry.is_regex ? UI.Spacer({ width: 6 }) : null,
                            entry.is_regex
                                ? renderHeaderTag(t.tagRegex, colors.secondary.copy({ alpha: 0.1 }), colors.secondary)
                                : null
                        ].filter(Boolean))
                    ].filter(Boolean)),
                    UI.Switch({
                        checked: entry.enabled,
                        onCheckedChange: (_checked) => doToggle(entry.id),
                        enabled: true,
                        checkedThumbColor: colors.primary,
                        checkedTrackColor: colors.primaryContainer,
                        uncheckedThumbColor: colors.outline,
                        uncheckedTrackColor: colors.surfaceVariant,
                        modifier: ctx.Modifier.scale(0.8)
                    })
                ]),
                UI.Spacer({ height: 8 }),
                UI.Box({
                    modifier: ctx.Modifier
                        .fillMaxWidth()
                        .clip({ cornerRadius: 12 })
                        .background(colors.surfaceVariant.copy({ alpha: 0.18 }))
                        .clickable(() => doEdit(entry.id))
                        .padding({ horizontal: 8, vertical: 6 })
                }, [
                    UI.Row({
                        fillMaxWidth: true,
                        verticalAlignment: "center"
                    }, [
                        UI.LazyRow({
                            weight: 1,
                            spacing: 4
                        }, infoPills),
                        UI.Spacer({ width: 6 }),
                        UI.Icon({
                            name: "arrowForward",
                            size: 14,
                            tint: colors.onSurfaceVariant.copy({ alpha: 0.7 })
                        })
                    ])
                ]),
                UI.Spacer({ height: 8 }),
                UI.Row({
                    fillMaxWidth: true,
                    spacing: 8
                }, [
                    UI.OutlinedButton({
                        onClick: () => doEdit(entry.id),
                        weight: 1,
                        height: 32,
                        contentPadding: { horizontal: 12 }
                    }, [
                        UI.Text({
                            text: t.buttonEdit,
                            style: "labelMedium",
                            fontSize: 12
                        })
                    ]),
                    UI.OutlinedButton({
                        onClick: () => doDelete(entry.id, entry.name),
                        weight: 1,
                        height: 32,
                        contentPadding: { horizontal: 12 }
                    }, [
                        UI.Text({
                            text: t.buttonDelete,
                            style: "labelMedium",
                            fontSize: 12
                        })
                    ])
                ])
            ].filter(Boolean))
        ]);
    }
    function renderForm() {
        const isEdit = view === "edit";
        return UI.Column({
            padding: 12,
            spacing: 12,
            fillMaxWidth: true
        }, [
            UI.Row({
                fillMaxWidth: true
            }, [
                UI.OutlinedButton({
                    onClick: () => setView("list"),
                    shape: { cornerRadius: 12 }
                }, [
                    UI.Row({
                        spacing: 6,
                        verticalAlignment: "center"
                    }, [
                        UI.Icon({
                            name: "arrowBack",
                            size: 16,
                            tint: colors.onSurface
                        }),
                        UI.Text({
                            text: t.buttonBack,
                            color: colors.onSurface,
                            fontWeight: "bold"
                        })
                    ])
                ])
            ]),
            UI.Card({
                containerColor: colors.surface,
                shape: { cornerRadius: 18 },
                fillMaxWidth: true
            }, [
                UI.Column({
                    padding: 16,
                    spacing: 12,
                    fillMaxWidth: true
                }, [
                    UI.Text({
                        text: t.sectionBasicInfo,
                        style: "titleMedium",
                        fontWeight: "bold",
                        color: colors.onSurface
                    }),
                    UI.Text({
                        text: t.sectionBasicInfoDesc,
                        style: "bodySmall",
                        color: colors.onSurfaceVariant
                    }),
                    UI.TextField({
                        label: t.fieldEntryName,
                        placeholder: t.fieldEntryNamePlaceholder,
                        value: formName,
                        onValueChange: setFormName,
                        singleLine: true,
                        fillMaxWidth: true
                    }),
                    UI.TextField({
                        label: t.fieldKeywords,
                        placeholder: t.fieldKeywordsPlaceholder,
                        value: formKeywords,
                        onValueChange: setFormKeywords,
                        singleLine: true,
                        fillMaxWidth: true
                    }),
                    UI.TextField({
                        label: t.fieldContent,
                        placeholder: t.fieldContentPlaceholder,
                        value: formContent,
                        onValueChange: setFormContent,
                        singleLine: false,
                        minLines: 5,
                        fillMaxWidth: true
                    }),
                    UI.Text({
                        text: t.fieldCharacterCard,
                        style: "labelMedium",
                        fontWeight: "bold",
                        color: colors.onSurface
                    }),
                    UI.Box({
                        fillMaxWidth: true
                    }, [
                        UI.OutlinedButton({
                            onClick: () => toggleCardPicker(),
                            fillMaxWidth: true,
                            shape: { cornerRadius: 14 }
                        }, [
                            UI.Row({
                                fillMaxWidth: true,
                                horizontalArrangement: "spaceBetween",
                                verticalAlignment: "center"
                            }, [
                                UI.Column({ weight: 1, spacing: 2 }, [
                                    UI.Text({
                                        text: getSelectedCardLabel(),
                                        color: colors.onSurface,
                                        fontWeight: "medium",
                                        maxLines: 1,
                                        overflow: "ellipsis"
                                    }),
                                    UI.Text({
                                        text: formCharacterCardId ? t.dropdownBoundCard : t.dropdownGlobalEffective,
                                        style: "bodySmall",
                                        color: colors.onSurfaceVariant
                                    })
                                ]),
                                UI.Icon({
                                    name: showCardPicker ? "arrowDropUp" : "arrowDropDown",
                                    tint: colors.onSurfaceVariant,
                                    size: 20
                                })
                            ])
                        ]),
                        UI.DropdownMenu({
                            expanded: showCardPicker,
                            properties: {
                                focusable: true
                            },
                            onDismissRequest: () => {
                                setShowCardPicker(false);
                                setLoadingCards(false);
                            }
                        }, [
                            UI.Box({
                                modifier: ctx.Modifier
                                    .fillMaxWidth()
                                    .clickable(() => doClearCardBinding())
                                    .padding({ horizontal: 16, vertical: 12 })
                            }, [
                                UI.Text({
                                    text: t.dropdownNoCharacterCard,
                                    color: colors.onSurface,
                                    fontWeight: !formCharacterCardId ? "bold" : "normal"
                                })
                            ]),
                            UI.HorizontalDivider({
                                color: colors.outlineVariant,
                                thickness: 1
                            }),
                            ...(loadingCards
                                ? [
                                    UI.Box({
                                        modifier: ctx.Modifier
                                            .fillMaxWidth()
                                            .padding({ horizontal: 16, vertical: 12 })
                                    }, [
                                        UI.Text({
                                            text: t.dropdownLoading,
                                            color: colors.onSurfaceVariant
                                        })
                                    ])
                                ]
                                : availableCards.length === 0
                                    ? [
                                        UI.Box({
                                            modifier: ctx.Modifier
                                                .fillMaxWidth()
                                                .padding({ horizontal: 16, vertical: 12 })
                                        }, [
                                            UI.Text({
                                                text: t.dropdownNoCards,
                                                color: colors.onSurfaceVariant
                                            })
                                        ])
                                    ]
                                    : availableCards.map((card) => UI.Box({
                                        modifier: ctx.Modifier
                                            .fillMaxWidth()
                                            .clickable(() => doPickCard(card.id))
                                            .padding({ horizontal: 16, vertical: 12 })
                                    }, [
                                        UI.Row({
                                            fillMaxWidth: true,
                                            horizontalArrangement: "spaceBetween",
                                            verticalAlignment: "center"
                                        }, [
                                            UI.Column({ weight: 1, spacing: 2 }, [
                                                UI.Text({
                                                    text: card.name,
                                                    color: colors.onSurface,
                                                    fontWeight: card.id === formCharacterCardId ? "bold" : "normal",
                                                    maxLines: 1,
                                                    overflow: "ellipsis"
                                                }),
                                                ...(card.description
                                                    ? [
                                                        UI.Text({
                                                            text: card.description,
                                                            style: "bodySmall",
                                                            color: colors.onSurfaceVariant,
                                                            maxLines: 1,
                                                            overflow: "ellipsis"
                                                        })
                                                    ]
                                                    : [])
                                            ]),
                                            card.id === formCharacterCardId
                                                ? UI.Icon({
                                                    name: "check",
                                                    tint: colors.primary,
                                                    size: 18
                                                })
                                                : UI.Spacer({ width: 18 })
                                        ])
                                    ])))
                        ])
                    ]),
                    UI.Text({
                        text: t.dropdownHint,
                        style: "bodySmall",
                        color: colors.onSurfaceVariant
                    })
                ])
            ]),
            UI.Card({
                containerColor: colors.surface,
                shape: { cornerRadius: 18 },
                fillMaxWidth: true
            }, [
                UI.Column({
                    padding: 16,
                    spacing: 12,
                    fillMaxWidth: true
                }, [
                    UI.Text({
                        text: t.sectionMatchAndEnable,
                        style: "titleMedium",
                        fontWeight: "bold",
                        color: colors.onSurface
                    }),
                    renderSettingRow(t.settingEnabledTitle, t.settingEnabledDesc, formEnabled, setFormEnabled),
                    UI.HorizontalDivider({
                        color: colors.outlineVariant,
                        thickness: 1
                    }),
                    renderSettingRow(t.settingAlwaysActiveTitle, t.settingAlwaysActiveDesc, formAlwaysActive, setFormAlwaysActive),
                    UI.HorizontalDivider({
                        color: colors.outlineVariant,
                        thickness: 1
                    }),
                    renderSettingRow(t.settingRegexTitle, t.settingRegexDesc, formIsRegex, setFormIsRegex),
                    UI.HorizontalDivider({
                        color: colors.outlineVariant,
                        thickness: 1
                    }),
                    renderSettingRow(t.settingCaseSensitiveTitle, t.settingCaseSensitiveDesc, formCaseSensitive, setFormCaseSensitive)
                ])
            ]),
            UI.Card({
                containerColor: colors.surface,
                shape: { cornerRadius: 18 },
                fillMaxWidth: true
            }, [
                UI.Column({
                    padding: 16,
                    spacing: 12,
                    fillMaxWidth: true
                }, [
                    UI.Text({
                        text: t.sectionInjectStrategy,
                        style: "titleMedium",
                        fontWeight: "bold",
                        color: colors.onSurface
                    }),
                    UI.Text({
                        text: t.sectionInjectStrategyDesc,
                        style: "bodySmall",
                        color: colors.onSurfaceVariant
                    }),
                    UI.Row({ fillMaxWidth: true, spacing: 12 }, [
                        UI.Column({ weight: 1 }, [
                            UI.TextField({
                                label: t.fieldPriority,
                                placeholder: t.fieldPriorityPlaceholder,
                                value: formPriority,
                                onValueChange: setFormPriority,
                                singleLine: true,
                                fillMaxWidth: true
                            })
                        ]),
                        UI.Column({ weight: 1 }, [
                            UI.TextField({
                                label: t.fieldScanDepth,
                                placeholder: t.fieldScanDepthPlaceholder,
                                value: formScanDepth,
                                onValueChange: setFormScanDepth,
                                singleLine: true,
                                fillMaxWidth: true
                            })
                        ])
                    ]),
                    UI.Text({
                        text: t.scanDepthHint,
                        style: "bodySmall",
                        color: colors.onSurfaceVariant
                    }),
                    UI.Spacer({ height: 8 }),
                    UI.Text({
                        text: t.injectTargetTitle,
                        style: "labelMedium",
                        fontWeight: "bold",
                        color: colors.onSurface
                    }),
                    UI.Row({ fillMaxWidth: true, spacing: 8 }, [
                        UI.FilledTonalButton({
                            onClick: () => setFormInjectTarget("system"),
                            weight: 1
                        }, [
                            UI.Text({
                                text: formInjectTarget === "system" ? `✓ ${t.injectTargetSystem}` : t.injectTargetSystem,
                                fontWeight: formInjectTarget === "system" ? "bold" : "normal"
                            })
                        ]),
                        UI.FilledTonalButton({
                            onClick: () => setFormInjectTarget("user"),
                            weight: 1
                        }, [
                            UI.Text({
                                text: formInjectTarget === "user" ? `✓ ${t.injectTargetUser}` : t.injectTargetUser,
                                fontWeight: formInjectTarget === "user" ? "bold" : "normal"
                            })
                        ])
                    ])
                ])
            ]),
            UI.Button({
                text: isEdit ? t.saveEditButton : t.createEntryButton,
                onClick: () => doSave(),
                fillMaxWidth: true,
                shape: { cornerRadius: 14 }
            })
        ]);
    }
    const items = [
        UI.Row({
            key: "actions",
            fillMaxWidth: true,
            horizontalArrangement: "end",
            verticalAlignment: "center",
            padding: { horizontal: 4, vertical: 4 }
        }, [
            UI.FilledTonalButton({
                onClick: doCreate,
                height: 36
            }, [
                UI.Row({
                    spacing: 6,
                    verticalAlignment: "center"
                }, [
                    UI.Icon({
                        name: "add",
                        tint: colors.onSecondaryContainer,
                        size: 18
                    }),
                    UI.Text({
                        text: t.newEntryButton,
                        color: colors.onSecondaryContainer,
                        fontWeight: "bold"
                    })
                ])
            ])
        ])
    ];
    if (view === "edit" || view === "create") {
        return UI.LazyColumn({
            fillMaxSize: true,
            spacing: 12,
            padding: { horizontal: 12, vertical: 8 }
        }, [renderForm()]);
    }
    if (loading || !hasLoadedOnce) {
        items.push(UI.Column({
            key: "loading",
            fillMaxWidth: true,
            horizontalAlignment: "center",
            padding: 32
        }, [
            UI.CircularProgressIndicator({}),
            UI.Spacer({ height: 8 }),
            UI.Text({
                text: t.listLoading,
                color: colors.onSurfaceVariant
            })
        ]));
    }
    else if (entries.length === 0) {
        items.push(UI.Card({
            key: "empty",
            fillMaxWidth: true,
            containerColor: colors.surfaceVariant,
            elevation: 0
        }, [
            UI.Column({
                fillMaxWidth: true,
                horizontalAlignment: "center",
                padding: 24,
                spacing: 8
            }, [
                UI.Text({
                    text: t.emptyTitle,
                    style: "titleMedium",
                    color: colors.onSurface
                }),
                UI.Text({
                    text: t.emptyDesc,
                    style: "bodySmall",
                    color: colors.onSurfaceVariant
                }),
                UI.FilledTonalButton({
                    onClick: doCreate,
                    height: 36
                }, [
                    UI.Text({
                        text: t.emptyAction,
                        color: colors.onSecondaryContainer,
                        fontWeight: "bold"
                    })
                ])
            ])
        ]));
    }
    else {
        for (const entry of entries) {
            items.push(renderCard(entry));
        }
    }
    return UI.LazyColumn({
        spacing: 10,
        padding: { horizontal: 12, vertical: 8 },
        fillMaxSize: true,
        onLoad: () => loadEntries()
    }, items);
}
