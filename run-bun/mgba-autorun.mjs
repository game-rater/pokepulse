// QSettings Qt_4_0 QVariant envelope, followed by mGBA ScriptInfo v1.
// Matches the pinned mGBA/Qt serializers; native startup is integration-tested.
export function autorunSetting(scriptPath){
 const type=Buffer.from('QGBA::AutorunScriptModel::ScriptInfo\0'),path=Buffer.from(scriptPath.replaceAll('\\','/'));
 const header=Buffer.alloc(8);header.writeUInt32BE(127,0);header.writeUInt32BE(type.length,4);
 const info=Buffer.alloc(6);info.writeUInt16BE(1,0);info.writeUInt32BE(path.length,2);
 const data=Buffer.concat([header,type,info,path,Buffer.from([1])]);
 return '@Variant('+[...data].map(b=>'\\x'+b.toString(16).padStart(2,'0')).join('')+')';
}
export function configureAutorun(ini,scriptPath){
 // The portable profile belongs to this launcher. Preserve all other settings.
 const section='[autorunSettings]\n0='+autorunSetting(scriptPath)+'\n';
 const expression=/^\[autorunSettings\][\s\S]*?(?=^\[|$(?![\s\S]))/m;
 return expression.test(ini)?ini.replace(expression,section+'\n'):ini.trimEnd()+'\n\n'+section;
}
