---
name: SandboxPackage_DEV
description: 用于 Operit Sandbox Package 开发。
---

# SandboxPackage_DEV

## 第一部分：安装与更新

这个 skill 不再要求 AI 一次性手动下载 `SKILL.md`、guide 和整套 `types`。

安装与更新都走同一个脚本：

- 先把安装脚本下载到本地
- 再通过 `operit_editor` 这个 package 里的 `debug_run_sandbox_script` 工具运行它
- 脚本会自动创建目录，并更新 `SKILL.md`、`references/SCRIPT_DEV_GUIDE.md`、`types/*.d.ts`

这里说的“执行”，指的是：

- 不是用 shell 执行
- 不是直接打开这个 `.js` 文件
- 而是调用 `operit_editor:debug_run_sandbox_script`

也就是先确保 `operit_editor` 这个 package 可用，再让它执行 `/sdcard/Download/Operit/skills/SandboxPackage_DEV/scripts/install_or_update.js`

最终目录应当长这样：

```text
/sdcard/Download/Operit/skills/SandboxPackage_DEV/
  SKILL.md
  references/
    SCRIPT_DEV_GUIDE.md
  types/
    index.d.ts
    core.d.ts
    ...
  scripts/
    install_or_update.js
```

首次安装时，按下面顺序做：

1. 先创建 `/sdcard/Download/Operit/skills/SandboxPackage_DEV/scripts/`
2. 用 `download_file` 下载 `https://cdn.jsdelivr.net/gh/AAswordman/Operit@main/tools/sandboxpackage_dev_install_or_update.js`
3. 保存为 `/sdcard/Download/Operit/skills/SandboxPackage_DEV/scripts/install_or_update.js`
4. 调用 `operit_editor` 的 `debug_run_sandbox_script`
5. 把 `source_path` 设为 `/sdcard/Download/Operit/skills/SandboxPackage_DEV/scripts/install_or_update.js`
6. 等脚本执行完成

如果当前环境里没有直接暴露这个工具名，就先使用 `use_package` 调用 `operit_editor`，再执行 `debug_run_sandbox_script`。

这个安装脚本会自动处理下面这些内容：

- 创建 `SandboxPackage_DEV` 目录
- 下载并更新 `SKILL.md`
- 下载并更新 `references/SCRIPT_DEV_GUIDE.md`
- 下载并更新 `types/` 下全部类型文件

更新时按下面规则处理：

1. 每次正式开始新的 Sandbox Package 开发任务前，优先重新下载一次安装脚本并重新运行
2. 如果怀疑 guide、types 或 `SKILL.md` 已经过旧，也重新运行这个脚本
3. 如果本地 skill 目录缺文件、文件名不对、或者内容明显陈旧，不要手动零散修补，直接重跑安装脚本

下载完以后，查资料时默认这样做：

1. 先用 `grep_code` 在 `/sdcard/Download/Operit/skills/SandboxPackage_DEV/` 里搜关键字
2. 再用 `read_file_part` 读取命中的具体片段
3. 只有片段不够时才扩大范围

不要默认直接读取整个 `SCRIPT_DEV_GUIDE.md` 或整个 `types` 文件，原因是：

- 它们内容比较大，容易把上下文撑爆
- 先更新本地 skill，再检索的方式更稳
- 本地 skill 可以长期复用，但 `types` 最容易过时，所以需要高频重跑安装脚本

## 第二部分：Sandbox Package 撰写

撰写 Sandbox Package 时，不要凭记忆硬写，先查本地 skill 资料。

推荐的查阅顺序：

1. 先查 `types/index.d.ts`，确认全局入口和主要能力
2. 再查 `types/core.d.ts`、`types/java-bridge.d.ts`，确认运行时与桥接接口
3. 查 `types/results.d.ts`，确认常见返回结构
4. 查 `types/software_settings.d.ts`、`types/toolpkg.d.ts`，确认设置类与包相关类型
5. 需要脚本格式、元数据、示例写法时，再查 `references/SCRIPT_DEV_GUIDE.md`

推荐的撰写流程：

1. 先判断这次要写的是普通 `.js` Sandbox Package，还是 `ToolPkg`
2. 用 `grep_code` 在 `SCRIPT_DEV_GUIDE.md` 里搜索 `METADATA`、`tool`、`execute`、`package` 等关键字
3. 用 `read_file_part` 读取相关段落，确认脚本结构与元数据写法
4. 用 `types/` 里的定义约束参数、返回值、可调用能力和结果结构
5. 开始写包时，优先遵循最新本地 types，不要依赖旧记忆

如果写到一半发现本地类型和实际需求对不上，先不要硬猜，先重新运行安装脚本，再继续写。
