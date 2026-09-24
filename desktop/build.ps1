# Kompilasi EMS Desktop dengan csc.exe bawaan .NET Framework 4.
#   powershell -ExecutionPolicy Bypass -File desktop\build.ps1
#
# TIDAK DISAJIKAN DI WEBSITE. Windows 11 dengan Smart App Control memblokir exe
# yang tidak bertanda tangan kode tanpa pilihan "Run anyway" (dicoba 24 Sep 2026
# di laptop user). Jalur resmi sekarang adalah "Install this site as an app" di
# Edge/Chrome, yang memakai manifest.json dan ikon di frontend/public.
# Peluncur ini baru layak dibagikan setelah ditandatangani dengan sertifikat
# code signing perusahaan (signtool sign /fd SHA256 ...).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
$outDir = Join-Path $here 'bin'
New-Item -ItemType Directory -Force $outDir | Out-Null
$out = Join-Path $outDir 'EMS-Desktop.exe'

& $csc /nologo /target:winexe /optimize+ /platform:anycpu `
  /win32icon:"$here\ems.ico" `
  /reference:System.Windows.Forms.dll `
  /out:"$out" "$here\EmsDesktop.cs"
if ($LASTEXITCODE -ne 0) { throw "csc gagal ($LASTEXITCODE)" }
Get-Item $out | Select-Object Name, Length, LastWriteTime
