$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot '.env'
$encryptedPath = "$envPath.gpg"
$gpg = Get-Command gpg -CommandType Application -ErrorAction SilentlyContinue
$gpgPath = if ($gpg) { $gpg.Source } else { Join-Path $env:ProgramFiles 'GnuPG\bin\gpg.exe' }

if (-not (Test-Path $gpgPath)) {
    throw 'GPG was not found. Install GPG, then run this script again.'
}

if (Test-Path $encryptedPath) {
    throw '.env.gpg already exists. Move or remove it before creating a new encrypted file.'
}

function Read-IntegrationValue {
    param([Parameter(Mandatory = $true)][string]$Name)

    while ($true) {
        $secureValue = Read-Host -Prompt $Name -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
        try {
            $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        }
        finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
            $secureValue.Dispose()
        }

        if ([string]::IsNullOrWhiteSpace($value)) {
            Write-Warning "$Name cannot be blank."
            continue
        }

        if ($value -match '[\r\n]') {
            Write-Warning "$Name cannot contain a newline."
            continue
        }

        return $value
    }
}

$names = @(
    'DATABASE_URL',
    'DATABASE_AUTH_TOKEN',
    'OPS_TOKEN',
    'BLING_CLIENT_ID',
    'BLING_CLIENT_SECRET',
    'MERCADOPAGO_PUBLIC_KEY',
    'MERCADOPAGO_ACCESS_TOKEN',
    'MERCADOPAGO_WEBHOOK_SECRET',
    'RESEND_API_KEY',
    'EMAIL_FROM'
)

$values = [ordered]@{}
foreach ($name in $names) {
    $values[$name] = Read-IntegrationValue -Name $name
}

$lines = New-Object System.Collections.ArrayList
if (Test-Path $envPath) {
    foreach ($line in [IO.File]::ReadAllLines($envPath)) {
        [void]$lines.Add($line)
    }
}
else {
    $templatePath = Join-Path $repoRoot '.env.template'
    if (Test-Path $templatePath) {
        foreach ($line in [IO.File]::ReadAllLines($templatePath)) {
            [void]$lines.Add($line)
        }
    }
}

foreach ($name in $names) {
    $matchingIndices = @()
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match ('^\s*' + [regex]::Escape($name) + '\s*=')) {
            $matchingIndices += $index
        }
    }

    if ($matchingIndices.Count -gt 1) {
        throw "The .env file contains duplicate entries for $name. Resolve them before running this script."
    }

    $escapedValue = $values[$name].Replace('\', '\\').Replace('"', '\"')
    $entry = "$name=`"$escapedValue`""
    if ($matchingIndices.Count -eq 1) {
        $lines[$matchingIndices[0]] = $entry
    }
    else {
        [void]$lines.Add($entry)
    }
}

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllLines($envPath, [string[]]$lines, $utf8WithoutBom)

Write-Host 'Encrypting .env with GPG. Enter and confirm a strong passphrase in the GPG prompt.'
& $gpgPath -c $envPath
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $encryptedPath)) {
    throw 'GPG encryption did not complete successfully. The plaintext .env remains local; review it and retry.'
}

Write-Host 'Created .env.gpg. The plaintext .env remains in place for local application use.'
