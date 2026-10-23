import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../public/js/admin/form-surfaces.js', import.meta.url), 'utf8');
test('client and gift card overlays escape the page stacking context', () => {
  const overlays = ['#card-modal-backdrop','#modal-giftcard-view'].map(id => ({id,parentElement:{}}));
  const body = { appendChild: el => { el.parentElement = body; } };
  vm.runInNewContext(source,{document:{body,documentElement:{nodeType:1,matches:()=>false,querySelectorAll:()=>[]},querySelectorAll:selector=>overlays.filter(el=>selector.includes(el.id))},MutationObserver:class {observe(){}}});
  for(const overlay of overlays) assert.equal(overlay.parentElement,body);
});
test('form surfaces decorate static and inserted forms without touching viewer geometry or inputs', () => {
  function node(selector, children = []) {
    const classes = new Set();
    return { nodeType: 1, value: 'unchanged', children, classes,
      classList: { add: name => classes.add(name) },
      matches: selectors => selectors.split(',').includes(selector),
      querySelectorAll: selectors => children.filter(child => child.matches(selectors))
    };
  }
  const edit=node('#editApptDialog'), scanner=node('#scanDialog'), gallery=node('#photo-lightbox');
  const root=node('html',[edit,scanner,gallery]);let inserted;
  vm.runInNewContext(source,{document:{documentElement:root,body:root,querySelectorAll:()=>[]},MutationObserver:class {
    constructor(callback){inserted=callback;} observe(){}
  }});
  assert(edit.classes.has('admin-form-surface'));
  assert.equal(edit.value,'unchanged');
  assert.equal(scanner.classes.size,0);assert.equal(gallery.classes.size,0);
  const clinic=node('.ci-dialog');inserted([{addedNodes:[clinic,{nodeType:3}]}]);
  assert(clinic.classes.has('admin-form-surface'));
  inserted([{addedNodes:[clinic]}]);assert.equal(clinic.classes.size,1);
});
test('edit actions keep their form association and existing handler ids', () => {
  const html=readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');
  const edit=html.slice(html.indexOf('<dialog id="editApptDialog">'),html.indexOf('<!-- PAYMENT DIALOG -->'));
  for(const id of ['form-edit-appt','edit-appt-id','edit-appt-client-name','edit-appt-service','edit-appt-price','edit-appt-duration','edit-appt-date','edit-appt-hour','edit-appt-minute','edit-appt-assigned','edit-appt-source','btn-cancel-edit-appt','btn-edit-appt-anticipo']) {
    assert.equal(edit.split(`id="${id}"`).length-1,1,id);
  }
  assert.match(edit,/type="submit" form="form-edit-appt"/);
  assert.match(edit,/type="button"[^>]+openReschedule/);
  assert(!html.includes("formEditAppt.querySelector('button[type=\"submit\"]')"));
});
