$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$path=Join-Path $PSScriptRoot '../run-bun/reader-status-panel.ps1'
$errors=$null;$tokens=$null
$null=[System.Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors|Out-String)}
. $path
function Equal($actual,$expected){if($actual -ne $expected){throw "Expected '$expected', got '$actual'"}}
Equal (Get-ReaderUpdateAge $null 1000) 'None yet'
Equal (Get-ReaderUpdateAge 1000 1000) 'Just now'
Equal (Get-ReaderUpdateAge 1000 2000) '1 second ago'
Equal (Get-ReaderUpdateAge 1000 121000) '2 minutes ago'
$script:readerPanel=New-ReaderStatusPanel
try{
    $script:targetScore=51
    $stamp=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $view=[pscustomobject]@{kind='missing-data';title='Missing battle data';connection='connected';detail='The battle is connected, but required information is missing.';action='Wait for the next game update. If this persists, save a bug report.';reasons=@('Wake-up counter unavailable');last_game_at=$stamp;last_prediction_at=$null}
    Update-ReaderStatusPanel ([pscustomobject]@{reader_status=$view}) $true
    Equal $script:readerPanelControls.title.Text 'Missing battle data'
    Equal $script:readerPanelControls.connection.Text 'Connection: Game connected'
    if($script:readerPanelControls.detail.Text -notmatch 'Wake-up counter unavailable'){throw 'Missing reason was not displayed'}
    Equal $script:readerPanelControls.prediction.Text 'Last prediction: None yet'
    Update-ReaderStatusPanel $null $false
    Equal $script:readerPanelControls.title.Text 'Disconnected'
    Equal $script:readerPanelView.last_game_at $stamp
    $view.kind='ready';$view.title='Reading battle';$view.last_prediction_at=$stamp;$view.reasons=@();$view.detail='The latest prediction is available.';$view.action='Keep playing; the meter follows the battle.'
    Update-ReaderStatusPanel ([pscustomobject]@{reader_status=$view}) $true
    Equal $script:readerPanelControls.title.Text 'Reading battle'
    Equal $script:targetScore 51
    $script:readerPanel.ClientSize=[System.Drawing.Size]::new(600,490)
    $script:readerPanel.PerformLayout()
    if($script:readerPanelControls.detail.Bottom -gt $script:readerPanelControls.action.Top){throw 'Details overlap the action text after resizing'}
    if($env:POKEPULSE_PANEL_PREVIEW){
        $bitmap=[System.Drawing.Bitmap]::new($script:readerPanel.Width,$script:readerPanel.Height)
        try{
            $script:readerPanel.DrawToBitmap($bitmap,[System.Drawing.Rectangle]::new(0,0,$bitmap.Width,$bitmap.Height))
            # Render children individually: the form is intentionally never
            # shown, so DrawToBitmap otherwise omits its invisible children.
            $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
            $border=[int](($script:readerPanel.Width-$script:readerPanel.ClientSize.Width)/2)
            $caption=$script:readerPanel.Height-$script:readerPanel.ClientSize.Height-$border
            try{
                foreach($control in $script:readerPanel.Controls){
                    $part=[System.Drawing.Bitmap]::new($control.Width,$control.Height)
                    try{$control.DrawToBitmap($part,[System.Drawing.Rectangle]::new(0,0,$part.Width,$part.Height));$graphics.DrawImageUnscaled($part,$control.Left+$border,$control.Top+$caption)}finally{$part.Dispose()}
                }
            }finally{$graphics.Dispose()}
            $bitmap.Save($env:POKEPULSE_PANEL_PREVIEW)
        }finally{$bitmap.Dispose()}
    }
}finally{Close-ReaderStatusPanel}
Equal $script:readerPanel $null
Write-Output 'PASS: reader status panel controls, reconnect, clock, resize and unchanged meter'
