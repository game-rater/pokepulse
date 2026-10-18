$ErrorActionPreference='Stop'
$errors=$null;$tokens=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '../run-bun/pokepulse-overlay.ps1'),[ref]$tokens,[ref]$errors)
foreach($name in @('Get-DisplayedScore','Set-TargetScore','Get-CombinedSegments','Update-LiveEstimate','Get-OutcomeLabel')){
 $function=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
 Invoke-Expression $function.Extent.Text
}
$script:targetScore=$null;$script:targetLoss=0.0;$script:lossFrom=0.0;$script:outlookBounds=$null;$script:animating=$false;$script:animationDuration=300.0
$estimate=[pscustomobject]@{victory=36.111111;display_score=36.111111;display_score_kind='simulation-estimate';pending=$false;refining=$true;outlook=[pscustomobject]@{approximate=$true;complete=$false;lower_bound=0;upper_bound=100;unresolved=1}}
$state=[pscustomobject]@{tracking=[pscustomobject]@{status='battle';received_at=0};result=$estimate;recording_state_id=257}
Update-LiveEstimate $state
if((Get-OutcomeLabel (Get-DisplayedScore)) -ne '36%'){throw 'Available estimate was not displayed'}
$state.result=$null
Update-LiveEstimate $state
if($null -ne $script:animationAnchor -or $null -ne $script:targetScore){throw 'Missing estimate left stale bars'}
'Overlay estimate label and missing-result clearing passed.'
