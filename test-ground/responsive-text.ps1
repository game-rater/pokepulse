$ErrorActionPreference='Stop'
$workspace='C:\Users\mathm\Pokethreat Meter'
$source=[IO.File]::ReadAllText((Join-Path $workspace 'run-bun\pokepulse-overlay.ps1'))
$source=$source.Replace('[System.Windows.Forms.Application]::Run($form)','').Replace('Split-Path -Parent $PSScriptRoot',"'C:\Users\mathm\Pokethreat Meter'").Replace('$port = 3001','$port = 3005')
Invoke-Expression $source
$settingsPath=Join-Path ([IO.Path]::GetTempPath()) ('pokepulse-text-'+$PID+'.json')
try {
 foreach($dimensions in @(@(0,0),@(-1,74),@([double]::NaN,74),@([double]::PositiveInfinity,74))){
  $layout=Get-ResponsiveLayout $dimensions[0] $dimensions[1] $false
  if([double]::IsNaN($layout.scale)-or [double]::IsInfinity($layout.scale)-or $layout.scale-le 0){throw 'Invalid resize dimensions produced an invalid scale'}
 }
 $script:targetScore=75;$script:animating=$false
 $sizes=@(@($false,300,70),@($false,360,74),@($false,640,148),@($true,64,240),@($true,72,330),@($true,140,440),@($true,200,240))
 foreach($case in $sizes){
  $script:showPercentage=$true
  $visibleLogo=(Get-ResponsiveLayout $case[1] $case[2] ([bool]$case[0])).pulseScale
  $script:showPercentage=$false
  $hiddenLogo=(Get-ResponsiveLayout $case[1] $case[2] ([bool]$case[0])).pulseScale
  if([Math]::Abs($visibleLogo-$hiddenLogo)-gt 0.00001){throw 'Percentage toggle changed pulse logo size'}
 }
 $script:showPercentage=$true
 $fontSizes=@{}
 foreach($case in $sizes){
  $script:vertical=[bool]$case[0];Update-OverlayLayout
  $form.ClientSize=[System.Drawing.Size]::new($case[1],$case[2])
  foreach($mode in @('both','wins','losses')){
   Set-MeterMode $mode
   foreach($partial in @($false,$true)){
    $script:outlookBounds=if($partial){@{lower=0;upper=100;complete=$false;pending=$false}}else{@{lower=75;upper=75;complete=$true;pending=$false}}
    $bitmap=$form.RenderBitmap()
    try{
     if($script:lastPaintError){throw $script:lastPaintError}
     foreach($text in $script:textLayout){
      $r=$text.bounds
      if($r.X -lt 0 -or $r.Y -lt 0 -or $r.Right -gt $form.ClientSize.Width -or $r.Bottom -gt $form.ClientSize.Height){throw "Text outside overlay: $($text.text), $r"}
      if($text.measured.Width -gt $r.Width+0.1 -or $text.measured.Height -gt $r.Height+0.1){throw "Text clips: $($text.text), $r, $($text.measured), font=$($text.size)"}
     }
     if(-not $partial -and $mode -eq 'both'){
      $fontSizes["$($case[0])-$($case[1])"]=$script:textLayout[0].size
      if($case[1] -in @(360,640,140)){$bitmap.Save((Join-Path $workspace ("overlay-text-$($case[1]).png")))}
     }
    }finally{$bitmap.Dispose()}
   }
  }
 }
 if($fontSizes['False-640'] -le $fontSizes['False-360']){throw 'Horizontal text did not grow with the box'}
 if($fontSizes['True-140'] -le $fontSizes['True-72']){throw 'Vertical text did not grow with the box'}
 'PASS: 42 size/mode/range combinations render without clipped or out-of-bounds text; fonts grow with larger boxes.'
}finally{
 $timer.Dispose();$script:animationTimer.Dispose();$tray.Dispose();$backgroundForm.Dispose();$form.Dispose()
 Remove-Item -LiteralPath $settingsPath -ErrorAction SilentlyContinue
}
