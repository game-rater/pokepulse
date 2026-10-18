function Set-PickerColor([System.Drawing.Color]$color) {
    $script:pickerColor = $color
    if ($script:pickerTarget -eq 'background') {
        Set-BackgroundAppearance $color $script:backgroundAlpha $script:pickerBrightness
    } elseif ($script:pickerTarget -ne 'signal') {
        Set-Variable -Scope Script -Name ($script:pickerTarget+'Color') -Value $color
        Set-BackgroundAppearance $script:backgroundColor $script:backgroundAlpha $script:backgroundBrightness
    } else {
        Set-BackgroundAppearance $script:backgroundColor $script:backgroundAlpha $script:backgroundBrightness
    }
    $script:colorHex.Text = '#{0:X2}{1:X2}{2:X2}' -f $color.R,$color.G,$color.B
    $script:colorSwatch.Invalidate()
    $script:colorWheel.Invalidate()
}

function Show-AppearancePicker([string]$target) {
    $script:pickerTarget = $target
    $script:pickerColor = Get-Variable -Scope Script -Name ($target+'Color') -ValueOnly
    $script:pickerBrightness = [int][Math]::Max(10,[Math]::Round(100*[Math]::Max($script:pickerColor.R,[Math]::Max($script:pickerColor.G,$script:pickerColor.B))/255))
    $script:colorPicker = New-Object System.Windows.Forms.Form
    $picker = $script:colorPicker
    $picker.Icon=$form.Icon
    $picker.Text = 'PokéPulse ' + $target
    $picker.Font = [System.Drawing.Font]::new('Segoe UI',10)
    $picker.BackColor = [System.Drawing.Color]::FromArgb(22,29,26)
    $picker.ForeColor = [System.Drawing.Color]::FromArgb(237,244,240)
    $picker.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
    $picker.AutoScaleDimensions = [System.Drawing.SizeF]::new(96,96)
    $picker.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
    $picker.AutoSize = $false
    $picker.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterParent
    $picker.MaximizeBox = $false; $picker.MinimizeBox = $false; $picker.ShowInTaskbar = $false
    $picker.Add_HandleCreated({param($sender,$e) [PokePulsePalette]::DarkTitleBar($sender.Handle)})
    $layout = New-Object System.Windows.Forms.TableLayoutPanel
    $layout.ColumnCount = 1; $layout.AutoSize = $true; $layout.Dock = 'Top'
    $layout.Padding = [System.Windows.Forms.Padding]::new(20)
    $layout.MinimumSize = [System.Drawing.Size]::new(320,0)
    $picker.Controls.Add($layout)
    $title = New-Object System.Windows.Forms.Label
    $title.Text = switch ($target) { 'background' { 'Background' }; 'name' { 'PokéPulse name' }; 'number' { 'Percentage' }; 'track' { 'Empty track' }; 'outline' { 'Overlay outline' }; 'baroutline' { 'Bar outline' }; 'signal' { 'Bar, pulse & controls' } }
    $title.Font = [System.Drawing.Font]::new('Segoe UI Semibold',16)
    $title.AutoSize = $true; $title.Margin = [System.Windows.Forms.Padding]::new(0,0,0,5)
    $layout.Controls.Add($title)
    $hint = New-Object System.Windows.Forms.Label
    $hint.Text = if ($target -eq 'background') { 'Color and transparency for your overlay.' } elseif ($target -eq 'signal') { 'Stoplight colors follow your win estimate.' } else { 'Color and transparency for this element.' }
    $hint.AutoSize = $true; $hint.ForeColor = [System.Drawing.Color]::FromArgb(163,185,172)
    $hint.Margin = [System.Windows.Forms.Padding]::new(0,0,0,14)
    $layout.Controls.Add($hint)
    $script:colorWheel = New-Object System.Windows.Forms.PictureBox
    $script:colorWheel.Name = 'ColorWheel'
    $script:colorWheel.Size = [System.Drawing.Size]::new(200,200)
    $script:colorWheel.SizeMode = 'Zoom'
    $script:colorWheel.Anchor = 'None'; $script:colorWheel.Cursor = 'Hand'
    $script:colorWheel.Margin = [System.Windows.Forms.Padding]::new(0,0,0,16)
    $script:colorWheelBitmap = [PokePulsePalette]::Wheel()
    $script:colorWheel.Image = $script:colorWheelBitmap
    $script:colorWheel.Add_Paint({ param($sender,$e)
        $c=$script:pickerColor; $max=[Math]::Max($c.R,[Math]::Max($c.G,$c.B)); $min=[Math]::Min($c.R,[Math]::Min($c.G,$c.B))
        $radius=if($max -eq 0){0}else{98*($max-$min)/$max}
        $angle=$c.GetHue()*[Math]::PI/180
        $scale=$sender.ClientSize.Width/200.0
        $x=[single]((99.5+$radius*[Math]::Cos($angle))*$scale); $y=[single]((99.5-$radius*[Math]::Sin($angle))*$scale)
        $e.Graphics.SmoothingMode='AntiAlias'
        $dark=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(22,29,26),3)
        $light=[System.Drawing.Pen]::new([System.Drawing.Color]::White,1.5)
        $e.Graphics.DrawEllipse($dark,$x-5,$y-5,10,10); $e.Graphics.DrawEllipse($light,$x-5,$y-5,10,10)
        $dark.Dispose(); $light.Dispose()
    })
    $script:colorWheel.Add_MouseDown({ param($sender,$e)
        if ($e.Button -ne 'Left') { return }; $sender.Capture=$true
        $picked=Get-WheelColor ($e.X*200.0/$sender.ClientSize.Width) ($e.Y*200.0/$sender.ClientSize.Height) $script:pickerBrightness
        if($null -ne $picked){Set-PickerColor $picked}
    })
    $script:colorWheel.Add_MouseMove({ param($sender,$e)
        if(-not $sender.Capture){return}
        $picked=Get-WheelColor ($e.X*200.0/$sender.ClientSize.Width) ($e.Y*200.0/$sender.ClientSize.Height) $script:pickerBrightness
        if($null -ne $picked){Set-PickerColor $picked}
    })
    $script:colorWheel.Add_MouseUp({ param($sender,$e) $sender.Capture=$false })
    if($target -ne 'signal'){$layout.Controls.Add($script:colorWheel)}
    $script:colorSwatch = New-Object System.Windows.Forms.Panel
    $script:colorSwatch.Name = 'ColorPreview'; $script:colorSwatch.Dock = 'Fill'
    $script:colorSwatch.Height = 28; $script:colorSwatch.Margin = [System.Windows.Forms.Padding]::new(0,0,0,8)
    $script:colorSwatch.Add_Paint({ param($sender,$e)
        $light=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(68,79,73))
        $dark=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(46,56,50))
        for($y=0;$y -lt $sender.Height;$y+=7){for($x=0;$x -lt $sender.Width;$x+=7){$b=if(([int]($x/7)+[int]($y/7))%2 -eq 0){$light}else{$dark};$e.Graphics.FillRectangle($b,$x,$y,7,7)}}
        $alpha=Get-Variable -Scope Script -Name ($script:pickerTarget+'Alpha') -ValueOnly
        $fill=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($alpha,$script:pickerColor))
        $e.Graphics.FillRectangle($fill,$sender.ClientRectangle)
        $fill.Dispose(); $light.Dispose(); $dark.Dispose()
    })
    $layout.Controls.Add($script:colorSwatch)
    $script:colorHex = New-Object System.Windows.Forms.Label
    $script:colorHex.AutoSize=$true; $script:colorHex.ForeColor=$hint.ForeColor
    $script:colorHex.Margin=[System.Windows.Forms.Padding]::new(0,0,0,14)
    $script:colorHex.Text='#{0:X2}{1:X2}{2:X2}' -f $script:pickerColor.R,$script:pickerColor.G,$script:pickerColor.B
    if($target -ne 'signal'){$layout.Controls.Add($script:colorHex)}
    $script:brightnessLabel = New-Object System.Windows.Forms.Label
    $script:brightnessLabel.AutoSize=$true; $script:brightnessLabel.Text='Brightness  {0}%' -f $script:pickerBrightness
    if($target -ne 'signal'){$layout.Controls.Add($script:brightnessLabel)}
    $script:brightnessSlider = New-Object PokePulseSlider
    $script:brightnessSlider.Name='BrightnessSlider'; $script:brightnessSlider.AccessibleName='Brightness'
    $script:brightnessSlider.Dock='Fill'; $script:brightnessSlider.Minimum=10; $script:brightnessSlider.Maximum=100; $script:brightnessSlider.Value=$script:pickerBrightness
    $script:brightnessSlider.Margin=[System.Windows.Forms.Padding]::new(0,0,0,10)
    $script:brightnessSlider.Add_ValueChanged({
        if ($script:syncPickedColor) { return }
        $script:pickerBrightness=$script:brightnessSlider.Value
        $script:brightnessLabel.Text='Brightness  {0}%' -f $script:pickerBrightness
        $c=$script:pickerColor; $max=[Math]::Max($c.R,[Math]::Max($c.G,$c.B))
        if($max -le 0){$newColor=[System.Drawing.Color]::FromArgb([int](255*$script:pickerBrightness/100),[int](255*$script:pickerBrightness/100),[int](255*$script:pickerBrightness/100))}
        else{$scale=255*$script:pickerBrightness/(100*$max);$newColor=[System.Drawing.Color]::FromArgb([int]($c.R*$scale),[int]($c.G*$scale),[int]($c.B*$scale))}
        Set-PickerColor $newColor
    })
    if($target -ne 'signal'){$layout.Controls.Add($script:brightnessSlider)}
    {
        $script:opacityLabel = New-Object System.Windows.Forms.Label
        $currentAlpha=Get-Variable -Scope Script -Name ($target+'Alpha') -ValueOnly
        $script:opacityLabel.AutoSize=$true; $script:opacityLabel.Text='Opacity  {0}%' -f [int][Math]::Round(100*$currentAlpha/255)
        $layout.Controls.Add($script:opacityLabel)
        $script:opacitySlider = New-Object PokePulseSlider
        $script:opacitySlider.Name='OpacitySlider'; $script:opacitySlider.AccessibleName=$target+' opacity'
        $script:opacitySlider.Dock='Fill'; $script:opacitySlider.Minimum=0; $script:opacitySlider.Maximum=255; $script:opacitySlider.Value=$currentAlpha
        $script:opacitySlider.Add_ValueChanged({
            Set-Variable -Scope Script -Name ($script:pickerTarget+'Alpha') -Value $script:opacitySlider.Value
            $script:opacityLabel.Text='Opacity  {0}%' -f [int][Math]::Round(100*$script:opacitySlider.Value/255)
            Set-PickerColor $script:pickerColor
        })
        $layout.Controls.Add($script:opacitySlider)
    }.Invoke()
    $footer=New-Object System.Windows.Forms.FlowLayoutPanel
    $footer.AutoSize=$true; $footer.Dock='Fill'; $footer.FlowDirection='RightToLeft'
    $footer.Margin=[System.Windows.Forms.Padding]::new(0,16,0,0)
    $done=New-Object System.Windows.Forms.Button
    $done.Name='Done'; $done.Text='Done'; $done.AutoSize=$true
    $done.Padding=[System.Windows.Forms.Padding]::new(18,7,18,7)
    $done.FlatStyle='Flat'; $done.FlatAppearance.BorderSize=0
    $done.BackColor=[System.Drawing.Color]::FromArgb(55,92,72)
    $done.ForeColor=[System.Drawing.Color]::FromArgb(241,249,244)
    $done.FlatAppearance.MouseOverBackColor=[System.Drawing.Color]::FromArgb(69,111,87)
    $done.DialogResult='OK'; $done.Add_Click({$script:colorPicker.Close()})
    $footer.Controls.Add($done)
    if ($target -ne 'signal') {
        $eyedropper=New-Object System.Windows.Forms.Button
        $eyedropper.Name='ScreenEyedropper';$eyedropper.Text='Pick from screen'
        $eyedropper.AccessibleName='Pick color from screen; Escape cancels'
        $eyedropper.AutoSize=$true;$eyedropper.Padding=[System.Windows.Forms.Padding]::new(8,7,8,7)
        $eyedropper.FlatStyle='Flat';$eyedropper.FlatAppearance.BorderSize=0
        $eyedropper.BackColor=$done.BackColor;$eyedropper.ForeColor=$done.ForeColor
        $eyedropper.FlatAppearance.MouseOverBackColor=$done.FlatAppearance.MouseOverBackColor
        $eyedropper.Add_Click({ Start-ScreenColorPick })
        $footer.Controls.Add($eyedropper)
    }
    $layout.Controls.Add($footer)
    $picker.AcceptButton=$done; $picker.CancelButton=$done
    $picker.ClientSize=$layout.GetPreferredSize([System.Drawing.Size]::new(320,0))
    $picker.Add_Load({
        $content=$script:colorPicker.Controls[0]
        $script:colorPicker.ClientSize=$content.GetPreferredSize([System.Drawing.Size]::new($content.MinimumSize.Width,0))
    })
    try { $picker.ShowDialog($form) | Out-Null }
    finally { $script:colorWheelBitmap.Dispose(); $script:colorWheel.Dispose(); $script:brightnessSlider.Dispose(); $script:brightnessLabel.Dispose(); $script:colorHex.Dispose(); $picker.Dispose(); $script:colorPicker=$null; $script:colorSwatch=$null }
}
