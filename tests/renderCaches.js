// SPDX-License-Identifier: GPL-3.0-only
import {coveredBy} from '../src/core/render/occlusion.js';
import {uniforms} from '../src/core/render/uniforms.js';
import {retainHidden, forgetHidden, hiddenCacheState} from '../src/core/render/hiddenCache.js';
function assert(value, message) { if (!value) throw Error(message); }
const rect={x:10,y:20,width:100,height:60};
assert(!coveredBy(rect,[]),'Empty coverage');
assert(coveredBy(rect,[rect]),'Identical coverage');
assert(coveredBy(rect,[{x:0,y:0,width:60,height:100},{x:60,y:0,width:100,height:100}]),'Joint coverage');
assert(!coveredBy(rect,[{x:0,y:0,width:59,height:100},{x:60,y:0,width:100,height:100}]),'One-pixel gap');
assert(!coveredBy(rect,[{x:NaN,y:0,width:200,height:200}]),'Unknown geometry');
assert(!coveredBy({...rect,width:0},[rect]),'Degenerate target');
assert(!coveredBy(rect,[{x:110,y:20,width:30,height:60}]),'Touching edge is not coverage');
let queries=0, writes=0;
const shader=uniforms({get_uniform_location(){return ++queries},set_uniform_1f(){writes++},set_uniform_float(){writes++}});
shader.scalar('brightness',1);shader.scalar('brightness',1);shader.scalar('brightness',.5);
shader.vector('size',[20,30]);shader.vector('size',[20,30]);shader.vector('size',[20,40]);
assert(queries===2 && writes===4,'Cache locations and changing values independently');
const a={},b={};let released=0;
retainHidden(a,100*1024*1024,()=>released++);
retainHidden(b,100*1024*1024,()=>released++);
assert(released===1 && hiddenCacheState().bytes===100*1024*1024,'Global hidden budget evicts oldest');
forgetHidden(b);
assert(hiddenCacheState().entries===0 && !hiddenCacheState().timer,'Last owner cancels expiry source');
console.log('PASS: conservative coverage, uniform cache and global hidden budget.');
