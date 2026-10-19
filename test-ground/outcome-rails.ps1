$ErrorActionPreference='Stop'
$workspace='C:\Users\mathm\Pokethreat Meter'
$source=[IO.File]::ReadAllText((Join-Path $workspace 'run-bun\pokepulse-overlay.ps1'))
$source=$source.Replace('[System.Windows.Forms.Application]::Run($form)','').Replace('Split-Path -Parent $PSScriptRoot',"'C:\Users\mathm\Pokethreat Meter\dist\Run-and-Bun-Automatic'").Replace('$port = 3001','$port = 3002')
Invoke-Expression $source
$settingsPath=Join-Path ([IO.Path]::GetTempPath()) ('pokepulse-rails-'+$PID+'.json')
try {
    $script:targetScore=10;$script:animating=$false
    $durationBefore=$script:animationDuration;$script:animationDuration=1000000000.0
    Set-TargetScore 90
    $script:animationStart-=[long]([System.Diagnostics.Stopwatch]::Frequency*500000.0)
    $before=Get-DisplayedScore
    if($before-le 10 -or $before-ge 90){throw 'Animation did not interpolate the current estimate'}
    Set-TargetScore 50
    $after=Get-DisplayedScore
    if([Math]::Abs($after-$before)-gt 1){throw 'Retargeting jumped rather than continuing the current animation'}
    $script:animationDuration=$durationBefore
    $state=[pscustomobject]@{tracking=[pscustomobject]@{status='battle'};result=[pscustomobject]@{victory=75;display_score=75;outlook=[pscustomobject]@{complete=$true;lower_bound=75;upper_bound=75;unresolved=0}}}
    Update-LiveEstimate $state
    if ((Get-OutcomeLabel 75 $true) -ne '25%') {throw 'Loss percentage was not complemented'}
    $script:outlookBounds=@{lower=60;upper=85;complete=$false;pending=$false}
    if ((Get-OutcomeLabel 60) -ne '60%' -or (Get-OutcomeLabel 60 $true) -ne '15%') {throw 'Progressive labels do not match the shared outcome values'}
    $script:targetScore=75;$script:animating=$false
    foreach($vertical in @($false,$true)) {
        $script:vertical=$vertical;Update-OverlayLayout
        foreach($mode in @('both','wins','losses')) {
            $script:outcomeItems[$mode].PerformClick()
            $saved=Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
            if($saved.meter_mode -ne $mode){throw 'Display choice was not saved'}
            if(@($script:outcomeItems.Values | Where-Object Checked).Count -ne 1){throw 'Menu choice must be exclusive'}
            $bitmap=$form.RenderBitmap()
            try {
                if($script:lastPaintError){throw $script:lastPaintError}
                if($mode -ne 'both') {
                    $pixel=if($vertical){$bitmap.GetPixel([int]($form.ClientSize.Width/2),($form.ClientSize.Height-50))}else{$bitmap.GetPixel(58,50)}
                    if($mode -eq 'losses' -and $pixel.R -le $pixel.G){throw 'Losses-only menu selection rendered the win rail'}
                    if($mode -eq 'wins' -and $pixel.G -le $pixel.R){throw 'Wins-only menu selection rendered the loss rail'}
                }
                if($mode -eq 'both') {
                    $name=if($vertical){'overlay-paired-vertical.png'}else{'overlay-paired-horizontal.png'}
                    $bitmap.Save((Join-Path $workspace $name))
                }
            } finally {$bitmap.Dispose()}
        }
    }
    $script:outlookBounds=@{lower=99.616;upper=99.633;complete=$true;pending=$false}
    if((Get-OutcomeLabel 99.616) -ne '100%'){throw 'Resolved result still displays a rounded range'}
    $script:outlookBounds=$null
    if((Get-OutcomeLabel $null $true) -ne '--'){throw 'Missing battle produced a numeric loss estimate'}
    'PASS: six orientation/display combinations render; complemented values, persisted exclusive menu choice, resolved values and disconnected labels verified.'
} finally {
    $timer.Dispose();$script:animationTimer.Dispose();$tray.Dispose();$backgroundForm.Dispose();$form.Dispose()
    Remove-Item -LiteralPath $settingsPath -ErrorAction SilentlyContinue
}
