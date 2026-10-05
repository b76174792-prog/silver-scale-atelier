银鳞书庭 / Silver-Scale Atelier Manager 1.0.0-beta.1

为官方 Windows 客户端提供 Astra 原版龙娘、夜间/日间/专注主题、形象切换和简洁/平衡/丰富显示设置。管理器及自有页面控件支持中、英、西、法、阿、俄六种界面语言。角色状态由可见页面信号推断。

系统要求：Windows 11 x64 build 22000+，.NET Framework 4.8+，Microsoft Visual C++ v14 x64 运行库，已安装本次验收主版本26.930.3930.0的官方 Store 宿主。Node 及已批准素材自带；缺少 C++ 运行库时由安装向导引导安装。首次使用和聊天需要联网及本人的官方账号。

使用
1. 安装后从开始菜单“银鳞书庭 主题管理器”启动。
2. 选择主题与显示丰富度，点击“开启”。首次使用时在专用官方窗口登录，完成后再启用主题。
3. “形象/场景”中切换已批准的原版形象；专注主题隐藏装饰。
4. “关闭主题”恢复原生外观。“完全停止”停止主题连接；退出后可正常再次启动。
5. 使用新版安装器升级，保留既有偏好。卸载时按提示处理设置；重装后主题默认关闭。

兼容范围：2026-09-25（含）起，按有来源的精确包版本登记。
宿主身份：OpenAI.Codex_2p2nqsd0c76g0，Store，x64。
26.930.2377.0：旧084ebe8f候选曾完成普通空/短/长回复、dot长会话与重建观察；本Beta未在此版本同包验收，不列为本次已验证版本。
26.930.3930.0：v10验收基线已在当前主机观察普通首页、既有长dot、启停/切换、GUI退出与真文档重建；干净VM在本人安装官方C++运行库后，观察既有长dot和一问一答普通短会话、图形退出及桌面快捷方式重开。真空/短dot、VM卸载重装未测试。
这些是文档更新前v10程序基线的实测范围；最终发布安装器将另行构建和校验，不以旧包哈希冒充最终下载文件。只登记精确宿主版本，不承诺未来版本稳定兼容。

安装位置：%LOCALAPPDATA%\Programs\SilverScaleAtelierManager。
设置实际物理位置：%LOCALAPPDATA%\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\SilverScaleAtelierManager。
theme-preference.json 为主题偏好，packs/selection.json 为形象选择，manager-ui.json 为显示语言偏好。重置或卸载官方宿主可能影响其 LocalCache。

安装、权限、安全、签名状态、素材授权与反馈须知集中见同目录《用户须知.txt》。代码许可见 LICENSE.txt；第三方组件索引见 THIRD-PARTY.txt。
