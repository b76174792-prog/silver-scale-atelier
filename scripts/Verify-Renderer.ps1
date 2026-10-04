param([Parameter(Mandatory=$true)][string]$Browser,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$base=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$browserPath=(Resolve-Path -LiteralPath $Browser).Path
$output=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $output -Force | Out-Null
$node=Join-Path $base 'stage\bin\node.exe'
$locked=Get-Content -Raw -LiteralPath (Join-Path $base 'dependencies.lock.json') | ConvertFrom-Json
if((Get-FileHash -LiteralPath $node).Hash.ToLower() -ne $locked.node.exeSha256){throw 'Renderer Node does not match dependency lock'}
$previousBrowser=$env:SILVER_SCALE_TEST_BROWSER;$previousOutput=$env:SILVER_SCALE_RENDER_OUTPUT
try{
 $env:SILVER_SCALE_TEST_BROWSER=$browserPath;$env:SILVER_SCALE_RENDER_OUTPUT=$output
 $tests=@(Get-ChildItem -LiteralPath (Join-Path $base 'tests\renderer') -Filter '*.test.mjs' | ForEach-Object FullName)
 & $node --test --test-concurrency=1 @tests
 if($LASTEXITCODE){throw 'Synthetic renderer verification failed'}
 Write-Output ('Synthetic headless renderer PASS; evidence: '+$output)
}finally{$env:SILVER_SCALE_TEST_BROWSER=$previousBrowser;$env:SILVER_SCALE_RENDER_OUTPUT=$previousOutput}
