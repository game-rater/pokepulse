$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$port = 3001
if ($args.Count -gt 0) { $port = [int]$args[0] }

$root = Split-Path -Parent $PSScriptRoot
$stateUrl = "http://127.0.0.1:$port/api/state?compact=1"
$node = @((Join-Path $root 'node.exe'),(Join-Path $root 'dist/Run-and-Bun-Automatic/node.exe')) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $node) { $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source }
try { $null = Invoke-RestMethod -Uri $stateUrl -TimeoutSec 1 }
catch {
    if (-not $node) { [System.Windows.Forms.MessageBox]::Show('Node.js was not found. Extract the complete PokéPulse folder, including node.exe, then try again.','PokéPulse') | Out-Null; exit 1 }
    Start-Process -FilePath $node -ArgumentList @('run-bun/server.mjs') -WorkingDirectory $root -WindowStyle Hidden
    $ready = $false
    for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 250; try { $null = Invoke-RestMethod -Uri $stateUrl -TimeoutSec 1; $ready = $true; break } catch {} }
    if (-not $ready) { [System.Windows.Forms.MessageBox]::Show('PokéPulse could not start its local battle service. Open the full app once, then retry.','PokéPulse') | Out-Null; exit 1 }
}

$script:displayedScore = $null
$script:targetScore = $null
$script:animationFrom = 0.0
$script:animationStart = 0L
$script:animationDuration = 300.0
$script:animating = $false
$script:status = 'CONNECTING'
$script:outlookRange = $null
$script:outlookBounds = $null
$script:lossFrom = 0.0
$script:targetLoss = 0.0
$script:meterMode = 'both'
$script:dragStart = $null
$script:meterVisible = $true
$script:vertical = ($args.Count -gt 1 -and $args[1] -eq 'vertical')
$script:horizontalSize = [System.Drawing.Size]::new(360,74)
$script:verticalSize = [System.Drawing.Size]::new(72,330)
$script:lastPaintError = $null
$script:backgroundColor = [System.Drawing.Color]::FromArgb(25,37,31)
$script:backgroundAlpha = 248
$script:backgroundBrightness = 18
$script:textColor = [System.Drawing.Color]::FromArgb(239,245,239)
$script:trackColor = [System.Drawing.Color]::FromArgb(60,75,65)
$script:outlineColor = [System.Drawing.Color]::FromArgb(117,145,129)
$script:textAlpha = 255
$script:nameColor = $script:textColor
$script:numberColor = $script:textColor
$script:nameAlpha = 255
$script:numberAlpha = 255
$script:showPercentage = $true
$script:trackAlpha = 255
$script:outlineAlpha = 160
$script:baroutlineColor = [System.Drawing.Color]::Black
$script:baroutlineAlpha = 255
$script:signalAlpha = 255
$script:signalColor = [System.Drawing.Color]::FromArgb(205,224,210)
$script:meterAccent = [System.Drawing.Color]::FromArgb(205,224,210)
$script:writeLayoutDiagnostic = $true
$settingsPath = Join-Path $root 'run-bun\live\overlay-settings.json'
$script:restoredWindow = $null
try {
    if (Test-Path -LiteralPath $settingsPath) {
        $savedAppearance = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
        if ($savedAppearance.window) {
            $script:restoredWindow = $savedAppearance.window
            if ($args.Count -lt 2 -and $null -ne $savedAppearance.window.vertical) { $script:vertical = [bool]$savedAppearance.window.vertical }
            if ($null -ne $savedAppearance.window.meter_visible) { $script:meterVisible = [bool]$savedAppearance.window.meter_visible }
            foreach ($orientation in @('horizontal','vertical')) {
                $savedSize = if ($orientation -eq 'vertical') { $savedAppearance.window.vertical_size } else { $savedAppearance.window.horizontal }
                if ($savedSize -and $savedSize.width -ge 1 -and $savedSize.height -ge 1) {
                    $minimumWidth = if ($orientation -eq 'vertical') {64} else {300}
                    $minimumHeight = if ($orientation -eq 'vertical') {240} else {70}
                    Set-Variable -Scope Script -Name ($orientation+'Size') -Value ([System.Drawing.Size]::new([Math]::Max($minimumWidth,[Math]::Min(10000,[int]$savedSize.width)),[Math]::Max($minimumHeight,[Math]::Min(10000,[int]$savedSize.height))))
                }
            }
        }
        if ($null -ne $savedAppearance.show_percentage) { $script:showPercentage = [bool]$savedAppearance.show_percentage }
        if ($savedAppearance.meter_mode -in @('wins','losses','both','combined')) { $script:meterMode = $savedAppearance.meter_mode }
        foreach ($secondary in @('text','track','outline','baroutline')) {
            $savedColor = $savedAppearance.secondary.$secondary
            if ($savedColor) { Set-Variable -Scope Script -Name ($secondary+'Color') -Value ([System.Drawing.Color]::FromArgb([int]$savedColor.r,[int]$savedColor.g,[int]$savedColor.b)) }
            if ($null -ne $savedColor.alpha) { Set-Variable -Scope Script -Name ($secondary+'Alpha') -Value ([Math]::Max(0,[Math]::Min(255,[int]$savedColor.alpha))) }
        }
        foreach ($textTarget in @('name','number')) {
            Set-Variable -Scope Script -Name ($textTarget+'Color') -Value $script:textColor
            Set-Variable -Scope Script -Name ($textTarget+'Alpha') -Value $script:textAlpha
            $savedText=$savedAppearance.secondary.$textTarget
            if($savedText){
                Set-Variable -Scope Script -Name ($textTarget+'Color') -Value ([System.Drawing.Color]::FromArgb([int]$savedText.r,[int]$savedText.g,[int]$savedText.b))
                if($null -ne $savedText.alpha){Set-Variable -Scope Script -Name ($textTarget+'Alpha') -Value ([Math]::Max(0,[Math]::Min(255,[int]$savedText.alpha)))}
            }
        }
        if ($null -ne $savedAppearance.signal_alpha) { $script:signalAlpha=[Math]::Max(0,[Math]::Min(255,[int]$savedAppearance.signal_alpha)) }
        if ($savedAppearance.background) {
            $script:backgroundColor = [System.Drawing.Color]::FromArgb([int]$savedAppearance.background.r,[int]$savedAppearance.background.g,[int]$savedAppearance.background.b)
            if ($null -ne $savedAppearance.background.alpha) { $script:backgroundAlpha = [Math]::Max(0,[Math]::Min(255,[int]$savedAppearance.background.alpha)) }
            if ($null -ne $savedAppearance.background.brightness) { $script:backgroundBrightness = [Math]::Max(10,[Math]::Min(100,[int]$savedAppearance.background.brightness)) }
        } elseif ($null -ne $savedAppearance.r -and $null -ne $savedAppearance.g -and $null -ne $savedAppearance.b) {
            $legacyColor = [System.Drawing.Color]::FromArgb([int]$savedAppearance.r,[int]$savedAppearance.g,[int]$savedAppearance.b)
            $legacyMaximum = [Math]::Max($legacyColor.R,[Math]::Max($legacyColor.G,$legacyColor.B))
            if ($legacyMaximum -gt 0) {
                $legacyScale = (255*$script:backgroundBrightness/100.0)/$legacyMaximum
                $script:backgroundColor = [System.Drawing.Color]::FromArgb([int]($legacyColor.R*$legacyScale),[int]($legacyColor.G*$legacyScale),[int]($legacyColor.B*$legacyScale))
            }
        }
    }
} catch {}

function Get-StoplightColor($score) {
    if ($null -eq $score) { return [System.Drawing.Color]::FromArgb(205,224,210) }
    $value = [Math]::Max(0.0,[Math]::Min(100.0,[double]$score))
    $red = [System.Drawing.Color]::FromArgb(239,83,80)
    $yellow = [System.Drawing.Color]::FromArgb(255,193,7)
    $green = [System.Drawing.Color]::FromArgb(76,175,80)
    if ($value -le 50) { $start=$red; $finish=$yellow; $t=$value/50.0 }
    else { $start=$yellow; $finish=$green; $t=($value-50)/50.0 }
    return [System.Drawing.Color]::FromArgb(
        [int]($start.R+($finish.R-$start.R)*$t),
        [int]($start.G+($finish.G-$start.G)*$t),
        [int]($start.B+($finish.B-$start.B)*$t))
}

function Get-DisplayedScore {
    if ($null -eq $script:targetScore) { return $null }
    if (-not $script:animating) { return $script:targetScore }
    $elapsed = 1000.0 * ([System.Diagnostics.Stopwatch]::GetTimestamp() - $script:animationStart) / [System.Diagnostics.Stopwatch]::Frequency
    $t = [Math]::Min(1.0,[Math]::Max(0.0,$elapsed / $script:animationDuration))
    $ease = 1.0 - [Math]::Pow(1.0 - $t,3)
    $script:displayedScore = $script:animationFrom + (($script:targetScore - $script:animationFrom) * $ease)
    if ($t -ge 1.0) { $script:displayedScore = $script:targetScore;$script:animating = $false }
    return $script:displayedScore
}

