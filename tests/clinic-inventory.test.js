import test from 'node:test';
import assert from 'node:assert/strict';
import { milliMl, normalizeUsage, requestKey } from '../src/services/clinicInventory.js';
test('ml preserves fractional quantities without floating point drift', () => {
  assert.equal(milliMl('3.5'),3500);
  assert.equal(milliMl('0.001'),1);
  assert.equal(milliMl('250')-milliMl('3.5'),246500);
  assert.equal(milliMl('0',{zero:true}),0);
});
test('invalid and overly precise quantities are rejected', () => {
  for(const value of [-1,'',null,NaN,Infinity,'1.2345','1e4','0','2,5','1000001']) assert.throws(()=>milliMl(value));
});
test('usage requires explicit no-products or unique positive items', () => {
  assert.deepEqual(normalizeUsage([],true),[]);
  assert.throws(()=>normalizeUsage([],false));
  assert.throws(()=>normalizeUsage([{supplyId:'a',ml:1}],true));
  assert.throws(()=>normalizeUsage([{supplyId:'a',ml:1},{supplyId:'a',ml:2}],false));
  assert.equal(normalizeUsage([{supplyId:'a',ml:'0.25'}],false)[0].milliMl,250);
});
test('movements require a stable idempotency reference',()=>{
  assert.throws(()=>requestKey(''));
  assert.equal(requestKey('0123456789abcdef'),'0123456789abcdef');
});
