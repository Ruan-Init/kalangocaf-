$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot '.env'
$encryptedPath = "$envPath.gpg"
$gpg = Get-Command gpg -CommandType Application -ErrorAction SilentlyContinue
$gpgPath = if ($gpg) { $gpg.Source } else { Join-Path $env:ProgramFiles 'GnuPG\bin\gpg.exe' }

if (-not (Test-Path $gpgPath)) {
    throw 'GPG was not found. Install GPG, then run this script again.'
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

        if ($Name -eq 'MERCADOPAGO_SELLER_ID' -and $value -notmatch '^\d+$') {
            Write-Warning 'MERCADOPAGO_SELLER_ID must contain only digits.'
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
    'MERCADOPAGO_SELLER_ID',
    'MERCADOPAGO_WEBHOOK_SECRET',
    'RESEND_API_KEY',
    'EMAIL_FROM'
)

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

$indicesByName = @{}
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

    $indicesByName[$name] = if ($matchingIndices.Count -eq 1) { $matchingIndices[0] } else { -1 }
}

$values = [ordered]@{}
foreach ($name in $names) {
    $index = $indicesByName[$name]
    if ($index -ge 0) {
        $existingValue = ($lines[$index] -replace '^\s*[^=]+\s*=\s*', '').Trim().Trim('"').Trim("'")
        if (-not [string]::IsNullOrWhiteSpace($existingValue)) {
            if ($name -eq 'MERCADOPAGO_SELLER_ID' -and $existingValue -notmatch '^\d+$') {
                throw 'MERCADOPAGO_SELLER_ID in .env must contain only digits.'
            }
            continue
        }
    }

    $value = Read-IntegrationValue -Name $name
    $values[$name] = $value
    $escapedValue = $value.Replace('\', '\\').Replace('"', '\"')
    $entry = "$name=`"$escapedValue`""
    if ($index -ge 0) {
        $lines[$index] = $entry
    }
    else {
        [void]$lines.Add($entry)
        $indicesByName[$name] = $lines.Count - 1
    }
}

$orderSecretIndices = @()
for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match '^\s*ORDER_ACCESS_SECRET\s*=') {
        $orderSecretIndices += $index
    }
}
if ($orderSecretIndices.Count -gt 1) {
    throw 'The .env file contains duplicate entries for ORDER_ACCESS_SECRET. Resolve them before running this script.'
}

$orderSecretIndex = if ($orderSecretIndices.Count -eq 1) { $orderSecretIndices[0] } else { -1 }
$existingOrderSecret = if ($orderSecretIndex -ge 0) {
    ($lines[$orderSecretIndex] -replace '^\s*ORDER_ACCESS_SECRET\s*=\s*', '').Trim().Trim('"').Trim("'")
}
else {
    ''
}

if ($existingOrderSecret.Length -lt 32) {
    $randomBytes = New-Object byte[] 32
    $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $randomGenerator.GetBytes($randomBytes)
        $orderSecret = [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    }
    finally {
        [Array]::Clear($randomBytes, 0, $randomBytes.Length)
        $randomGenerator.Dispose()
    }

    $entry = "ORDER_ACCESS_SECRET=`"$orderSecret`""
    if ($orderSecretIndex -ge 0) {
        $lines[$orderSecretIndex] = $entry
    }
    else {
        [void]$lines.Add($entry)
    }
    Write-Host 'Generated ORDER_ACCESS_SECRET locally.'
}

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllLines($envPath, [string[]]$lines, $utf8WithoutBom)

if (Test-Path $encryptedPath) {
    Write-Host 'The existing .env.gpg will be replaced after successful encryption.'
}

$temporaryEncryptedPath = Join-Path $repoRoot ".env.$([guid]::NewGuid().ToString('N')).gpg.tmp"
try {
    Write-Host 'Encrypting .env with GPG. Enter and confirm a strong passphrase in the GPG prompt.'
    & $gpgPath --output $temporaryEncryptedPath -c $envPath
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $temporaryEncryptedPath)) {
        throw 'GPG encryption did not complete successfully. The plaintext .env remains local; review it and retry.'
    }

    Move-Item -LiteralPath $temporaryEncryptedPath -Destination $encryptedPath -Force
}
finally {
    if (Test-Path $temporaryEncryptedPath) {
        Remove-Item -LiteralPath $temporaryEncryptedPath
    }
}

Write-Host 'Updated .env.gpg. The plaintext .env remains in place for local application use.'
