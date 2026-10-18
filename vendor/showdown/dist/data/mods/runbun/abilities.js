exports.Abilities={magmaarmor:{inherit:true,onCriticalHit(){return false;}},galewings:{inherit:true,onModifyPriority(priority,pokemon,target,move){if(move?.type==='Flying')return priority+1;}}};
