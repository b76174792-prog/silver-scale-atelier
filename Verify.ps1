param([Parameter(Mandatory=$true)][string]$NodeDirectory,[Parameter(Mandatory=$true)][string]$Iscc)
$ErrorActionPreference='Stop'
$base=[IO.Path]::GetFullPath($PSScriptRoot)
& (Join-Path $base 'Build.ps1') -NodeDirectory $NodeDirectory -Iscc $Iscc
if($LASTEXITCODE){throw 'Build or Node tests failed'}
& (Join-Path $base 'stage\bin\ActivationHost.exe') --self-test
if($LASTEXITCODE){throw 'Native helper self test failed'}
# Keep the .NET Framework fixture's nested per-user paths below MAX_PATH even
# when the source checkout itself lives under a long project/workspace path.
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('ss-gui-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$runner=Join-Path $testRoot 'GuiExitTests.exe'
& (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe') /nologo /target:exe /main:GuiExitTests /platform:x64 ('/out:'+$runner) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll (Join-Path $base 'src\Manager.cs') (Join-Path $base 'src\DataPaths.cs') (Join-Path $base 'src\Localization.cs') (Join-Path $base 'src\UiSettings.cs') (Join-Path $base 'src\DiagnosticPresentation.cs') (Join-Path $base 'src\ManagerLayout.cs') (Join-Path $base 'src\ManagerDialogs.cs') (Join-Path $base 'tests\GuiExitTests.cs')
if($LASTEXITCODE){throw 'GUI fixture compilation failed'}
$start=New-Object System.Diagnostics.ProcessStartInfo
$start.FileName=$runner
$start.Arguments='"'+(Join-Path $base 'stage')+'" "'+$testRoot+'"'
$start.UseShellExecute=$false
$start.CreateNoWindow=$true
$start.RedirectStandardOutput=$true
$start.RedirectStandardError=$true
$start.EnvironmentVariables['LOCALAPPDATA']=$testRoot
$process=[Diagnostics.Process]::Start($start)
$stdout=$process.StandardOutput.ReadToEndAsync()
$stderr=$process.StandardError.ReadToEndAsync()
if(-not $process.WaitForExit(60000)){throw ('GUI fixture did not finish; retained PID '+$process.Id+' and evidence at '+$testRoot)}
$stdout.Result | Tee-Object -FilePath (Join-Path $testRoot 'gui-exit.log')
if($process.ExitCode){throw $stderr.Result}
Write-Output ('GUI bitmap and isolated state retained at '+$testRoot)
& (Join-Path $base 'scripts\Verify-DragonPayload.ps1') -StageDirectory (Join-Path $base 'stage') -ManifestPath (Join-Path $base 'package-manifest.json') -AssetManifestPath (Join-Path $base 'assets\dragon-v1\asset-manifest.json')
$installer=Join-Path $base 'dist\SilverScaleAtelier-1.0.0-beta.1-x64-Setup.exe'
Write-Output ('Installer SHA256: '+(Get-FileHash -LiteralPath $installer).Hash.ToLower())
Write-Output ('Package manifest SHA256: '+(Get-FileHash -LiteralPath (Join-Path $base 'package-manifest.json')).Hash.ToLower())
Write-Output ('Installer signature: '+(Get-AuthenticodeSignature -LiteralPath $installer).Status)
Write-Output 'Verification is synthetic/isolated. No real official-client theme cycle or 30-minute soak was performed.'
