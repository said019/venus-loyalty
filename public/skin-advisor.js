(function () {
  'use strict';
  var byId = function (id) { return document.getElementById(id); };
  var config, record, current, renderedId, busy = false, generatingRequest = false, photoControls = [], corrections = [];
  var query = new URLSearchParams(location.search);
  document.querySelector('.layout aside').prepend(byId('review'));
  var activeStep = 1;
  function showStep(step) {
    activeStep = step;
    byId('step-photos').hidden = step !== 1;
    byId('step-consultation').hidden = step !== 2;
    byId('review').hidden = step !== 3 || !current;
    byId('prepare-title').textContent = step === 1 ? 'Fotos de la sesión' : step === 2 ? 'Consulta' : 'Reporte de piel';
    document.querySelectorAll('[data-step]').forEach(function (button) {
      if (Number(button.dataset.step) === step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
  }
  function continueConsultation() {
    var count = photoControls.filter(function (p) { return p.check.checked; }).length;
    if (count < 1 || count > 4) { message('Selecciona entre una y cuatro fotos.', true); showStep(1); return; }
    if (!byId('white-light').checked) { message('Confirma que las fotos seleccionadas son originales de luz blanca.', true); showStep(1); byId('white-light').focus(); return; }
    showStep(2); byId('prepare-title').focus();
  }
  document.querySelectorAll('[data-step]').forEach(function (button) { button.addEventListener('click', function () {
    if (busy) return;
    var step = Number(button.dataset.step);
    if (step === 2) continueConsultation();
    else if (step === 3 && !current) message('Prepara un borrador desde Consulta para ver el reporte.', true);
    else showStep(step);
  }); });
  byId('next-consultation').addEventListener('click', continueConsultation);
  byId('previous-photos').addEventListener('click', function () { showStep(1); });
  var recordId = query.get('recordId');
  var captureIds = window.VenusCaptureFlow ? window.VenusCaptureFlow.selectedIds(location.search) : [];
  if (query.get('capture') === '1') {
    document.querySelector('.intro h1').textContent = 'Tus fotos ya están aquí.';
    document.querySelector('.intro p:last-child').textContent = 'Confirma la luz, orientación y fecha de las fotos recién tomadas. Completa la consulta y autoriza el análisis, sin volver a subir archivos.';
  }
  if (query.get('cardId')) byId('back').href = '/admin/clientas/' + encodeURIComponent(query.get('cardId'));
  else byId('back').textContent = '← Volver a Venus';
  if (query.get('capture') === '1') {
    byId('back').href = '/captura.html?modo=analisis';
    byId('back').textContent = '← Nueva sesión en el Moji';
    document.querySelector('footer a').href = '/captura.html?modo=analisis';
    document.querySelector('footer a').textContent = 'Nueva sesión';
  }
  var statusNames = { draft: 'Borrador guardado', generating: 'Analizando', pending_review: 'Pendiente de tu revisión', approved: 'Aprobada', needs_information: 'Se necesita más información', failed: 'Análisis no completado', superseded: 'Versión anterior', refused: 'Sin valoración' };
  var fields = [['goal','¿Qué te gustaría mejorar?'],['duration','¿Desde cuándo lo notas?'],['symptoms','Molestias: picor, dolor, ardor u otras'],['routineDay','Rutina de día'],['routineNight','Rutina de noche'],['allergies','Alergias conocidas'],['medications','Medicamentos relevantes'],['previousTreatments','Tratamientos anteriores'],['reactions','Reacciones a productos o tratamientos'],['sunExposure','Exposición habitual al sol'],['sunscreen','Uso de protector solar']];
  var flags = [['declaredReactivity','¿La clienta declara piel reactiva?'],['changingLesion','¿Declara una lesión que cambia?'],['bleedingLesion','¿Declara una lesión que sangra?'],['growingLesion','¿Declara una lesión que crece?']];
  var zones = [['unknown','Zona no determinada'],['full_face','Rostro completo'],['forehead','Frente'],['nose','Nariz'],['right_cheek','Mejilla derecha de la clienta'],['left_cheek','Mejilla izquierda de la clienta'],['chin','Mentón'],['right_eye','Contorno del ojo derecho'],['left_eye','Contorno del ojo izquierdo'],['lower_contour','Contorno inferior']];
  var orientations = [['','Confirma orientación'],['upright','Ya está vertical'],['rotated_90_cw','Girada 90° a la derecha'],['rotated_90_ccw','Girada 90° a la izquierda'],['upside_down','Está de cabeza']];
  function node(tag, text, parent) { var el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (parent) parent.appendChild(el); return el; }
  function message(text, error) { byId('message').textContent = text; byId('message').className = error ? 'error' : ''; }
  function select(options, parent) { var el = node('select', undefined, parent); options.forEach(function (pair) { var opt = node('option', pair[1], el); opt.value = pair[0]; }); return el; }
  function date(value) { var d = new Date(value); return isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX'); }
  function safeImage(value) { try { var url = new URL(value, location.origin); return (url.protocol === 'https:' || url.origin === location.origin) && !url.username && !url.password ? url.href : ''; } catch (_) { return ''; } }
  var errors = { auth_required: 'Inicia sesión en Venus para continuar.', invalid_token: 'Tu sesión venció. Vuelve a iniciar sesión.', forbidden: 'Tu cuenta no tiene permiso para esta acción.', not_authorized: 'Solo el administrador autorizado puede aprobar.', disabled: 'El análisis con el proveedor de IA aún no está activado en el servidor.', not_configured: 'Falta completar la configuración privada del proveedor de IA.', key_missing: 'Falta configurar la clave del proveedor de IA en el servidor.', stale_input: 'La valoración cambió. Vuelve a abrir la versión vigente.', conflict: 'La valoración cambió o ya está en proceso. Actualiza su estado.', photo_storage_unavailable: 'Esta foto no está disponible en el almacenamiento autorizado. Súbela primero al expediente.', photo_unavailable: 'No se pudo recuperar una de las fotos.', invalid_photo: 'Una foto no es válida. Revisa su formato y tamaño.', invalid_input: 'Revisa las fotos, las respuestas y el consentimiento.', consent_required: 'Es necesario registrar el consentimiento específico.', timeout: 'El análisis excedió el tiempo permitido. No se reintentó automáticamente.', not_found: 'No se encontró el expediente o la valoración.' };
  Object.assign(errors, { unauthenticated: 'Inicia sesión en Venus para continuar.', stale_version: 'La valoración cambió. Selecciónala de nuevo en el historial.', already_generating: 'Hay un análisis en curso. Espera a que termine antes de iniciar otro.', invalid_review: 'Revisa la longitud de los textos corregidos.', activation_required: 'La configuración cambió. Crea un borrador nuevo y confirma su consentimiento.', white_light_confirmation_required: 'Confirma que las fotos son originales tomadas con luz blanca.', capture_time_confirmation_required: 'Confirma la fecha real de captura de cada fotografía.', invalid_capture_time: 'Revisa la fecha de captura: debe ser válida y no estar en el futuro.' });
  async function api(path, body) {
    var response = await fetch('/api/skin-advisor' + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    var payload;
    try { payload = await response.json(); } catch (_) { throw new Error('El servidor no devolvió una respuesta válida.'); }
    if (!response.ok || !payload.success) throw new Error(errors[payload.error] || 'No se pudo completar la acción. Revisa la configuración o vuelve a cargar la valoración.');
    return payload.data;
  }
  async function action(fn) {
    if (busy) return;
    var previous = current;
    busy = true;
    var buttonStates = Array.from(document.querySelectorAll('.layout button, #generate, #approve')).map(function (button) { var state = { button: button, disabled: button.disabled }; button.disabled = true; return state; });
    try { await fn(); } catch (error) { message(error.message || 'No se pudo completar la acción.', true); }
    finally { busy = false; buttonStates.forEach(function (state) { if (state.button.isConnected) state.button.disabled = state.disabled; }); byId('save').disabled = !record; if (current && current !== previous) render(current); byId('approve').disabled = false; byId('generate').disabled = !config || !config.enabled || !config.configured; renderHistory(); }
  }
  fields.forEach(function (field) { var label = node('label', field[1], byId('answers')); var input = node('textarea', undefined, label); input.id = 'answer-' + field[0]; input.rows = 2; input.maxLength = 500; });
  flags.forEach(function (field) { var label = node('label', field[1], byId('answers')); var input = select([['','No sabemos'],['true','Sí'],['false','No']], label); input.id = 'answer-' + field[0]; });
  function renderPhotos(photos) {
    byId('photos').textContent = ''; photoControls = [];
    byId('photo-data').textContent = '';
    byId('capture-preview').hidden = true;
    byId('complementary-photos').textContent = '';
    byId('complementary').hidden = true;
    var complementaryCount = 0;
    function updateSelection() {
      var selected = photoControls.filter(function (p) { return p.check.checked; });
      var pending = selected.filter(function (p) { return !p.orientation.value || !p.confirmed.checked || !p.captured.value; }).length;
      byId('session-photos').textContent = '';
      selected.forEach(function (p) {
        var figure = node('figure', undefined, byId('session-photos'));
        if (p.src) { var thumb = node('img', undefined, figure); thumb.src = p.src; thumb.alt = p.name; thumb.referrerPolicy = 'no-referrer'; }
        node('figcaption', p.name + ' · ' + (p.captured.value ? date(p.captured.value) : 'Fecha pendiente'), figure);
      });
      byId('session-progress').textContent = pending ? pending + ' de ' + selected.length + ' tomas pendientes de confirmar' : selected.length + ' tomas revisadas';
      byId('confirm-session').disabled = selected.length === 0;
      byId('photo-count').textContent = selected.length + ' de 4 seleccionadas' + (pending ? ' · ' + pending + ' por revisar' : selected.length ? ' · Datos revisados' : '');
      photoControls.forEach(function (p) {
        p.box.classList.toggle('selected', p.check.checked);
        p.details.hidden = !p.check.checked;
        p.check.disabled = !p.check.checked && selected.length >= 4;
        p.summary.textContent = p.name + (p.orientation.value && p.confirmed.checked && p.captured.value ? ' · Datos revisados' : ' · Revisar datos');
      });
    }
    byId('confirm-session').onclick = function () {
      var selected = photoControls.filter(function (p) { return p.check.checked; });
      if (selected.some(function (p) { return !p.captured.value || !Number.isFinite(new Date(p.captured.value).getTime()) || new Date(p.captured.value).getTime() > Date.now(); })) {
        byId('individual-settings').open = true;
        message('Hay una fecha pendiente o futura. Corrígela antes de confirmar la sesión.', true); return;
      }
      selected.forEach(function (p) { p.orientation.value = 'upright'; p.confirmed.checked = true; if (byId('session-sides').checked) p.side.checked = true; });
      byId('session-sides').checked = false;
      updateSelection();
      message('Fechas y posición confirmadas para las ' + selected.length + ' tomas seleccionadas.');
    };
    var nativeSelected = 0, nativeLatest = 0;
    photos.forEach(function (p) { if (/(?:^|\|)\s*modo=image\s*(?:\||$)/.test(p.description || '')) nativeLatest = Math.max(nativeLatest, new Date(p.takenAt).getTime()); });
    if (!photos.length) node('p', 'Este expediente aún no tiene fotos. Añádelas desde la sección Fotos del expediente y vuelve aquí.', byId('photos'));
    photos.forEach(function (photo, index) {
      var captureMode = /(?:^|\|)\s*modo=([a-z_]+)/.exec(photo.description || '');
      var complementary = captureMode && captureMode[1] !== 'image';
      var box = node('div', undefined, byId(complementary ? 'complementary-photos' : 'photos')); box.className = 'photo';
      var src = safeImage(photo.url);
      if (src) {
        var view = node('button', undefined, box); view.type = 'button'; view.className = 'capture-view'; view.setAttribute('aria-label', 'Ver toma ' + (index + 1));
        var img = node('img', undefined, view); img.alt = 'Fotografía ' + (index + 1) + ' del expediente'; img.referrerPolicy = 'no-referrer'; img.src = src;
        img.addEventListener('error', function () { img.hidden = true; node('p', 'Vista previa no disponible', view); });
        function preview() { byId('capture-preview').hidden = false; byId('capture-image').hidden = false; byId('capture-image').src = src; byId('capture-caption').textContent = 'Toma ' + (index + 1) + ' · ' + date(photo.takenAt) + (complementary ? ' · Complementaria' : ''); }
        view.addEventListener('click', preview);
        if (!complementary && byId('capture-preview').hidden) preview();
      }
      if (complementary) { complementaryCount++; node('p', 'Foto ' + (index + 1) + ' · Captura complementaria', box); return; }
      var label = node('label', undefined, box); label.className = 'check'; var check = node('input', undefined, label); check.type = 'checkbox'; node('span', 'Foto ' + (index + 1) + ' · ' + date(photo.takenAt), label);
      check.checked = captureIds.indexOf(photo.id) !== -1;
      var details = node('details', undefined, byId('photo-data')); details.className = 'photo-details';
      var summary = node('summary', 'Revisar datos', details);
      details.addEventListener('toggle', function () { if (details.open) photoControls.forEach(function (p) { if (p.details !== details) p.details.open = false; }); });
      var zone = select(zones, node('label', 'Zona', details));
      if (captureMode) {
        check.disabled = captureMode[1] !== 'image';
        if (check.disabled) { check.checked = false; node('p', 'Captura complementaria: no se usa como luz blanca.', box); }
        else {
          zone.value = 'full_face';
          if (!captureIds.length && nativeSelected < 1 && nativeLatest - new Date(photo.takenAt).getTime() <= 600000) { check.checked = true; nativeSelected++; }
        }
      }
      var orientation = select(orientations, node('label', 'Orientación actual', details));
      var captured = node('input', undefined, node('label', 'Fecha y hora de la toma', details)); captured.type = 'datetime-local';
      var suggested = new Date(photo.takenAt); if (!isNaN(suggested.getTime())) captured.value = new Date(suggested.getTime() - suggested.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      var dateLabel = node('label', undefined, details); dateLabel.className = 'check'; var confirmed = node('input', undefined, dateLabel); confirmed.type = 'checkbox'; node('span', 'Confirmo la fecha de captura, no la de subida', dateLabel);
      var sideLabel = node('label', undefined, details); sideLabel.className = 'check'; var side = node('input', undefined, sideLabel); side.type = 'checkbox'; node('span', 'Identifiqué derecha e izquierda de la clienta', sideLabel);
      captured.addEventListener('input', function () { confirmed.checked = false; updateSelection(); });
      photoControls.push({ id: photo.id, src: src, name: 'Toma ' + (index + 1), box: box, details: details, summary: summary, check: check, zone: zone, orientation: orientation, side: side, captured: captured, confirmed: confirmed });
      check.addEventListener('change', function () { byId('session-sides').checked = false; });
      box.addEventListener('change', updateSelection);
      details.addEventListener('change', updateSelection);
    });
    byId('complementary').hidden = !complementaryCount;
    byId('complementary-title').textContent = 'Capturas complementarias (' + complementaryCount + ')';
    updateSelection();
  }
  function renderHistory() {
    if (!record) return;
    var list = byId('history'); list.textContent = '';
    if (!record.assessments.length) node('p', 'Todavía no hay valoraciones.', list);
    record.assessments.forEach(function (row) {
      var button = node('button', (statusNames[row.status] || row.status) + ' · ' + date(row.createdAt), list); button.type = 'button'; button.className = 'history-item'; button.disabled = busy; button.setAttribute('aria-pressed', String(!!current && current.id === row.id));
      button.addEventListener('click', function () { action(async function () { current = await api('/assessments/' + encodeURIComponent(row.id)); message('Valoración guardada cargada.'); }); });
    });
  }
  function section(title, items) { if (!items || !items.length) return; var sec = node('section', undefined, byId('result')); node('h3', title, sec); var list = node('ul', undefined, sec); items.forEach(function (text) { node('li', text, list); }); }
  function editable(labelText, path, value) { var label = node('label', labelText, byId('corrections')); var input = node('textarea', undefined, label); input.rows = 3; input.maxLength = 2000; input.value = value; corrections.push({ path: path, input: input, original: value }); }
  function render(row) {
    if (renderedId !== row.id) byId('review-notes').value = row.approval && row.approval.reviewNotes ? row.approval.reviewNotes : '';
    renderedId = row.id;
    var analyzing = generatingRequest || row.status === 'generating';
    byId('review').hidden = false; byId('state').textContent = analyzing ? 'Análisis en curso' : statusNames[row.status] || row.status;
    byId('review-title').textContent = row.status === 'approved' ? 'Reporte Venus Skin' : 'Revisar valoración Venus';
    byId('result').textContent = ''; byId('corrections').textContent = ''; corrections = [];
    var result = row.approval && row.approval.correctedAssessment ? row.approval.correctedAssessment : row.assessment;
    byId('provenance').textContent = row.provenance ? 'Proveedor: ' + (row.provenance.provider || 'el proveedor de IA') + ' · Modelo: ' + (row.provenance.model || 'registrado') : analyzing ? 'Solicitud en proceso. Las conclusiones aparecerán al recibir el resultado.' : 'Fotos y contexto guardados. El análisis aún no se ha realizado.';
    if (!result) {
      var input = row.input || {}, photos = input.photos || [], patient = input.patient || {};
      var overview = node('section', undefined, byId('result')); overview.className = 'analysis-overview';
      node('h3', analyzing ? 'Preparando tu valoración' : 'Resumen de la valoración', overview);
      if (analyzing) { var progress = node('progress', undefined, overview); progress.setAttribute('aria-label', 'Análisis en curso, progreso indeterminado'); }
      var facts = node('dl', undefined, overview); facts.className = 'analysis-facts';
      [['Borrador creado', date(row.createdAt)], ['Fotos incluidas', String(photos.length)], ['Edad registrada', patient.age == null ? 'No registrada' : patient.age + ' años'], ['Objetivo', patient.objective || 'No registrado']].forEach(function (pair) { var item = node('div', undefined, facts); node('dt', pair[0], item); node('dd', pair[1], item); });
      var gallery = node('div', undefined, overview); gallery.className = 'session-photos';
      photos.forEach(function (photo, index) { var figure = node('figure', undefined, gallery); var src = safeImage(photo.sourceUrl); if (src) { var img = node('img', undefined, figure); img.src = src; img.alt = 'Toma incluida ' + (index + 1); img.referrerPolicy = 'no-referrer'; img.onerror = function () { img.hidden = true; }; } node('figcaption', 'Toma ' + (index + 1) + ' · ' + date(photo.capturedAt), figure); });
      var supplied = fields.filter(function (field) { return input.answers && input.answers[field[0]]; });
      if (supplied.length) { var context = node('details', undefined, overview); node('summary', 'Contexto registrado (' + supplied.length + ')', context); supplied.forEach(function (field) { node('h4', field[1], context); node('p', input.answers[field[0]], context); }); }
      node('p', analyzing ? 'No cierres esta pantalla. El resultado quedará pendiente de revisión profesional; no se enviará automáticamente a la clienta.' : 'El borrador conserva las fotos y el contexto. Al iniciar, se enviarán al proveedor para preparar una valoración sujeta a revisión.', overview).className = 'muted';
    }
    if (result) {
      if (window.VenusPhotoReport) {
        window.VenusPhotoReport.render(byId('result'), row, record ? record.assessments : [], {
          photos: record ? record.photos : [],
          preview: function (photoId, mode) { return api('/records/' + encodeURIComponent(recordId) + '/photos/' + encodeURIComponent(photoId) + '/preview', { mode: mode }); }
        });
      } else {
      node('p', result.summary, byId('result'));
      section('Límites de las fotografías', result.quality.limits);
      section('Observaciones', result.observations.map(function (item) { return item.description; }));
      section('Prioridades', result.priorities.map(function (item) { return item.description; }));
      section('Información pendiente', result.missingInformation);
      section('Preguntas para completar', result.followUpQuestions);
      section('Cuidados para revisar', result.careDraft.education);
      section('Opciones sujetas a valoración', result.careDraft.options.map(function (item) { return item.rationale; }));
      section('Alternativa sin procedimiento', [result.careDraft.noProcedureAlternative]);
      section('Revisión profesional', result.professionalReview.reasons);
      }
    }
    byId('generate').hidden = row.status !== 'draft' || analyzing; byId('generate').disabled = busy || !config.enabled || !config.configured;
    byId('generation-note').textContent = row.status === 'draft' && config.simulation ? 'Esta acción genera una respuesta ficticia sin contactar el proveedor de IA.' : row.status === 'draft' ? 'Esta acción enviará únicamente las fotos seleccionadas y la información autorizada al proveedor de IA.' : row.status === 'generating' ? 'La generación está en curso. Vuelve a seleccionar esta valoración para consultar su estado; no se repetirá automáticamente.' : row.failureCode ? 'No se obtuvo un borrador válido. Crea una nueva valoración si deseas intentarlo otra vez.' : '';
    if (analyzing) byId('generation-note').textContent = 'Esperando respuesta. No se iniciará otro análisis automáticamente.';
    var simulated = row.provenance && row.provenance.simulation;
    if (simulated) node('p', 'SIMULACIÓN: datos ficticios, sin el proveedor de IA. Este resultado no se puede aprobar ni entregar como valoración real.', byId('result'));
    var canReview = row.status === 'pending_review' && config.canApprove && result && !simulated;
    byId('approval-form').hidden = !canReview; byId('approve').disabled = busy;
    if (canReview) {
      editable('Resumen para la clienta', ['summary'], result.summary);
      result.observations.forEach(function (item, i) { editable('Observación ' + (i + 1), ['observations', i, 'description'], item.description); });
      result.priorities.forEach(function (item, i) { editable('Prioridad ' + (i + 1), ['priorities', i, 'description'], item.description); });
      result.careDraft.education.forEach(function (item, i) { editable('Cuidado ' + (i + 1), ['careDraft', 'education', i], item); });
      editable('Alternativa sin procedimiento', ['careDraft', 'noProcedureAlternative'], result.careDraft.noProcedureAlternative);
    }
    byId('approval-info').textContent = row.approval ? 'Aprobada el ' + date(row.approval.approvedAt) + '. Registro privado; no se envió automáticamente.' : row.status === 'pending_review' && !config.canApprove && !simulated ? 'Solo el administrador autorizado puede aprobar esta valoración.' : '';
    showStep(3);
  }
  async function refresh() { record = await api('/records/' + encodeURIComponent(recordId)); renderHistory(); }
  byId('draft-form').addEventListener('submit', function (event) {
    event.preventDefault(); action(async function () {
      if (activeStep !== 2) { continueConsultation(); return; }
      if (!byId('white-light').checked) { showStep(1); throw new Error('Confirma que las fotos son originales de luz blanca.'); }
      if (!byId('draft-form').reportValidity()) return;
      var selected = photoControls.filter(function (photo) { return photo.check.checked; });
      if (selected.length < 1 || selected.length > 4) throw new Error('Selecciona entre una y cuatro fotografías.');
      var incomplete = selected.find(function (photo) { return !photo.orientation.value || !photo.confirmed.checked || !photo.captured.value || isNaN(new Date(photo.captured.value).getTime()); });
      if (incomplete) { byId('individual-settings').open = true; incomplete.details.open = true; incomplete.summary.focus(); throw new Error('Falta revisar la orientación o la fecha de esta foto.'); }
      var answers = {}; fields.forEach(function (field) { answers[field[0]] = byId('answer-' + field[0]).value || null; }); flags.forEach(function (field) { var value = byId('answer-' + field[0]).value; answers[field[0]] = value === '' ? null : value === 'true'; });
      current = await api('/records/' + encodeURIComponent(recordId) + '/assessments', { whiteLightOriginalConfirmed: byId('white-light').checked, photos: selected.map(function (photo) { return { id: photo.id, zone: photo.zone.value, orientation: photo.orientation.value, lateralityResolved: photo.side.checked, capturedAt: new Date(photo.captured.value).toISOString(), capturedAtConfirmed: photo.confirmed.checked }; }), patient: { age: byId('age').value === '' ? null : Number(byId('age').value), objective: byId('objective').value || null }, answers: answers, consentAccepted: byId('consent').checked, consentVersion: config.consentVersion });
      byId('consent').checked = false; await refresh(); message('Borrador guardado. Aún no se han enviado fotografías al proveedor de IA.');
    });
  });
  byId('capture-image').addEventListener('error', function () { byId('capture-image').hidden = true; byId('capture-caption').textContent = 'Vista previa no disponible'; });
  byId('generate').addEventListener('click', function () { action(async function () {
    message(config.simulation ? 'Generando respuesta ficticia, sin el proveedor de IA…' : 'Analizando con el proveedor de IA. Espera sin repetir la solicitud…');
    generatingRequest = true; render(current);
    try { current = await api('/assessments/' + encodeURIComponent(current.id) + '/generate', { version: current.version }); }
    catch (error) { try { current = await api('/assessments/' + encodeURIComponent(current.id)); await refresh(); } catch (_) { /* Keep the last known version; never retry generation. */ } throw error; }
    finally { generatingRequest = false; render(current); }
    await refresh(); message(config.simulation ? 'Simulación lista, sin el proveedor de IA ni aprobación posible.' : current.status === 'pending_review' ? 'Borrador del proveedor de IA listo para revisión.' : 'Consulta el estado y la información pendiente de la valoración.');
  }); });
  byId('approval-form').addEventListener('submit', function (event) { event.preventDefault();
    // Capture edits before disabling/rerendering controls.
    var corrected = JSON.parse(JSON.stringify(current.assessment)); var changed = false;
    corrections.forEach(function (edit) { if (edit.input.value !== edit.original) changed = true; var target = corrected; edit.path.slice(0, -1).forEach(function (key) { target = target[key]; }); target[edit.path[edit.path.length - 1]] = edit.input.value; });
    var notes = byId('review-notes').value || null;
    action(async function () { current = await api('/assessments/' + encodeURIComponent(current.id) + '/approve', { version: current.version, correctedAssessment: changed ? corrected : null, reviewNotes: notes }); await refresh(); message('Valoración aprobada y guardada con tu revisión.'); });
  });
  (async function () {
    try {
      if (!recordId) throw new Error('Abre Venus Skin IA desde el expediente de una clienta.');
      config = await api('/config'); await refresh();
      if (record.assessments.length) { current = record.assessments[0]; render(current); }
      var visiblePhotos = captureIds.length ? record.photos.filter(function (p) { return captureIds.indexOf(p.id) !== -1; }) : record.photos;
      renderPhotos(visiblePhotos);
      byId('age').value = record.record.age === null || record.record.age === undefined ? '' : record.record.age;
      byId('objective').value = record.record.objectives || ''; byId('consent-text').textContent = config.consentText;
      byId('save').disabled = false;
      if (config.simulation) { byId('configuration').hidden = false; byId('configuration').textContent = 'SIMULACIÓN · Datos ficticios. No se envían fotos al proveedor de IA ni se permite aprobar.'; byId('generate').textContent = 'Generar simulación'; }
      if (!config.simulation && (!config.enabled || !config.configured)) { byId('configuration').hidden = false; byId('configuration').textContent = 'Puedes preparar borradores. Para analizar falta activar el proveedor de IA y completar su configuración privada en el servidor.'; }
      message(captureIds.length ? visiblePhotos.length === captureIds.length ? 'Fotos de esta sesión seleccionadas. Confirma sus datos para continuar.' : 'Algunas fotos de esta sesión no están disponibles. Regresa a captura y revisa las fotos guardadas.' : 'Expediente listo. Las fotos originales se conservan.');
    } catch (error) { message(error.message, true); }
  })();
}());
