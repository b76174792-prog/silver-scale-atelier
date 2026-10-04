# 银鳞书庭

为官方 Windows 客户端提供可关闭的 Astra 原版龙娘主题、角色状态显示及夜间、日间、专注模式。包含已批准的形象切换、显示丰富度设置及六种管理器界面语言。

本轮版本为 **1.0.0-beta.1**。目前仍在准备与验收，发布后可从 [GitHub Releases](https://github.com/b76174792-prog/silver-scale-atelier/releases) 下载安装器及 SHA-256 文件。请以实际公开 Release 状态为准。

## 安装和使用

需要 Windows 11 x64 build 22000+、.NET Framework 4.8+，以及下表中的官方 Store 宿主。安装包自带运行时和项目资源。运行安装器后从开始菜单启动，选择主题并开启；首次使用在专用官方窗口登录自己的账号，再启用主题。

关闭主题恢复原生外观，完全停止或退出清理主题组件。新版安装器保留偏好；卸载时按提示处理设置。详细操作见 [随包使用说明](src/README.txt)，统一的权限、安全、签名和素材范围说明见 [用户须知](src/用户须知.txt)。

## 兼容矩阵

新增适配与发布验收边界为 **2026-09-25（含）**。版本来源使用真实签名包时间和部署记录，不从版本号推断日期。

| 官方宿主版本 | 普通聊天 | Your dot | 切换 | 本 Beta 状态 |
| --- | --- | --- | --- | --- |
| `26.930.2377.0` | 0.5.9 实机基线通过 | 0.5.9 长会话基线通过；空/短与真实重建待补齐 | 0.5.9 基线通过 | 最终 Beta 包回归待完成 |
| `26.930.3930.0` | 未运行验证 | 未运行验证 | 未验证 | 原包仅 Stage；生产拒绝 |

宿主身份为 `OpenAI.Codex_2p2nqsd0c76g0`、Store、x64。待验证不等同支持。其他已保留的旧适配路径不在本轮新增验收范围；未知身份、结构或不唯一目标会停止挂载。

## 开发和反馈

[构建说明](BUILD.md) 使用已有 WinForms、Node 和 Inno Setup 工具链。代码中的版本登记、普通/dot 定位器及共享布局和生命周期分离，结构相同的版本可以复用适配器。

问题请提交到 [Issues](https://github.com/b76174792-prog/silver-scale-atelier/issues)，附客户端构建、精确宿主版本、普通/dot 模式及复现步骤。

原角色和原始形象素材作者：[ZipZipPipe](https://space.bilibili.com/4168597/)。主题实现和项目内衍生整理：项目维护者（AI 辅助）。代码许可见 [LICENSE](src/LICENSE.txt)，组件索引见 [THIRD-PARTY](src/THIRD-PARTY.txt)，素材来源见 [PROVENANCE](assets/dragon-v1/PROVENANCE.md)。
