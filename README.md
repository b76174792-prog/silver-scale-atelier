# 银鳞书庭

为官方 Windows 客户端提供可关闭的 Astra 原版龙娘主题、角色状态显示及夜间、日间、专注模式。包含已批准的形象切换、显示丰富度设置及六种管理器界面语言。

本轮版本为 **1.0.0-beta.1**。请从 [本版 Release](https://github.com/b76174792-prog/silver-scale-atelier/releases/tag/v1.0.0-beta.1) 获取 [Windows x64 安装器](https://github.com/b76174792-prog/silver-scale-atelier/releases/download/v1.0.0-beta.1/SilverScaleAtelier-1.0.0-beta.1-x64-Setup.exe) 与该页公布的最终 SHA-256 校验值。

## 安装和使用

需要 Windows 11 x64 build 22000+、.NET Framework 4.8+、Microsoft Visual C++ v14 x64 运行库，以及本次验收主版本 `26.930.3930.0` 的官方 Store 宿主。安装包自带 Node 和项目资源；缺少 C++ 运行库时，安装向导会引导下载并安装 Microsoft 官方运行库。运行安装器后从开始菜单启动，选择主题并开启；首次使用在专用官方窗口登录自己的账号，再启用主题。

关闭主题恢复原生外观，完全停止或退出清理主题组件。新版安装器保留偏好；卸载时按提示处理设置。详细操作见 [随包使用说明](src/README.txt)，统一的权限、安全、签名和素材范围说明见 [用户须知](src/用户须知.txt)。

## 兼容矩阵

版本登记边界为 **2026-09-25（含）**。下表区分本 Beta 的 v10 程序验收基线与旧候选；文档更新后的最终安装器另行构建，不能把 v10 安装器哈希或旧候选结果当成最终下载文件的同包证明。

| 官方宿主版本 | 普通聊天 | Your dot | 切换 | 本 Beta 状态 |
| --- | --- | --- | --- | --- |
| `26.930.2377.0` | 旧 `084ebe8f` 候选曾观察空/短及完成长回复 | 同一旧候选曾观察长会话、重建及启停 | 同一旧候选曾观察切换 | **本 Beta 未在此版本同包验收**，不列为本次已验证版本 |
| `26.930.3930.0` | v10 验收基线在当前主机观察首页主题；干净 VM 观察既有一问一答短会话的人物、输入及背景 | 既有长 dot 会话观察 On/Off、人物与输入；真空/短 dot **未测试** | 既有页面的普通/dot 切换、GUI Exit 后原生恢复、管理器重开及真实文档重建已观察 | **公开 Beta 的已观察主版本**；VM 卸载/重装未测试，未来宿主版本不在此范围 |

宿主身份为 `OpenAI.Codex_2p2nqsd0c76g0`、Store、x64。3930 验收用官方 MSIX 的本地 SHA-256 为 `f7b0266d6c00d4743da01d62bc82488f7ec5560c642501758119cb9885f67c87`；来源为 [官方客户端包地址](https://persistent.oaistatic.com/codex-app-prod/ChatGPT-x64.msix)，2026-10-05 取得，签名时间戳为 2026-10-03 03:06:29.599 UTC。该时间戳只作版本边界依据，不代表公开发布日期。未知身份、结构或不唯一目标会停止挂载；本 Beta 不承诺未来版本兼容。更多已测与未测项目见 [发行说明](RELEASE_NOTES.md)。

## 开发和反馈

[构建说明](BUILD.md) 使用已有 WinForms、Node 和 Inno Setup 工具链。代码中的版本登记、普通/dot 定位器及共享布局和生命周期分离，结构相同的版本可以复用适配器。

问题请提交到 [Issues](https://github.com/b76174792-prog/silver-scale-atelier/issues)，附客户端构建、精确宿主版本、普通/dot 模式及复现步骤。

原角色和原始形象素材作者：[ZipZipPipe](https://space.bilibili.com/4168597/)。主题实现和项目内衍生整理：项目维护者（AI 辅助）。代码许可见 [LICENSE](src/LICENSE.txt)，组件索引见 [THIRD-PARTY](src/THIRD-PARTY.txt)，素材来源见 [PROVENANCE](assets/dragon-v1/PROVENANCE.md)。
