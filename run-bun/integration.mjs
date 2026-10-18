// The generated script uses this installation's bridge path, never a ROM/save path.
export function integrationScript(destination) {
 return `-- PokeThreat Meter: read-only mGBA integration for Run & Bun 1.07.
-- Load once in Tools > Scripting. No game memory or save writes.
local destination = ${JSON.stringify(destination.replaceAll('\\','/'))}
if PokeThreatMeterCallback then callbacks:remove(PokeThreatMeterCallback) end
local sequence, frames = 0, 0
local events, eventId, prints, lastHP, lastSpecies = {}, 0, {}, {}, {}
local session = string.format('%d-%d', os.time(), math.floor(os.clock()*1000000))
local function number(address, size)
 local bytes = emu:readRange(address, size)
 return (string.unpack(size == 4 and '<I4' or size == 2 and '<I2' or '<I1', bytes))
end
local function addEvent(code, move, attacker, target, before)
 eventId = eventId + 1
 local player = number(0x020233ee,1) & 1 == 0 and 0 or 1
 local row = string.format('{"id":%d,"code":%d,"move":%d,"attacker":%d,"target":%d,"turn":%d,"player_index":%d,"hp":[%d,%d],"species":[%d,%d],"phase":%d,"action_index":%d,"before_hp":%d}',eventId,code,move,attacker,target,number(0x03005d23,1),player,number(0x02023426,2),number(0x02023482,2),number(0x020233fc,2),number(0x02023458,2),number(0x03005d04,4),number(0x020233fa,1),before or 0)
 table.insert(events,row);if #events > 128 then table.remove(events,1) end
end
local function observeMessages()
 if number(0x030026f9,1) & 2 == 0 or number(0x020233e4,1) ~= 2 then prints = {};lastHP={};lastSpecies={};return end
 local active = number(0x020233e0,4)
 local resources = number(0x02023a18,4)
 if resources < 0x02000000 or resources + 0x824 > 0x02040000 then prints = {}; return end
 for controller=0,1 do
  local base = resources + 0x24 + controller*0x200
  local header = emu:readRange(base,24)
  if active & (1 << controller) ~= 0 and string.byte(header,1) == 16 then
   local code = string.unpack('<I2',header,3)
   if prints[controller] ~= header and code <= 1024 then addEvent(code,string.unpack('<I2',header,5),number(0x02023594,1),number(0x02023595,1)) end
   prints[controller] = header
  else prints[controller] = nil end
 end
 for battler=0,1 do
  local hp = number(0x02023426+battler*92,2)
  local species = number(0x020233fc+battler*92,2)
  if lastHP[battler] and lastHP[battler] ~= hp and lastSpecies[battler] == species then addEvent(-1,number(0x02023572,2),number(0x02023594,1),battler,lastHP[battler]) end
  lastHP[battler] = hp;lastSpecies[battler] = species
 end
end
local function capture()
 if not emu then return end
 local ok, err = pcall(function()
  local fingerprint = emu:checksum(0)
  if not fingerprint or #fingerprint ~= 4 then error('This mGBA build does not provide binary CRC32 checksums') end
  sequence = sequence + 1
  local journal = assert(io.open(destination .. '/events-' .. (sequence % 2) .. '.json', 'wb'))
  journal:write(string.format('{"version":1,"sequence":%d,"session":"%s","events":[%s]}',sequence,session,table.concat(events,',')))
  journal:close()
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
 local ok, err = pcall(observeMessages)
 if not ok then console:log('PokeThreat event capture: ' .. tostring(err)) end
 if frames % 15 == 0 then capture() end
end)
capture()
console:log('PokeThreat connected. Play normally. Keep the local meter running.')
`;
}
