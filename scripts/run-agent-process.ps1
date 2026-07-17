param(
	[Parameter(Mandatory = $true)]
	[string]$ConfigPath
)

$ErrorActionPreference = "Stop"
$config = Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
$arguments = [string[]]$config.arguments
Set-Location -LiteralPath $config.cwd

& $config.command @arguments 1> $config.stdoutPath 2> $config.stderrPath
exit $LASTEXITCODE
