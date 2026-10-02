import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';
// @ts-expect-error The offline plan is shared JavaScript with the generation CLI.
import {plan} from '../scripts/audio-plan.mjs';
import {PETS,FOOD_WORDS,COLORS} from '../src/word-play-narration';
import {zooNarrationTexts} from '../src/zoo-narration';

test('literal narration calls and their conditional branches all have a local audio plan entry',()=>{
  const missing:string[]=[];
  for(const file of readdirSync('src/components').filter(name=>name.endsWith('.tsx'))){
    const source=ts.createSourceFile(file,readFileSync(`src/components/${file}`,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const check=(node:ts.Node|undefined):void=>{
      if(!node)return;
      if(ts.isStringLiteralLike(node)&&/\p{Script=Han}/u.test(node.text)&&!plan.has(node.text))missing.push(`${file}: ${node.text}`);
      if(ts.isConditionalExpression(node)){check(node.whenTrue);check(node.whenFalse);}
    };
    const walk=(node:ts.Node):void=>{
      if(ts.isCallExpression(node)&&['say','onSpeak','listenTo','speakFeedback'].includes(node.expression.getText(source)))check(node.arguments[0]);
      ts.forEachChild(node,walk);
    };
    walk(source);
  }
  assert.deepEqual(missing,[],'a normal game prompt must not fall back to another voice because a quote regex missed it');
});

test('variable game feedback has complete coverage for the actual pet, bowl, color and counting vocabulary',()=>{
  const prompts:string[]=[];
  for(const [char,pet] of Object.entries(PETS))prompts.push(`这份不适合。${pet.hint}`,`${pet.name}吃了一口。${char}。`);
  for(const [char,food] of Object.entries(FOOD_WORDS))prompts.push(`这不是${food.name}，再看看。`,`${food.name}放进碗里。${char}。`);
  for(const char of Object.keys(COLORS))prompts.push(`先选${char}色。`,`${char}色的花瓣。`,`${char}色。`);
  for(const item of ['小花','小草','树'])for(let i=1;i<=3;i++)prompts.push(`${i}棵${item}长出来啦。`);
  prompts.push('先点牙膏。','先点肥皂。');
  assert.deepEqual(prompts.filter(text=>!plan.has(text)),[]);
});

test('every supported zoo reward, building and animal-food feedback has a local narration entry',()=>{
  assert.deepEqual(zooNarrationTexts().filter(text=>!plan.has(text)),[]);
});
