# Screen pixels stay in memory and are discarded when picking finishes.
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Windows.Forms;
using System.Runtime.InteropServices;
public sealed class PokePulseScreenPicker : Form {
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    readonly Bitmap desktop;
    Point hover;
    public Color? SelectedColor { get; private set; }
    public static Color Sample(Bitmap pixels, Point point) {
        if (point.X < 0 || point.Y < 0 || point.X >= pixels.Width || point.Y >= pixels.Height)
            throw new ArgumentOutOfRangeException("point");
        return pixels.GetPixel(point.X, point.Y);
    }
    PokePulseScreenPicker(Bitmap pixels, Rectangle bounds) {
        desktop = pixels;
        DoubleBuffered = true;
        AutoScaleMode = AutoScaleMode.None;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        Bounds = bounds;
        TopMost = true;
        ShowInTaskbar = false;
        KeyPreview = true;
        Cursor = Cursors.Cross;
        hover = PointToClient(Cursor.Position);
        MouseMove += delegate(object sender, MouseEventArgs e) { hover = e.Location; Invalidate(); };
        Text = "Pick a screen color - Escape to cancel";
        AccessibleName = Text;
        MouseDown += delegate(object sender, MouseEventArgs e) {
            if (e.Button == MouseButtons.Left) {
                SelectedColor = Sample(desktop, e.Location);
                DialogResult = DialogResult.OK;
            } else DialogResult = DialogResult.Cancel;
            Close();
        };
        KeyDown += delegate(object sender, KeyEventArgs e) {
            if (e.KeyCode == Keys.Escape) { DialogResult = DialogResult.Cancel; Close(); }
        };
    }
    protected override void OnPaint(PaintEventArgs e) {
        e.Graphics.DrawImageUnscaled(desktop, Point.Empty);
        if (hover.X < 0 || hover.Y < 0 || hover.X >= desktop.Width || hover.Y >= desktop.Height) return;
        Color color = Sample(desktop, hover);
        Rectangle monitor = Screen.FromPoint(PointToScreen(hover)).Bounds;
        monitor.Offset(-Left, -Top);
        int x = Math.Max(monitor.Left, Math.Min(hover.X + 22, monitor.Right - 148));
        int y = Math.Max(monitor.Top, Math.Min(hover.Y + 22, monitor.Bottom - 48));
        using (var bg = new SolidBrush(Color.FromArgb(24, 29, 35)))
        using (var swatch = new SolidBrush(color))
        using (var border = new Pen(Color.FromArgb(120, 130, 140))) {
            e.Graphics.FillRectangle(bg, x, y, 146, 46);
            e.Graphics.DrawRectangle(border, x, y, 145, 45);
            e.Graphics.FillRectangle(swatch, x + 8, y + 8, 28, 28);
            e.Graphics.DrawRectangle(Pens.White, x + 8, y + 8, 28, 28);
            TextRenderer.DrawText(e.Graphics, String.Format("#{0:X2}{1:X2}{2:X2}", color.R, color.G, color.B), SystemFonts.MessageBoxFont, new Point(x + 45, y + 15), Color.White);
        }
    }
    public static Color? Pick(IWin32Window owner) {
        // Keep capture, window bounds, and cursor sampling in physical pixels at every display scale.
        IntPtr previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
        try {
        var bounds = SystemInformation.VirtualScreen;
        using (var pixels = new Bitmap(bounds.Width, bounds.Height)) {
            using (var graphics = Graphics.FromImage(pixels))
                graphics.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);
            using (var picker = new PokePulseScreenPicker(pixels, bounds)) {
                picker.ShowDialog(owner);
                return picker.SelectedColor;
            }
        }
        } finally { if (previous != IntPtr.Zero) SetThreadDpiAwarenessContext(previous); }
    }
}
'@

function Set-ScreenPickedColor([System.Drawing.Color]$color) {
    $script:syncPickedColor=$true
    try {
        $script:pickerBrightness=[int][Math]::Max(10,[Math]::Round(100*[Math]::Max($color.R,[Math]::Max($color.G,$color.B))/255))
        $script:brightnessSlider.Value=$script:pickerBrightness
        $script:brightnessLabel.Text='Brightness  {0}%' -f $script:pickerBrightness
    } finally { $script:syncPickedColor=$false }
    Set-PickerColor $color
}

function Start-ScreenColorPick {
    $picker=$script:colorPicker
    $polling=$timer.Enabled;$animation=$script:animationTimer.Enabled
    try {
        $timer.Stop();$script:animationTimer.Stop()
        $picker.Hide()
        [System.Windows.Forms.Application]::DoEvents()
        [System.Threading.Thread]::Sleep(120)
        $picked=[PokePulseScreenPicker]::Pick($form)
        if ($null -ne $picked) { Set-ScreenPickedColor $picked }
    } finally {
        $picker.Show();$picker.Activate()
        if ($polling) { $timer.Start() }
        if ($animation) { $script:animationTimer.Start() }
    }
}
