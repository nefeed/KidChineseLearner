import { mkdirSync, copyFileSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
const files=['SPEC.md','RESEARCH.md','HANZI_SOURCES.md','POETRY_SOURCES.md','VERIFICATION.md','REVIEW.md','LICENSING.md','ZOO_VERIFICATION.md', 'IPAD_VERIFICATION.md'];
mkdirSync('public/docs',{recursive:true});
for(const file of files)copyFileSync(`docs/${file}`,`public/docs/${file}`);
for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md','README.md']){
  copyFileSync(file,`public/${file}`);
  // The root notices link into docs; adjust only this nested static copy.
  writeFileSync(`public/docs/${file}`,readFileSync(file,'utf8').replace(/\]\(docs\//g,']('));
}
cpSync('docs/licenses','public/docs/licenses',{recursive:true});
cpSync('docs/screenshots','public/docs/screenshots',{recursive:true});
mkdirSync('public/data/strokes',{recursive:true});
copyFileSync('docs/licenses/hanzi-writer-data-ARPHICPL.TXT','public/data/strokes/ARPHICPL.TXT');
