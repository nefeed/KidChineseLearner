import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
// The CLI module is JavaScript; these fixtures verify its exported audit contract.
// @ts-expect-error The command-line .mjs module has no TypeScript declarations.
import {auditAudio} from '../scripts/audit-audio.mjs';

interface GeneratorConfiguration {
  overrides: Record<string,unknown>;
  sha: string;
  model: string;
  revision: string;
  modelSHA256: string;
  sampleRate: number;
}
interface ReleaseManifest {
  version: number;
  renderer: string;
  rendererSignature?: string;
  hashAlgorithm: string;
  filePrefix: string;
  model: string;
  modelRevision: string;
  modelSHA256: string;
  modelLicense: string;
  defaultPlaybackRate: number;
  voice: string;
  rate: number;
  complete: boolean | string;
  total: number;
  uniqueRequiredFiles: number;
  planSHA256: string;
  pronunciationOverrides?: Record<string,unknown>;
  pronunciationOverridesSHA256: string;
  pronunciationCacheCorrection: {complete: boolean; overrideSHA256: string};
  files: Record<string,string>;
}
interface AuditReport {
  complete: boolean | string;
  rendererMatches: boolean;
  planMatches: boolean;
  mappingsMatch: boolean;
  countsMatch: boolean;
  overrideMatches: boolean | null;
  coveredTexts: number;
  missingRequired: number;
  unexpectedMappings: number;
  unexpectedFiles: number;
  unexpectedFileExamples: string[];
  brokenMappings: number;
  invalidAACFiles: {file: string; error: string}[];
  currentOverrideSHA256: string | null;
  manifestOverrideConfigSHA256: string | null;
  signatureErrors: string[];
}
interface ReleaseCase {
  name: string;
  change: (manifest: ReleaseManifest,directory: string) => void;
  check: (report: AuditReport) => void;
  succeeds?: boolean;
}

const generator=fileURLToPath(new URL('../scripts/build-kokoro-audio.py',import.meta.url));
const entries=[
  {text:'你好',spoken:'你好',file:'hello.m4a',kind:'fixture'},
  {text:'月亮',spoken:'月亮',file:'moon.m4a',kind:'fixture'},
];
const hash=(text: string) => createHash('sha256').update(text).digest('hex');
let current: GeneratorConfiguration;
let healthy: ReleaseManifest;

before(() => {
  // This reads current constants once with Python's standard library. It never
  // calls main(), installs packages, downloads models or invokes the generator.
  const source=`import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('audio_release_fixture', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(json.dumps({'overrides': module.READING_OVERRIDE_CONFIG,
    'sha': module.READING_OVERRIDE_SHA256, 'model': module.REPO,
    'revision': module.REVISION, 'modelSHA256': module.MODEL_SHA256,
    'sampleRate': module.RATE}))`;
  const result=spawnSync('python3',['-B','-c',source,generator],{encoding:'utf8',timeout:30000});
  assert.ifError(result.error);
  assert.equal(result.status,0,result.stderr);
  current=JSON.parse(result.stdout) as GeneratorConfiguration;
  const signature=JSON.stringify({
    renderer:'kokoro-local-v1',model:current.model,revision:current.revision,
    modelSHA256:current.modelSHA256,sampleRate:current.sampleRate,
    voice:'zf_001',speed:.85,configSHA256:'a'.repeat(64),voiceSHA256:'b'.repeat(64),
  });
  healthy={
    version:2,renderer:'kokoro-local',rendererSignature:signature,
    hashAlgorithm:'sha256-renderer-null-spoken-v1',filePrefix:'kokoro-',
    model:current.model,modelRevision:current.revision,modelSHA256:current.modelSHA256,
    modelLicense:'Apache-2.0',defaultPlaybackRate:1,voice:'zf_001',rate:.85,
    complete:true,total:entries.length,uniqueRequiredFiles:entries.length,
    planSHA256:hash(JSON.stringify(entries)),pronunciationOverrides:current.overrides,
    pronunciationOverridesSHA256:current.sha,
    pronunciationCacheCorrection:{complete:true,overrideSHA256:current.sha},
    files:Object.fromEntries(entries.map(entry => [entry.text,'/audio/'+filename(signature,entry.spoken)])),
  };
});

function filename(signature: string,spoken: string) {
  return `kokoro-${hash(signature+'\0'+spoken).slice(0,20)}.m4a`;
}
// A minimal finalized MP4/AAC container tests the release gates. It is not a
// synthesized voice or a claim that a decoder/listening review has passed.
function atom(kind: string,payload=Buffer.alloc(0)) {
  const output=Buffer.alloc(8+payload.length);
  output.writeUInt32BE(output.length);output.write(kind,4,'ascii');payload.copy(output,8);
  return output;
}
const mvhd=Buffer.alloc(20);mvhd.writeUInt32BE(24000,12);mvhd.writeUInt32BE(24000,16);
const aac=Buffer.concat([
  atom('ftyp'),atom('mdat',Buffer.concat([Buffer.from('mp4a'),Buffer.alloc(24)])),atom('moov',atom('mvhd',mvhd)),
]);