function Set-TargetScore($value,[bool]$force=$false) {
    if ($null -eq $value) {
        $current=Get-DisplayedScore;if($null -ne $current){$script:animationAnchor=$current}
        $script:displayedScore = $null;$script:targetScore = $null;$script:animating = $false
        return
    }
    $next = [Math]::Max(0.0,[Math]::Min(100.0,[double]$value))
    if (-not $force -and $null -ne $script:targetScore -and [Math]::Abs($next - $script:targetScore) -lt 0.01) { return }
    $current = Get-DisplayedScore
    if ($null -eq $current) { $current = if($null -ne $script:animationAnchor){$script:animationAnchor}else{0.0} }
    $script:animationAnchor=$current
    $script:animationFrom = [double]$current
    $script:targetScore = $next
    $script:animationStart = [System.Diagnostics.Stopwatch]::GetTimestamp()
    $script:animating = $force -or [Math]::Abs($next - $script:animationFrom) -ge 0.01
    if (-not $script:animating) { $script:displayedScore = $next }
    elseif ($null -ne $script:animationTimer -and -not $script:animationTimer.Enabled) { $script:animationTimer.Start() }
}
Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Windows.Forms;
public class PokePulseOverlayForm : Form {
    public event EventHandler BugReportRequested;
    private bool bugHotkeyRegistered;
    [System.Runtime.InteropServices.DllImport("user32.dll",SetLastError=true)] private static extern bool RegisterHotKey(IntPtr hwnd,int id,uint modifiers,uint key);
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr hwnd,int id);
    public bool RegisterBugHotkey() { if(bugHotkeyRegistered)return true;return bugHotkeyRegistered=RegisterHotKey(Handle,0x5050,0x4006,0x42); }
    public void UnregisterBugHotkey() { if(bugHotkeyRegistered){UnregisterHotKey(Handle,0x5050);bugHotkeyRegistered=false;} }
    protected override void OnHandleDestroyed(EventArgs e) { UnregisterBugHotkey();base.OnHandleDestroyed(e); }
    public bool ResizeEnabled = true;
    public bool LayeredRendering = false;
    public bool LayoutPending = false;
    public long RenderVersion { get; private set; }
    public Size LastFrameSize { get; private set; }
    private bool rendering;
    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)] private struct XY { public int X,Y; public XY(int x,int y){X=x;Y=y;} }
    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)] private struct WH { public int Width,Height; public WH(int w,int h){Width=w;Height=h;} }
    [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential,Pack=1)] private struct Blend { public byte Op,Flags,Alpha,Format; }
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern IntPtr GetDC(IntPtr hwnd);
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern int ReleaseDC(IntPtr hwnd,IntPtr dc);
    [System.Runtime.InteropServices.DllImport("gdi32.dll")] private static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [System.Runtime.InteropServices.DllImport("gdi32.dll")] private static extern IntPtr SelectObject(IntPtr dc,IntPtr obj);
    [System.Runtime.InteropServices.DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr obj);
    [System.Runtime.InteropServices.DllImport("gdi32.dll")] private static extern bool DeleteDC(IntPtr dc);
    [System.Runtime.InteropServices.DllImport("user32.dll",SetLastError=true)] private static extern bool UpdateLayeredWindow(IntPtr hwnd,IntPtr dst,ref XY pos,ref WH size,IntPtr src,ref XY origin,uint key,ref Blend blend,uint flags);
    [System.Runtime.InteropServices.ComImport, System.Runtime.InteropServices.Guid("56FDF342-FD6D-11d0-958A-006097C9A090"), System.Runtime.InteropServices.InterfaceType(System.Runtime.InteropServices.ComInterfaceType.InterfaceIsIUnknown)]
    private interface ShellTaskbar {
        void HrInit(); void AddTab(IntPtr window); void DeleteTab(IntPtr window);
        void ActivateTab(IntPtr window); void SetActiveAlt(IntPtr window);
    }
    [System.Runtime.InteropServices.DllImport("user32.dll",CharSet=System.Runtime.InteropServices.CharSet.Unicode)] private static extern uint RegisterWindowMessage(string name);
    private static readonly uint TaskbarCreated=RegisterWindowMessage("TaskbarCreated");
    public void EnsureTaskbarButton() {
        if(!ShowInTaskbar || !Visible || !IsHandleCreated)return;
        object shell=Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("56FDF344-FD6D-11d0-958A-006097C9A090")));
        try { var taskbar=(ShellTaskbar)shell;taskbar.HrInit();taskbar.AddTab(Handle); }
        finally { System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shell); }
    }
    protected override CreateParams CreateParams { get { var p=base.CreateParams; if(LayeredRendering){p.ExStyle|=0x80000;p.Style&=~0x00C40000;} if(ShowInTaskbar){p.ExStyle|=0x40000;p.ExStyle&=~0x80;} return p; } }
    public PokePulseOverlayForm() { DoubleBuffered = true; }
    public Bitmap RenderBitmap() {
        using(var high=new Bitmap(Math.Max(1,ClientSize.Width*2),Math.Max(1,ClientSize.Height*2),System.Drawing.Imaging.PixelFormat.Format32bppPArgb)) {
            using(var g=Graphics.FromImage(high)) {
                g.Clear(Color.Transparent); g.ScaleTransform(2,2);
                g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                g.TextRenderingHint=System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
                base.OnPaint(new PaintEventArgs(g,ClientRectangle));
                foreach(Control c in Controls) { var button=c as Button; if(button!=null && button.Visible && button.Image!=null)g.DrawImage(button.Image,c.Left+(c.Width-18)/2f,c.Top+(c.Height-18)/2f,18,18); }
            }
            var bitmap=new Bitmap(Math.Max(1,ClientSize.Width),Math.Max(1,ClientSize.Height),System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
            using(var g=Graphics.FromImage(bitmap)) { g.CompositingMode=System.Drawing.Drawing2D.CompositingMode.SourceCopy;g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;g.DrawImage(high,new Rectangle(Point.Empty,bitmap.Size)); }
            // Windows passes mouse input through zero-alpha layered pixels.
            // Give invisible button pixels the minimum alpha so their entire
            // square receives clicks, without drawing button chrome.
            foreach(Control control in Controls) {
                if(!(control is Button) || !control.Visible)continue;
                Rectangle area=Rectangle.Intersect(control.Bounds,new Rectangle(Point.Empty,bitmap.Size));
                for(int y=area.Top;y<area.Bottom;y++)for(int x=area.Left;x<area.Right;x++)
                    if(bitmap.GetPixel(x,y).A==0)bitmap.SetPixel(x,y,Color.FromArgb(1,0,0,0));
            }
            return bitmap;
        }
    }
    public void RenderFrame() {
        if(rendering || LayoutPending || !IsHandleCreated || IsDisposed)return;
        rendering=true;
        try { using(var bitmap=RenderBitmap()) {
            IntPtr screen=GetDC(IntPtr.Zero), memory=CreateCompatibleDC(screen), handle=bitmap.GetHbitmap(Color.FromArgb(0)), old=SelectObject(memory,handle);
            try { var pos=new XY(Left,Top);var size=new WH(bitmap.Width,bitmap.Height);var origin=new XY(0,0);var blend=new Blend{Alpha=255,Format=1};
                if(!UpdateLayeredWindow(Handle,screen,ref pos,ref size,memory,ref origin,0,ref blend,2))throw new System.ComponentModel.Win32Exception(System.Runtime.InteropServices.Marshal.GetLastWin32Error());
                RenderVersion++; LastFrameSize=bitmap.Size;
            } finally { SelectObject(memory,old);DeleteObject(handle);DeleteDC(memory);ReleaseDC(IntPtr.Zero,screen); }
        }} finally { rendering=false; }
    }
    protected override void OnPaint(PaintEventArgs e) { if(LayeredRendering)RenderFrame();else base.OnPaint(e); }
    protected override void WndProc(ref Message m) {
        if(m.Msg==0x83 && LayeredRendering){m.Result=IntPtr.Zero;return;}
        if((uint)m.Msg==TaskbarCreated && LayeredRendering && ShowInTaskbar) { base.WndProc(ref m);EnsureTaskbarButton();return; }
        if(m.Msg==0x312&&m.WParam.ToInt32()==0x5050){var handler=BugReportRequested;if(handler!=null)handler(this,EventArgs.Empty);return;}
        base.WndProc(ref m);
        if (m.Msg == 0x84 && ResizeEnabled) {
            long pos = m.LParam.ToInt64();
            Point p = PointToClient(new Point((short)(pos & 0xffff), (short)((pos >> 16) & 0xffff)));
            foreach(Control control in Controls)if(control is Button && control.Visible && control.Bounds.Contains(p)){m.Result=new IntPtr(1);return;}
            bool left = p.X < 8, right = p.X >= ClientSize.Width - 8;
            bool top = p.Y < 8, bottom = p.Y >= ClientSize.Height - 8;
            int hit = top && left ? 13 : top && right ? 14 : bottom && left ? 16 :
                bottom && right ? 17 : left ? 10 : right ? 11 : top ? 12 : bottom ? 15 : 1;
            m.Result = new IntPtr(hit);
        }
    }
}
public class PokePulseIconButton : Button {
    public PokePulseIconButton() { SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true); }
    protected override void OnPaintBackground(PaintEventArgs e) { e.Graphics.Clear(Parent.BackColor); }
    protected override void OnPaint(PaintEventArgs e) {
        if (Image != null) { e.Graphics.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic; e.Graphics.DrawImage(Image,(Width-18)/2f,(Height-18)/2f,18,18); }
    }
}
public class PokePulseMenuRenderer : ToolStripProfessionalRenderer {
    public PokePulseMenuRenderer() { RoundedEdges = false; }
    protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e) { e.Graphics.Clear(Color.FromArgb(24,31,28)); }
    protected override void OnRenderImageMargin(ToolStripRenderEventArgs e) { }
    protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e) {
        using (var b = new SolidBrush(e.Item.Selected ? Color.FromArgb(45,62,54) : Color.FromArgb(24,31,28))) e.Graphics.FillRectangle(b, new Rectangle(Point.Empty,e.Item.Size));
    }
    protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e) {
        e.TextColor = Color.FromArgb(237,245,240);
        base.OnRenderItemText(e);
    }
    protected override void OnRenderArrow(ToolStripArrowRenderEventArgs e) { e.ArrowColor=Color.FromArgb(196,220,207);base.OnRenderArrow(e); }
    protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e) {
        using(var p=new Pen(Color.FromArgb(60,76,67))) e.Graphics.DrawRectangle(p,0,0,e.ToolStrip.Width-1,e.ToolStrip.Height-1);
    }
    protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e) {
        using(var p=new Pen(Color.FromArgb(49,62,55))) e.Graphics.DrawLine(p,10,e.Item.Height/2,e.Item.Width-10,e.Item.Height/2);
    }
}
public class PokePulseSlider : Control {
    public int Minimum { get; set; }
    public int Maximum { get; set; }
    private int current;
    public int Value { get { return current; } set { int next=Math.Max(Minimum,Math.Min(Maximum,value)); if(next==current)return; current=next; Invalidate(); if(ValueChanged!=null)ValueChanged(this,EventArgs.Empty); } }
    public event EventHandler ValueChanged;
    public PokePulseSlider() { Maximum=100; Height=32; TabStop=true; Cursor=Cursors.Hand; SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.Selectable,true); }
    protected override void OnPaint(PaintEventArgs e) {
        e.Graphics.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        float y=Height/2f, x=10+(Width-20)*(current-Minimum)/(float)Math.Max(1,Maximum-Minimum);
        using(var rail=new Pen(Color.FromArgb(60,72,66),4)) e.Graphics.DrawLine(rail,10,y,Width-10,y);
        using(var fill=new Pen(Color.FromArgb(117,195,156),4)) e.Graphics.DrawLine(fill,10,y,x,y);
        using(var thumb=new SolidBrush(Color.FromArgb(227,244,234))) e.Graphics.FillEllipse(thumb,x-6,y-6,12,12);
        if(Focused)using(var p=new Pen(Color.FromArgb(117,195,156)))e.Graphics.DrawEllipse(p,x-9,y-9,18,18);
    }
    private void Pick(int x) { Value=Minimum+(int)Math.Round(Math.Max(0,Math.Min(1,(x-10)/(double)Math.Max(1,Width-20)))*(Maximum-Minimum)); }
    protected override void OnMouseDown(MouseEventArgs e) { base.OnMouseDown(e); if(e.Button==MouseButtons.Left){ Focus();Capture=true;Pick(e.X); } }
    protected override void OnMouseMove(MouseEventArgs e) { base.OnMouseMove(e); if(Capture)Pick(e.X); }
    protected override void OnMouseUp(MouseEventArgs e) { base.OnMouseUp(e);Capture=false; }
    protected override bool IsInputKey(Keys key) { return key==Keys.Left||key==Keys.Right||key==Keys.Home||key==Keys.End||base.IsInputKey(key); }
    protected override void OnKeyDown(KeyEventArgs e) { base.OnKeyDown(e); if(e.KeyCode==Keys.Left)Value--; if(e.KeyCode==Keys.Right)Value++; if(e.KeyCode==Keys.Home)Value=Minimum; if(e.KeyCode==Keys.End)Value=Maximum; }
}
public static class PokePulsePalette {
    [System.Runtime.InteropServices.DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
    public static void DarkTitleBar(IntPtr hwnd) { int dark=1; try { if(DwmSetWindowAttribute(hwnd,20,ref dark,4)!=0)DwmSetWindowAttribute(hwnd,19,ref dark,4); } catch { } }
    public static Bitmap Wheel() {
        var b=new Bitmap(200,200);
        for(int y=0;y<200;y++)for(int x=0;x<200;x++) {
            double dx=x-99.5,dy=99.5-y,r=Math.Sqrt(dx*dx+dy*dy);
            if(r>98)continue;
            double h=(Math.Atan2(dy,dx)*180/Math.PI+360)%360,s=r/98,c=s,v=c*(1-Math.Abs((h/60)%2-1)),m=1-c;
            double rr=0,gg=0,bb=0;
            if(h<60){rr=c;gg=v;}else if(h<120){rr=v;gg=c;}else if(h<180){gg=c;bb=v;}else if(h<240){gg=v;bb=c;}else if(h<300){rr=v;bb=c;}else{rr=c;bb=v;}
            b.SetPixel(x,y,Color.FromArgb((int)(255*(rr+m)),(int)(255*(gg+m)),(int)(255*(bb+m))));
        }
        return b;
    }
}
"@ -ReferencedAssemblies System.Windows.Forms,System.Drawing
$form = New-Object PokePulseOverlayForm
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class PokePulseIdentity {
    [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
    public static extern int SetCurrentProcessExplicitAppUserModelID(string id);
}
'@
$null=[PokePulseIdentity]::SetCurrentProcessExplicitAppUserModelID('Athena.PokePulse')
$script:appIcon=[System.Drawing.Icon]::new((Join-Path $root 'run-bun\assets\pokepulse.ico'))
$form.Icon=$script:appIcon
$form.LayeredRendering = $true
$form.Text = 'PokéPulse - Stream Overlay'
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.Location = New-Object System.Drawing.Point(24,24)
$form.ClientSize = New-Object System.Drawing.Size(360,74)
if ($script:restoredWindow -and $null -ne $script:restoredWindow.x -and $null -ne $script:restoredWindow.y) {
    $form.Location = [System.Drawing.Point]::new([int]$script:restoredWindow.x,[int]$script:restoredWindow.y)
}
$form.BackColor = [System.Drawing.Color]::Magenta
$form.ShowInTaskbar = $true
$form.TopMost = $true
$form.KeyPreview = $true
$form.Opacity = 1.0
$backgroundForm = New-Object PokePulseOverlayForm
$backgroundForm.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$backgroundForm.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$backgroundForm.ShowInTaskbar = $false
$backgroundForm.TopMost = $true
$backgroundForm.BackColor = [System.Drawing.Color]::Magenta
$backgroundForm.TransparencyKey = [System.Drawing.Color]::Magenta
$backgroundForm.Opacity = $script:backgroundAlpha/255.0
$backgroundForm.Bounds = $form.Bounds
$backgroundForm.Add_Paint({
    param($sender,$e)
    $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $path = New-RoundedPath 2 2 ($sender.ClientSize.Width-4) ($sender.ClientSize.Height-4) ([Math]::Min(14,($sender.ClientSize.Height-4)/2))
    $brush = New-Object System.Drawing.SolidBrush($script:backgroundColor)
    $e.Graphics.FillPath($brush,$path)
    $brush.Dispose();$path.Dispose()
})
$form.Add_LocationChanged({ $form.RenderFrame();Queue-OverlayWindowSave })
$form.Font = New-Object System.Drawing.Font('Segoe UI',10,[System.Drawing.FontStyle]::Regular)
$toggleButton = New-Object PokePulseIconButton
$toggleButton.Text = ''
$moreButton = New-Object PokePulseIconButton
$moreButton.Text = ''
$controlTips = New-Object System.Windows.Forms.ToolTip
function New-ControlIcon($kind,[System.Drawing.Color]$accent) {
    $bitmap = New-Object System.Drawing.Bitmap(36,36,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform(2,2)
    $pen = New-Object System.Drawing.Pen($accent,1.5)
    $iconBrush = New-Object System.Drawing.SolidBrush($accent)
    if ($kind -eq 'eye') {
        $graphics.DrawBezier($pen,2,9,5,2,13,2,16,9)
        $graphics.DrawBezier($pen,2,9,5,16,13,16,16,9)
        $graphics.DrawEllipse($pen,7,7,4,4)
    } elseif ($kind -eq 'more') {
        foreach ($dotX in @(2.5,7.5,12.5)) { $graphics.FillEllipse($iconBrush,[single]$dotX,[single]7.5,[single]3,[single]3) }
    } else {
        $graphics.DrawArc($pen,3,3,12,12,45,275)
        $graphics.DrawLine($pen,13,3,15,6)
        $graphics.DrawLine($pen,15,6,11,6)
    }
    $iconBrush.Dispose();$pen.Dispose();$graphics.Dispose()
    return $bitmap
}
function New-RoundedPath([single]$x,[single]$y,[single]$width,[single]$height,[single]$radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    # A layout transition can briefly leave no room for the track.
    if ($width -le 0 -or $height -le 0) { return $path }
    $radius=[Math]::Max(0.1,[Math]::Min($radius,[Math]::Min($width,$height)/2))
    $diameter = 2*$radius
    $path.AddArc($x,$y,$diameter,$diameter,180,90)
    $path.AddArc(($x+$width-$diameter),$y,$diameter,$diameter,270,90)
    $path.AddArc(($x+$width-$diameter),($y+$height-$diameter),$diameter,$diameter,0,90)
    $path.AddArc($x,($y+$height-$diameter),$diameter,$diameter,90,90)
    $path.CloseFigure()
    return $path
}
function Draw-TrackOutline($graphics,$path) {
    $outline=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb($script:baroutlineAlpha,$script:baroutlineColor),2)
    $graphics.DrawPath($outline,$path)
    $outline.Dispose()
}
$toggleButton.Image = New-ControlIcon 'eye' $script:meterAccent
$moreButton.Image = New-ControlIcon 'more' $script:meterAccent
$controlTips.SetToolTip($moreButton,'More overlay controls')
foreach ($button in @($toggleButton,$moreButton)) {
    $button.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $button.FlatAppearance.BorderSize = 0
    $button.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::Transparent
    $button.FlatAppearance.MouseDownBackColor = [System.Drawing.Color]::Transparent
    $button.UseVisualStyleBackColor = $false
    $button.BackColor = [System.Drawing.Color]::Transparent
    $button.ForeColor = [System.Drawing.Color]::FromArgb(239,245,239)
    $button.Font = New-Object System.Drawing.Font('Segoe UI',8)
    $button.Size = New-Object System.Drawing.Size(22,22)
    $button.ImageAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $button.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $button.Padding = [System.Windows.Forms.Padding]::Empty
    $button.Margin = [System.Windows.Forms.Padding]::Empty
    $form.Controls.Add($button)
}
function Get-OverlayWindowSettings {
    $savedPoint = $form.Location
    if ($form.WindowState -eq [System.Windows.Forms.FormWindowState]::Minimized -and $form.RestoreBounds.Width -gt 0) { $savedPoint = $form.RestoreBounds.Location }
    return @{x=$savedPoint.X;y=$savedPoint.Y;vertical=[bool]$script:vertical;meter_visible=[bool]$script:meterVisible;
        horizontal=@{width=$script:horizontalSize.Width;height=$script:horizontalSize.Height};
        vertical_size=@{width=$script:verticalSize.Width;height=$script:verticalSize.Height}}
}
function Save-OverlayWindowSettings {
    try {
        [IO.Directory]::CreateDirectory((Split-Path -Parent $settingsPath)) | Out-Null
        $saved = if (Test-Path -LiteralPath $settingsPath) { Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
        $saved | Add-Member -NotePropertyName window -NotePropertyValue (Get-OverlayWindowSettings) -Force
        [IO.File]::WriteAllText($settingsPath,($saved|ConvertTo-Json -Depth 8 -Compress))
    } catch {}
}
function Queue-OverlayWindowSave {
    if ($script:windowSaveTimer) { $script:windowSaveTimer.Stop();$script:windowSaveTimer.Start() }
}
function Update-OverlayLayout([bool]$resizing = $false) {
    $form.LayoutPending=$true
    $toggleButton.AccessibleName = if ($script:meterVisible) { 'Hide meter' } else { 'Show meter' }
    $controlTips.SetToolTip($toggleButton,$toggleButton.AccessibleName)
    if (-not $resizing) {
        $script:applyingLayout = $true
        $desiredSize = if ($script:vertical) { $script:verticalSize } else { $script:horizontalSize }
        $compactSize = if ($script:vertical) { [System.Drawing.Size]::new(72,76) } else { [System.Drawing.Size]::new(188,32) }
        $form.MinimumSize = if ($script:vertical) { [System.Drawing.Size]::new(64,76) } else { [System.Drawing.Size]::new(188,32) }
        $form.ResizeEnabled = $script:meterVisible
        $backgroundForm.ResizeEnabled = $script:meterVisible
        if (-not $script:meterVisible) { $form.ClientSize = $compactSize }
        elseif ($script:vertical) {
            $form.MinimumSize = [System.Drawing.Size]::new(64,240)
            $form.ClientSize = $desiredSize
        } else {
            $form.MinimumSize = [System.Drawing.Size]::new(300,70)
            $form.ClientSize = $desiredSize
        }
        $script:applyingLayout = $false
    }
    $width = $form.ClientSize.Width
    $height = $form.ClientSize.Height
    $controlSize = if ($script:vertical) { 20 } else { 22 }
    foreach ($button in @($toggleButton,$moreButton)) {
        $button.Size = [System.Drawing.Size]::new($controlSize,$controlSize)
    }
    if (-not $script:meterVisible -and -not $script:vertical) {
        $toggleButton.Location = [System.Drawing.Point]::new(134,5)
        $moreButton.Location = [System.Drawing.Point]::new(160,5)
    } elseif ($script:vertical) {
        $toggleButton.Location = [System.Drawing.Point]::new([int]($width/2-22),($height-29))
        $moreButton.Location = [System.Drawing.Point]::new([int]($width/2+2),($height-29))
    } else {
        $header=Get-ResponsiveLayout $width $height $false
        $controlY=[int](($header.header-$controlSize)/2)
        $toggleButton.Location = [System.Drawing.Point]::new(($width-60),$controlY)
        $moreButton.Location = [System.Drawing.Point]::new(($width-34),$controlY)
    }
    $form.LayoutPending=$false
    $form.RenderFrame()
    Queue-OverlayWindowSave
}
function Set-BackgroundAppearance([System.Drawing.Color]$color,[int]$alpha=$script:backgroundAlpha,[int]$brightness=$script:backgroundBrightness) {
    $script:backgroundColor = [System.Drawing.Color]::FromArgb(255,$color.R,$color.G,$color.B)
    $script:backgroundAlpha = [Math]::Max(0,[Math]::Min(255,$alpha))
    $script:backgroundBrightness = [Math]::Max(10,[Math]::Min(100,$brightness))
    $form.Opacity = 1.0
    $backgroundForm.Opacity = $script:backgroundAlpha/255.0
    $backgroundForm.Invalidate()
    try {
        [IO.Directory]::CreateDirectory((Split-Path -Parent $settingsPath)) | Out-Null
        $appearance = @{background=@{r=$script:backgroundColor.R;g=$script:backgroundColor.G;b=$script:backgroundColor.B;alpha=$script:backgroundAlpha;brightness=$script:backgroundBrightness};secondary=@{name=@{r=$script:nameColor.R;g=$script:nameColor.G;b=$script:nameColor.B;alpha=$script:nameAlpha};number=@{r=$script:numberColor.R;g=$script:numberColor.G;b=$script:numberColor.B;alpha=$script:numberAlpha};track=@{r=$script:trackColor.R;g=$script:trackColor.G;b=$script:trackColor.B;alpha=$script:trackAlpha};outline=@{r=$script:outlineColor.R;g=$script:outlineColor.G;b=$script:outlineColor.B;alpha=$script:outlineAlpha};baroutline=@{r=$script:baroutlineColor.R;g=$script:baroutlineColor.G;b=$script:baroutlineColor.B;alpha=$script:baroutlineAlpha}};signal_alpha=$script:signalAlpha}
        $appearance.meter_mode = $script:meterMode
        $appearance.show_percentage = $script:showPercentage
        $appearance.window = Get-OverlayWindowSettings
        [IO.File]::WriteAllText($settingsPath,($appearance|ConvertTo-Json -Depth 8 -Compress))
    } catch {}
    if ($null -ne $script:colorSwatch) { $script:colorSwatch.Invalidate() }
    $form.RenderFrame()
}
function Get-WheelColor([double]$x,[double]$y,[int]$brightness) {
    $dx=$x-99.5; $dy=99.5-$y; $radius=[Math]::Sqrt($dx*$dx+$dy*$dy)
    if ($radius -gt 98) { return $null }
    $hue=([Math]::Atan2($dy,$dx)*180/[Math]::PI+360)%360
    $saturation=[Math]::Min(1.0,$radius/98.0); $chroma=$saturation*([Math]::Max(10,[Math]::Min(100,$brightness))/100.0)
    $xv=$chroma*(1-[Math]::Abs(($hue/60)%2-1))
    if ($hue -lt 60) {$rr=$chroma;$gg=$xv;$bb=0} elseif ($hue -lt 120) {$rr=$xv;$gg=$chroma;$bb=0} elseif ($hue -lt 180) {$rr=0;$gg=$chroma;$bb=$xv} elseif ($hue -lt 240) {$rr=0;$gg=$xv;$bb=$chroma} elseif ($hue -lt 300) {$rr=$xv;$gg=0;$bb=$chroma} else {$rr=$chroma;$gg=0;$bb=$xv}
    $m=([Math]::Max(10,[Math]::Min(100,$brightness))/100.0)-$chroma
    return [System.Drawing.Color]::FromArgb([int](255*($rr+$m)),[int](255*($gg+$m)),[int](255*($bb+$m)))
}
function Set-BackgroundBrightness([int]$brightness) {
    $value=[Math]::Max(10,[Math]::Min(100,$brightness)); $max=[Math]::Max($script:backgroundColor.R,[Math]::Max($script:backgroundColor.G,$script:backgroundColor.B))
    if ($max -le 0) { return }
    $target=255*$value/100.0; $factor=$target/$max
    $color=[System.Drawing.Color]::FromArgb([int][Math]::Min(255,$script:backgroundColor.R*$factor),[int][Math]::Min(255,$script:backgroundColor.G*$factor),[int][Math]::Min(255,$script:backgroundColor.B*$factor))
    Set-BackgroundAppearance $color $script:backgroundAlpha $value
}
$toggleButton.Add_Click({ $script:meterVisible = -not $script:meterVisible; Update-OverlayLayout })
$script:moreMenu = New-Object System.Windows.Forms.ContextMenuStrip
$moreMenu = $script:moreMenu
$moreMenu.Renderer = New-Object PokePulseMenuRenderer
$moreMenu.ShowImageMargin = $false
$moreMenu.ShowCheckMargin = $true
$moreMenu.Font = [System.Drawing.Font]::new('Segoe UI',10)
. (Join-Path $root 'run-bun\reader-status-panel.ps1')
$readerStatusItem = $moreMenu.Items.Add('Connection and status')
$readerStatusItem.Add_Click({ Show-ReaderStatusPanel $form })
$script:npcAiEnabled = $false
$npcAiItem = $moreMenu.Items.Add('Use NPC AI')
$npcAiItem.CheckOnClick = $false
$npcAiItem.Add_Click({
    try {
        $nextModel = if ($script:npcAiEnabled) { 'minimax' } else { 'npc-ai' }
        $reply = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/optimizer" -Method Post -ContentType 'application/json' -Body (@{opponent_model=$nextModel}|ConvertTo-Json -Compress) -TimeoutSec 3
        $script:npcAiEnabled = $reply.opponent_model -eq 'npc-ai'
        $npcAiItem.Checked = $script:npcAiEnabled
    } catch {
        [System.Windows.Forms.MessageBox]::Show('Could not change the optimizer. Check that the reader is running.','PokéPulse') | Out-Null
    }
})
. (Join-Path $root 'run-bun\screen-color-picker.ps1')
. (Join-Path $root 'run-bun\appearance-picker.ps1')
$orientationItem = $moreMenu.Items.Add('Switch to vertical')
$orientationItem.Add_Click({ $script:vertical = -not $script:vertical; $script:meterVisible = $true; Update-OverlayLayout })
$showOutcomeItem = $moreMenu.Items.Add('Show')
$showOutcomeItem.DropDown.Renderer = New-Object PokePulseMenuRenderer
$showOutcomeItem.DropDown.ShowImageMargin = $false
$script:outcomeItems = @{}
foreach ($option in @(@('both','Wins and losses'),@('wins','Wins only'),@('losses','Losses only'),@('combined','Combined win/loss bar'))) {
    $item = $showOutcomeItem.DropDownItems.Add($option[1])
    $item.Tag = $option[0]
    $item.Checked = $script:meterMode -eq $item.Tag
    $script:outcomeItems[$option[0]] = $item
    $item.Add_Click({ param($sender,$e) Set-MeterMode $sender.Tag })
}
function Set-MeterMode($mode) {
    if ($mode -notin @('wins','losses','both','combined')) { throw 'Unknown meter display mode' }
    $script:meterMode = $mode
    foreach ($key in $script:outcomeItems.Keys) { $script:outcomeItems[$key].Checked = $key -eq $mode }
    Set-BackgroundAppearance $script:backgroundColor
    $form.RenderFrame()
}
$percentageItem = $showOutcomeItem.DropDownItems.Add('Percentage')
$percentageItem.CheckOnClick = $true
$percentageItem.Checked = $script:showPercentage
$percentageItem.Add_Click({
    $script:showPercentage = $percentageItem.Checked
    Set-BackgroundAppearance $script:backgroundColor
    Update-OverlayLayout
    $form.RenderFrame()
})
$secondaryItem = $moreMenu.Items.Add('Colors')
$colorItem = $secondaryItem.DropDownItems.Add('Background…')
$colorItem.Add_Click({ Show-AppearancePicker 'background' })
$textColorItem = $secondaryItem.DropDownItems.Add('PokéPulse name…')
$textColorItem.Add_Click({ Show-AppearancePicker 'name' })
$numberColorItem = $secondaryItem.DropDownItems.Add('Percentage…')
$numberColorItem.Add_Click({ Show-AppearancePicker 'number' })
$trackColorItem = $secondaryItem.DropDownItems.Add('Empty track…')
$trackColorItem.Add_Click({ Show-AppearancePicker 'track' })
$barOutlineColorItem = $secondaryItem.DropDownItems.Add('Bar outline…')
$barOutlineColorItem.Add_Click({ Show-AppearancePicker 'baroutline' })
$outlineColorItem = $secondaryItem.DropDownItems.Add('Overlay outline…')
$outlineColorItem.Add_Click({ Show-AppearancePicker 'outline' })
$signalItem = $secondaryItem.DropDownItems.Add('Bar, pulse & controls opacity…')
$signalItem.Add_Click({ Show-AppearancePicker 'signal' })
$secondaryItem.DropDown.Renderer = New-Object PokePulseMenuRenderer
$secondaryItem.DropDown.ShowImageMargin = $false
$historyItem = $moreMenu.Items.Add('Recent battle history')
$historyItem.Add_Click({ Start-Process "http://127.0.0.1:$port/history" })
$reportItem = $moreMenu.Items.Add('Report bug')
$reportItem.ShortcutKeyDisplayString = 'Ctrl+Shift+B'
$reportItem.Add_Click({ Save-BugReport 'menu' })
$openReportsItem = $moreMenu.Items.Add('Open bug reports')
$openReportsItem.Add_Click({
    try {
        $info=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/recorder" -TimeoutSec 2
        [IO.Directory]::CreateDirectory($info.reports_directory) | Out-Null
        Start-Process -FilePath 'explorer.exe' -ArgumentList ('"'+$info.reports_directory+'"')
    } catch { $script:status='REPORT FOLDER UNAVAILABLE' }
})
$moreMenu.Items.Add('-') | Out-Null
$closeItem = $moreMenu.Items.Add('Close overlay')
$closeItem.Add_Click({ $form.Close() })
function Update-MeterAccent($score) {
    $next = [System.Drawing.Color]::FromArgb($script:signalAlpha,(Get-StoplightColor $score))
    $changed = $script:meterAccent.ToArgb() -ne $next.ToArgb()
    $script:meterAccent = $next
    $script:signalColor = [System.Drawing.Color]::FromArgb(255,$next.R,$next.G,$next.B)
    if ($changed -and $null -ne $toggleButton -and $null -ne $toggleButton.Image) { $old=$toggleButton.Image; $toggleButton.Image=New-ControlIcon 'eye' $next; $old.Dispose() }
    if ($changed -and $null -ne $moreButton -and $null -ne $moreButton.Image) { $old=$moreButton.Image; $moreButton.Image=New-ControlIcon 'more' $next; $old.Dispose() }
    if ($null -ne $script:moreMenu) {
        $script:moreMenu.ForeColor=$next
        foreach ($item in $script:moreMenu.Items) { if ($item -is [System.Windows.Forms.ToolStripMenuItem]) { $item.ForeColor=$next } }
    }
}
Update-MeterAccent $null
$moreButton.ContextMenuStrip = $moreMenu
$moreButton.Add_Click({ param($sender,$e) $moreMenu.Show($sender,[System.Drawing.Point]::new(0,$sender.Height)) })
$moreMenu.Add_Opening({
    try { $choice=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/optimizer" -TimeoutSec 1; $script:npcAiEnabled=$choice.opponent_model -eq 'npc-ai' } catch {}
    $npcAiItem.Checked = $script:npcAiEnabled
    $orientationItem.Text = if ($script:vertical) { 'Switch to horizontal' } else { 'Switch to vertical' }
    $script:moreMenu.BackColor = $script:backgroundColor
    Update-MeterAccent (Get-DisplayedScore)
})
function Get-OutcomeLabel($score,[bool]$loss=$false,[bool]$animated=$false) {
    if ($null -eq $score) { return '--' }

    $value = if ($null -ne $script:outlookBounds) { $shares=Get-CombinedSegments -Animated:$animated; if ($loss) { $shares.losses } else { $shares.wins } } elseif ($loss) { 100-$score } else { $score }
    return ('{0:0}%' -f [Math]::Round($value))
}
function Get-ResponsiveLayout([double]$width,[double]$height,[bool]$vertical) {
    # Resize/layout callbacks can expose transient invalid dimensions.
    if ([double]::IsNaN($width) -or [double]::IsInfinity($width)) { $width=360 }
    if ([double]::IsNaN($height) -or [double]::IsInfinity($height)) { $height=74 }
    $width=[Math]::Max(8.0,$width);$height=[Math]::Max(8.0,$height)
    $scale=if($vertical){[Math]::Sqrt(($width/72.0)*($height/330.0))}else{[Math]::Sqrt(($width/360.0)*($height/74.0))}
    if($vertical){
        $referenceHeader=[Math]::Min($height*0.38,100*$scale)
        $scale=[Math]::Min($scale,$referenceHeader/100)
        $header=if ($script:showPercentage) { $referenceHeader } else { [Math]::Min($height*0.38,42*$scale) }
        return @{scale=$scale;pulseScale=$scale;header=$header;railTop=$header+22*$scale;railBottom=$height-40;labelTop=$header;labelHeight=22*$scale}
    }
    $header=if ($script:showPercentage) { [Math]::Min($height*0.44,[Math]::Max(28.0,32*$scale)) } else { [Math]::Min($height*0.36,[Math]::Max(24.0,28*$scale)) }
    $referenceHeader=[Math]::Min($height*0.44,[Math]::Max(28.0,32*$scale))
    $pulseScale=[Math]::Min($scale,$referenceHeader/42)
    $railValueWidth=if ($script:showPercentage) { [Math]::Min($width*0.19,62*$scale) } else { 0 }
    return @{scale=$scale;pulseScale=$pulseScale;header=$header;railTop=$header+2;railBottom=$height-5;padding=[Math]::Max(10.0,12*$scale);labelWidth=[Math]::Min($width*0.15,42*$scale);valueWidth=$railValueWidth}
}
function Draw-ResponsiveText($g,$text,$rectangle,$size,$brush,$family='Segoe UI',$alignment=[System.Drawing.StringAlignment]::Center) {
    $font=[System.Drawing.Font]::new($family,[single]$size)
    $format=[System.Drawing.StringFormat]::new()
    try {
        $measure=$g.MeasureString([string]$text,$font)
        $fit=[Math]::Min(1.0,[Math]::Min($rectangle.Width/[Math]::Max(1.0,$measure.Width),$rectangle.Height/[Math]::Max(1.0,$measure.Height)))
        if($fit -lt 1){$font.Dispose();$font=[System.Drawing.Font]::new($family,[single]([Math]::Max(1.0,$size*$fit*0.96)))}
        $format.Alignment=$alignment;$format.LineAlignment=[System.Drawing.StringAlignment]::Center;$format.FormatFlags=[System.Drawing.StringFormatFlags]::NoWrap
        $g.DrawString([string]$text,$font,$brush,$rectangle,$format)
        $script:textLayout+=@{text=[string]$text;size=$font.Size;bounds=$rectangle;measured=$g.MeasureString([string]$text,$font)}
    } finally {$font.Dispose();$format.Dispose()}
}
function Get-CombinedSegments([switch]$Animated) {
    # Bounds certify win and loss mass; a held display estimate cannot certify either.
    if ($null -eq $script:outlookBounds) { return @{wins=0.0;losses=0.0;unresolved=100.0} }
    if ($null -ne $script:outlookBounds.point) {
        $lower=[double]$script:outlookBounds.point;$upper=$lower
    } else { $lower=[double]$script:outlookBounds.lower;$upper=[double]$script:outlookBounds.upper }
    if ([double]::IsNaN($lower) -or [double]::IsNaN($upper) -or [double]::IsInfinity($lower) -or [double]::IsInfinity($upper)) { return @{wins=0.0;losses=0.0;unresolved=100.0} }
    $lower=[Math]::Max(0.0,[Math]::Min(100.0,$lower))
    $upper=[Math]::Max($lower,[Math]::Min(100.0,$upper))
    $losses=100.0-$upper
    if ($Animated -and $null -ne $script:targetScore) {
        $lower=Get-DisplayedScore
        if ($script:animating) {
            $elapsed=1000.0*([System.Diagnostics.Stopwatch]::GetTimestamp()-$script:animationStart)/[System.Diagnostics.Stopwatch]::Frequency
            $t=[Math]::Min(1.0,[Math]::Max(0.0,$elapsed/$script:animationDuration))
            $losses=$script:lossFrom+($script:targetLoss-$script:lossFrom)*(1.0-[Math]::Pow(1.0-$t,3))
        }
    }
    $losses=[Math]::Max(0.0,[Math]::Min(100.0-$lower,$losses))
    return @{wins=$lower;losses=$losses;unresolved=100.0-$lower-$losses}
}
function Draw-CombinedRail($g,$width,$height,[bool]$vertical) {
    $layout=Get-ResponsiveLayout $width $height $vertical;$scale=$layout.scale
    $parts=Get-CombinedSegments -Animated
    if ($vertical) {
        $barWidth=[single]([Math]::Min($width/3,18*$scale));$x=[single](($width-$barWidth)/2)
        $y=[single]($layout.header+4);$barHeight=[single]($layout.railBottom-$y)
    } else {
        $x=[single]$layout.padding;$y=[single]$layout.railTop
        $barWidth=[single]($width-2*$layout.padding);$barHeight=[single]($layout.railBottom-$y)
    }
    $path=New-RoundedPath $x $y $barWidth $barHeight ([Math]::Min(5,[Math]::Min($barWidth,$barHeight)/2))
    $empty=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($script:trackAlpha,$script:trackColor))
    $win=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($script:signalAlpha,76,175,80))
    $loss=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($script:signalAlpha,239,83,80))
    $saved=$g.Save()
    try {
        $g.FillPath($empty,$path);$g.SetClip($path)
        if ($vertical) {
            $g.FillRectangle($win,$x,[single]($y+$barHeight*(1-$parts.wins/100)),$barWidth,[single]($barHeight*$parts.wins/100))
            $g.FillRectangle($loss,$x,$y,$barWidth,[single]($barHeight*$parts.losses/100))
        } else {
            $g.FillRectangle($win,$x,$y,[single]($barWidth*$parts.wins/100),$barHeight)
            $g.FillRectangle($loss,[single]($x+$barWidth*(1-$parts.losses/100)),$y,[single]($barWidth*$parts.losses/100),$barHeight)
        }
    } finally { $g.Restore($saved);$empty.Dispose();$win.Dispose();$loss.Dispose() }
    try { Draw-TrackOutline $g $path } finally { $path.Dispose() }
}
function Draw-OutcomeRails($g,$width,$height,$score,[bool]$vertical) {
    if ($script:meterMode -eq 'combined') { Draw-CombinedRail $g $width $height $vertical; return }
    $sides = @(if ($script:meterMode -eq 'both') { 'wins'; 'losses' } else { $script:meterMode })
    $layout=Get-ResponsiveLayout $width $height $vertical
    $scale=$layout.scale
    $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($script:numberAlpha,$script:numberColor))
    $empty = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($script:trackAlpha,$script:trackColor))
    try {
        for ($i=0;$i -lt $sides.Count;$i++) {
            $loss = $sides[$i] -eq 'losses'
            $fillScore=if($null -eq $score){$script:animationAnchor}else{$score}
            $value = if ($null -ne $script:outlookBounds) { $shares=Get-CombinedSegments -Animated; if ($loss) { $shares.losses } else { $shares.wins } } elseif ($null -eq $fillScore) { 0 } elseif ($loss) { 100-$fillScore } else { $fillScore }
            $value = [Math]::Max(0,[Math]::Min(100,$value))
            $color = if ($sides.Count -eq 1) { [System.Drawing.Color]::FromArgb($script:signalAlpha,(Get-StoplightColor $fillScore)) } elseif ($loss) { [System.Drawing.Color]::FromArgb($script:signalAlpha,239,83,80) } else { [System.Drawing.Color]::FromArgb($script:signalAlpha,76,175,80) }
            if ($vertical) {
                $barWidth=[single]([Math]::Min($width/($sides.Count*2.5),18*$scale));$gap=[single](8*$scale)
                $x=[single]($width/2-($sides.Count*$barWidth+($sides.Count-1)*$gap)/2+$i*($barWidth+$gap));$y=[single]$layout.railTop;$barHeight=[single]($layout.railBottom-$y)
                if($sides.Count -gt 1){Draw-ResponsiveText $g $(if($loss){'L'}else{'W'}) ([System.Drawing.RectangleF]::new(($x-4),$layout.labelTop,($barWidth+8),$layout.labelHeight)) (10.5*$scale) $textBrush}
            } else {
                $rowHeight=[single](($layout.railBottom-$layout.railTop)/$sides.Count);$rowY=[single]($layout.railTop+$i*$rowHeight)
                $x=[single]($layout.padding+$layout.labelWidth+4*$scale);$barWidth=[single]($width-$x-$layout.padding-$layout.valueWidth-4*$scale);$barHeight=[single]([Math]::Max(4,$rowHeight-2*$scale));$y=[single]($rowY+($rowHeight-$barHeight)/2)
                if($sides.Count -gt 1){
                    Draw-ResponsiveText $g $(if($loss){'Loss'}else{'Win'}) ([System.Drawing.RectangleF]::new($layout.padding,$rowY,$layout.labelWidth,$rowHeight)) (10.5*$scale) $textBrush
                    if ($script:showPercentage) { Draw-ResponsiveText $g (Get-OutcomeLabel $score $loss $true) ([System.Drawing.RectangleF]::new(($width-$layout.padding-$layout.valueWidth),$rowY,$layout.valueWidth,$rowHeight)) (10.5*$scale) $textBrush }
                }else{
                    $x=[single]$layout.padding;$barWidth=[single]($width-2*$layout.padding)
                }
            }
            $path=New-RoundedPath $x $y $barWidth $barHeight ([Math]::Min(5,[Math]::Min($barWidth,$barHeight)/2))
            $fill=[System.Drawing.SolidBrush]::new($color)
            try {
                $g.FillPath($empty,$path); $saved=$g.Save(); $g.SetClip($path)
                if ($vertical) { $g.FillRectangle($fill,$x,[single]($y+$barHeight*(1-$value/100)),$barWidth,[single]($barHeight*$value/100)) }
                else { $g.FillRectangle($fill,$x,$y,[single]($barWidth*$value/100),$barHeight) }

                $g.Restore($saved); Draw-TrackOutline $g $path
            } finally { $fill.Dispose();$path.Dispose() }
        }
    } finally { $textBrush.Dispose();$empty.Dispose() }
}
Update-OverlayLayout
$form.Add_Paint({
    param($sender,$e)
    $g = $e.Graphics
    try {
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $width = $sender.ClientSize.Width
    $height = $sender.ClientSize.Height
    if ($width -lt 8 -or $height -lt 8) { return }
    $script:textLayout=@()
    $score = Get-DisplayedScore
    if ($null -ne $script:outlookBounds -and $null -ne $score) { $score=(Get-CombinedSegments -Animated).wins }
    $script:lastRenderedScore=$score
    Update-MeterAccent $score
    $panel = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,$script:backgroundColor.R,$script:backgroundColor.G,$script:backgroundColor.B))
    $label = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($script:nameAlpha,$script:nameColor))
    $numberLabel = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($script:numberAlpha,$script:numberColor))
    $muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,153,174,159))
    $rail = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($script:trackAlpha,$script:trackColor))
    $cardPath = New-RoundedPath 2 2 ($width-4) ($height-4) ([Math]::Min(14,($height-4)/2))
    # One per-pixel alpha surface keeps antialiased edges free of color-key halos.
    $hitSurface = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb([Math]::Max(1,$script:backgroundAlpha),$script:backgroundColor))
    $g.FillPath($hitSurface,$cardPath); $hitSurface.Dispose()
    $edge = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb($script:outlineAlpha,$script:outlineColor),1.25)
    $g.DrawPath($edge,$cardPath)
    $edge.Dispose();$cardPath.Dispose()
    if (-not $script:meterVisible) {
        $pulsePen = New-Object System.Drawing.Pen($script:meterAccent,1.6)
        if ($script:vertical) {
            $pulseCenter = $width/2
            $g.DrawLines($pulsePen,[System.Drawing.PointF[]]@(
                [System.Drawing.PointF]::new(($pulseCenter-16),23),[System.Drawing.PointF]::new(($pulseCenter-10),23),
                [System.Drawing.PointF]::new(($pulseCenter-6),18),[System.Drawing.PointF]::new($pulseCenter,35),
                [System.Drawing.PointF]::new(($pulseCenter+5),12),[System.Drawing.PointF]::new(($pulseCenter+10),23),
                [System.Drawing.PointF]::new(($pulseCenter+16),23)))
        } else {
        $g.DrawLines($pulsePen,[System.Drawing.PointF[]]@(
            [System.Drawing.PointF]::new(12,17),[System.Drawing.PointF]::new(17,17),
            [System.Drawing.PointF]::new(20,13),[System.Drawing.PointF]::new(24,23),
            [System.Drawing.PointF]::new(28,8),[System.Drawing.PointF]::new(32,17),
            [System.Drawing.PointF]::new(37,17)))
        $g.DrawString('PokéPulse',$sender.Font,$label,44,7)
        }
        $pulsePen.Dispose()
        $panel.Dispose();$label.Dispose();$numberLabel.Dispose();$muted.Dispose();$rail.Dispose()
        return
    }
    if ($script:vertical) {
        $layout=Get-ResponsiveLayout $width $height $true
        $scale=$layout.scale
        $pulse = [System.Drawing.Pen]::new($script:meterAccent,1.6)
        $saved=$g.Save();$g.TranslateTransform([single]($width/2-24.5*$scale),0);$g.ScaleTransform([single]$scale,[single]$scale)
        $g.DrawLines($pulse,[System.Drawing.PointF[]]@([System.Drawing.PointF]::new(12,25),[System.Drawing.PointF]::new(17,25),[System.Drawing.PointF]::new(20,21),[System.Drawing.PointF]::new(24,31),[System.Drawing.PointF]::new(28,16),[System.Drawing.PointF]::new(32,25),[System.Drawing.PointF]::new(37,25)))
        $g.Restore($saved);$pulse.Dispose()
        $scoreLabel=if ($script:meterMode -eq 'combined') { Get-OutcomeLabel $score $false $true } else { Get-OutcomeLabel $score ($script:meterMode -eq 'losses') $true }
        if ($script:showPercentage) { Draw-ResponsiveText $g $scoreLabel ([System.Drawing.RectangleF]::new(4,[single](42*$scale),($width-8),[single]($layout.header-42*$scale))) (24*$scale) $numberLabel 'Segoe UI Semibold' }
        Draw-OutcomeRails $g $width $height $score $true
        $panel.Dispose();$label.Dispose();$numberLabel.Dispose();$muted.Dispose();$rail.Dispose()
        return
    }
    $layout=Get-ResponsiveLayout $width $height $false
    $scale=$layout.scale;$pulseScale=$layout.pulseScale
    $pulsePen=[System.Drawing.Pen]::new($script:meterAccent,1.6)
    $saved=$g.Save();$g.TranslateTransform([single]($layout.padding-14*$pulseScale),[single]($layout.header/2-22*$pulseScale));$g.ScaleTransform([single]$pulseScale,[single]$pulseScale)
    $g.DrawLines($pulsePen,[System.Drawing.PointF[]]@([System.Drawing.PointF]::new(14,22),[System.Drawing.PointF]::new(20,22),[System.Drawing.PointF]::new(23,18),[System.Drawing.PointF]::new(27,28),[System.Drawing.PointF]::new(31,13),[System.Drawing.PointF]::new(35,22),[System.Drawing.PointF]::new(42,22)))
    $g.Restore($saved);$pulsePen.Dispose()
    $valueWidth=if ($script:showPercentage) { [Math]::Min($width*0.25,90*$scale) } else { 0 }
    $valueX=$width-68-$valueWidth
    $nameX=$layout.padding+34*$pulseScale
    Draw-ResponsiveText $g 'PokéPulse' ([System.Drawing.RectangleF]::new([single]$nameX,4,[single]($valueX-$nameX-5),[single]($layout.header-8))) (10*$scale) $label 'Segoe UI' ([System.Drawing.StringAlignment]::Near)
    $scoreLabel=if ($script:meterMode -eq 'combined') { Get-OutcomeLabel $score $false $true } else { Get-OutcomeLabel $score ($script:meterMode -eq 'losses') $true }
    if ($script:showPercentage) { Draw-ResponsiveText $g $scoreLabel ([System.Drawing.RectangleF]::new([single]$valueX,4,[single]$valueWidth,[single]($layout.header-8))) (18*$scale) $numberLabel 'Segoe UI Semibold' }
    Draw-OutcomeRails $g $width $height $score $false
    $panel.Dispose();$label.Dispose();$numberLabel.Dispose();$muted.Dispose();$rail.Dispose()
    } catch {
        $message = $_.Exception.ToString()
        if ($message -ne $script:lastPaintError) {
            $script:lastPaintError = $message
            try { Add-Content -LiteralPath (Join-Path $root 'run-bun\live\overlay-errors.log') -Value ("{0:o} {1}" -f [DateTime]::Now,$message) } catch {}
        }
        $g.ResetTransform();$g.ResetClip()
        $g.Clear([System.Drawing.Color]::FromArgb(25,37,31))
        $g.DrawString('Updating...',$sender.Font,[System.Drawing.Brushes]::White,12,10)
    }
})
$form.Add_Resize({
    if ($script:applyingLayout) { return }
    if ($script:meterVisible -and $form.WindowState -eq [System.Windows.Forms.FormWindowState]::Normal) {
        if ($script:vertical) { $script:verticalSize = $form.ClientSize }
        else { $script:horizontalSize = $form.ClientSize }
    }
    Update-OverlayLayout $true
})
foreach ($dragSurface in @($form,$backgroundForm)) { $dragSurface.Add_MouseDown({
    param($sender,$e)
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
        $form.Capture = $true
        $script:dragStart = [System.Windows.Forms.Cursor]::Position
        $script:windowStart = $form.Location
    }
})
$dragSurface.Add_MouseMove({
    param($sender,$e)
    if ($script:dragStart -and [System.Windows.Forms.Control]::MouseButtons -eq [System.Windows.Forms.MouseButtons]::Left) {
        $cursor = [System.Windows.Forms.Cursor]::Position
        $form.Location = [System.Drawing.Point]::new(($script:windowStart.X+$cursor.X-$script:dragStart.X),($script:windowStart.Y+$cursor.Y-$script:dragStart.Y))
    }
})
$dragSurface.Add_MouseUp({ $script:dragStart = $null;$form.Capture = $false }) }
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = $script:appIcon
$tray.Text = 'PokéPulse overlay'
$tray.Visible = $false
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$hide = $menu.Items.Add('Hide overlay')
$hide.Add_Click({ $script:meterVisible = $false; Update-OverlayLayout })
$show = $menu.Items.Add('Show overlay')
$show.Add_Click({ $script:meterVisible = $true; Update-OverlayLayout; $tray.Visible = $false;$form.Show();$form.Activate() })
$menu.Items.Add('-') | Out-Null
$quit = $menu.Items.Add('Exit PokéPulse overlay')
$quit.Add_Click({ $form.Close() })
$form.ContextMenuStrip = $menu
$trayMenu = New-Object System.Windows.Forms.ContextMenuStrip
$trayShow = $trayMenu.Items.Add('Show overlay')
$trayShow.Add_Click({ $tray.Visible = $false;$form.Show();$form.Activate() })
$trayMenu.Items.Add('-') | Out-Null
$trayExit = $trayMenu.Items.Add('Exit PokéPulse overlay')
$trayExit.Add_Click({ $form.Close() })
$tray.ContextMenuStrip = $trayMenu
$tray.Add_DoubleClick({ $tray.Visible = $false;$form.Show();$form.Activate() })
$form.Add_KeyDown({ param($sender,$e) if($e.KeyCode -eq [System.Windows.Forms.Keys]::Escape){$script:meterVisible = $false; Update-OverlayLayout} })

