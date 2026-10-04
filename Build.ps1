param([Parameter(Mandatory=$true)][string]$NodeDirectory,[Parameter(Mandatory=$true)][string]$Iscc)
$ErrorActionPreference='Stop'
$base=[IO.Path]::GetFullPath($PSScriptRoot)
$locked=Get-Content -LiteralPath (Join-Path $base 'dependencies.lock.json') -Raw | ConvertFrom-Json
$node=Join-Path $NodeDirectory 'node.exe'
if((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLower() -ne $locked.node.exeSha256){throw 'Node binary does not match dependency lock'}
$validator=Join-Path $base 'vendor\retheme-theme-validator.exe'
if((Get-FileHash -LiteralPath $validator -Algorithm SHA256).Hash.ToLower() -ne $locked.validator.sha256){throw 'Validator hash mismatch'}
& $node (Join-Path $base 'src\runtime\localization.mjs') (Join-Path $base 'src\localization')
if($LASTEXITCODE){throw 'Six-language catalogue validation failed'}
$stage=Join-Path $base 'stage'
if(Test-Path -LiteralPath $stage){
 if([IO.Path]::GetFullPath($stage) -ne (Join-Path $base 'stage')){throw 'Invalid stage root'}
 if((Get-Item -LiteralPath $stage).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Stage is a link'}
 Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Path $stage,(Join-Path $stage 'bin'),(Join-Path $stage 'runtime'),(Join-Path $stage 'upstream'),(Join-Path $stage 'licenses') | Out-Null
$csc=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /nologo /target:winexe /platform:x64 ('/out:'+(Join-Path $stage 'SilverScaleAtelier.exe')) ('/win32icon:'+(Join-Path $base 'src\atelier.ico')) /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll (Join-Path $base 'src\Manager.cs') (Join-Path $base 'src\DataPaths.cs') (Join-Path $base 'src\Localization.cs') (Join-Path $base 'src\UiSettings.cs') (Join-Path $base 'src\DiagnosticPresentation.cs') (Join-Path $base 'src\ManagerLayout.cs') (Join-Path $base 'src\ManagerDialogs.cs')
if($LASTEXITCODE){throw 'Manager build failed'}
& $csc /nologo /target:exe /platform:x64 ('/out:'+(Join-Path $stage 'bin\ActivationHost.exe')) /r:System.Management.dll /r:System.Web.Extensions.dll (Join-Path $base 'src\ActivationHost.cs') (Join-Path $base 'src\NativeLease.cs') (Join-Path $base 'src\DataPaths.cs')
if($LASTEXITCODE){throw 'Activation helper build failed'}
& $csc /nologo /target:exe /platform:x64 ('/out:'+(Join-Path $stage 'bin\PackTool.exe')) /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll (Join-Path $base 'src\PackTool.cs')
if($LASTEXITCODE){throw 'Resource importer build failed'}
$runtime=@('ui-locale.mjs','display-messages.mjs','localization.mjs','first-release.mjs','compatibility.mjs','host-support.mjs','surface-contract.mjs','cleanup.mjs','lifecycle.mjs','operation.mjs','native.mjs','config-state.mjs','packs.mjs','pack-switch.mjs','character-state.mjs','character-runtime.mjs','character.css','atelier-elements.css','deployment-layout.css','environment.mjs','input-contrast.css','manager.mjs','paths.mjs','policy.mjs','portable-policy.mjs','probe.mjs','recovery.mjs','semantic-surfaces.css','theme-controller.mjs','theme-host.mjs','theme-runtime.mjs')
foreach($file in $runtime){Copy-Item -LiteralPath (Join-Path $base ('src\runtime\'+$file)) -Destination (Join-Path $stage ('runtime\'+$file))}
$localization=@('catalogue.json','zh-CN.json','en.json','es.json','fr.json','ar.json','ru.json')
New-Item -ItemType Directory -Path (Join-Path $stage 'localization') | Out-Null
foreach($file in $localization){Copy-Item -LiteralPath (Join-Path $base ('src\localization\'+$file)) -Destination (Join-Path $stage ('localization\'+$file))}
Copy-Item -LiteralPath $node -Destination (Join-Path $stage 'bin\node.exe')
Copy-Item -LiteralPath $validator -Destination (Join-Path $stage 'bin\retheme-theme-validator.exe')
Copy-Item -LiteralPath (Join-Path $NodeDirectory 'LICENSE') -Destination (Join-Path $stage 'licenses\LICENSE-Node.txt')
foreach($file in @('LICENSE-ReTheme.txt','LICENSE-Inno.txt')){Copy-Item -LiteralPath (Join-Path $base ('vendor\'+$file)) -Destination (Join-Path $stage ('licenses\'+$file))}
foreach($file in @('codex.rs','LICENSE-ReTheme.txt')){Copy-Item -LiteralPath (Join-Path $base ('src\upstream\'+$file)) -Destination (Join-Path $stage ('upstream\'+$file))}
foreach($file in @('README.txt','用户须知.txt','LICENSE.txt','THIRD-PARTY.txt')){Copy-Item -LiteralPath (Join-Path $base ('src\'+$file)) -Destination (Join-Path $stage $file)}
$assetManifest=Get-Content -LiteralPath (Join-Path $base 'assets\dragon-v1\asset-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$assetAllowed=@()
foreach($item in $assetManifest.files){
 if($item.file -match '(^|[\\/])\.\.([\\/]|$)' -or [IO.Path]::IsPathRooted($item.file)){throw 'Asset path refused'}
 $source=Join-Path $base ('assets\dragon-v1\resources\'+$item.file)
 if((Get-Item -LiteralPath $source).Length -ne $item.size -or (Get-FileHash -LiteralPath $source).Hash.ToLower() -ne $item.sha256){throw ('Asset integrity mismatch: '+$item.file)}
 $relative='resources\dragon-v1\'+$item.file.Replace('/','\');$target=Join-Path $stage $relative
 New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
 Copy-Item -LiteralPath $source -Destination $target;$assetAllowed+=$relative
}
foreach($name in @('asset-manifest.json','PROVENANCE.md')){Copy-Item -LiteralPath (Join-Path $base ('assets\dragon-v1\'+$name)) -Destination (Join-Path $stage ('resources\dragon-v1\'+$name));$assetAllowed+='resources\dragon-v1\'+$name}
$allowed=@('SilverScaleAtelier.exe','bin\node.exe','bin\ActivationHost.exe','bin\PackTool.exe','bin\retheme-theme-validator.exe','upstream\codex.rs','upstream\LICENSE-ReTheme.txt','licenses\LICENSE-Node.txt','licenses\LICENSE-ReTheme.txt','licenses\LICENSE-Inno.txt','README.txt','用户须知.txt','LICENSE.txt','THIRD-PARTY.txt')+@($runtime | ForEach-Object {'runtime\'+$_})
$allowed+=$assetAllowed
$allowed+=@($localization | ForEach-Object {'localization\'+$_})
$manifest=@(Get-ChildItem -LiteralPath $stage -File -Recurse | ForEach-Object {
 $rel=$_.FullName.Substring($stage.Length+1)
 if($allowed -notcontains $rel){throw ('Unexpected package file: '+$rel)}
 [pscustomobject]@{file=$rel;size=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName).Hash.ToLower()}
})
if($manifest.Count -ne $allowed.Count){throw 'Missing package files'}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $base 'package-manifest.json') -Encoding UTF8
New-Item -ItemType Directory -Path (Join-Path $base 'src\bin') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $stage 'bin\PackTool.exe') -Destination (Join-Path $base 'src\bin\PackTool.exe')
Copy-Item -LiteralPath (Join-Path $stage 'bin\ActivationHost.exe') -Destination (Join-Path $base 'src\bin\ActivationHost.exe')
Copy-Item -LiteralPath (Join-Path $stage 'bin\retheme-theme-validator.exe') -Destination (Join-Path $base 'src\bin\retheme-theme-validator.exe')
New-Item -ItemType Directory -Path (Join-Path $base 'src\resources') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $stage 'resources\dragon-v1') -Destination (Join-Path $base 'src\resources') -Recurse -Force
$nodeTests=@(Get-ChildItem -LiteralPath (Join-Path $base 'tests') -Filter '*.test.mjs' | ForEach-Object FullName)
& $node --test @nodeTests
if($LASTEXITCODE){throw 'Policy tests failed'}
& (Join-Path $base 'scripts\Verify-DragonPayload.ps1') -StageDirectory $stage -ManifestPath (Join-Path $base 'package-manifest.json') -AssetManifestPath (Join-Path $base 'assets\dragon-v1\asset-manifest.json')
& $Iscc /Q (Join-Path $base 'installer.iss')
if($LASTEXITCODE){throw 'Installer build failed'}
Write-Output ('Beta candidate built from explicit '+$allowed.Count+'-file allowlist; acceptance is recorded separately.')
