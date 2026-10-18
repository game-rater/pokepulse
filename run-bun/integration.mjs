// The generated script uses this installation's bridge path, never a ROM/save path.
export function integrationScript(destination) {
 return `-- PokeThreat Meter: read-only mGBA integration for Run & Bun 1.07.
-- Load once in Tools > Scripting. No game memory or save writes.
local destination = ${JSON.stringify(destination.replaceAll('\\','/'))}
if PokeThreatMeterCallback then callbacks:remove(PokeThreatMeterCallback) end
local sequence, frames = 0, 0
local function capture()
 if not emu then return end
 local ok, err = pcall(function()
  local fingerprint = emu:checksum(0)
  if not fingerprint or #fingerprint ~= 4 then error('This mGBA build does not provide binary CRC32 checksums') end
  sequence = sequence + 1
  local file, reason = io.open(destination .. '/capture-' .. (sequence % 2) .. '.bin', 'wb')
  if not file then error(reason) end
  local serial = string.pack('<I4', sequence)
  file:write('PTHREAT1', fingerprint, serial, emu:readRange(0x02000000, 0x40000), emu:readRange(0x03000000, 0x8000), serial)
  file:close()
 end)
 if not ok then console:log('PokeThreat: ' .. tostring(err)) end
end
PokeThreatMeterCallback = callbacks:add('frame', function()
 frames = frames + 1
 if frames % 15 == 0 then capture() end
end)
capture()
console:log('PokeThreat connected. Play normally. Keep the local meter running.')
`;
}
