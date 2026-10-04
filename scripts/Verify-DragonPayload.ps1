param([Parameter(Mandatory=$true)][string]$StageDirectory,[Parameter(Mandatory=$true)][string]$ManifestPath,[Parameter(Mandatory=$true)][string]$AssetManifestPath)
$ErrorActionPreference='Stop'
function Assert-NoLink([string]$Path){
 $current=[IO.Path]::GetFullPath($Path)
 while($current){if((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw ('Payload link refused: '+$current)};$parent=[IO.Path]::GetDirectoryName($current);if($parent -eq $current){break};$current=$parent}
}
function Relative-Path([string]$Value){
 $badSegments=@($Value.Split([char[]]'\/') | Where-Object {$_ -eq '..' -or $_ -eq '.' -or $_ -eq '' -or $_ -match '[. ]$'})
 if(!$Value -or [IO.Path]::IsPathRooted($Value) -or $Value.Contains(':') -or $badSegments.Count){throw 'Invalid payload path'}
 return $Value.Replace('/','\')
}
if(![IO.Path]::IsPathRooted($StageDirectory)){throw 'Stage directory must be absolute'}
$root=[IO.Path]::GetFullPath($StageDirectory).TrimEnd('\');Assert-NoLink $root;Assert-NoLink $ManifestPath;Assert-NoLink $AssetManifestPath
$runtime=@('ui-locale.mjs','display-messages.mjs','localization.mjs','first-release.mjs','compatibility.mjs','host-support.mjs','surface-contract.mjs','cleanup.mjs','lifecycle.mjs','operation.mjs','native.mjs','config-state.mjs','packs.mjs','pack-switch.mjs','character-state.mjs','character-runtime.mjs','character.css','atelier-elements.css','deployment-layout.css','environment.mjs','input-contrast.css','manager.mjs','paths.mjs','policy.mjs','portable-policy.mjs','probe.mjs','recovery.mjs','semantic-surfaces.css','theme-controller.mjs','theme-host.mjs','theme-runtime.mjs')
$allowed=@('SilverScaleAtelier.exe','bin\node.exe','bin\ActivationHost.exe','bin\PackTool.exe','bin\retheme-theme-validator.exe','upstream\codex.rs','upstream\LICENSE-ReTheme.txt','licenses\LICENSE-Node.txt','licenses\LICENSE-ReTheme.txt','licenses\LICENSE-Inno.txt','README.txt','用户须知.txt','LICENSE.txt','THIRD-PARTY.txt')+@($runtime | ForEach-Object {'runtime\'+$_})
$allowed+=@('catalogue.json','zh-CN.json','en.json','es.json','fr.json','ar.json','ru.json') | ForEach-Object {'localization\'+$_}
$assets=Get-Content -LiteralPath $AssetManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if($assets.schemaVersion -ne 1 -or $assets.characterId -ne 'local.astra.original' -or !$assets.files){throw 'Invalid dragon asset manifest'}
$assetNames=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach($asset in $assets.files){
 $relative=Relative-Path $asset.file
 if($asset.file -notmatch '^(pack\.json|avatar\.webp|environment/l[123]-v3\.png|themes/astra-(day|night|focus)/(manifest\.json|styles/[a-zA-Z0-9_-]+\.css|assets/[a-zA-Z0-9_-]+\.(png|webp|svg)))$' -or !$assetNames.Add($relative)){throw 'Asset whitelist or duplicate invalid'}
 $allowed+='resources\dragon-v1\'+$relative
}
$allowed+=@('resources\dragon-v1\asset-manifest.json','resources\dragon-v1\PROVENANCE.md')
$rows=@(Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json)
if($rows.Count -ne $allowed.Count){throw 'Payload manifest count mismatch'}
$seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach($row in $rows){
 $relative=Relative-Path $row.file
 if($allowed -notcontains $relative -or !$seen.Add($relative)){throw ('Payload whitelist or duplicate invalid: '+$relative)}
 $file=Join-Path $root $relative;Assert-NoLink $file
 $info=Get-Item -LiteralPath $file -Force
 if($info.PSIsContainer -or $info.Length -ne $row.size -or $row.sha256 -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower() -ne $row.sha256){throw ('Payload integrity mismatch: '+$relative)}
}
$actual=@(Get-ChildItem -LiteralPath $root -Recurse -Force | ForEach-Object {if($_.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Payload linked entry refused'};if(! $_.PSIsContainer){$_.FullName.Substring($root.Length+1)}})
if($actual.Count -ne $allowed.Count -or @($actual | Where-Object {$allowed -notcontains $_}).Count){throw 'Unexpected or missing payload file'}
foreach($asset in $assets.files){$file=Join-Path $root ('resources\dragon-v1\'+(Relative-Path $asset.file));if((Get-Item -LiteralPath $file).Length -ne $asset.size -or (Get-FileHash -LiteralPath $file).Hash.ToLower() -ne $asset.sha256){throw 'Asset integrity mismatch'}}
Write-Output ('Dragon payload PASS: '+$allowed.Count+' exact files; '+$assets.files.Count+' original resources verified.')
