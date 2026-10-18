$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
. './run-bun/screen-color-picker.ps1'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ScreenPickProbe {
 [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,int msg,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] public static extern IntPtr GetThreadDpiAwarenessContext();
 [DllImport("user32.dll")] public static extern bool AreDpiAwarenessContextsEqual(IntPtr a,IntPtr b);
}
'@
$swatch=[System.Windows.Forms.Form]::new()
$swatch.FormBorderStyle='None';$swatch.TopMost=$true;$swatch.ShowInTaskbar=$false
$swatch.StartPosition='Manual';$swatch.Size=[System.Drawing.Size]::new(160,160)
$area=[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$swatch.Location=[System.Drawing.Point]::new(($area.Left+200),($area.Top+200))
$swatch.BackColor=[System.Drawing.Color]::FromArgb(71,140,210)
$probe=[System.Windows.Forms.Timer]::new();$probe.Interval=100
$probe.Add_Tick({
 $pick=@([System.Windows.Forms.Application]::OpenForms | Where-Object {$_.GetType().Name -eq 'PokePulseScreenPicker'})[0]
 if($null -eq $pick){return}
 $probe.Stop()
 if(-not [ScreenPickProbe]::AreDpiAwarenessContextsEqual([ScreenPickProbe]::GetThreadDpiAwarenessContext(),[IntPtr](-4))){throw 'Picker is not using physical per-monitor pixels'}
 if($pick.Bounds -ne [System.Windows.Forms.SystemInformation]::VirtualScreen){throw 'Picker bounds differ from physical desktop bounds'}
 $point=$pick.PointToClient($swatch.PointToScreen([System.Drawing.Point]::new(80,80)))
 $null=[ScreenPickProbe]::SendMessage($pick.Handle,0x0200,[IntPtr]0,[IntPtr](($point.Y -shl 16) -bor $point.X))
 $render=[System.Drawing.Bitmap]::new($pick.Width,$pick.Height)
 try {
  $pick.DrawToBitmap($render,[System.Drawing.Rectangle]::new(0,0,$pick.Width,$pick.Height))
  $preview=$render.GetPixel(($point.X+32),($point.Y+32))
  if($preview.R -ne 71 -or $preview.G -ne 140 -or $preview.B -ne 210){throw 'Cursor preview swatch does not match the sampled screen pixel'}
 } finally {$render.Dispose()}
 $null=[ScreenPickProbe]::SendMessage($pick.Handle,0x0201,[IntPtr]1,[IntPtr](($point.Y -shl 16) -bor $point.X))
})
try {
 $swatch.Show();[System.Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 150
 $probe.Start();$color=[PokePulseScreenPicker]::Pick($swatch)
 if($null -eq $color -or $color.R -ne 71 -or $color.G -ne 140 -or $color.B -ne 210){throw "Screen color mismatch: $color"}
 $cancel=[System.Windows.Forms.Timer]::new();$cancel.Interval=100
 $cancel.Add_Tick({
  $pick=@([System.Windows.Forms.Application]::OpenForms | Where-Object {$_.GetType().Name -eq 'PokePulseScreenPicker'})[0]
  if($null -ne $pick){$cancel.Stop();$pick.Close()}
 })
 try{$cancel.Start();$color=[PokePulseScreenPicker]::Pick($swatch);if($null -ne $color){throw 'Cancel returned a color'}}finally{$cancel.Dispose()}
 Write-Host 'PASS: physical desktop scaling, cursor preview swatch, actual selected pixel RGB, and cancellation.'
} finally {$probe.Dispose();$swatch.Dispose()}
