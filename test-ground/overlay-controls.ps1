$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::ThrowException)
$source = Get-Content 'run-bun\pokepulse-overlay.ps1' -Raw
$source = $source.Replace('[System.Windows.Forms.Application]::Run($form)','').Replace('Split-Path -Parent $PSScriptRoot',"(Get-Location).Path").Replace('$port = 3001','$port = 3005').Replace('$script:writeLayoutDiagnostic = $true','$script:writeLayoutDiagnostic = $false')
Write-Host 'Loading overlay controls...'
Invoke-Expression $source
Write-Host 'Overlay controls loaded.'
$settingsPath = Join-Path ([IO.Path]::GetTempPath()) ('pokepulse-appearance-test-'+$PID+'.json')
$script:meterMode = 'both'
Add-Type -ReferencedAssemblies System.Drawing @'
using System;
using System.Runtime.InteropServices;
public static class OverlayProbe {
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(System.Drawing.Point point);
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window,uint flags);
}
'@
try {
    $resolvedState = [pscustomobject]@{ tracking=[pscustomobject]@{status='battle'}; result=[pscustomobject]@{victory=100;display_score=100;outlook=[pscustomobject]@{unresolved=0}} }
    Update-LiveEstimate $resolvedState
    $refiningState = [pscustomobject]@{ tracking=[pscustomobject]@{status='battle'}; result=[pscustomobject]@{victory=0;display_score=100;display_score_kind='held-estimate-within-current-bounds';refining=$true;outlook=[pscustomobject]@{unresolved=1;lower_bound=0;upper_bound=100}} }
    Update-LiveEstimate $refiningState
    if ($script:targetScore -ne 0 -or (Get-CombinedSegments).unresolved -ne 100) { throw 'A held provisional estimate was presented as resolved wins' }
    $refiningState.result.display_score=0;$refiningState.result.outlook.unresolved=0;$refiningState.result.display_score_kind='certified-lower-bound';$refiningState.result.refining=$false
    Update-LiveEstimate $refiningState
    if ($script:targetScore -ne 0) { throw 'A resolved loss was hidden by smoothing' }
    function Assert-PickerLayout($picker) {
        foreach ($name in @('ColorWheel','BrightnessSlider','OpacitySlider','Done','ScreenEyedropper')) {
            $control = $picker.Controls.Find($name,$true)[0]
            if (-not $control) { throw "Missing picker control: $name" }
            $bounds = $picker.RectangleToClient($control.RectangleToScreen($control.ClientRectangle))
            if ($bounds.Top -lt 0 -or $bounds.Bottom -gt $picker.ClientSize.Height -or $bounds.Left -lt 0 -or $bounds.Right -gt $picker.ClientSize.Width) { throw "Picker clips $name : $bounds in $($picker.ClientSize)" }
        }
        if ($script:opacityLabel.Height -lt $script:opacityLabel.PreferredHeight) { throw 'Opacity text is clipped' }
    }
    $script:targetScore = 72.5
    $script:animating = $false
    $form.Show()
    $form.RenderFrame()
    if (-not $form.TransparencyKey.IsEmpty) { throw 'Color-key transparency returned' }
    $form.ClientSize = [System.Drawing.Size]::new(520,78)
    if ($form.Font.Size -ne 10 -or $toggleButton.Width -ne 22) { throw 'Controls scaled instead of reflowing' }
    if (@($form.Controls | Where-Object { $_ -is [System.Windows.Forms.Button] -and $_.Visible }).Count -ne 2) { throw 'Expected exactly two visible overlay buttons' }
    if ($moreMenu.Items.Count -ne 7 -or $moreMenu.Items[1].Text -ne 'Show' -or $showOutcomeItem.DropDownItems[4].Text -ne 'Percentage' -or $showOutcomeItem.DropDownItems[3].Text -ne 'Combined win/loss bar' -or $moreMenu.Items[2].Text -ne 'Colors' -or $moreMenu.Items[6].Text -ne 'Close overlay' -or $secondaryItem.DropDownItems.Count -ne 7) { throw 'Menu controls are incomplete' }
    # Toggle the actual control and inspect rendered labels in both orientations.
    $script:showPercentage=$true;$percentageItem.Checked=$true
    foreach ($verticalCase in @($false,$true)) {
        $script:vertical=$verticalCase
        Update-OverlayLayout
        $shownLayout=Get-ResponsiveLayout $form.ClientSize.Width $form.ClientSize.Height $verticalCase
        $percentageItem.PerformClick();$form.RenderFrame()
        $hiddenLayout=Get-ResponsiveLayout $form.ClientSize.Width $form.ClientSize.Height $verticalCase
        if ($hiddenLayout.railTop -ge $shownLayout.railTop) { throw 'Bars did not expand into the freed header space' }
        if (-not $verticalCase -and $hiddenLayout.valueWidth -ne 0) { throw 'Hidden row percentages still reserve space' }
        if ($script:showPercentage -or @($script:textLayout | Where-Object {$_.text -match '[0-9%]'}).Count) { throw 'Hidden percentages were rendered' }
        $savedToggle=Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
        if ($savedToggle.show_percentage -ne $false) { throw 'Percentage preference was not persisted' }
        $percentageItem.PerformClick();$form.RenderFrame()
        if (-not $script:showPercentage -or -not @($script:textLayout | Where-Object {$_.text -match '[0-9%]'}).Count) { throw 'Percentage was not restored' }
    }
    # Rendering must interpolate both shares, including a loss-only update.
    $script:outlookBounds=@{lower=100;upper=100};$script:targetScore=100;$script:animationFrom=0
    $script:lossFrom=0;$script:targetLoss=0;$script:animating=$true
    $script:animationStart=[System.Diagnostics.Stopwatch]::GetTimestamp()-[long]([System.Diagnostics.Stopwatch]::Frequency*$script:animationDuration/2000)
    $animated=Get-CombinedSegments -Animated
    if ($animated.wins -le 0 -or $animated.wins -ge 100) { throw 'Win rail jumped directly to its target' }
    $script:outlookBounds=@{lower=30;upper=30};$script:targetScore=30;$script:animationFrom=30
    $script:lossFrom=0;$script:targetLoss=70;$script:animating=$true
    $script:animationStart=[System.Diagnostics.Stopwatch]::GetTimestamp()-[long]([System.Diagnostics.Stopwatch]::Frequency*$script:animationDuration/2000)
    $animated=Get-CombinedSegments -Animated
    if ($animated.losses -le 0 -or $animated.losses -ge 70 -or $animated.unresolved -lt 0) { throw 'Loss rail did not interpolate independently' }
    $script:vertical=$false;Update-OverlayLayout
    $script:outlookBounds=@{lower=30;upper=80;complete=$false;pending=$false}
    $script:targetScore=30;$script:displayedScore=30;$script:animating=$false;$script:targetLoss=20
    $parts=Get-CombinedSegments
    if ($parts.wins -ne 30 -or $parts.losses -ne 20 -or $parts.unresolved -ne 50) { throw 'Incorrect combined probability segments' }
    foreach ($mode in @('wins','losses','both','combined')) {
        Set-MeterMode $mode;$form.RenderFrame()
        $expected=if($mode -eq 'losses'){'20%'}else{'30%'}
        if (-not @($script:textLayout | Where-Object {$_.text -eq $expected}).Count) { throw "Mode $mode disagrees with shared outcome shares" }
    }
    foreach ($verticalCase in @($false,$true)) {
        $script:vertical=$verticalCase;Update-OverlayLayout
        Set-MeterMode 'combined';$form.RenderFrame()
        if (-not @($script:textLayout | Where-Object {$_.text -eq '30%'}).Count) { throw 'Combined number disagrees with the win share' }
        $bitmap=$form.RenderBitmap()
        $bitmap.Save((Join-Path (Get-Location) ('overlay-combined-'+$verticalCase+'-preview.png')));$bitmap.Dispose()
    }
    $script:outlookBounds=@{lower=75;upper=75;complete=$true;pending=$false}
    $parts=Get-CombinedSegments
    if ($parts.wins -ne 75 -or $parts.losses -ne 25 -or $parts.unresolved -ne 0) { throw 'Completed combined bar retained unresolved space' }
    foreach ($endpoint in @(0,100)) {
        $script:outlookBounds=@{lower=$endpoint;upper=$endpoint;complete=$true;pending=$false}
        $parts=Get-CombinedSegments
        if ($parts.wins -ne $endpoint -or $parts.losses -ne (100-$endpoint) -or $parts.unresolved -ne 0) { throw 'Resolved outcome did not take over the full bar' }
    }
    $script:outlookBounds=$null
    if ((Get-CombinedSegments).unresolved -ne 100) { throw 'Disconnected state fabricated resolved outcomes' }
    $script:vertical=$false;Set-MeterMode 'both';Update-OverlayLayout
    if ($moreButton -isnot [PokePulseIconButton] -or $moreMenu.Renderer -isnot [PokePulseMenuRenderer]) { throw 'Native button or bright menu chrome returned' }
    $secondaryItem.DropDown.Show([System.Drawing.Point]::new(500,100))
    $secondaryItem.DropDownItems[0].Select()
    [System.Windows.Forms.Application]::DoEvents()
    $submenuBitmap=[System.Drawing.Bitmap]::new($secondaryItem.DropDown.Width,$secondaryItem.DropDown.Height)
    $secondaryItem.DropDown.DrawToBitmap($submenuBitmap,$secondaryItem.DropDown.ClientRectangle)
    $submenuBitmap.Save((Join-Path (Get-Location) 'overlay-colors-menu-preview.png'))
    $submenuBitmap.Dispose(); $secondaryItem.DropDown.Close()
    $wheelCenter = Get-WheelColor 99.5 99.5 100
    if ($wheelCenter.R -ne 255 -or $wheelCenter.G -ne 255 -or $wheelCenter.B -ne 255) { throw 'Wheel center should select white' }
    $redSignal=Get-StoplightColor 0;$yellowSignal=Get-StoplightColor 50;$greenSignal=Get-StoplightColor 100
    if ($redSignal.R -lt $redSignal.G -or $yellowSignal.G -lt 150 -or $greenSignal.G -lt $greenSignal.R) { throw 'Stoplight colors are not ordered red-yellow-green' }
    if (([System.Drawing.Bitmap]$moreButton.Image).GetPixel(0,0).A -ne 0) { throw 'Options icon background is not transparent' }
    $buttonBitmap=[System.Drawing.Bitmap]::new($moreButton.Width,$moreButton.Height)
    $moreButton.DrawToBitmap($buttonBitmap,$moreButton.ClientRectangle)
    if ($buttonBitmap.GetPixel(0,0).A -ne 0 -and $buttonBitmap.GetPixel(0,0).ToArgb() -ne $form.BackColor.ToArgb()) { throw ('Options button paints a box: '+$buttonBitmap.GetPixel(0,0)) }
    $buttonBitmap.Dispose()
    $originalBackgroundAlpha=$script:backgroundAlpha
    $script:backgroundAlpha=0
    $transparentButtons=$form.RenderBitmap()
    try {
        foreach($button in @($toggleButton,$moreButton)){
            for($py=$button.Top;$py -lt $button.Bottom;$py++){
                for($px=$button.Left;$px -lt $button.Right;$px++){
                    if($transparentButtons.GetPixel($px,$py).A -eq 0){throw 'Button square contains click-through pixels'}
                }
            }
            if($transparentButtons.GetPixel($button.Left,$button.Top).A -gt 1){throw 'Invisible button square paints visible chrome'}
        }
        $form.RenderFrame();[System.Windows.Forms.Application]::DoEvents()
        $point=$form.PointToScreen([System.Drawing.Point]::new(($moreButton.Left+1),($moreButton.Top+1)))
        $hit=[OverlayProbe]::WindowFromPoint($point)
        if([OverlayProbe]::GetAncestor($hit,2) -ne $form.Handle){throw 'Windows routes the invisible menu-button corner through the overlay'}
    } finally {$transparentButtons.Dispose();$script:backgroundAlpha=$originalBackgroundAlpha;$form.RenderFrame()}
    foreach ($case in @(@(1,39,10),@(518,39,11),@(260,1,12),@(260,76,15),@(1,1,13),@(518,1,14),@(1,76,16),@(518,76,17),@(260,39,1))) {
        $point = $form.PointToScreen([System.Drawing.Point]::new($case[0],$case[1]))
        $packed = (($point.Y -band 65535) -shl 16) -bor ($point.X -band 65535)
        $hit = [OverlayProbe]::SendMessage($form.Handle,0x84,[IntPtr]::Zero,[IntPtr]::new($packed)).ToInt32()
        if ($hit -ne $case[2]) { throw "Resize hit area failed: $case returned $hit" }
    }
    $bitmap = $form.RenderBitmap()
    if ($bitmap.GetPixel(0,0).A -ne 0) { throw 'Overlay corners are not transparent' }
    $bitmap.Save((Join-Path (Get-Location) 'overlay-horizontal-preview.png'))
    $bitmap.Dispose()
    $orientationItem.PerformClick()
    $form.ClientSize = [System.Drawing.Size]::new(150,420)
    $orientationItem.PerformClick()
    if ($form.ClientSize.Width -ne 520 -or $form.ClientSize.Height -ne 78) { throw 'Horizontal dimensions not preserved' }
    $toggleButton.PerformClick()
    if ($form.LastFrameSize.Width -ne 188 -or $form.LastFrameSize.Height -ne 32) { throw 'Minimized surface did not repaint to compact dimensions' }
    $compactBitmap=$form.RenderBitmap()
    if ($compactBitmap.GetPixel(187,31).A -ne 0) { throw 'Compact corner is rectangular' }
    $compactBitmap.Save((Join-Path (Get-Location) 'overlay-compact-preview.png')); $compactBitmap.Dispose()
    $toggleButton.PerformClick()
    if ($form.ClientSize.Width -ne 520 -or $form.ClientSize.Height -ne 78) { throw 'Size lost on visibility toggle' }
    $orientationItem.PerformClick()
    $expandedVertical = $form.ClientSize
    $toggleButton.PerformClick()
    if (-not $script:vertical -or $form.LastFrameSize.Width -ne 72 -or $form.LastFrameSize.Height -ne 76) { throw 'Minimized vertical meter changed to a horizontal layout' }
    if ($toggleButton.Bottom -gt $form.ClientSize.Height -or $moreButton.Right -gt $form.ClientSize.Width) { throw 'Minimized vertical controls are clipped' }
    $compactVerticalBitmap = $form.RenderBitmap()
    if ($compactVerticalBitmap.GetPixel(71,75).A -ne 0) { throw 'Minimized vertical corner is rectangular' }
    $compactVerticalBitmap.Save((Join-Path (Get-Location) 'overlay-compact-vertical-preview.png'));$compactVerticalBitmap.Dispose()
    $toggleButton.PerformClick()
    if ($form.ClientSize -ne $expandedVertical) { throw 'Expanded vertical dimensions lost on minimize' }
    $orientationItem.PerformClick()
    $oldColor = $script:backgroundColor
    $oldAlpha = $script:backgroundAlpha
    $oldBrightness = $script:backgroundBrightness
    $savedSettings = if (Test-Path -LiteralPath $settingsPath) { [IO.File]::ReadAllText($settingsPath) } else { $null }
    $appearanceFrameBefore=$form.RenderVersion
    Set-BackgroundAppearance ([System.Drawing.Color]::FromArgb(36,112,224)) 128 44
    if ($form.RenderVersion -le $appearanceFrameBefore) { throw 'Appearance edit saved without repainting the native surface' }
    $savedColor = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    if ($savedColor.background.r -ne 36 -or $savedColor.background.g -ne 112 -or $savedColor.background.b -ne 224 -or $savedColor.background.alpha -ne 128) { throw 'Background color or opacity did not persist' }
    if ($form.Opacity -ne 1.0 -or [Math]::Abs($backgroundForm.Opacity-(128/255.0)) -gt 0.01) { throw 'Background opacity was not applied to the overlay' }
    $wheelTimer = New-Object System.Windows.Forms.Timer
    $wheelTimer.Interval = 100
    $wheelTimer.Add_Tick({
        $pickerWindow = [System.Windows.Forms.Application]::OpenForms | Where-Object { $_.Text -eq 'PokéPulse background' } | Select-Object -First 1
        if ($pickerWindow) {
            $wheelTimer.Stop()
            try {
            $wheelControl = $pickerWindow.Controls.Find('ColorWheel',$true)[0]
            $brightnessControl = $pickerWindow.Controls.Find('BrightnessSlider',$true)[0]
            $brightnessControl.Value=100
            $mouseClick = [System.Windows.Forms.MouseEventArgs]::new([System.Windows.Forms.MouseButtons]::Left,1,197,99,0)
            $onMouseClick = $wheelControl.GetType().GetMethod('OnMouseDown',[Reflection.BindingFlags]'Instance,NonPublic')
            $onMouseClick.Invoke($wheelControl,@($mouseClick)) | Out-Null
            $pickerWindow.PerformLayout()
            Assert-PickerLayout $pickerWindow
            $pickerBitmap=[System.Drawing.Bitmap]::new($pickerWindow.Width,$pickerWindow.Height)
            $pickerWindow.DrawToBitmap($pickerBitmap,[System.Drawing.Rectangle]::new(0,0,$pickerWindow.Width,$pickerWindow.Height))
            $pickerBitmap.Save((Join-Path (Get-Location) 'overlay-picker-preview.png')); $pickerBitmap.Dispose()
            $pickerWindow.Scale([System.Drawing.SizeF]::new(1.5,1.5))
            $pickerWindow.PerformLayout()
            Assert-PickerLayout $pickerWindow
            $pickerWindow.Controls.Find('Done',$true)[0].PerformClick()
            } catch { $script:pickerTestFailure=$_.Exception.Message }
            finally { $pickerWindow.Close() }
        }
    })
    $wheelTimer.Start()
    $colorItem.PerformClick()
    $wheelTimer.Dispose()
    if ($script:pickerTestFailure) { throw $script:pickerTestFailure }
    if ($script:backgroundColor.R -lt 245 -or $script:backgroundColor.G -gt 12 -or $script:backgroundColor.B -gt 12) { throw "Background wheel click did not select red: $($script:backgroundColor)" }
    $secondaryTimer=New-Object System.Windows.Forms.Timer
    $secondaryTimer.Interval=100
    $secondaryTimer.Add_Tick({
        if ($script:colorPicker -and $script:colorPicker.Visible) {
            $secondaryTimer.Stop()
            if ($script:colorPicker.Controls.Find('OpacitySlider',$true).Count -ne 1) { throw 'Element picker has no opacity control' }
            $script:opacitySlider.Value=128
            if ($script:pickerTarget -ne 'signal') {
                if ($script:colorPicker.Controls.Find('ScreenEyedropper',$true).Count -ne 1) { throw 'Missing screen eyedropper' }
                Set-ScreenPickedColor ([System.Drawing.Color]::FromArgb(71,140,210))
                if ($script:pickerColor.ToArgb() -ne ([System.Drawing.Color]::FromArgb(71,140,210)).ToArgb()) { throw 'Sampled RGB was altered' }
            } else { Set-PickerColor ([System.Drawing.Color]::FromArgb(71,140,210)) }
            $script:colorPicker.Controls.Find('Done',$true)[0].PerformClick()
        }
    })
    $backgroundBeforeSecondary=$script:backgroundColor
    $alphaBeforeSecondary=$script:backgroundAlpha
    $textBeforeSecondary=$script:textColor; $trackBeforeSecondary=$script:trackColor
    foreach ($secondaryTarget in @('name','number','track','outline','baroutline','signal')) {
        $independentName=$script:nameColor; $independentNumber=$script:numberColor; $independentOverlayOutline=$script:outlineColor
        $secondaryTimer.Start()
        Show-AppearancePicker $secondaryTarget
        $secondarySaved=Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
        if ($secondaryTarget -ne 'signal' -and $secondarySaved.secondary.$secondaryTarget.b -ne 210) { throw 'Secondary color did not persist' }
        if ($secondaryTarget -eq 'signal') { if ($secondarySaved.signal_alpha -ne 128) { throw 'Signal opacity did not persist' } }
        elseif ($secondarySaved.secondary.$secondaryTarget.alpha -ne 128) { throw 'Element opacity did not persist' }
        if ($secondaryTarget -eq 'name' -and $script:numberColor -ne $independentNumber) { throw 'Name color changed percentage color' }
        if ($secondaryTarget -eq 'number' -and $script:nameColor -ne $independentName) { throw 'Percentage color changed name color' }
        if ($secondaryTarget -eq 'baroutline' -and $script:outlineColor -ne $independentOverlayOutline) { throw 'Bar outline changed the overlay outline' }
        if ($script:backgroundColor -ne $backgroundBeforeSecondary -or $script:backgroundAlpha -ne $alphaBeforeSecondary) { throw 'Secondary color changed the background' }
    }
    $secondaryTimer.Dispose()
    $outlineProbe=[System.Drawing.Bitmap]::new(40,20)
    $outlineGraphics=[System.Drawing.Graphics]::FromImage($outlineProbe)
    $outlinePath=New-RoundedPath 4 4 30 10 3
    try {
        Draw-TrackOutline $outlineGraphics $outlinePath
        $stroke=$outlineProbe.GetPixel(16,4)
        if($stroke.A -ne 128 -or [Math]::Abs($stroke.B-210) -gt 1 -or [Math]::Abs($stroke.R-71) -gt 1 -or [Math]::Abs($stroke.G-140) -gt 1){throw "Selected bar outline color/opacity did not reach the renderer: $stroke"}
        $outlineGraphics.Clear([System.Drawing.Color]::Transparent)
        $script:baroutlineAlpha=0;Draw-TrackOutline $outlineGraphics $outlinePath
        if($outlineProbe.GetPixel(16,4).A -ne 0){throw 'Zero bar-outline opacity still paints a border'}
        $script:baroutlineAlpha=128
    } finally {$outlinePath.Dispose();$outlineGraphics.Dispose();$outlineProbe.Dispose()}
    $barOutlineBefore=$script:baroutlineColor;$barOutlineAlphaBefore=$script:baroutlineAlpha
    $script:baroutlineColor=[System.Drawing.Color]::Black;$script:baroutlineAlpha=255
    $trackAlphaBefore=$script:trackAlpha; $signalAlphaBefore=$script:signalAlpha
    $script:trackAlpha=0; $script:signalAlpha=0; $script:targetScore=0; $script:animating=$false
    foreach ($borderMode in @($false,$true)) {
        $script:vertical=$borderMode; Update-OverlayLayout
        $borderBitmap=$form.RenderBitmap()
        $layout=Get-ResponsiveLayout $form.ClientSize.Width $form.ClientSize.Height $borderMode
        $foundBlack=$false
        $first=if($borderMode){[int]($form.ClientSize.Width/6)}else{[int][Math]::Floor($layout.railTop)}
        $last=if($borderMode){[int]($form.ClientSize.Width*5/6)}else{[int]($layout.railTop+($layout.railBottom-$layout.railTop)/2)}
        for($pixel=$first;$pixel -le $last;$pixel++){
            $sample=if($borderMode){$borderBitmap.GetPixel($pixel,[int]($layout.railTop+30))}else{$borderBitmap.GetPixel(100,$pixel)}
            if($sample.A -ge 240 -and $sample.R -le 15 -and $sample.G -le 15 -and $sample.B -le 15){$foundBlack=$true;break}
        }
        if(-not $foundBlack){throw 'Black track outline disappears at zero opacity'}
        $borderBitmap.Dispose()
    }
    $script:trackAlpha=$trackAlphaBefore; $script:signalAlpha=$signalAlphaBefore
    $script:baroutlineColor=$barOutlineBefore;$script:baroutlineAlpha=$barOutlineAlphaBefore
    $script:textColor=$textBeforeSecondary; $script:trackColor=$trackBeforeSecondary
    Set-BackgroundAppearance $oldColor $oldAlpha $oldBrightness
    if ($null -eq $savedSettings) { Remove-Item -LiteralPath $settingsPath -ErrorAction SilentlyContinue } else { [IO.File]::WriteAllText($settingsPath,$savedSettings) }
    $timer.Stop()
    $script:animationTimer.Stop()
    foreach ($vertical in @($false,$true)) {
        $script:vertical = $vertical
        Update-OverlayLayout
        foreach ($score in @(100,50,1,0.001,0.000001,0.00000001,0,$null)) {
            $script:targetScore = $score
            $script:animating = $false
            $bitmap = $form.RenderBitmap()
            $bitmap.Dispose()
            if ($script:lastPaintError) { throw $script:lastPaintError }
        }
    }
    $script:verticalSize = [System.Drawing.Size]::new(72,330)
    $script:vertical = $false
    $script:meterVisible = $false
    Update-OverlayLayout
    $orientationItem.PerformClick()
    if (-not $script:vertical -or -not $script:meterVisible -or $form.ClientSize.Width -ne 72 -or $form.ClientSize.Height -ne 330) { throw ('Narrow switch failed: '+$form.ClientSize) }
    $script:targetScore = $null
    $bitmap = $form.RenderBitmap()
    $bitmap.Save((Join-Path (Get-Location) 'overlay-narrow-preview.png'))
    $bitmap.Dispose()
    if ($script:lastPaintError) { throw $script:lastPaintError }
    'PASS: native per-pixel alpha rendering, transparent corners, picker layout at normal and 150% scale, independent element colors and opacity, Colors submenu, resize handling, and both orientations.'
} finally { $form.Close();$form.Dispose() }
