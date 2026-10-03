import test from 'node:test';
import assert from 'node:assert/strict';
import {ANIMALS,BUILDINGS,REWARDS} from '../src/data/rewards';
import {ZOO_REGIONS,regionFor,rewardRegion} from '../src/data/zoo-regions';
import {arrangeRegion,type MapMember} from '../src/zoo-layout';

test('every animal and building has exactly one region, including old reward species',()=>{
  assert.equal(ZOO_REGIONS.length,6);
  assert.deepEqual(ZOO_REGIONS.flatMap(region=>[...region.animals]).sort(),ANIMALS.map(animal=>animal.id).sort());
  assert.deepEqual(ZOO_REGIONS.flatMap(region=>[...region.buildings]).sort(),BUILDINGS.map(building=>building.id).sort());
  assert.equal(regionFor('animal','turtle').id,'meadow');
  assert.equal(regionFor('animal','dolphin').id,'coast');
  assert.equal(regionFor('animal','panda').id,'bamboo');
  assert.equal(regionFor('animal','parrot').id,'aviary');
  assert.equal(regionFor('animal','elephant').id,'savanna');
  for(const reward of REWARDS) assert.ok(rewardRegion(reward));
});

test('old coordinates that collide across former pages stay saved while every map target is reachable',()=>{
  const members:MapMember[]=Array.from({length:12},(_,index)=>({kind:'animal',key:String(index),x:index%2?39:60,y:index%3?56:77}));
  const before=JSON.stringify(members),width=390,height=310;
  const positions=arrangeRegion(members,width,height,'animal:4',true);
  assert.equal(positions.size,12);assert.equal(JSON.stringify(members),before);
  const pixels=[...positions.values()].map(point=>({x:parseFloat(point.left)*width/100,y:parseFloat(point.top)*height/100}));
  for(const [i,point]of pixels.entries()){
    assert.ok(point.x>=28&&point.x<=width-28&&point.y>=30&&point.y<=height-30);
    for(const other of pixels.slice(i+1))assert.ok(Math.abs(point.x-other.x)>=56||Math.abs(point.y-other.y)>=60);
  }
});

test('a single selected friend follows placement without snapping or mutating progress',()=>{
  const item:MapMember={kind:'animal',key:'rabbit',x:70,y:65};
  const result=arrangeRegion([item],600,400,'animal:rabbit',true).get('animal:rabbit');
  assert.deepEqual(result,{left:'70%',top:'65%'});
});
