# Kompilasi EMS Desktop dengan csc.exe bawaan .NET Framework 4.
#   powershell -ExecutionPolicy Bypass -File desktop\build.ps1
# Hasilnya ditaruh di frontend\public\download supaya ikut tersaji di
# http://<server>:3010/download/EMS-Desktop.exe setelah frontend di-build.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
$outDir = Join-Path $here '..\frontend\public\download'
New-Item -ItemType Directory -Force $outDir | Out-Null
$out = Join-Path $outDir 'EMS-Desktop.exe'

& $csc /nologo /target:winexe /optimize+ /platform:anycpu `
  /win32icon:"$here\ems.ico" `
  /reference:System.Windows.Forms.dll `
  /out:"$out" "$here\EmsDesktop.cs"
if ($LASTEXITCODE -ne 0) { throw "csc gagal ($LASTEXITCODE)" }
Get-Item $out | Select-Object Name, Length, LastWriteTime
