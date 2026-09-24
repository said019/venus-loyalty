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
  function button(text, parent, handler, cls) { var el = node('button', text, parent, cls); el.type = 'button'; el.onclick = handler; return el; }
  function imageUrl(value) {
    if (typeof value !== 'string' || !value) return '';
    try { var u = new URL(value, location.origin); return (u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' || u.origin === location.origin) && !u.username && !u.password ? u.href : ''; }
    catch (_) { return ''; }
  }
  function resultOf(row) { return row.approval && row.approval.correctedAssessment || row.assessment; }
  function date(value) { return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('es-MX') : 'Fecha no registrada'; }
  function list(root, title, items) {
    if (!items || !items.length) return;
    var section = node('section', null, root, 'report-band'); node('h2', title, section);
    var ul = node('ul', null, section); items.forEach(function (item) { node('li', item, ul); });
  }
  function tabs(parent, names, panels, prefix) {
    var group = node('div', null, parent, 'report-tabs'); group.setAttribute('role', 'tablist'); group.setAttribute('aria-label', names.join(' / '));
    var controls = [];
    function select(index) { panels.forEach(function (panel, i) { panel.hidden = i !== index; controls[i].setAttribute('aria-selected', String(i === index)); controls[i].tabIndex = i === index ? 0 : -1; }); }
    names.forEach(function (name, i) {
      var tab = button(name, group, function () { select(i); }); tab.id = prefix + '-tab-' + i; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', prefix + '-panel-' + i);
      panels[i].id = prefix + '-panel-' + i; panels[i].setAttribute('role', 'tabpanel'); panels[i].setAttribute('aria-labelledby', tab.id);
      tab.onkeydown = function (event) { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) !== -1) { event.preventDefault(); var next = event.key === 'Home' ? 0 : event.key === 'End' ? names.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : names.length - 1)) % names.length; select(next); controls[next].focus(); } };
      controls.push(tab);
    });
    select(0); return select;
  }
  function render(root, row, history, options) {
    options = options || {};
    root.textContent = ''; root.className = 'photo-report';
    var generation = {}; root.venusReportGeneration = generation;
    var result = resultOf(row); if (!result) return;
    var data = window.VenusReportData;
    var simulated = row.provenance && row.provenance.simulation;
    var approved = row.status === 'approved' && !simulated;
    root.dataset.approved = String(approved);
    var photos = row.input && Array.isArray(row.input.photos) ? row.input.photos : [];
    var observations = result.observations || [];
    var captures = data ? data.captures(row, options.photos) : photos.map(function (photo) { return Object.assign({}, photo, { url: photo.sourceUrl, mode: 'unknown', analyzed: true }); });
    var previous = (history || []).filter(function (old) { return old.id !== row.id && old.approval && !(old.provenance && old.provenance.simulation) && new Date(old.createdAt) < new Date(row.createdAt) && resultOf(old); }).sort(function (a, b) { return Date.parse(b.createdAt) - Date.parse(a.createdAt); })[0];
    var header = node('section', null, root, 'photo-report-heading');
    var logo = node('img', null, header, 'venus-official-logo'); logo.src = '/assets/logo.png'; logo.alt = 'Venus Cosmetología';
    node('p', simulated ? 'DEMOSTRACIÓN · IMAGEN Y CONTENIDO DE EJEMPLO' : 'VENUS SKIN · VALORACIÓN COSMÉTICA', header, 'report-kicker');
    node('h1', 'Tu piel, en detalle', header);
    node('p', date(row.createdAt) + ' · ' + (approved ? 'Revisada por el profesional autorizado' : 'Pendiente de revisión profesional'), header, 'report-subtitle');
    node('p', result.summary, header, 'report-introduction');
    var facts = node('dl', null, root, 'report-facts');
    [['Fotografías analizadas', String(photos.length)], ['Hallazgos registrados', String(observations.length)], ['Seguimiento', previous ? 'Desde ' + date(previous.createdAt) : 'Sin valoración previa revisada']].forEach(function (pair) { var col = node('div', null, facts); node('dt', pair[0], col); node('dd', pair[1], col); });
    var layout = node('div', null, root, 'photo-report-zones');
    var viewer = node('div', null, layout, 'report-viewer');
    if (photos.length && imageUrl(photos[0].sourceUrl)) { var printPhoto = node('img', null, viewer, 'report-print-photo'); printPhoto.src = imageUrl(photos[0].sourceUrl); printPhoto.alt = 'Original incluido en el análisis, sin contraste visual'; printPhoto.referrerPolicy = 'no-referrer'; }
    var stage = node('div', null, viewer, 'report-stage');
    var photoFrame = node('div', null, stage, 'photo-report-face');
    var mainImage = node('img', null, photoFrame); mainImage.referrerPolicy = 'no-referrer'; mainImage.alt = 'Captura del expediente';
    var pins = node('div', null, photoFrame, 'report-pins'); pins.hidden = true;
    var loading = node('p', 'Cargando captura…', stage, 'report-image-state'); loading.setAttribute('role', 'status');
    var caption = node('p', null, viewer, 'report-image-caption'); caption.setAttribute('aria-live', 'polite');
    var modeLabel = node('label', 'Iluminación registrada', viewer, 'report-mode-label');
    var modeSelect = node('select', null, modeLabel); modeSelect.setAttribute('aria-label', 'Iluminación registrada');
    var availableModes = [];
    captures.forEach(function (photo) { if (availableModes.indexOf(photo.mode) === -1) availableModes.push(photo.mode); });
    availableModes.forEach(function (mode) { var opt = node('option', data && data.modes[mode] || 'Captura sin modalidad registrada', modeSelect); opt.value = mode; });
    var strip = node('div', null, viewer, 'report-filmstrip'); strip.setAttribute('aria-label', 'Tomas disponibles');
    var visualControls = node('div', null, viewer, 'report-visual-controls');
    var filterLabel = node('label', 'Vista de la fotografía', visualControls);
    var filter = node('select', null, filterLabel); filter.setAttribute('aria-label', 'Vista de la fotografía');
    [['original', 'Original'], ['red_contrast', 'Contraste rojo · visual'], ['brown_contrast', 'Contraste marrón · visual'], ['detail', 'Realce de detalle · visual']].forEach(function (pair) { var opt = node('option', pair[1], filter); opt.value = pair[0]; });
    if (options.layers) { var mapOption = node('option', 'Mapa procesado', filter); mapOption.value = 'map'; mapOption.disabled = true; }
    var visualNote = node('p', null, viewer, 'report-visual-note'); visualNote.setAttribute('role', 'status');
    var layerCache = Object.create(null), layersBusy = false;
    var layerNames = { poros: 'Poros', textura: 'Textura', manchas: 'Contraste pigmentado', lesiones: 'Puntos rojos', zonas_rojas: 'Zonas rojas', brillo: 'Brillo' };
    var layerControls = node('div', null, viewer, 'report-visual-controls');
    var layerSelect = node('select', null, layerControls); layerSelect.setAttribute('aria-label', 'Mapa de la fotografía'); layerSelect.hidden = true;
    var layerButton = button('Generar mapas', layerControls, async function () {
      if (!selected || selected.mode !== 'image' || layersBusy || !options.layers) return;
      var photo = selected, version = ++requestVersion;
      layersBusy = true; layerButton.disabled = true;
      visualNote.textContent = 'Procesando mapas. Puede tardar hasta tres minutos.';
      try {
        var result = layerCache[photo.id] || await options.layers(photo.id);
        if (result.sourcePhotoId !== photo.id || result.sourceUrl !== photo.url || !Array.isArray(result.images)) throw new Error('invalid_layers');
        layerCache[photo.id] = result;
        if (!alive(version)) return;
        layerSelect.textContent = '';
        result.images.forEach(function (entry) { if (layerNames[entry.key]) { var opt = node('option', layerNames[entry.key], layerSelect); opt.value = entry.key; } });
        layerSelect.hidden = false;
        layerSelect.onchange = function () {
          if (selected !== photo) return;
          var entry = result.images.find(function (item) { return item.key === layerSelect.value; });
          if (!entry || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(entry.dataUrl)) return;
          filter.value = 'map';
          visualNote.textContent = result.notice + (entry.candidateCount == null ? '' : ' Candidatos: ' + entry.candidateCount + '.');
          caption.textContent = layerNames[entry.key] + ' · Pendiente de revisión';
          setSource(entry.dataUrl, caption.textContent, ++requestVersion, false);
        };
        layerSelect.onchange();
      } catch (_) {
        if (alive(version)) visualNote.textContent = 'No se pudieron generar los mapas. El original se conserva; intenta de nuevo.';
      } finally { layersBusy = false; layerButton.disabled = !selected || selected.mode !== 'image'; }
    });
    layerControls.hidden = !options.layers;
    var enlarge = button('Ampliar original ↗', viewer, function () { var url = imageUrl(selected && selected.url); if (url) window.open(url, '_blank', 'noopener,noreferrer'); }, 'report-original-link'); enlarge.title = 'Abrir la fotografía original sin filtros';
    var observationSide = node('div', null, layout, 'report-observations');
    node('h2', 'Qué observamos', observationSide);
    var all = node('div'), zoned = node('div');
    var switchObservations = tabs(observationSide, ['Resumen', 'Por zona'], [all, zoned], 'findings');
    observationSide.appendChild(all); observationSide.appendChild(zoned);
    var categoryLabel = node('label', 'Categoría', all, 'report-category-label');
    var categorySelect = node('select', null, categoryLabel); categorySelect.setAttribute('aria-label', 'Categoría de hallazgos');
    var everyCategory = node('option', 'Todos los hallazgos', categorySelect); everyCategory.value = '';
    var categories = [];
    observations.forEach(function (observation) {
      if (categories.indexOf(observation.areaId) !== -1) return;
      categories.push(observation.areaId);
      var option = node('option', data && data.areas[observation.areaId] || 'Observación visual', categorySelect); option.value = observation.areaId;
    });
    categoryLabel.hidden = categories.length < 2;
    categorySelect.onchange = function () {
      Array.prototype.forEach.call(all.querySelectorAll('[data-report-area]'), function (item) {
        item.hidden = !!categorySelect.value && item.dataset.reportArea !== categorySelect.value;
      });
    };
    var limits = [], grouped = {};
    observations.forEach(function (observation, index) {
      var item = node('article', null, all, 'report-finding');
      item.dataset.reportArea = observation.areaId;
      node('span', String(index + 1).padStart(2, '0'), item, 'report-finding-number');
      var content = node('div', null, item);
      node('h3', data && data.areas[observation.areaId] || 'Observación visual', content);
      node('p', labels[observation.zone] || 'Zona no registrada', content, 'report-finding-zone');
      node('p', observation.description, content);
      (observation.limits || []).forEach(function (limit) { if (limits.indexOf(limit) === -1) limits.push(limit); });
      if (!grouped[observation.zone]) grouped[observation.zone] = [];
      grouped[observation.zone].push(observation);
    });
    if (!observations.length) node('p', 'No hay observaciones evaluables en las fotografías de esta valoración.', all);
    var zoneControls = node('div', null, zoned, 'report-zone-controls');
    var detail = node('div', null, zoned, 'photo-report-selection'); detail.setAttribute('aria-live', 'polite');
    var zoneKeys = Object.keys(grouped);
    function selectZone(key) {
      detail.textContent = ''; node('h3', labels[key] || 'Zona no registrada', detail);
      grouped[key].forEach(function (o) { node('h4', data && data.areas[o.areaId] || 'Observación', detail); node('p', o.description, detail); });
      Array.prototype.forEach.call(root.querySelectorAll('[data-report-zone]'), function (el) { el.setAttribute('aria-pressed', String(el.dataset.reportZone === key)); });
    }
    zoneKeys.forEach(function (key) { var control = button(labels[key] || 'Zona no registrada', zoneControls, function () { selectZone(key); }, 'photo-report-zone'); control.dataset.reportZone = key; });
    if (zoneKeys.length) selectZone(zoneKeys[0]); else node('p', 'Sin observaciones por zona.', detail);
    var selected = null, requestVersion = 0;
    function alive(version) { return root.venusReportGeneration === generation && version === requestVersion; }
    function setSource(url, alt, version, showPins) {
      loading.hidden = false; loading.textContent = 'Cargando captura…'; mainImage.hidden = true; pins.hidden = true;
      mainImage.onload = function () { if (!alive(version)) return; loading.hidden = true; mainImage.hidden = false; pins.hidden = !showPins; };
      mainImage.onerror = function () { if (!alive(version)) return; loading.hidden = false; loading.textContent = 'No se pudo cargar la imagen. El original no se ha modificado.'; mainImage.hidden = true; pins.hidden = true; };
      mainImage.alt = alt; mainImage.src = url;
    }
    function selectCapture(photo) {
      selected = photo; requestVersion++; filter.value = 'original'; visualNote.textContent = '';
      layerSelect.hidden = true; layerButton.disabled = layersBusy || photo.mode !== 'image';
      modeSelect.value = photo.mode;
      filter.disabled = !options.preview || ['image', 'image_negative'].indexOf(photo.mode) === -1;
      var name = data && data.modes[photo.mode] || 'Modalidad no registrada';
      caption.textContent = name + ' · ' + date(photo.capturedAt) + (photo.analyzed ? ' · Incluida en el análisis' : ' · Complementaria, no analizada por IA');
      if (photo.nearby) visualNote.textContent = 'Toma cercana por hora registrada (±10 min). No consta un identificador de sesión; confirma su correspondencia.';
      pins.textContent = '';
      var eligible = photo.analyzed && photo.zone === 'full_face' && photo.orientation === 'upright' && photo.lateralityResolved;
      if (eligible) zoneKeys.forEach(function (key, index) {
        var supported = grouped[key].some(function (o) { return o.evidence && Array.isArray(o.evidence.photoIds) && o.evidence.photoIds.indexOf(photo.id) !== -1; });
        if (!positions[key] || !supported) return;
        var pin = button(String(index + 1), pins, function () { switchObservations(1); selectZone(key); }, 'photo-report-pin photo-zone-' + key); pin.dataset.reportZone = key; pin.setAttribute('aria-label', labels[key]);
      });
      strip.textContent = '';
      captures.filter(function (p) { return p.mode === photo.mode; }).forEach(function (p, index) {
        var thumb = button(null, strip, function () { selectCapture(p); }, 'report-thumbnail'); thumb.setAttribute('aria-label', name + ' · Toma ' + (index + 1)); thumb.setAttribute('aria-pressed', String(p.id === photo.id));
        var src = imageUrl(p.url); if (src) { var img = node('img', null, thumb); img.alt = ''; img.src = src; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; }
        node('span', 'Toma ' + (index + 1), thumb);
      });
      var url = imageUrl(photo.url); enlarge.disabled = !url;
      if (url) setSource(url, name + ' · Original', requestVersion, eligible && pins.childNodes.length > 0);
      else { mainImage.hidden = true; pins.hidden = true; loading.hidden = false; loading.textContent = 'Original no disponible.'; }
    }
    modeSelect.onchange = function () { var photo = captures.find(function (p) { return p.mode === modeSelect.value; }); if (photo) selectCapture(photo); };
    filter.onchange = async function () {
      layerSelect.hidden = true;
      if (!selected || filter.value === 'original') { if (selected) selectCapture(selected); return; }
      var mode = filter.value, version = ++requestVersion;
      pins.hidden = true; visualNote.textContent = 'Preparando contraste visual. No se modifica el original.';
      try {
        var preview = await options.preview(selected.id, mode);
        if (!alive(version)) return;
        if (preview.sourcePhotoId !== selected.id || preview.sourceUrl !== selected.url || preview.mode !== mode || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(preview.dataUrl)) throw new Error('invalid_preview');
        visualNote.textContent = preview.notice;
        caption.textContent = filter.options[filter.selectedIndex].text + ' · Vista procesada, no diagnóstica';
        setSource(preview.dataUrl, caption.textContent, version, false);
      } catch (_) {
        if (!alive(version)) return;
        selectCapture(selected); visualNote.textContent = 'No se pudo preparar el contraste. Se conserva la fotografía original; puedes intentarlo de nuevo.';
      }
    };
    if (captures.length) selectCapture(captures[0]);
    else { loading.textContent = 'No hay fotografías disponibles en esta valoración.'; filter.disabled = true; modeSelect.disabled = true; enlarge.disabled = true; }
    node('p', 'Los marcadores son referencias de zona, no delimitaciones de lesiones. Las vistas procesadas no generan nuevas conclusiones.', viewer, 'muted');
    var priorities = node('section', null, root, 'report-band'); node('h2', 'Prioridades de la consulta', priorities);
    var prioritiesList = node('ol', null, priorities, 'report-priorities');
    (result.priorities || []).forEach(function (priority, index) { var item = node('li', null, prioritiesList); node('span', String(index + 1).padStart(2, '0'), item); var content = node('div', null, item); node('h3', data && data.areas[priority.areaId] || 'Prioridad', content); node('p', priority.description, content); });
    if (!(result.priorities || []).length) node('p', 'Sin prioridades registradas. Pendiente de revisión profesional.', priorities);
    var careSection = node('section', null, root, 'report-band'); node('h2', 'Tu cuidado, paso a paso', careSection);
    var home = node('div'), cabin = node('div'); tabs(careSection, ['Cuidados en casa', 'En cabina'], [home, cabin], 'care'); careSection.appendChild(home); careSection.appendChild(cabin);
    var care = result.careDraft || {};
    list(home, 'Cuidados para revisar', care.education);
    if (!(care.education || []).length) node('p', 'No hay una rutina registrada en esta valoración.', home);
    if (care.noProcedureAlternative) node('p', care.noProcedureAlternative, home, 'report-alternative');
    (care.options || []).forEach(function (option) { var item = node('article', null, cabin, 'report-treatment'); node('h3', option.serviceId, item); node('p', option.rationale, item); list(item, 'Antes de realizarlo', option.prerequisitesToConfirm); });
    if (!(care.options || []).length) node('p', 'No hay procedimientos propuestos. Se definirán tras la revisión profesional.', cabin);
    var evolution = node('section', null, root, 'report-band'); node('h2', 'Evolución', evolution);
    if (previous) { var comparison = node('div', null, evolution, 'photo-report-comparison'); [previous, row].forEach(function (entry) { var col = node('div', null, comparison); node('h3', date(entry.createdAt), col); node('p', resultOf(entry).summary, col); }); node('p', 'Comparación de observaciones; no mide un porcentaje de mejora.', evolution, 'muted'); }
    else node('p', 'El seguimiento aparecerá cuando exista una valoración anterior revisada. No se han calculado cambios.', evolution);
    list(root, 'Información pendiente', result.missingInformation);
    list(root, 'Preguntas para completar', result.followUpQuestions);
    list(root, 'Revisión profesional', result.professionalReview && result.professionalReview.reasons);
    var disclaimer = node('details', null, root, 'report-limitations'); node('summary', 'Alcance y limitaciones', disclaimer);
    node('p', 'Observaciones cosméticas orientativas. No sustituye una valoración clínica. Los contrastes de color no equivalen a mediciones del fabricante.', disclaimer);
    ((result.quality && result.quality.limits) || []).forEach(function (limit) { if (limits.indexOf(limit) === -1) limits.push(limit); });
    var limitsList = node('ul', null, disclaimer); limits.forEach(function (limit) { node('li', limit, limitsList); });
    if (approved) { var print = button('Guardar PDF', root, function () { var wasOpen = disclaimer.open; disclaimer.open = true; window.print(); disclaimer.open = wasOpen; }, 'photo-report-print'); print.title = 'Imprimir la valoración revisada, sin contrastes visuales'; }
  }
  window.VenusPhotoReport = { render: render };
}());
