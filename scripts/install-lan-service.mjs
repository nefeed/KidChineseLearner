#!/usr/bin/env node
// Install this release server as a per-user macOS login service; no sudo needed.
import {mkdirSync,existsSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir,userInfo} from 'node:os';
import {spawnSync} from 'node:child_process';

if(process.platform!=='darwin')throw Error('macOS login service only. On other systems run npm run serve:lan.');
const root=fileURLToPath(new URL('../',import.meta.url));
if(!existsSync(join(root,'dist/index.html')))throw Error('Run npm run build before installing the LAN service.');
const label='com.nefeed.kidchineselearner',domain=`gui/${userInfo().uid}`;
const folder=join(homedir(),'Library/LaunchAgents'),logs=join(homedir(),'Library/Logs/KidChineseLearner');
const target=join(folder,label+'.plist');
const nodePath=['/opt/homebrew/bin/node','/usr/local/bin/node'].find(path=>existsSync(path)&&realpathSync(path)===realpathSync(process.execPath))??process.execPath;
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
if(existsSync(target)&&!readFileSync(target,'utf8').includes(escape(join(root,'scripts/serve-lan.mjs'))))throw Error('A different service already uses this label. Refusing to overwrite it.');
mkdirSync(folder,{recursive:true});mkdirSync(logs,{recursive:true});
const plist=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${escape(nodePath)}</string><string>${escape(join(root,'scripts/serve-lan.mjs'))}</string><string>--port</string><string>5173</string></array>
<key>WorkingDirectory</key><string>${escape(root)}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${escape(join(logs,'server.log'))}</string>
<key>StandardErrorPath</key><string>${escape(join(logs,'server-error.log'))}</string>
<key>EnvironmentVariables</key><dict><key>NODE_ENV</key><string>production</string></dict>
</dict></plist>\n`;
spawnSync('launchctl',['bootout',domain,target],{encoding:'utf8'});
writeFileSync(target,plist);
for(const args of [['bootstrap',domain,target],['kickstart','-k',`${domain}/${label}`]]){
 const result=spawnSync('launchctl',args,{encoding:'utf8'});
 if(result.status!==0)throw Error(`launchctl ${args[0]} failed: ${result.stderr.trim()}`);
}
console.log(JSON.stringify({service:label,plist:target,logs,port:5173}));
