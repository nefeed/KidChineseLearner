// Check required mappings, current renderer configuration and encoded integrity.
// None of these checks replace listening for pronunciation or naturalness.
import {readFileSync,writeFileSync,readdirSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {plan} from './audio-plan.mjs';
import {inspectAAC} from './audio-integrity.mjs';
import {createHash} from 'node:crypto';

const defaultDirectory=fileURLToPath(new URL('../public/audio/',import.meta.url));
const defaultGenerator=fileURLToPath(new URL('./build-kokoro-audio.py',import.meta.url));
const qwenGenerator=fileURLToPath(new URL('./build-qwen3-audio.py',import.meta.url));
const defaultReport=fileURLToPath(new URL('./verification/audio-audit.json',import.meta.url));
const sha256=text=>createHash('sha256').update(text).digest('hex');

// Importing the generator executes only standard-library definitions, never
// main(), model downloads, Misaki or Torch. Python also computes both JSON hashes
// with the exact canonical serialization used by the generator.
function currentGeneratorConfiguration(generator,manifestPath){
  const source=`import hashlib, importlib.util, json, sys
spec = importlib.util.spec_from_file_location('narration_release_audit', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
manifest = json.load(open(sys.argv[2], encoding='utf-8'))
def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
current = module.READING_OVERRIDE_CONFIG
published = manifest.get('pronunciationOverrides')
print(json.dumps({
    'currentOverrideSHA256': digest(current),
    'generatorOverrideSHA256': module.READING_OVERRIDE_SHA256,
    'manifestOverrideConfigSHA256': digest(published) if isinstance(published, dict) else None,
    'overrideConfigMatches': published == current,
    'model': module.REPO, 'revision': module.REVISION,
    'modelSHA256': module.MODEL_SHA256, 'filePrefix': module.PREFIX,
    'sampleRate': module.RATE,
    'rendererConfiguration': module.renderer_configuration() if hasattr(module, 'renderer_configuration') else None,
}))`;
  const result=spawnSync('python3',['-B','-c',source,generator,manifestPath],{encoding:'utf8',timeout:30000});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(`Cannot check current generator configuration: ${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

// Exported so temporary fixtures can exercise release rejection without writing
// or replacing the real audio-audit.json while narration is being generated.
export function auditAudio({directory=defaultDirectory,entries=[...plan.values()],complete=false,generator}={}){
  directory=resolve(directory);
  const manifestPath=join(directory,'manifest.json');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  const files=manifest.files && typeof manifest.files==='object' && !Array.isArray(manifest.files) ? manifest.files : {};
  const currentPlanSHA256=sha256(JSON.stringify(entries));
  const qwen=manifest.renderer==='qwen3-mlx-local';
  const filePrefix=qwen?'qwen3-':'kokoro-';
  const rendererMatches=(qwen || manifest.renderer==='kokoro-local') && manifest.hashAlgorithm==='sha256-renderer-null-spoken-v1' && manifest.filePrefix===filePrefix;
  const local=rendererMatches || manifest.hashAlgorithm==='sha256-renderer-null-spoken-v1';
  const signatureErrors=[];
  let configuration=null,signature=null,overrideMatches=null;
  if(local){
    try{
      configuration=currentGeneratorConfiguration(resolve(generator??(qwen?qwenGenerator:defaultGenerator)),manifestPath);
      signature=JSON.parse(manifest.rendererSignature);
      if(!signature || typeof signature!=='object' || Array.isArray(signature))throw Error('Renderer signature must be an object');
      const expectedSignature=qwen?configuration.rendererConfiguration:{
        renderer:'kokoro-local-v1',model:configuration.model,revision:configuration.revision,
        modelSHA256:configuration.modelSHA256,sampleRate:configuration.sampleRate,
        voice:manifest.voice,speed:manifest.rate,
      };
      if(!expectedSignature)throw Error('Generator does not describe this renderer');
      const stable=value=>value && typeof value==='object' && !Array.isArray(value)
        ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])) : value;
      for(const [field,expected] of Object.entries(expectedSignature))if(JSON.stringify(stable(signature[field]))!==JSON.stringify(stable(expected)))signatureErrors.push(`rendererSignature.${field} differs from current generator or manifest`);
      for(const field of (qwen?['configSHA256']:['configSHA256','voiceSHA256']))if(!/^[a-f0-9]{64}$/.test(signature[field]??''))signatureErrors.push(`rendererSignature.${field} is not a SHA256`);
      if(qwen){
        if(manifest.voice!==expectedSignature.voice || manifest.rate!==expectedSignature.speed)signatureErrors.push('manifest voice or rate differs from current renderer');
        if(manifest.generationValidation?.naturalStops!==manifest.uniqueRequiredFiles || manifest.generationValidation?.sha256Verified!==manifest.uniqueRequiredFiles)
          signatureErrors.push('generationValidation does not cover all required clips');
      }
      for(const [field,expected] of Object.entries({
        model:configuration.model,modelRevision:configuration.revision,modelSHA256:configuration.modelSHA256,
        filePrefix:configuration.filePrefix,modelLicense:'Apache-2.0',defaultPlaybackRate:1,
      }))if(manifest[field]!==expected)signatureErrors.push(`manifest.${field} differs from current generator`);
      overrideMatches=configuration.overrideConfigMatches &&
        configuration.generatorOverrideSHA256===configuration.currentOverrideSHA256 &&
        manifest.pronunciationOverridesSHA256===configuration.currentOverrideSHA256 &&
        configuration.manifestOverrideConfigSHA256===configuration.currentOverrideSHA256;
      const correction=manifest.pronunciationCacheCorrection;
      if(correction?.complete!==true || correction.overrideSHA256!==configuration.currentOverrideSHA256)
        signatureErrors.push('pronunciationCacheCorrection does not certify the current reading overrides');
    }catch(error){signatureErrors.push(String(error.message));}
  }
  const expectedFile=entry=>manifest.hashAlgorithm==='sha256-renderer-null-spoken-v1'
    ? `${filePrefix}${sha256(`${typeof manifest.rendererSignature==='string' ? manifest.rendererSignature : ''}\0${entry.spoken}`).slice(0,20)}.m4a`
    : entry.file;
  const requiredFiles=new Set(entries.map(expectedFile));
  const requiredTexts=new Set(entries.map(entry=>entry.text));
  const diskEntries=readdirSync(directory,{withFileTypes:true});
  const unexpectedFiles=diskEntries.filter(entry=>entry.name!=='manifest.json' && !requiredFiles.has(entry.name)).map(entry=>entry.name);
  const invalid=[];let valid=0,duration=0;
  for(const entry of diskEntries.filter(entry=>/\.m4a$/i.test(entry.name))){
    try{
      if(!entry.isFile())throw Error('audio is not a regular file');
      duration+=inspectAAC(readFileSync(join(directory,entry.name)));valid++;
    }catch(error){invalid.push({file:entry.name,error:String(error.message)});}
  }
  const missing=[];
  for(const entry of entries){
    const file=expectedFile(entry);
    if(files[entry.text]!==`/audio/${file}` || !existsSync(join(directory,file)))missing.push(entry.text);
  }
  const unexpectedMappings=Object.keys(files).filter(text=>!requiredTexts.has(text));
  const brokenMappings=Object.entries(files).filter(([,path])=>
    typeof path!=='string' || !/^\/audio\/[^/]+\.m4a$/.test(path) || !existsSync(join(directory,path.slice('/audio/'.length))));
  const planMatches=manifest.planSHA256===currentPlanSHA256;
  const mappingsMatch=missing.length===0 && unexpectedMappings.length===0 && Object.keys(files).length===requiredTexts.size;
  const countsMatch=manifest.total===entries.length && manifest.uniqueRequiredFiles===requiredFiles.size;
  const report={
    checkedAt:new Date().toISOString(),voice:manifest.voice,renderer:manifest.renderer??'macos-personal-only',
    complete:manifest.complete,planMatches,rendererMatches,mappingsMatch,countsMatch,
    requiredTexts:entries.length,coveredTexts:entries.length-missing.length,missingRequired:missing.length,
    missingExamples:missing.slice(0,20),manifestMappings:Object.keys(files).length,
    unexpectedMappings:unexpectedMappings.length,unexpectedMappingExamples:unexpectedMappings.slice(0,20),
    requiredAACFiles:requiredFiles.size,validAACFiles:valid,invalidAACFiles:invalid,
    unexpectedFiles:unexpectedFiles.length,unexpectedFileExamples:unexpectedFiles.slice(0,20),
    totalRecordedSeconds:Math.round(duration),brokenMappings:brokenMappings.length,
    currentOverrideSHA256:configuration?.currentOverrideSHA256??null,
    manifestOverrideSHA256:manifest.pronunciationOverridesSHA256??null,
    manifestOverrideConfigSHA256:configuration?.manifestOverrideConfigSHA256??null,
    overrideMatches,signatureErrors,
    boundary:'Checks current renderer and reading configuration, text hashes, exact release directory, mappings, AAC containers and positive durations. It does not prove pronunciation by listening.',
  };
  const failed=invalid.length>0 || brokenMappings.length>0 || (complete && (
    !rendererMatches || manifest.complete!==true || !planMatches || !mappingsMatch || !countsMatch ||
    unexpectedFiles.length>0 || overrideMatches!==true || signatureErrors.length>0));
  return {report,failed};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const directoryIndex=process.argv.indexOf('--directory');
  const {report,failed}=auditAudio({complete:process.argv.includes('--complete'),
    ...(directoryIndex<0?{}:{directory:process.argv[directoryIndex+1]})});
  if(!process.argv.includes('--no-write')){
    mkdirSync(dirname(defaultReport),{recursive:true});
    writeFileSync(defaultReport,JSON.stringify(report,null,2));
  }
  console.log(JSON.stringify(report,null,2));
  if(failed)process.exitCode=1;
}
