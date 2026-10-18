// Party layout and encrypted substructure order from the creator's
// runandbun.lua. Match the observed BattlePokemon personality/OT pair and
// verify the decrypted checksum before accepting nature or friendship.
export const identityLayout={personality:76,otId:88,playerParty:0x23a98,opponentParty:0x23cf0,partySize:100};
const order=[[0,1,2,3],[0,1,3,2],[0,2,1,3],[0,3,1,2],[0,2,3,1],[0,3,2,1],
  [1,0,2,3],[1,0,3,2],[2,0,1,3],[3,0,1,2],[2,0,3,1],[3,0,2,1],
  [1,2,0,3],[1,3,0,2],[2,1,0,3],[3,1,0,2],[2,3,0,1],[3,2,0,1],
  [1,2,3,0],[1,3,2,0],[2,1,3,0],[3,1,2,0],[2,3,1,0],[3,2,1,0]];
export function readBattleIdentity(ram,battlerOffset,maps){
  const personality=ram.readUInt32LE(battlerOffset+identityLayout.personality),ot=ram.readUInt32LE(battlerOffset+identityLayout.otId);
  for(const party of [identityLayout.playerParty,identityLayout.opponentParty])for(let i=0;i<6;i++){
    const base=party+i*identityLayout.partySize;
    if(ram.readUInt32LE(base)!==personality||ram.readUInt32LE(base+4)!==ot)continue;
    const words=Array.from({length:12},(_,j)=>(ram.readUInt32LE(base+32+j*4)^personality^ot)>>>0);
    const checksum=words.reduce((sum,w)=>sum+(w&0xffff)+(w>>>16),0)&0xffff;
    if(checksum!==ram.readUInt16LE(base+28))continue;
    const growth=order[personality%24][0]*3,species=words[growth]&0xffff;
    if(!species||species>maps.mons.length)continue;
    const hidden=(words[growth+2]>>>16)&31,nature=hidden===26?personality%25:hidden;
    if(nature>24)continue;
    return {personality,nature:maps.nature[nature],friendship:(words[growth+2]>>>8)&255};
  }
  return null;
}
