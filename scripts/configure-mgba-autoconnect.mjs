import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {configureAutorun} from '../run-bun/mgba-autorun.mjs';
const [directory,script]=process.argv.slice(2);
if(!directory||!script)throw Error('Usage: configure-mgba-autoconnect.mjs <portable emulator directory> <reader.lua>');
const path=join(resolve(directory),'qt.ini');
writeFileSync(path,configureAutorun(readFileSync(path,'utf8'),resolve(script)));
