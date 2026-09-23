(function () {
  'use strict';
  var labels = { full_face: 'Rostro completo', forehead: 'Frente', nose: 'Nariz', right_cheek: 'Mejilla derecha', left_cheek: 'Mejilla izquierda', chin: 'Mentón', right_eye: 'Ojo derecho', left_eye: 'Ojo izquierdo', lower_contour: 'Contorno inferior', unknown: 'Sin zona determinada' };
  var positions = { forehead: true, nose: true, right_cheek: true, left_cheek: true, chin: true, right_eye: true, left_eye: true, lower_contour: true };
  function node(tag, text, parent, cls) {
    var el = document.createElement(tag);
    if (text !== null && text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    if (parent) parent.appendChild(el);
    return el;
  }
  function imageUrl(value) {
    try { var u = new URL(value, location.origin); return (u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' || u.origin === location.origin) && !u.username && !u.password ? u.href : ''; }
    catch (_) { return ''; }
  }
  function resultOf(row) { return row.approval && row.approval.correctedAssessment || row.assessment; }
  function date(value) { return new Date(value).toLocaleDateString('es-MX'); }
  function list(root, title, items) {
    if (!items || !items.length) return;
    var section = node('section', null, root); node('h2', title, section);
    var ul = node('ul', null, section); items.forEach(function (item) { node('li', item, ul); });
  }
  function render(root, row, history) {
    root.textContent = ''; root.className = 'photo-report';
    var result = resultOf(row);
    if (!result) return;
    var simulated = row.provenance && row.provenance.simulation;
    var approved = row.status === 'approved' && !simulated;
    var header = node('section', null, root, 'photo-report-heading');
    var logo = node('img', null, header, 'venus-official-logo'); logo.src = '/assets/logo.png'; logo.alt = 'Venus Cosmetología';
    node('p', simulated ? 'SIMULACIÓN' : approved ? 'Valoración revisada' : 'Borrador privado · pendiente de revisión', header, 'eyebrow');
    node('h1', 'Tu piel, por zonas', header);
    node('p', date(row.createdAt) + ' · Fotografías de Venus', header);
    node('p', 'Observaciones visuales, no mediciones del aparato ni diagnóstico médico.', header, 'muted');
    var photos = row.input && Array.isArray(row.input.photos) ? row.input.photos : [];
    var frontal = photos.find(function (p) { return p.zone === 'full_face' && p.orientation === 'upright' && p.lateralityResolved && imageUrl(p.sourceUrl); });
    var layout = node('div', null, root, 'photo-report-zones');
    var figure = null;
    if (frontal) {
      figure = node('div', null, layout, 'photo-report-face'); figure.hidden = true;
      var img = node('img', null, figure); img.alt = 'Captura frontal de Venus'; img.referrerPolicy = 'no-referrer';
      img.onload = function () { figure.hidden = false; }; img.onerror = function () { figure.hidden = true; };
      img.src = imageUrl(frontal.sourceUrl);
    }
    var side = node('div', null, layout);
    var detail = node('div', null, side, 'photo-report-selection'); detail.setAttribute('aria-live', 'polite');
    var grouped = {};
    (result.observations || []).forEach(function (observation) {
      if (!grouped[observation.zone]) grouped[observation.zone] = [];
      grouped[observation.zone].push(observation);
    });
    var keys = Object.keys(grouped);
    function select(key) {
      detail.textContent = ''; node('h3', labels[key] || key, detail);
      grouped[key].forEach(function (o) { node('p', o.description, detail); list(detail, 'Límites', o.limits); });
      Array.prototype.forEach.call(root.querySelectorAll('[data-report-zone]'), function (button) { button.setAttribute('aria-pressed', String(button.dataset.reportZone === key)); });
    }
    keys.forEach(function (key, index) {
      var button = node('button', labels[key] || key, side, 'photo-report-zone'); button.type = 'button'; button.dataset.reportZone = key;
      button.onclick = function () { select(key); };
      // A fixed guide is shown only on a confirmed, upright full-face capture.
      var supported = frontal && grouped[key].some(function (o) { return o.evidence.photoIds.indexOf(frontal.id) !== -1; });
      if (figure && positions[key] && supported) {
        var pin = node('button', String(index + 1), figure, 'photo-report-pin photo-zone-' + key); pin.type = 'button'; pin.dataset.reportZone = key;
        pin.setAttribute('aria-label', labels[key]);
        pin.onclick = function () { select(key); };
      }
    });
    if (keys.length) select(keys[0]);
    else node('p', 'No hay observaciones evaluables en estas fotografías.', detail);
    if (figure) node('p', 'Ubicaciones orientativas; no delimitan lesiones.', root, 'muted');
    var interpretation = node('section', null, root, 'photo-report-summary'); node('h2', 'Tu valoración Venus', interpretation); node('p', result.summary, interpretation);
    list(root, 'Prioridades para revisar', result.priorities.map(function (p) { return p.description; }));
    var previous = (history || []).find(function (old) { return old.id !== row.id && old.approval && !(old.provenance && old.provenance.simulation) && new Date(old.createdAt) < new Date(row.createdAt) && resultOf(old); });
    if (previous) {
      var progress = node('section', null, root); node('h2', 'Seguimiento', progress);
      var comparison = node('div', null, progress, 'photo-report-comparison');
      [previous, row].forEach(function (entry) { var col = node('div', null, comparison); node('h3', date(entry.createdAt), col); node('p', resultOf(entry).summary, col); });
      node('p', 'Comparación de observaciones. No se calcula una mejora numérica a partir de fotografías.', progress, 'muted');
    }
    list(root, 'Opciones sujetas a valoración', result.careDraft.options.map(function (o) { return o.rationale; }));
    list(root, 'Rutina en casa', result.careDraft.education);
    list(root, 'Alternativa sin procedimiento', [result.careDraft.noProcedureAlternative]);
    list(root, 'Información pendiente', result.missingInformation);
    list(root, 'Preguntas para completar', result.followUpQuestions);
    list(root, 'Revisión profesional', result.professionalReview.reasons);
    list(root, 'Límites de las fotografías', result.quality.limits);
    var gallery = node('section', null, root); node('h2', 'Fotos de esta valoración', gallery);
    var grid = node('div', null, gallery, 'photo-report-gallery');
    photos.forEach(function (photo) {
      var url = imageUrl(photo.sourceUrl); if (!url) return;
      var box = node('figure', null, grid); var link = node('a', null, box); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      var image = node('img', null, link); image.alt = labels[photo.zone] || 'Fotografía'; image.src = url; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
      image.onerror = function () { link.textContent = 'Foto no disponible'; link.removeAttribute('href'); };
      node('figcaption', image.alt + ' · ' + date(photo.capturedAt), box);
    });
    root.dataset.approved = String(approved);
    var tabs = node('div', null, null, 'report-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Contenido del reporte');
    header.after(tabs);
    var care = node('div', null, null);
    while (layout.nextSibling) care.appendChild(layout.nextSibling);
    root.appendChild(care);
    var panels = [layout, care], tabButtons = [];
    function activate(index) {
      panels.forEach(function (panel, i) { panel.hidden = i !== index; tabButtons[i].setAttribute('aria-selected', String(i === index)); tabButtons[i].tabIndex = i === index ? 0 : -1; });
    }
    ['Zonas', 'Cuidados y contexto'].forEach(function (label, index) {
      var tab = node('button', label, tabs); tab.type = 'button'; tab.id = 'report-tab-' + index; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', 'report-panel-' + index);
      panels[index].id = 'report-panel-' + index; panels[index].setAttribute('role', 'tabpanel'); panels[index].setAttribute('aria-labelledby', tab.id);
      tab.onclick = function () { activate(index); };
      tab.onkeydown = function (event) { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) !== -1) { event.preventDefault(); var next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index; activate(next); tabButtons[next].focus(); } };
      tabButtons.push(tab);
    });
    activate(0);
    if (approved) { var print = node('button', 'Guardar PDF', root, 'photo-report-print'); print.type = 'button'; print.onclick = function () { window.print(); }; }
  }
  window.VenusPhotoReport = { render: render };
}());
