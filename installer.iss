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
Source: "vendor\retheme-theme-validator.exe"; DestName: "silverscale-runtime-probe.exe"; Flags: dontcopy
Source: "stage\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\银鳞书庭 主题管理器"; Filename: "{app}\SilverScaleAtelier.exe"; WorkingDir: "{app}"
Name: "{userdesktop}\银鳞书庭 主题管理器"; Filename: "{app}\SilverScaleAtelier.exe"; WorkingDir: "{app}"; Tasks: desktopicon
[Run]
Filename: "{app}\SilverScaleAtelier.exe"; Description: "启动银鳞书庭主题管理器"; Flags: nowait postinstall skipifsilent
[Code]
const
  VCRedistURL = 'https://download.visualstudio.microsoft.com/download/pr/ebdab8e5-1d7b-4d9f-a11b-cbb1720c3b12/843068991DAAA1F73AD9F6239BCE4D0F6A07A51F18C37EA2A867E9BECA71295C/VC_redist.x64.exe';
  VCRedistSHA256 = '843068991daaa1f73ad9f6239bce4d0f6a07a51f18c37ea2a867e9beca71295c';
  ValidatorSHA256 = '7046378574bad1e3170cde506afa7b925fec95979ec8083968e9ebe83c634b75';
var
  RuntimeDownloadPage: TDownloadWizardPage;
  RuntimeRestartRequired: Boolean;

procedure InitializeWizard();
begin
  RuntimeDownloadPage := CreateDownloadPage('安装 Microsoft 运行库', '正在从 Microsoft 下载并校验 x64 Visual C++ 运行库。', nil);
end;

function ValidatorLoaderReady(): Boolean;
var Code, I: Integer; Probe, Text: String; Output: TExecOutput;
begin
  Result := False;
  { Do not launch a known missing-DLL process: Windows could show a modal loader error. }
  { In 64-bit install mode, Inno's FileExists disables WOW64 redirection. }
  if not FileExists(ExpandConstant('{sys}\VCRUNTIME140.dll')) then begin
    Log('x64 VCRUNTIME140.dll is absent'); exit;
  end;
  try
    ExtractTemporaryFile('silverscale-runtime-probe.exe');
    Probe := ExpandConstant('{tmp}\silverscale-runtime-probe.exe');
    if CompareText(GetSHA256OfFile(Probe), ValidatorSHA256) <> 0 then begin
      Log('Validator probe hash mismatch'); exit;
    end;
    if not ExecAndCaptureOutput(Probe, '--help', ExpandConstant('{tmp}'), SW_HIDE, ewWaitUntilTerminated, Code, Output) then begin
      Log('Validator loader could not start: ' + IntToStr(Code)); exit;
    end;
    Log('Validator loader probe exit: ' + IntToStr(Code));
    if (Code <> 2) or Output.Error then exit;
    Text := '';
    for I := 0 to GetArrayLength(Output.StdOut) - 1 do Text := Text + Output.StdOut[I];
    Result := (Pos('"ok":false', Text) > 0) and (Pos('"code":"usage"', Text) > 0);
    { Usage proves executable loading only, never acceptance of a theme. }
  except
    Log('Validator loader probe error: ' + GetExceptionMessage);
  end;
end;

function EnsureVCRuntime(var NeedsRestart: Boolean): String;
var Code: Integer; Redist: String;
begin
  Result := '';
  if RuntimeRestartRequired then begin
    NeedsRestart := True; Result := 'Microsoft 运行库需要重启。请保存工作并自行重启 Windows，然后重新运行本安装程序。'; exit;
  end;
  if ValidatorLoaderReady() then exit;
  if WizardSilent() then begin
    Result := '缺少可用的 x64 Visual C++ 运行库。静默安装已停止且未联网；请以图形方式重新安装或先安装 Microsoft 官方运行库。'; exit;
  end;
  if MsgBox('主题校验器需要 Microsoft Visual C++ x64 运行库。是否从 Microsoft 下载并打开官方安装程序？' + #13#10 + '您将自行查看许可并确认 Windows 权限提示；不会自动重启。取消将停止本次安装，旧管理器和官方客户端不会被关闭。', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) <> IDYES then begin
    Result := '运行库安装已取消。旧管理器未停止；准备好后可重新运行安装程序。'; exit;
  end;
  try
    RuntimeDownloadPage.Clear;
    RuntimeDownloadPage.Add(VCRedistURL, 'VC_redist.x64.exe', VCRedistSHA256);
    RuntimeDownloadPage.Show;
    try
      RuntimeDownloadPage.Download;
    finally
      RuntimeDownloadPage.Hide;
    end;
    Redist := ExpandConstant('{tmp}\VC_redist.x64.exe');
    if CompareText(GetSHA256OfFile(Redist), VCRedistSHA256) <> 0 then begin
      Result := 'Microsoft 运行库校验失败，未执行。请重试下载。'; exit;
    end;
    if not Exec(Redist, '/install /norestart', ExpandConstant('{tmp}'), SW_SHOWNORMAL, ewWaitUntilTerminated, Code) then begin
      Result := '无法启动 Microsoft 运行库安装程序：' + SysErrorMessage(Code) + '。请重试；旧管理器未停止。'; exit;
    end;
    Log('Microsoft VC runtime installer exit: ' + IntToStr(Code));
    if (Code = 3010) or (Code = 1641) then begin
      RuntimeRestartRequired := True; NeedsRestart := True;
      Result := 'Microsoft 运行库要求重启。请保存工作并自行重启 Windows，然后重新运行本安装程序。'; exit;
    end;
    if (Code <> 0) and (Code <> 1638) then begin
      Result := 'Microsoft 运行库安装未完成或已取消（代码 ' + IntToStr(Code) + '）。请完成官方运行库安装后重试；旧管理器未停止。'; exit;
    end;
    if not ValidatorLoaderReady() then
      Result := '运行库安装后，主题校验器仍无法正常启动。本次安装已停止；请检查安装日志或重启 Windows 后重试。';
  except
    Result := '运行库下载、校验或安装未完成：' + GetExceptionMessage + '。请检查网络或取消状态后重试；旧管理器未停止。';
    Log(Result);
  end;
end;

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
  Result := EnsureVCRuntime(NeedsRestart);
  if Result <> '' then exit;
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
