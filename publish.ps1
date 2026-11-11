# 꼬미입시(PHGC) 자동 빌드 & 릴리즈 & 푸시 스크립트
# - GitHub (github.com/purnpado/kkomi_ipsi, 옛 이름 PHGC): 공개 배포 저장소 (kkomi-ipsi.exe·zip 자동 업로드)
#   GitHub는 릴리즈 파일 이름의 한글을 바꿔 버리므로 영문 이름(kkomi-ipsi)으로 올린다.
# - 실행 파일은 v1.6.4부터 꼬미입시.exe (zip 안에도 꼬미입시.exe), Gitea 릴리즈에는 꼬미입시.exe 이름 그대로 올린다.
# - 이 파일은 윈도우 PowerShell 5.1이 한글 경로를 바르게 읽도록 BOM 있는 UTF-8로 저장한다.
# - Gitea (gitea.gguk.link): 내부 소스 백업 및 옵션별 릴리즈 업로드
param (
    [string]$Notes = @"
- 울산공업고 및 특성화고 공식 성적 산출식 정밀화 (학기별 성취도 산출 및 3-1 예체능 감점 합산 오류 수정)
- 비밀번호 재설정 저장 오류 수정 (스코프 참조 버그 해결)
- 학년부장 배포 패키지 파일 비밀번호 인증 및 초기화 지원 강화
- 전체 팝업창(alert/confirm/prompt)의 프리미엄 글래스모피즘 모달 전면 전환
- 진학 상담 대시보드 1:1 프라이버시 상담 모드 (학생 번호/이름 실시간 검색 및 다차원 정렬)
- 대시보드 희망학교 원클릭 즉시 삭제([✕]) 버튼 구현
- WebView2 임시 캐시 경로 단일 고정(PHGC_WebviewData) 및 과거 구버전 잔여 폴더 자동 청소(자가 치유)
- 고교 커트라인 관리 관내 타교 진학자료(.phgcdata) 다중 파일 동시 선택 및 일괄 병합 보강
"@.Trim(),
    [string]$Version = "1.6.1",
    [switch]$SkipBindings,       # (Wails v3에서는 사용하지 않음: wails3 build 가 바인딩을 항상 다시 생성)
    [switch]$SkipGitHubRelease,  # GitHub 릴리즈 바이너리 업로드를 건너뛸 때 사용
    [switch]$UploadGiteaRelease  # Gitea에도 바이너리 릴리즈 업로드할 때 사용
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Git 인코딩 강제 설정 (UTF-8)
git config i18n.commitEncoding utf-8
git config i18n.logOutputEncoding utf-8

# ===== 저장소 설정 =====
$ghOwner = "purnpado"
$ghRepo = "kkomi_ipsi"

$giteaURL = "https://gitea.gguk.link"
$giteaOwner = "purnpadosori"
$giteaRepo = "PHGC-OFFLINE"

$newVer = $Version.TrimStart('v').Trim()

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ">>> 꼬미입시 릴리즈 배포 파이프라인 시작 (v$newVer)" -ForegroundColor Green
Write-Host ">>> 릴리즈 노트: $Notes" -ForegroundColor Yellow
Write-Host ">>> 배포 대상: https://github.com/$ghOwner/$ghRepo/releases" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Cyan

# ===== 1. version.json 및 internal/sync/manager.go 버전 업데이트 =====
$versionFile = "server-data/version.json"
if (Test-Path $versionFile) {
    $json = Get-Content $versionFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $json.latestVersion = $newVer
    $json.releaseNotes = "v$newVer - $Notes"
    $json.downloadUrl = "https://github.com/$ghOwner/$ghRepo/releases/latest/download/kkomi-ipsi.exe"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $jsonString = $json | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText((Resolve-Path $versionFile), $jsonString, $utf8NoBom)
}

$syncFile = "internal/sync/manager.go"
if (Test-Path $syncFile) {
    $syncContent = Get-Content $syncFile -Raw -Encoding UTF8
    $syncContent = $syncContent -replace 'AppVersion = "[^"]+"', "AppVersion = `"$newVer`""
    Set-Content -Path $syncFile -Value $syncContent -Encoding UTF8
}

# Wails v3 제품 정보(build/config.yml)의 버전도 맞춘다. exe 속성(파일 버전)과 맥 Info.plist 에 반영된다.
$buildConfig = "build/config.yml"
if (Test-Path $buildConfig) {
    $cfgText = [System.IO.File]::ReadAllText((Resolve-Path $buildConfig), [System.Text.Encoding]::UTF8)
    $cfgText = [regex]::Replace($cfgText, '(?m)^(  version: )"[^"]*"', ('$1"' + $newVer + '"'))
    [System.IO.File]::WriteAllText((Resolve-Path $buildConfig), $cfgText, (New-Object System.Text.UTF8Encoding($false)))
}

# ===== 2. 실행 중인 PHGC 프로세스 종료 (버전명 실행파일 포함) =====
Get-Process | Where-Object { $_.ProcessName -like "꼬미입시*" -or $_.ProcessName -like "kkomi-ipsi*" -or $_.ProcessName -like "PHGC*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

# ===== 3. Wails v3 빌드 =====
Write-Host ">>> Wails v3 빌드 실행 중..." -ForegroundColor Cyan
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
# 일부 PC에서는 사용자 Go bin 경로가 환경 변수에 즉시 반영되지 않는다.
# 현재 사용자 홈의 기본 Go 설치 경로를 보완해 Wails v3 CLI(wails3)를 안정적으로 찾는다.
$goBin = Join-Path $env:USERPROFILE "go\bin"
if (Test-Path (Join-Path $goBin "wails3.exe")) {
    $env:Path = "$goBin;$env:Path"
}
if (-not (Get-Command wails3 -ErrorAction SilentlyContinue)) {
    Write-Host ">>> wails3 CLI를 찾을 수 없습니다. 설치: go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0" -ForegroundColor Red
    exit 1
}
if ($SkipBindings) {
    Write-Host ">>> [안내] -SkipBindings 는 Wails v3에서 사용하지 않습니다(바인딩은 빌드 때 항상 다시 생성)." -ForegroundColor Yellow
}

# 버전이 바뀐 제품 정보로 exe 파일 정보·매니페스트를 다시 생성한 뒤 빌드한다.
& wails3 task common:update:build-assets
if ($LASTEXITCODE -ne 0) {
    Write-Host ">>> 빌드 자산 갱신 실패!" -ForegroundColor Red
    exit 1
}
# Taskfile.yml 의 windows:build 작업: 프론트엔드 빌드 → 바인딩 생성 → 아이콘·리소스(syso) → go build
# (-tags production -trimpath -ldflags "-w -s -H windowsgui": 개발 PC 경로·디버그 정보 제거)
& wails3 build
if ($LASTEXITCODE -ne 0) {
    Write-Host ">>> Wails 빌드 실패!" -ForegroundColor Red
    exit 1
}

$exePath = "bin\꼬미입시.exe"
if (-not (Test-Path $exePath)) {
    Write-Host ">>> 생성된 exe 파일을 찾을 수 없습니다: $exePath" -ForegroundColor Red
    exit 1
}
Write-Host ">>> 빌드 성공: $exePath" -ForegroundColor Green

# 버전 명시 바이너리 파일명 생성 (예: kkomi-ipsi_v1.6.4.exe, 로컬 보관용)
$versionedExeName = "kkomi-ipsi_v$newVer.exe"
$versionedExePath = "bin\$versionedExeName"
Copy-Item $exePath $versionedExePath -Force
Write-Host ">>> 실행 파일 확인: $exePath" -ForegroundColor Green

# 압축 배포 파일 생성 (kkomi-ipsi_v$newVer.zip, 안에는 꼬미입시.exe)
$zipName = "kkomi-ipsi_v$newVer.zip"
$zipPath = "bin\$zipName"

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Compress-Archive -Path $exePath -DestinationPath $zipPath -Force
Write-Host ">>> 압축 배포 파일 생성 완료 ($zipName)" -ForegroundColor Green

# server-data 및 배포 폴더 복사
Copy-Item $exePath "server-data\꼬미입시.exe" -Force
Copy-Item $zipPath "server-data\$zipName" -Force

$desktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$schoolDir = Join-Path $desktopPath "푸른파도소리중학교"
$testDir = Join-Path $desktopPath "test"
if (Test-Path -LiteralPath $schoolDir) {
    Copy-Item -LiteralPath $exePath -Destination (Join-Path $schoolDir "꼬미입시.exe") -Force -ErrorAction SilentlyContinue
}
if (Test-Path -LiteralPath $testDir) {
    Copy-Item -LiteralPath $exePath -Destination (Join-Path $testDir "꼬미입시.exe") -Force -ErrorAction SilentlyContinue
}
Write-Host ">>> server-data 및 로컬 배포 폴더 복사 완료" -ForegroundColor Green

# ===== 4. Git 커밋 & 태그 & 푸시 =====
Write-Host ">>> Git 커밋 및 GitHub/Gitea 양방향 푸시 중..." -ForegroundColor Cyan

$firstLineSummary = ($Notes -split "\r?\n")[0].TrimStart('-* ').Trim()
$releaseTitle = "v$newVer - $firstLineSummary 등 주요 기능 개선"
$commonReleaseBody = @"
## 🌟 v$newVer 릴리즈 안내

### 📋 주요 개선 사항
$Notes

### 📥 다운로드 안내
- **압축 배포 파일(권장)**: 아래 Assets 항목의 **$zipName**을 내려받아 압축을 풀면 **꼬미입시.exe**가 나옵니다.
- **단독 실행 파일**: GitHub에서는 **kkomi-ipsi.exe**, Gitea에서는 **꼬미입시.exe**입니다. 내려받은 뒤 이름을 꼬미입시.exe로 바꿔 쓰셔도 됩니다.
- 본 프로그램은 학생 개인정보 보호 및 학교 정보보안 지침을 철저히 준수하는 100% 로컬 독립형 소프트웨어입니다.
"@

$commitMsgFile = Join-Path $PWD ".git\temp_commit_msg.txt"
$commitText = @"
release: v$newVer

$Notes

GitHub 공식 릴리즈: https://github.com/$ghOwner/$ghRepo/releases/tag/v$newVer
"@
[System.IO.File]::WriteAllText($commitMsgFile, $commitText, (New-Object System.Text.UTF8Encoding($false)))

git add -A
git commit -F "$commitMsgFile" -q 2>$null
if (git tag -l "v$newVer") {
    git tag -d "v$newVer" > $null 2>&1
}
$tagMsgFile = Join-Path $PWD ".git\temp_tag_msg.txt"
[System.IO.File]::WriteAllText($tagMsgFile, $commonReleaseBody, (New-Object System.Text.UTF8Encoding($false)))
git tag -a "v$newVer" -F "$tagMsgFile" -f
Remove-Item $commitMsgFile -Force -ErrorAction SilentlyContinue
Remove-Item $tagMsgFile -Force -ErrorAction SilentlyContinue

# 4-1. GitHub 푸시 (메인 브랜치 및 태그)
try {
    Write-Host ">>> GitHub (github.com) 푸시 중..." -ForegroundColor Cyan
    git push github main -f
    git push github "v$newVer" -f
    Write-Host ">>> GitHub 푸시 완료!" -ForegroundColor Green
} catch {
    Write-Host ">>> GitHub 푸시 예외: $_" -ForegroundColor Yellow
}

# 4-2. Gitea 백업 푸시
try {
    Write-Host ">>> Gitea (gitea.gguk.link) 백업 푸시 중..." -ForegroundColor Cyan
    git push gitea main -f
    git push gitea "v$newVer" -f
    Write-Host ">>> Gitea 푸시 완료!" -ForegroundColor Green
} catch {
    Write-Host ">>> Gitea 푸시 예외: $_" -ForegroundColor Yellow
}

# ===== 5. GitHub 릴리즈 생성 및 kkomi-ipsi.exe·zip 에셋 업로드 =====
if (-not $SkipGitHubRelease) {
    Write-Host ">>> GitHub Releases (v$newVer) 등록 및 바이너리 업로드 시작..." -ForegroundColor Cyan
    try {
        # Git 자격 증명 관리자에서 github.com 토큰 획득 (화면 출력 없이 내부 변수 사용)
        $procInfo = New-Object System.Diagnostics.ProcessStartInfo
        $procInfo.FileName = "git.exe"
        $procInfo.Arguments = "credential fill"
        $procInfo.RedirectStandardInput = $true
        $procInfo.RedirectStandardOutput = $true
        $procInfo.UseShellExecute = $false
        $p = [System.Diagnostics.Process]::Start($procInfo)
        $p.StandardInput.WriteLine("protocol=https")
        $p.StandardInput.WriteLine("host=github.com")
        $p.StandardInput.WriteLine("")
        $p.StandardInput.Close()
        $credOutput = $p.StandardOutput.ReadToEnd()
        $p.WaitForExit()

        if ($credOutput -match "password=([^\r\n]+)") {
            $ghToken = $matches[1].Trim()
            $headers = @{
                "Authorization"        = "Bearer $ghToken"
                "Accept"               = "application/vnd.github+json"
                "X-GitHub-Api-Version" = "2022-11-28"
                "User-Agent"           = "PHGC-Publisher"
            }

            # 기존 릴리즈 확인 후 필요 시 갱신
            $existing = $null
            try {
                $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$ghOwner/$ghRepo/releases/tags/v$newVer" -Headers $headers -Method Get -ErrorAction Stop
            } catch {}

            if ($existing -and $existing.id) {
                Invoke-RestMethod -Uri "https://api.github.com/repos/$ghOwner/$ghRepo/releases/$($existing.id)" -Headers $headers -Method Delete -ErrorAction Stop
            }

            $payload = @{
                tag_name         = "v$newVer"
                target_commitish = "main"
                name             = $releaseTitle
                body             = $commonReleaseBody
                draft            = $false
                prerelease       = $false
            } | ConvertTo-Json -Depth 5 -Compress

            $newRel = Invoke-RestMethod -Uri "https://api.github.com/repos/$ghOwner/$ghRepo/releases" -Headers $headers -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) -ContentType "application/json; charset=utf-8"
            $relId = $newRel.id

            # 기존 에셋 삭제 (2종 에셋 유지: kkomi-ipsi.exe & kkomi-ipsi_v버전.zip)
            try {
                $ghAssets = Invoke-RestMethod -Uri "https://api.github.com/repos/$ghOwner/$ghRepo/releases/$relId/assets" -Headers $headers -Method Get -ErrorAction SilentlyContinue
                foreach ($asset in $ghAssets) {
                    Invoke-RestMethod -Uri "https://api.github.com/repos/$ghOwner/$ghRepo/releases/assets/$($asset.id)" -Headers $headers -Method Delete -ErrorAction SilentlyContinue
                }
            } catch {}

            # 1. 실행 파일 업로드 (GitHub는 한글 파일 이름을 바꾸므로 영문 이름 사용)
            $uploadUrl = "https://uploads.github.com/repos/$ghOwner/$ghRepo/releases/$relId/assets?name=kkomi-ipsi.exe"
            $absExe = (Resolve-Path $exePath).Path
            & curl.exe -s -S -X POST "$uploadUrl" `
                -H "Authorization: Bearer $ghToken" `
                -H "Accept: application/vnd.github+json" `
                -H "Content-Type: application/octet-stream" `
                --data-binary "@$absExe" > $null
            Write-Host ">>> GitHub Releases (kkomi-ipsi.exe) 업로드 완료!" -ForegroundColor Green

            # 2. 압축 배포 파일 업로드 (kkomi-ipsi_v버전.zip)
            $uploadUrlZip = "https://uploads.github.com/repos/$ghOwner/$ghRepo/releases/$relId/assets?name=$zipName"
            $absZip = (Resolve-Path $zipPath).Path
            & curl.exe -s -S -X POST "$uploadUrlZip" `
                -H "Authorization: Bearer $ghToken" `
                -H "Accept: application/vnd.github+json" `
                -H "Content-Type: application/zip" `
                --data-binary "@$absZip" > $null
            Write-Host ">>> GitHub Releases ($zipName) 업로드 완료!" -ForegroundColor Green

            Write-Host ">>> GitHub 릴리즈 링크: https://github.com/$ghOwner/$ghRepo/releases/tag/v$newVer" -ForegroundColor Green
        } else {
            Write-Host ">>> [안내] GitHub 자격 증명을 찾을 수 없어 릴리즈 바이너리 업로드는 건너뛰었습니다." -ForegroundColor Yellow
        }
    } catch {
        Write-Host ">>> GitHub 릴리즈 업로드 예외: $_" -ForegroundColor Yellow
    }
}

# ===== 6. Gitea Release 릴리즈 노트 동기화 및 바이너리/압축 에셋 업로드 =====
try {
    Write-Host ">>> Gitea [$giteaRepo] 릴리즈 정보 동기화 중..." -ForegroundColor Cyan
    $procInfoG = New-Object System.Diagnostics.ProcessStartInfo
    $procInfoG.FileName = "git.exe"
    $procInfoG.Arguments = "credential fill"
    $procInfoG.RedirectStandardInput = $true
    $procInfoG.RedirectStandardOutput = $true
    $procInfoG.UseShellExecute = $false
    $pG = [System.Diagnostics.Process]::Start($procInfoG)
    $pG.StandardInput.WriteLine("protocol=https")
    $pG.StandardInput.WriteLine("host=gitea.gguk.link")
    $pG.StandardInput.WriteLine("")
    $pG.StandardInput.Close()
    $credOutputG = $pG.StandardOutput.ReadToEnd()
    $pG.WaitForExit()

    $gUser = ""
    $gPass = ""
    if ($credOutputG -match "username=([^\r\n]+)") { $gUser = $matches[1].Trim() }
    if ($credOutputG -match "password=([^\r\n]+)") { $gPass = $matches[1].Trim() }

    if ($gUser -and $gPass) {
        $basicAuth = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("$($gUser):$($gPass)"))
        $gHeaders = @{
            "Authorization" = "Basic $basicAuth"
            "Content-Type"  = "application/json; charset=utf-8"
        }

        # 태그 기반 Gitea 릴리즈 조회
        $gRelease = $null
        try {
            $gRelease = Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/tags/v$newVer" -Headers $gHeaders -Method Get -ErrorAction Stop
        } catch {}

        $gPayload = @{
            name = $releaseTitle
            body = $commonReleaseBody
        } | ConvertTo-Json -Depth 5 -Compress

        $gRelId = $null
        if ($gRelease -and $gRelease.id) {
            $gRelId = $gRelease.id
            Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/$($gRelease.id)" -Headers $gHeaders -Method Patch -Body ([System.Text.Encoding]::UTF8.GetBytes($gPayload)) > $null
            Write-Host ">>> Gitea 릴리즈 노트 업데이트 완료! (ID: $gRelId)" -ForegroundColor Green
        } else {
            $gCreatePayload = @{
                tag_name = "v$newVer"
                name     = $releaseTitle
                body     = $commonReleaseBody
            } | ConvertTo-Json -Depth 5 -Compress
            $createdRel = Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases" -Headers $gHeaders -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($gCreatePayload))
            $gRelId = $createdRel.id
            Write-Host ">>> Gitea 릴리즈 신규 생성 완료! (ID: $gRelId)" -ForegroundColor Green
        }

        if ($gRelId) {
            # 기존 동일 에셋 삭제 후 신규 업로드 (꼬미입시.exe & kkomi-ipsi_v버전.zip 2종)
            try {
                $existingAssets = Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/$gRelId/assets" -Headers $gHeaders -Method Get -ErrorAction SilentlyContinue
                foreach ($asset in $existingAssets) {
                    Invoke-RestMethod -Uri "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/$gRelId/assets/$($asset.id)" -Headers $gHeaders -Method Delete -ErrorAction SilentlyContinue
                }
            } catch {}

            $absExe = (Resolve-Path $exePath).Path
            $absZip = (Resolve-Path $zipPath).Path

            $giteaExeName = [uri]::EscapeDataString("꼬미입시.exe")
            & curl.exe -s -S -X POST "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/$gRelId/assets?name=$giteaExeName" -H "Authorization: Basic $basicAuth" -F "attachment=@$absExe" > $null
            & curl.exe -s -S -X POST "$giteaURL/api/v1/repos/$giteaOwner/$giteaRepo/releases/$gRelId/assets?name=$zipName" -H "Authorization: Basic $basicAuth" -F "attachment=@$absZip" > $null
            Write-Host ">>> Gitea 바이너리 및 압축 파일 에셋 (꼬미입시.exe, $zipName) 업로드 완료!" -ForegroundColor Green
        }
    }
} catch {
    Write-Host ">>> Gitea 릴리즈 동기화 예외: $_" -ForegroundColor Yellow
}

Write-Host "==========================================" -ForegroundColor Green
Write-Host ">>> 꼬미입시 v$newVer GitHub & Gitea 릴리즈 및 배포 파이프라인 완료!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
