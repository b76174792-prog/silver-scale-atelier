# 构建银鳞书庭 1.0.0-beta.1

使用 Windows x64、PowerShell 7、Windows .NET Framework 4.8 编译器，以及 `dependencies.lock.json` 固定的 Node 24.21.0 Windows x64 完整目录（含 LICENSE）和 Inno Setup 6.7.3。固定主题校验器及许可位于 `vendor`。没有 npm 依赖，也不会自动安装或下载工具。

在隔离的源码副本中运行以下命令；Build/Verify 会重建副本内的 stage，不应在存有待保留 stage 的旧工作目录执行。

```powershell
./Build.ps1 -NodeDirectory <Node完整目录的绝对路径> -Iscc <ISCC.exe绝对路径>
./Verify.ps1 -NodeDirectory <同一Node目录> -Iscc <同一ISCC.exe>
```

Build 校验锁定哈希，编译管理器、身份/启动帮助程序及 PackTool，复制显式载荷和 26 个已批准项目资源，执行 Node 策略测试与载荷哈希/白名单验证，最后生成 Inno 安装器。Verify 会再次构建，执行原生 self-test 及隔离 Windows GUI 退出测试；因此最终产物验收期间不要无故重复 Verify。

输出为 `dist/SilverScaleAtelier-1.0.0-beta.1-x64-Setup.exe`，文件清单为 `package-manifest.json`。对外版本是 1.0.0-beta.1，Windows 数值版本为 1.0.0.1。每次产品文件变化都需要新构建身份与受影响验证；不能把旧包的哈希或回执改名复用。

浏览器回归使用已有 Chromium 浏览器并建立一次性的隔离资料目录：

```powershell
./scripts/Verify-Renderer.ps1 -Browser <Chrome绝对路径> -OutputDirectory <证据目录绝对路径>
```

合成 DOM、单元测试和本地 GUI 测试辅助回归，不能替代真实官方宿主的普通/dot 独立验收及同安装包的干净 Windows 安装使用结果。准确兼容状态见 README 矩阵和对应发行记录。

只读取证脚本 `scripts/Inspect-ThemeSurface.mjs` 不进入安装载荷。它分别报告观察是否完成、旧空输入采集门槛及活动结构契约；`observed` 不代表生产兼容验收通过。3930 仍需真实运行证据才能解除生产拒绝。

软件许可与组件索引见 `src/LICENSE.txt`、`src/THIRD-PARTY.txt` 及 `vendor`/`src/upstream` 中的完整许可。面向用户的说明集中于 `src/用户须知.txt`。
