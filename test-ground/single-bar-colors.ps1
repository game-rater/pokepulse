$ErrorActionPreference='Stop'
$workspace='C:\Users\mathm\Pokethreat Meter'
$source=[IO.File]::ReadAllText((Join-Path $workspace 'run-bun\pokepulse-overlay.ps1'))
$source=$source.Replace('[System.Windows.Forms.Application]::Run($form)','').Replace('Split-Path -Parent $PSScriptRoot',"'C:\Users\mathm\Pokethreat Meter'").Replace('$port = 3001','$port = 3005')
Invoke-Expression $source
try {
 $script:signalAlpha=255;$script:trackAlpha=255;$script:outlookBounds=$null
 foreach($vertical in @($false,$true)) {
  $width=if($vertical){72}else{360};$height=if($vertical){330}else{100}
  foreach($mode in @('wins','losses')) {
   $script:meterMode=$mode
   foreach($score in @(5,95)) {
    $bitmap=[System.Drawing.Bitmap]::new($width,$height)
    $g=[System.Drawing.Graphics]::FromImage($bitmap)
    try {
     Draw-OutcomeRails $g $width $height $score $vertical
     $layout=Get-ResponsiveLayout $width $height $vertical
     $x=if($vertical){[int]($width/2)}else{[int]($layout.padding+5)}
     $y=if($vertical){[int]($layout.railBottom-5)}else{[int](($layout.railTop+$layout.railBottom)/2)}
     $actual=$bitmap.GetPixel($x,$y);$expected=Get-StoplightColor $score
     if($actual.ToArgb()-ne $expected.ToArgb()){throw "Wrong $mode stoplight color at score $score, vertical=$vertical : $actual"}
    } finally {$g.Dispose();$bitmap.Dispose()}
   }
  }
 }
 'PASS: Win-only and Loss-only bars use victory-based stoplight colors in both orientations.'
} finally {$timer.Dispose();$script:animationTimer.Dispose();$tray.Dispose();$backgroundForm.Dispose();$form.Dispose()}
