# Modeless diagnostics, fed by the overlay's existing poll. No extra requests.
$script:readerPanel=$null
$script:readerPanelControls=$null
$script:readerPanelView=$null

function Get-ReaderUpdateAge($stamp,$now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) {
    if($null -eq $stamp){return 'None yet'}
    try{$seconds=[Math]::Floor([Math]::Max(0,([double]$now-[double]$stamp)/1000))}catch{return 'Unknown'}
    if($seconds -lt 1){return 'Just now'}
    if($seconds -eq 1){return '1 second ago'}
    if($seconds -lt 60){return ('{0:0} seconds ago' -f $seconds)}
    return ('{0:0} minutes ago' -f [Math]::Floor($seconds/60))
}
function Get-ReaderPanelView($state,[bool]$connected,$errorMessage='') {
    if(-not $connected){
        return [pscustomobject]@{kind='disconnected';title='Disconnected';connection='Reader not responding';detail='The local Poképulse reader is not responding.';action='Reopen Poképulse if the reader has closed. This panel reconnects automatically when it returns.';reasons=@();last_game_at=$script:readerPanelView.last_game_at;last_prediction_at=$script:readerPanelView.last_prediction_at}
    }
    if($errorMessage){
        return [pscustomobject]@{kind='error';title='Overlay update failed';connection='Reader responding';detail=$errorMessage;action='Save a bug report so the overlay update can be investigated.';reasons=@();last_game_at=$state.tracking.received_at;last_prediction_at=$script:readerPanelView.last_prediction_at}
    }
    if($null -ne $state.reader_status){return $state.reader_status}
    # An old service may still be running after updating the overlay files.
    return [pscustomobject]@{kind='reading';title='Reader responding';connection=$state.tracking.status;detail=$state.tracking.message;action='Restart Poképulse to enable detailed status.';reasons=@();last_game_at=$state.tracking.received_at;last_prediction_at=$null}
}
function Update-ReaderStatusPanel($state,[bool]$connected=$true,$errorMessage='') {
    $script:readerPanelView=Get-ReaderPanelView $state $connected $errorMessage
    if($null -eq $script:readerPanel -or $script:readerPanel.IsDisposed){return}
    $view=$script:readerPanelView
    $connection=switch($view.connection){'connected'{'Game connected'} 'disconnected'{'No game connection'} 'stale'{'Game updates stopped'} default{$view.connection}}
    $texts=@{
        title=$view.title
        connection=('Connection: '+$connection)
        game=('Last game update: '+(Get-ReaderUpdateAge $view.last_game_at))
        prediction=('Last prediction: '+(Get-ReaderUpdateAge $view.last_prediction_at))
        detail=(@($view.detail)+@($view.reasons) -join "`r`n`r`n")
        action=$view.action
    }
    foreach($name in $texts.Keys){if($script:readerPanelControls[$name].Text -ne $texts[$name]){$script:readerPanelControls[$name].Text=$texts[$name]}}
}
function New-ReaderStatusPanel {
    $panel=New-Object System.Windows.Forms.Form
    $panel.Text='Poképulse status';$panel.ClientSize=[System.Drawing.Size]::new(500,390)
    $panel.MinimumSize=[System.Drawing.Size]::new(516,429)
    $panel.StartPosition='CenterScreen';$panel.ShowInTaskbar=$false
    $panel.BackColor=[System.Drawing.Color]::FromArgb(24,31,28)
    $panel.ForeColor=[System.Drawing.Color]::FromArgb(225,237,229)
    $panel.Font=[System.Drawing.Font]::new('Segoe UI',10)
    $script:readerPanelControls=@{}
    foreach($row in @(@('title',16,34),@('connection',58,24),@('game',84,24),@('prediction',110,24),@('action',306,48))){
        $label=New-Object System.Windows.Forms.Label
        $label.Location=[System.Drawing.Point]::new(20,$row[1]);$label.Size=[System.Drawing.Size]::new(460,$row[2])
        $label.Anchor='Top,Left,Right'
        if($row[0] -eq 'title'){$label.Font=[System.Drawing.Font]::new('Segoe UI',17,[System.Drawing.FontStyle]::Bold)}
        if($row[0] -eq 'action'){$label.Anchor='Bottom,Left,Right';$label.Font=[System.Drawing.Font]::new('Segoe UI',9)}
        $panel.Controls.Add($label);$script:readerPanelControls[$row[0]]=$label
    }
    $detail=New-Object System.Windows.Forms.TextBox
    $detail.Location=[System.Drawing.Point]::new(20,146);$detail.Size=[System.Drawing.Size]::new(460,146)
    $detail.Anchor='Top,Bottom,Left,Right';$detail.Multiline=$true;$detail.ReadOnly=$true;$detail.WordWrap=$true
    $detail.ScrollBars='Vertical';$detail.BorderStyle='None';$detail.BackColor=$panel.BackColor;$detail.ForeColor=$panel.ForeColor
    $detail.AccessibleName='Status details';$panel.Controls.Add($detail);$script:readerPanelControls.detail=$detail
    $close=New-Object System.Windows.Forms.Button
    $close.Text='Close';$close.Location=[System.Drawing.Point]::new(390,352);$close.Size=[System.Drawing.Size]::new(90,28)
    $close.UseVisualStyleBackColor=$false;$close.BackColor=[System.Drawing.Color]::FromArgb(40,55,46)
    $close.ForeColor=$panel.ForeColor;$close.FlatStyle='Flat';$close.FlatAppearance.BorderColor=[System.Drawing.Color]::FromArgb(80,103,88)
    $close.Anchor='Bottom,Right';$close.Add_Click({param($sender,$e) $sender.FindForm().Close()});$panel.Controls.Add($close)
    $panel.Add_FormClosed({param($sender,$e) if($script:readerPanel -eq $sender){$script:readerPanel=$null;$script:readerPanelControls=$null}})
    return $panel
}
function Show-ReaderStatusPanel($owner) {
    if($null -ne $script:readerPanel -and -not $script:readerPanel.IsDisposed){$script:readerPanel.Activate();return}
    $script:readerPanel=New-ReaderStatusPanel
    if($null -eq $script:readerPanelView){Update-ReaderStatusPanel $null $false}
    else{Update-ReaderStatusPanel ([pscustomobject]@{reader_status=$script:readerPanelView}) $true}
    if($null -ne $owner){$script:readerPanel.Show($owner)}else{$script:readerPanel.Show()}
}
function Close-ReaderStatusPanel {
    $panel=$script:readerPanel
    if($null -ne $panel -and -not $panel.IsDisposed){$panel.Close();$panel.Dispose()}
    $script:readerPanel=$null;$script:readerPanelControls=$null
}
