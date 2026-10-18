// Capability boundary for the independently implemented fast model.
// This file selects an engine; it does not implement battle effects.
// Unknown abilities/items use native execution by default.
export const fastMoves=new Set(['Tackle','Scratch','Pound','Leafage','Earthquake','Water Pulse','Ember','Headbutt',
  'Leer','Growl','Tail Whip','Recover','Endure','Splash','Helping Hand']);
// A move being supported does not establish support for its ability/item
// interactions. Unknown callbacks must use the native engine, not disappear.
const fastAbilities=new Set(['No Ability','Run Away','Illuminate','Keen Eye',
 'Guts','Huge Power','Pure Power','Hustle','Technician','Iron Fist','Strong Jaw','Tough Claws','Reckless','Rock Head','Adaptability',
 'Sheer Force','Serene Grace','Shield Dust','Skill Link','Sniper','Super Luck','Battle Armor','Shell Armor','Sturdy','Levitate','Damp',
 'No Guard','Compound Eyes','Victory Star','Sand Veil','Snow Cloak','Tangled Feet','Wonder Skin','Poison Heal','Magic Guard',
 'Water Veil','Water Bubble','Insomnia','Vital Spirit','Sweet Veil','Early Bird','Own Tempo','Limber','Immunity','Magma Armor','Overcoat',
 'Clear Body','White Smoke','Full Metal Body','Hyper Cutter','Big Pecks','Contrary','Simple','Defiant','Competitive','Mirror Armor',
 'Water Absorb','Volt Absorb','Storm Drain','Lightning Rod','Motor Drive','Flash Fire','Unburden','Rough Skin','Iron Barbs','Aftermath',
 'Static','Flame Body','Poison Point','Effect Spore','Poison Touch','Cursed Body','Gooey','Tangling Hair','Stamina','Weak Armor',
 'Justified','Rattled','Water Compaction','Long Reach','Liquid Ooze','Pressure','Gluttony','Unnerve','Corrosion',
 'Chlorophyll','Swift Swim','Sand Rush','Slush Rush','Quick Feet']);
const fastItems=new Set(['Choice Band','Choice Specs','Choice Scarf','Focus Sash','Oran Berry','Sitrus Berry',
 'Figy Berry','Wiki Berry','Mago Berry','Aguav Berry','Iapapa Berry','Lum Berry','Chesto Berry','Pecha Berry','Rawst Berry','Aspear Berry','Cheri Berry','Persim Berry',
 'White Herb','Leftovers','Black Sludge','Life Orb','Rocky Helmet','Flame Orb','Toxic Orb','Wide Lens','Bright Powder','Lax Incense','Zoom Lens',
 'Safety Goggles','Protective Pads','Big Root','Weakness Policy','Absorb Bulb','Cell Battery','Air Balloon',
 'Electric Seed','Grassy Seed','Misty Seed','Psychic Seed']);
export function nativeInteractionReasons(snapshot){
 const reasons=[];
 for(const side of [snapshot.player,snapshot.opponent]){
  const {ability,item}=side.build;
  // Some mechanics (e.g. Blunder Policy) live in engine code rather than a
  // definition callback. Callback inspection alone is not a capability check.
  if(ability&&!fastAbilities.has(ability))reasons.push(`Native ability mechanics: ${ability}`);
  if(item&&!fastItems.has(item))reasons.push(`Native item mechanics: ${item}`);
 }
 return reasons;
}