test('Qwen release requires the current local voice, style, reading configuration and complete natural stops',() => {
  const script=fileURLToPath(new URL('../scripts/build-qwen3-audio.py',import.meta.url));
  const source=`import importlib.util, json, sys
spec=importlib.util.spec_from_file_location('qwen_release_fixture',sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
print(json.dumps({'signature':m.renderer_configuration(),'overrides':m.READING_OVERRIDE_CONFIG,'sha':m.READING_OVERRIDE_SHA256}))`;
  const result=spawnSync('python3',['-B','-c',source,script],{encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr);
  const configuration=JSON.parse(result.stdout);
  const signature=JSON.stringify({...configuration.signature,configSHA256:'a'.repeat(64)});
  const base={...structuredClone(healthy),renderer:'qwen3-mlx-local',filePrefix:'qwen3-',
    rendererSignature:signature,model:configuration.signature.model,modelRevision:configuration.signature.revision,
    modelSHA256:configuration.signature.modelSHA256,voice:'Vivian',rate:1,
    pronunciationOverrides:configuration.overrides,pronunciationOverridesSHA256:configuration.sha,
    pronunciationCacheCorrection:{complete:true,overrideSHA256:configuration.sha},
    generationValidation:{naturalStops:2,sha256Verified:2}};
  for (const fault of ['none','style','voice','reading','natural-stop','old-audio']) {
    const directory=mkdtempSync(join(tmpdir(),'kidchinese-qwen-release-'));
    try {
      const manifest=structuredClone(base),modified=JSON.parse(signature);
      if(fault==='style')modified.style='stale style';
      if(fault==='reading')modified.readingOverrideSHA256='0'.repeat(64);
      if(fault==='voice')manifest.voice='Serena';
      if(fault==='natural-stop')manifest.generationValidation.naturalStops=1;
      manifest.rendererSignature=JSON.stringify(modified);
      manifest.files=Object.fromEntries(entries.map(entry => {
        const name=`qwen3-${hash(manifest.rendererSignature+'\0'+entry.spoken).slice(0,20)}.m4a`;
        writeFileSync(join(directory,name),aac);return [entry.text,'/audio/'+name];
      }));
      if(fault==='old-audio')writeFileSync(join(directory,'kokoro-old.m4a'),aac);
      writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest));
      const {failed,report}=auditAudio({directory,entries,complete:true});
      assert.equal(failed,fault!=='none',JSON.stringify({fault,report}));
    } finally { rmSync(directory,{recursive:true,force:true}); }
  }
});

function changeSignature(manifest: ReleaseManifest,directory: string,signature?: string) {
  for (const entry of entries) {
    const original=manifest.files[entry.text].slice('/audio/'.length);
    const renamed=filename(signature??'',entry.spoken);
    renameSync(join(directory,original),join(directory,renamed));
    manifest.files[entry.text]='/audio/'+renamed;
  }
  if (signature===undefined) delete manifest.rendererSignature;
  else manifest.rendererSignature=signature;
}

