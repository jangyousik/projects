$ErrorActionPreference = 'Stop'

$androidDir = Resolve-Path (Join-Path $PSScriptRoot '..\android')
$keystorePath = Join-Path $androidDir 'travelon-upload.jks'
$propertiesPath = Join-Path $androidDir 'keystore.properties'
$keytoolCandidates = @()
if ($env:JAVA_HOME) {
  $keytoolCandidates += Join-Path $env:JAVA_HOME 'bin\keytool.exe'
}
$keytoolCandidates += 'C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe'
$keytoolCandidates = $keytoolCandidates | Where-Object { Test-Path -LiteralPath $_ }

if (-not $keytoolCandidates) {
  throw 'keytool was not found. Please check the Android Studio installation.'
}
if ((Test-Path -LiteralPath $keystorePath) -or (Test-Path -LiteralPath $propertiesPath)) {
  throw 'An upload key or properties file already exists. Nothing was overwritten.'
}

$securePassword = Read-Host 'Enter a password for the TravelOn upload key (save a backup)' -AsSecureString
$credential = [pscredential]::new('travelon-upload', $securePassword)
$plainPassword = $credential.GetNetworkCredential().Password
if ($plainPassword.Length -lt 12) {
  throw 'The password must contain at least 12 characters.'
}

$keytoolPath = [string]($keytoolCandidates | Select-Object -First 1)
& $keytoolPath -genkeypair -v `
  -keystore $keystorePath `
  -alias 'travelon-upload' `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000 `
  -storepass $plainPassword `
  -keypass $plainPassword `
  -dname 'CN=TravelOn, OU=Mobile, O=TravelOn, L=Seoul, ST=Seoul, C=KR'

if ($LASTEXITCODE -ne 0) {
  throw 'Failed to create the upload key.'
}

$propertiesContent = @"
storeFile=travelon-upload.jks
storePassword=$plainPassword
keyAlias=travelon-upload
keyPassword=$plainPassword
"@
[IO.File]::WriteAllText($propertiesPath, $propertiesContent, [Text.UTF8Encoding]::new($false))

$plainPassword = $null
Write-Host ''
Write-Host 'The upload key was created successfully.' -ForegroundColor Green
Write-Host $keystorePath
Write-Host 'Back up the key file and password in separate secure locations.' -ForegroundColor Yellow
