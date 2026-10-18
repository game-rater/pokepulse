$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::ThrowException)
$source=[IO.File]::ReadAllText((Join-Path (Get-Location) 'run-bun\pokepulse-overlay.ps1'))
$source=$source.Replace('[System.Windows.Forms.Application]::Run($form)','').Replace('Split-Path -Parent $PSScriptRoot',"(Join-Path (Get-Location) 'dist\Run-and-Bun-Automatic')")
Invoke-Expression $source
function Save-BugReport($source='menu') {$script:reportedSource=$source}
Add-Type @"
using System;using System.Runtime.InteropServices;
public static class ReportProbe {[DllImport("user32.dll")]public static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,IntPtr l);}
"@
try {
 $reportItem.PerformClick()
 if($script:reportedSource -ne 'menu'){throw 'Menu dispatch failed'}
 if(-not $form.RegisterBugHotkey()){throw 'Hotkey unavailable'}
 $null=[ReportProbe]::SendMessage($form.Handle,0x312,[IntPtr]0x5050,[IntPtr]::Zero)
 if($script:reportedSource -ne 'hotkey'){throw 'Hotkey dispatch failed'}
 Write-Output 'PASS: menu dispatch, global hotkey registration and hotkey handler.'
} finally {$form.Dispose();$backgroundForm.Dispose();$tray.Dispose();$timer.Dispose();$script:animationTimer.Dispose()}