function Update-LiveEstimate($state) {
        $oldParts=Get-CombinedSegments -Animated
        $script:lastRecorderStateId=$state.recording_state_id
        $script:lastStateReceivedAt=$state.tracking.received_at
        $script:outlookRange = $null
        $script:outlookBounds = $null
        if ($state.tracking.status -eq 'battle' -and $null -ne $state.result) {
            $score = $state.result.victory
            if ($null -ne $state.result.outlook.lower_bound -and $null -ne $state.result.outlook.upper_bound) {
                $script:outlookBounds = @{lower=$state.result.outlook.lower_bound;upper=$state.result.outlook.upper_bound;complete=[bool]$state.result.outlook.complete;pending=[bool]$state.result.pending}
                if ($state.result.outlook.approximate -and $null -ne $state.result.display_score) { $script:outlookBounds.point=$state.result.display_score }
            }
            if ($state.result.PSObject.Properties.Name -contains 'display_score') { $score = $state.result.display_score }
            if ($null -ne $script:outlookBounds -and $null -ne $score) { $score=(Get-CombinedSegments).wins }
            $newLoss=(Get-CombinedSegments).losses
            $lossChanged=[Math]::Abs($newLoss-$script:targetLoss) -ge 0.01
            if ($lossChanged -or $null -eq $script:targetScore -or [Math]::Abs($score-$script:targetScore) -ge 0.01) {
                $script:lossFrom=$oldParts.losses;$script:targetLoss=$newLoss
            }
            Set-TargetScore $score $lossChanged
            $script:status = if ($state.result.pending -or $state.result.refining) { 'REFINING OUTLOOK' } elseif ($null -eq $score) { 'OUTLOOK UNRESOLVED' } else { 'LIVE OUTLOOK' }
            if ($null -ne $score -and ($state.result.pending -or $state.result.display_score_kind -eq 'held-estimate-within-current-bounds')) {
                $script:outlookRange = '{0:0.0}' -f $score
            } elseif ($null -ne $score -and -not $state.result.outlook.complete -and $state.result.outlook.unresolved -gt 0) {
                $lowerLabel = '{0:0}' -f $state.result.outlook.lower_bound
                $upperLabel = '{0:0}' -f $state.result.outlook.upper_bound
                if ($lowerLabel -ne $upperLabel) { $script:outlookRange = $lowerLabel + '–' + $upperLabel }
            }
        }
        else { Set-TargetScore $null;$script:animationAnchor=$null;$script:status = if ($state.tracking.status -eq 'outside-battle') { 'WAITING FOR BATTLE' } else { 'WAITING FOR EMULATOR' } }
}
function Send-DisplaySample {
    $payload=@{score=$script:lastRenderedScore;target_score=$script:targetScore;mode=$script:meterMode;vertical=[bool]$script:vertical;visible=[bool]$script:meterVisible;width=$form.ClientSize.Width;height=$form.ClientSize.Height;frame=$form.RenderVersion;client_at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();state_received_at=$script:lastStateReceivedAt;state_id=$script:lastRecorderStateId;outcome_shares=$(if ($script:meterMode -eq 'combined') { Get-CombinedSegments } else { $null });labels=@($script:textLayout | ForEach-Object {$_.text})}
    try { $null=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/display" -Method Post -ContentType 'application/json' -Body ($payload|ConvertTo-Json -Compress -Depth 4) -TimeoutSec 1 } catch {}
}
function Save-BugReport($source='menu') {
    if($script:reportBusy){return}
    $script:reportBusy=$true;$reportItem.Enabled=$false
    try {
        Send-DisplaySample
        $report=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/report" -Method Post -ContentType 'application/json' -Body (@{source=$source}|ConvertTo-Json -Compress) -TimeoutSec 15
        $bitmap=$form.RenderBitmap()
        try {$bitmap.Save((Join-Path $report.directory 'overlay.png'))}finally{$bitmap.Dispose()}
        $script:lastBugReport=$report.report_path
        $tray.Visible=$true;$tray.ShowBalloonTip(4000,'PokéPulse report saved',("Recent battle history saved. Tell me 'check my latest report'.`n"+$report.directory),[System.Windows.Forms.ToolTipIcon]::Info)
    } catch {
        $tray.Visible=$true;$tray.ShowBalloonTip(4000,'PokéPulse report failed',$_.Exception.Message,[System.Windows.Forms.ToolTipIcon]::Error)
    } finally {$script:reportBusy=$false;$reportItem.Enabled=$true}
}
$form.Add_BugReportRequested({ Save-BugReport 'hotkey' })
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 120
$timer.Add_Tick({
    $state=$null
    try {
        $state = Invoke-RestMethod -Uri $stateUrl -TimeoutSec 1
        Update-LiveEstimate $state
        Update-ReaderStatusPanel $state $true
    } catch {
        Set-TargetScore $null;$script:outlookBounds=$null;$script:animationAnchor=$null;$script:status = 'RECONNECTING'
        Update-ReaderStatusPanel $state ($null -ne $state) $_.Exception.Message
    }
    $form.RenderFrame()
    if($null -ne $state){ Send-DisplaySample }
})
$script:animationTimer = New-Object System.Windows.Forms.Timer
$script:animationTimer.Interval = 16
$script:animationTimer.Add_Tick({
    if ($script:animating) { $null = Get-DisplayedScore;$form.RenderFrame() }
    else { $script:animationTimer.Stop() }
})
$script:windowSaveTimer = New-Object System.Windows.Forms.Timer
$script:windowSaveTimer.Interval = 350
$script:windowSaveTimer.Add_Tick({ $script:windowSaveTimer.Stop();Save-OverlayWindowSettings })
$form.Add_FormClosing({ Close-ReaderStatusPanel;$timer.Stop();$script:animationTimer.Stop();$script:windowSaveTimer.Stop();Save-OverlayWindowSettings })
$form.Add_Shown({
    $form.EnsureTaskbarButton()
    $script:bugHotkeyAvailable=$form.RegisterBugHotkey()
    if(-not $script:bugHotkeyAvailable){$reportItem.ShortcutKeyDisplayString='Hotkey unavailable';$reportItem.ToolTipText='Another app uses Ctrl+Shift+B. Use this menu item.'}
    $form.RenderFrame()
    $form.Activate()
    $timer.Start()
    Queue-OverlayWindowSave
    if ($script:writeLayoutDiagnostic) {
        try {
            [IO.File]::WriteAllText((Join-Path $root 'run-bun\live\overlay-layout.json'),
                (@{vertical=$script:vertical;meter_visible=$script:meterVisible;width=$form.ClientSize.Width;height=$form.ClientSize.Height} | ConvertTo-Json -Compress))
        } catch {}
    }
})
$form.Add_FormClosed({ $script:windowSaveTimer.Stop();$script:windowSaveTimer.Dispose();$backgroundForm.Dispose(); $timer.Stop();$timer.Dispose();$script:animationTimer.Stop();$script:animationTimer.Dispose();$tray.Visible=$false;$tray.Dispose();$trayMenu.Dispose() })
[System.Windows.Forms.Application]::Run($form)