const cases: ReleaseCase[]=[
  {
    name:'an exact complete Kokoro release passes',succeeds:true,change:() => {},
    check:report => {
      assert.equal(report.overrideMatches,true);assert.equal(report.unexpectedFiles,0);
      assert.equal(report.coveredTexts,2);assert.equal(report.currentOverrideSHA256,current.sha);
    },
  },
  {
    name:'old system-voice audio remaining in the public directory is rejected',
    change:(_manifest,directory) => writeFileSync(join(directory,'old-tingting.m4a'),aac),
    check:report => assert.deepEqual(report.unexpectedFileExamples,['old-tingting.m4a']),
  },
  {
    name:'unused Kokoro audio remaining in the public directory is rejected',
    change:(_manifest,directory) => writeFileSync(join(directory,'kokoro-unused.m4a'),aac),
    check:report => assert.deepEqual(report.unexpectedFileExamples,['kokoro-unused.m4a']),
  },
  {
    name:'an unpublished partial file in the public directory is rejected',
    change:(_manifest,directory) => writeFileSync(join(directory,'clip.partial'),'partial'),
    check:report => assert.deepEqual(report.unexpectedFileExamples,['clip.partial']),
  },
  {
    name:'a missing required text mapping is rejected',
    change:manifest => { delete manifest.files['月亮']; },
    check:report => { assert.equal(report.missingRequired,1);assert.equal(report.mappingsMatch,false); },
  },
  {
    name:'an extra unknown text mapping is rejected',
    change:manifest => { manifest.files['旧文本']=manifest.files['你好']; },
    check:report => { assert.equal(report.unexpectedMappings,1);assert.equal(report.mappingsMatch,false); },
  },
  {
    name:'a mapping to an existing but incorrect audio hash is rejected',
    change:manifest => { manifest.files['你好']=manifest.files['月亮']; },
    check:report => { assert.equal(report.missingRequired,1);assert.equal(report.brokenMappings,0); },
  },
  {
    name:'a missing required AAC file is rejected',
    change:(_manifest,directory) => rmSync(join(directory,filename(healthy.rendererSignature!,entries[0].spoken))),
    check:report => { assert.equal(report.missingRequired,1);assert.equal(report.brokenMappings,1); },
  },
  {
    name:'an incomplete manifest is rejected',change:manifest => { manifest.complete=false; },
    check:report => assert.equal(report.complete,false),
  },
  {
    name:'the string true cannot certify a complete release',change:manifest => { manifest.complete='true'; },
    check:report => assert.equal(report.complete,'true'),
  },
  {
    name:'a stale narration-plan hash is rejected',change:manifest => { manifest.planSHA256='c'.repeat(64); },
    check:report => assert.equal(report.planMatches,false),
  },
  {
    name:'incorrect required-text metadata is rejected',change:manifest => { manifest.total=10; },
    check:report => assert.equal(report.countsMatch,false),
  },
  {
    name:'incorrect unique-file metadata is rejected',change:manifest => { manifest.uniqueRequiredFiles=10; },
    check:report => assert.equal(report.countsMatch,false),
  },
  {
    name:'a stale declared reading-override hash is rejected',
    change:manifest => { manifest.pronunciationOverridesSHA256='d'.repeat(64); },
    check:report => assert.equal(report.overrideMatches,false),
  },
  {
    name:'edited override configuration cannot reuse the current declared hash',
    change:manifest => { manifest.pronunciationOverrides!.version=999; },
    check:report => {
      assert.equal(report.overrideMatches,false);assert.notEqual(report.manifestOverrideConfigSHA256,current.sha);
    },
  },
  {
    name:'missing reading-override configuration is rejected',
    change:manifest => { delete manifest.pronunciationOverrides; },
    check:report => { assert.equal(report.overrideMatches,false);assert.equal(report.manifestOverrideConfigSHA256,null); },
  },
  {
    name:'a stale reading-cache correction certificate is rejected',
    change:manifest => { manifest.pronunciationCacheCorrection.overrideSHA256='e'.repeat(64); },
    check:report => assert.ok(report.signatureErrors.some(error => error.includes('pronunciationCacheCorrection'))),
  },
  {
    name:'a stale model revision is rejected even when all audio hashes and mappings match its signature',
    change:(manifest,directory) => {
      const signature=JSON.parse(manifest.rendererSignature!);signature.revision='old';
      changeSignature(manifest,directory,JSON.stringify(signature));
    },
    check:report => {
      assert.equal(report.missingRequired,0);assert.equal(report.unexpectedFiles,0);
      assert.ok(report.signatureErrors.some(error => error.includes('rendererSignature.revision')));
    },
  },
  {
    name:'a missing renderer signature is rejected',
    change:(manifest,directory) => changeSignature(manifest,directory),
    check:report => { assert.equal(report.missingRequired,0);assert.ok(report.signatureErrors.length>0); },
  },
  {
    name:'a complete legacy renderer is rejected as a public release',
    change:(manifest,directory) => {
      for (const entry of entries) {
        renameSync(join(directory,manifest.files[entry.text].slice('/audio/'.length)),join(directory,entry.file));
        manifest.files[entry.text]='/audio/'+entry.file;
      }
      manifest.renderer='macos-personal-only';manifest.hashAlgorithm='legacy';
    },
    check:report => { assert.equal(report.missingRequired,0);assert.equal(report.rendererMatches,false); },
  },
  {
    name:'an invalid AAC container is rejected',
    change:(_manifest,directory) => writeFileSync(join(directory,filename(healthy.rendererSignature!,entries[0].spoken)),Buffer.alloc(0)),
    check:report => assert.equal(report.invalidAACFiles.length,1),
  },
];

for (const scenario of cases) {
  test(`audio release audit: ${scenario.name}`,() => {
    const directory=mkdtempSync(join(tmpdir(),'kidchinese-audio-release-'));
    try {
      const manifest=structuredClone(healthy);
      for (const entry of entries) writeFileSync(join(directory,filename(manifest.rendererSignature!,entry.spoken)),aac);
      scenario.change(manifest,directory);
      writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest));
      const {report,failed}=auditAudio({directory,entries,complete:true,generator}) as {report: AuditReport; failed: boolean};
      assert.equal(failed,!scenario.succeeds,JSON.stringify(report));
      scenario.check(report);
    } finally {
      rmSync(directory,{recursive:true,force:true});
    }
  });
}
