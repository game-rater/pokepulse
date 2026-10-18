import {readFileSync,writeFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
const file=readFileSync(process.argv[2]);
for(let p=8;p<file.length;){
 const n=file.readUInt32BE(p), type=file.toString('ascii',p+4,p+8),data=file.subarray(p+8,p+8+n);
 if(type==='gbAs'){
  const s=inflateSync(data); console.log('state',s.length,s.subarray(0,32).toString('hex'));
  const ram=Buffer.concat([s.subarray(0x21000,0x61000),s.subarray(0x19000,0x21000)]);
  writeFileSync(process.argv[3]||'Human Testing/isolated/state-ram.bin',ram);
 }
 console.log(type,n);p+=n+12;
}
