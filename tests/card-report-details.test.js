import test from 'node:test';
import assert from 'node:assert/strict';
import {cardReportDetails} from '../public/js/card-report-details.js';
test('bar card payment explains fee, net and Monday settlement in movements',()=>{
 const html=cardReportDetails('card',84,'2026-10-24T02:00:00Z');
 assert.match(html,/4\.20/);assert.match(html,/79\.80/);assert.match(html,/26 oct/);assert.match(html,/12:00/);
 assert.equal(cardReportDetails('efectivo',84,'2026-10-24T02:00:00Z'),'');
 assert.equal(cardReportDetails('transferencia',84,'2026-10-24T02:00:00Z'),'');
});
