#define AppVersion "1.0.0-beta.1"
[Setup]
AppId={{8DBD7199-EF69-4E28-A198-EDCF95EE4E59}
AppName=银鳞书庭 主题管理器
AppVersion={#AppVersion}
AppPublisher=Silver-Scale Atelier contributors
AppComments=银鳞书庭公开测试候选
VersionInfoVersion=1.0.0.1
VersionInfoProductTextVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\SilverScaleAtelierManager
DefaultGroupName=银鳞书庭
PrivilegesRequired=lowest
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
MinVersion=10.0.22000
DisableProgramGroupPage=yes
DisableDirPage=no
LicenseFile=src\LICENSE.txt
InfoBeforeFile=src\用户须知.txt
OutputDir=dist
OutputBaseFilename=SilverScaleAtelier-{#AppVersion}-x64-Setup
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
SetupIconFile=src\atelier.ico
UninstallDisplayName=银鳞书庭 主题管理器 {#AppVersion}
UninstallDisplayIcon={app}\SilverScaleAtelier.exe
CloseApplications=no
RestartApplications=no
SetupLogging=yes
[Languages]
Name: english; MessagesFile: compiler:Default.isl
[Tasks]
Name: desktopicon; Description: 创建桌面快捷方式; Flags: unchecked
[Files]
Source: "stage\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\银鳞书庭 主题管理器"; Filename: "{app}\SilverScaleAtelier.exe"; WorkingDir: "{app}"
Name: "{userdesktop}\银鳞书庭 主题管理器"; Filename: "{app}\SilverScaleAtelier.exe"; WorkingDir: "{app}"; Tasks: desktopicon
[Run]
Filename: "{app}\SilverScaleAtelier.exe"; Description: "启动银鳞书庭主题管理器"; Flags: nowait postinstall skipifsilent
[Code]
function StopManager(): Boolean;
var Code: Integer; Exe: String;
begin
  Result := True; Exe := ExpandConstant('{app}\SilverScaleAtelier.exe');
  if FileExists(Exe) then begin
    Result := Exec(Exe, '--shutdown', '', SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0);
    if Result then begin Sleep(6000); Result := not CheckForMutexes('Local\SilverScaleAtelierManagerGUI'); end;
  end;
end;
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if not StopManager() then Result := '无法安全停止旧主题管理器。请先在管理器中完全停止主题连接并退出，再重试。不会结束官方客户端。';
end;
function InitializeUninstall(): Boolean;
var Code: Integer;
begin
  Result := StopManager();
  if not Result then begin MsgBox('主题组件尚未安全退出，已取消卸载；官方客户端没有被结束。', mbError, MB_OK); exit; end;
  if MsgBox('是否同时删除本工具的主题偏好和导入素材？' + #13#10 + '选择“否”可保留供重装使用。独立官方登录资料 ClientProfile 无论如何都会保留。', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then begin
    Result := Exec(ExpandConstant('{app}\SilverScaleAtelier.exe'), '--cleanup', '', SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0);
    if not Result then MsgBox('主题资料清理未确认，已取消卸载。请保留资料并重试。',mbError,MB_OK);
  end;
end;
