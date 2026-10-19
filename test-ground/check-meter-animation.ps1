$ErrorActionPreference = 'Stop'
# Load only the real arithmetic/update functions. No forms, server, settings,
# emulator, timers or live overlay are started by this regression check.
$errors=$null;$tokens=$null
$path=Join-Path $PSScriptRoot '../run-bun/pokepulse-overlay.ps1'
$ast=[System.Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors | Out-String)}
foreach($name in @('Get-DisplayedScore','Set-TargetScore','Get-CombinedSegments','Update-LiveEstimate','Get-OutcomeLabel')){
 $function=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
 if(-not $function){throw "Missing function: $name"}
 Invoke-Expression $function.Extent.Text
}
function Reset-Animation {
 $script:targetScore=$null;$script:displayedScore=$null;$script:animationAnchor=$null
 $script:targetLoss=0.0;$script:lossFrom=0.0;$script:outlookBounds=$null;$script:animating=$false
 # A very long duration lets the test position the real stopwatch analytically
 # without sleeps, scheduler-sensitive millisecond assertions, or fake UI code.
 $script:animationDuration=1000000000.0
}
function At-Fraction([double]$fraction){$script:animationStart=[System.Diagnostics.Stopwatch]::GetTimestamp()-[long]([System.Diagnostics.Stopwatch]::Frequency*$script:animationDuration*$fraction/1000.0)}
function Close($actual,$expected){if([Math]::Abs($actual-$expected)-gt 0.01){throw "Expected $expected, got $actual"}}
function State($score,[bool]$approximate=$true){
 $lower=if($approximate){0}else{$score};$upper=if($approximate){100}else{$score}
 return [pscustomobject]@{tracking=[pscustomobject]@{status='battle';received_at=1};recording_state_id=1;result=[pscustomobject]@{victory=$score;display_score=$score;outlook=[pscustomobject]@{approximate=$approximate;lower_bound=$lower;upper_bound=$upper;complete=(-not $approximate);unresolved=0}}}
}
foreach($approximate in @($true,$false)){
 Reset-Animation;Update-LiveEstimate (State 80 $approximate)
 if(-not $script:animating){throw 'First prediction did not animate'}
 Close $script:animationFrom 0
 $parts=Get-CombinedSegments -Animated;Close $parts.wins 0;Close $parts.losses 0
 if((Get-OutcomeLabel (Get-DisplayedScore) $false $true)-ne '0%'){throw 'First label jumped to the target'}
 At-Fraction 0.5;$parts=Get-CombinedSegments -Animated
 Close $parts.wins 70;Close $parts.losses 17.5
 if((Get-OutcomeLabel (Get-DisplayedScore) $false $true)-ne '70%'){throw 'Label does not follow the animated win rail'}
 $expectedLoss=('{0:0}%' -f [Math]::Round($parts.losses))
 if((Get-OutcomeLabel (Get-DisplayedScore) $true $true)-ne $expectedLoss){throw 'Label does not follow the animated loss rail'}
 $before=Get-CombinedSegments -Animated;Update-LiveEstimate (State 40 $approximate);$after=Get-CombinedSegments -Animated
 Close $before.wins $after.wins;Close $before.losses $after.losses
 $start=$script:animationStart;Update-LiveEstimate (State 40 $approximate)
 if($start-ne $script:animationStart){throw 'An unchanged prediction restarted the animation'}
 At-Fraction 1.1;$parts=Get-CombinedSegments -Animated;Close $parts.wins 40;Close $parts.losses 60
 if((Get-OutcomeLabel (Get-DisplayedScore) $false $true)-ne '40%'){throw 'Final whole percentage is wrong'}
}
Reset-Animation;Update-LiveEstimate (State 0);$parts=Get-CombinedSegments -Animated;Close $parts.losses 0
At-Fraction 1.1;$parts=Get-CombinedSegments -Animated;Close $parts.wins 0;Close $parts.losses 100
Reset-Animation;$state=State 20 $false;$state.result.outlook.upper_bound=80;Update-LiveEstimate $state
At-Fraction 1.1;$null=Get-DisplayedScore
$state.result.outlook.upper_bound=60;Update-LiveEstimate $state
$parts=Get-CombinedSegments -Animated;Close $parts.wins 20;Close $parts.losses 20
At-Fraction 0.5;$parts=Get-CombinedSegments -Animated;Close $parts.wins 20;Close $parts.losses 37.5
At-Fraction 1.1;$parts=Get-CombinedSegments -Animated;Close $parts.losses 40
Update-LiveEstimate ([pscustomobject]@{tracking=[pscustomobject]@{status='outside-battle'};result=$null})
if((Get-OutcomeLabel (Get-DisplayedScore) $false $true)-ne '--'){throw 'Missing battle invented a percentage'}
Update-LiveEstimate (State 60);Close $script:animationFrom 0
'PASS: desktop first readings, labels, both rails, retargeting, repeated targets, endpoints and battle reset animate correctly.'
