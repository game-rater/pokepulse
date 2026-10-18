import test from 'node:test';
import assert from 'node:assert/strict';
import {readBattlePhase,phaseLayout} from '../run-bun/memory.mjs';
test('ROM phase callback separates selection, queued actions and end-of-turn effects',()=>{
 const ram=Buffer.alloc(0x48000);ram.writeUInt32LE(phaseLayout.selection,phaseLayout.callback);ram[phaseLayout.turn]=4;ram[phaseLayout.action]=2;ram[phaseLayout.order]=1;
 assert.equal(readBattlePhase(ram).kind,'selection');assert.equal(readBattlePhase(ram).turn,4);
 ram.writeUInt32LE(phaseLayout.actions,phaseLayout.callback);ram[phaseLayout.action]=0;
 assert.equal(readBattlePhase(ram).kind,'resolving');ram[phaseLayout.action]=1;assert.equal(readBattlePhase(ram).action_index,1);
 ram.writeUInt32LE(phaseLayout.endTurn,phaseLayout.callback);assert.equal(readBattlePhase(ram).kind,'end-turn');
 ram.writeUInt32LE(0x08001235,phaseLayout.callback);assert.equal(readBattlePhase(ram).kind,'transition','unknown callbacks must not be fresh turns');
 ram.writeUInt32LE(phaseLayout.selection,phaseLayout.callback);ram[phaseLayout.turn]=5;assert.equal(readBattlePhase(ram).turn,5);
});
