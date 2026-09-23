(function () {
  'use strict';
  var byId = function (id) { return document.getElementById(id); };
  var config, record, current, renderedId, busy = false, photoControls = [], corrections = [];
  var query = new URLSearchParams(location.search);
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
  var errors = { auth_required: 'Inicia sesión en Venus para continuar.', invalid_token: 'Tu sesión venció. Vuelve a iniciar sesión.', forbidden: 'Tu cuenta no tiene permiso para esta acción.', not_authorized: 'Solo el administrador autorizado puede aprobar.', disabled: 'El análisis con OpenAI aún no está activado en el servidor.', not_configured: 'Falta completar la configuración privada de OpenAI.', key_missing: 'Falta configurar la clave de OpenAI en el servidor.', stale_input: 'La valoración cambió. Vuelve a abrir la versión vigente.', conflict: 'La valoración cambió o ya está en proceso. Actualiza su estado.', photo_storage_unavailable: 'Esta foto no está disponible en el almacenamiento autorizado. Súbela primero al expediente.', photo_unavailable: 'No se pudo recuperar una de las fotos.', invalid_photo: 'Una foto no es válida. Revisa su formato y tamaño.', invalid_input: 'Revisa las fotos, las respuestas y el consentimiento.', consent_required: 'Es necesario registrar el consentimiento específico.', timeout: 'El análisis excedió el tiempo permitido. No se reintentó automáticamente.', not_found: 'No se encontró el expediente o la valoración.' };
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
    document.querySelectorAll('.layout button, #generate, #approve').forEach(function (button) { button.disabled = true; });
    try { await fn(); } catch (error) { message(error.message || 'No se pudo completar la acción.', true); }
    finally { busy = false; byId('save').disabled = !record; if (current && current !== previous) render(current); byId('approve').disabled = false; byId('generate').disabled = !config || !config.enabled || !config.configured; renderHistory(); }
  }
  fields.forEach(function (field) { var label = node('label', field[1], byId('answers')); var input = node('textarea', undefined, label); input.id = 'answer-' + field[0]; input.rows = 2; input.maxLength = 500; });
  flags.forEach(function (field) { var label = node('label', field[1], byId('answers')); var input = select([['','No sabemos'],['true','Sí'],['false','No']], label); input.id = 'answer-' + field[0]; });
  function renderPhotos(photos) {
    byId('photos').textContent = ''; photoControls = [];
    var nativeSelected = 0, nativeLatest = 0;
    photos.forEach(function (p) { if (/(?:^|\|)\s*modo=image\s*(?:\||$)/.test(p.description || '')) nativeLatest = Math.max(nativeLatest, new Date(p.takenAt).getTime()); });
    if (!photos.length) node('p', 'Este expediente aún no tiene fotos. Añádelas desde la sección Fotos del expediente y vuelve aquí.', byId('photos'));
    photos.forEach(function (photo, index) {
      var box = node('div', undefined, byId('photos')); box.className = 'photo';
      var src = safeImage(photo.url);
      if (src) { var img = node('img', undefined, box); img.alt = 'Fotografía ' + (index + 1) + ' del expediente'; img.referrerPolicy = 'no-referrer'; img.src = src; img.addEventListener('error', function () { img.hidden = true; node('p', 'Vista previa no disponible', box); }); }
      var label = node('label', undefined, box); label.className = 'check'; var check = node('input', undefined, label); check.type = 'checkbox'; node('span', 'Foto ' + (index + 1) + ' · ' + date(photo.takenAt), label);
      check.checked = captureIds.indexOf(photo.id) !== -1;
      var zone = select(zones, node('label', 'Zona', box));
      var captureMode = /(?:^|\|)\s*modo=([a-z_]+)/.exec(photo.description || '');
      if (captureMode) {
        check.disabled = captureMode[1] !== 'image';
        if (check.disabled) { check.checked = false; node('p', 'Captura complementaria: no se usa como luz blanca.', box); }
        else {
          zone.value = 'full_face';
          if (!captureIds.length && nativeSelected < 4 && nativeLatest - new Date(photo.takenAt).getTime() <= 600000) { check.checked = true; nativeSelected++; }
        }
      }
      var orientation = select(orientations, node('label', 'Orientación actual', box));
      var captured = node('input', undefined, node('label', 'Fecha y hora de la toma', box)); captured.type = 'datetime-local';
      var suggested = new Date(photo.takenAt); if (!isNaN(suggested.getTime())) captured.value = new Date(suggested.getTime() - suggested.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      var dateLabel = node('label', undefined, box); dateLabel.className = 'check'; var confirmed = node('input', undefined, dateLabel); confirmed.type = 'checkbox'; node('span', 'Confirmo que esta es la fecha de la toma, no solo la fecha de subida', dateLabel);
      var sideLabel = node('label', undefined, box); sideLabel.className = 'check'; var side = node('input', undefined, sideLabel); side.type = 'checkbox'; node('span', 'Derecha e izquierda confirmadas desde la perspectiva de la clienta', sideLabel);
      photoControls.push({ id: photo.id, check: check, zone: zone, orientation: orientation, side: side, captured: captured, confirmed: confirmed });
    });
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
    byId('review').hidden = false; byId('state').textContent = statusNames[row.status] || row.status;
    byId('review-title').textContent = row.status === 'approved' ? 'Reporte Venus Skin' : 'Revisar valoración Venus';
    byId('result').textContent = ''; byId('corrections').textContent = ''; corrections = [];
    var result = row.approval && row.approval.correctedAssessment ? row.approval.correctedAssessment : row.assessment;
    byId('provenance').textContent = row.provenance ? 'Proveedor: ' + (row.provenance.provider || 'OpenAI') + ' · Modelo: ' + (row.provenance.model || 'registrado') : 'Todavía no hay una valoración de IA.';
    if (result) {
      if (window.VenusPhotoReport) {
        window.VenusPhotoReport.render(byId('result'), row, record ? record.assessments : []);
        document.querySelector('.layout').before(byId('review'));
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
    byId('generate').hidden = row.status !== 'draft'; byId('generate').disabled = busy || !config.enabled || !config.configured;
    byId('generation-note').textContent = row.status === 'draft' && config.simulation ? 'Esta acción genera una respuesta ficticia sin contactar OpenAI.' : row.status === 'draft' ? 'Esta acción enviará únicamente las fotos seleccionadas y la información autorizada a OpenAI.' : row.status === 'generating' ? 'La generación está en curso. Vuelve a seleccionar esta valoración para consultar su estado; no se repetirá automáticamente.' : row.failureCode ? 'No se obtuvo un borrador válido. Crea una nueva valoración si deseas intentarlo otra vez.' : '';
    var simulated = row.provenance && row.provenance.simulation;
    if (simulated) node('p', 'SIMULACIÓN: datos ficticios, sin OpenAI. Este resultado no se puede aprobar ni entregar como valoración real.', byId('result'));
    var canReview = row.status === 'pending_review' && config.canApprove && result && !simulated;
    byId('approval-form').hidden = !canReview; byId('approve').disabled = busy;
    if (canReview) {
      editable('Resumen para la clienta', ['summary'], result.summary);
      result.observations.forEach(function (item, i) { editable('Observación ' + (i + 1), ['observations', i, 'description'], item.description); });
      result.priorities.forEach(function (item, i) { editable('Prioridad ' + (i + 1), ['priorities', i, 'description'], item.description); });
      result.careDraft.education.forEach(function (item, i) { editable('Cuidado ' + (i + 1), ['careDraft', 'education', i], item); });
      editable('Alternativa sin procedimiento', ['careDraft', 'noProcedureAlternative'], result.careDraft.noProcedureAlternative);
    }
    byId('approval-info').textContent = row.approval ? 'Aprobada el ' + date(row.approval.approvedAt) + '. Registro privado; no se envió automáticamente.' : row.status === 'pending_review' && !config.canApprove ? 'Solo el administrador autorizado puede aprobar esta valoración.' : '';
  }
  async function refresh() { record = await api('/records/' + encodeURIComponent(recordId)); renderHistory(); }
  byId('draft-form').addEventListener('submit', function (event) {
    event.preventDefault(); action(async function () {
      var selected = photoControls.filter(function (photo) { return photo.check.checked; });
      if (selected.length < 1 || selected.length > 4) throw new Error('Selecciona entre una y cuatro fotografías.');
      if (selected.some(function (photo) { return !photo.orientation.value; })) throw new Error('Confirma la orientación de cada fotografía seleccionada.');
      if (selected.some(function (photo) { return !photo.confirmed.checked || !photo.captured.value || isNaN(new Date(photo.captured.value).getTime()); })) throw new Error('Confirma la fecha y hora de la toma de cada fotografía seleccionada.');
      var answers = {}; fields.forEach(function (field) { answers[field[0]] = byId('answer-' + field[0]).value || null; }); flags.forEach(function (field) { var value = byId('answer-' + field[0]).value; answers[field[0]] = value === '' ? null : value === 'true'; });
      current = await api('/records/' + encodeURIComponent(recordId) + '/assessments', { whiteLightOriginalConfirmed: byId('white-light').checked, photos: selected.map(function (photo) { return { id: photo.id, zone: photo.zone.value, orientation: photo.orientation.value, lateralityResolved: photo.side.checked, capturedAt: new Date(photo.captured.value).toISOString(), capturedAtConfirmed: photo.confirmed.checked }; }), patient: { age: byId('age').value === '' ? null : Number(byId('age').value), objective: byId('objective').value || null }, answers: answers, consentAccepted: byId('consent').checked, consentVersion: config.consentVersion });
      byId('consent').checked = false; await refresh(); message('Borrador guardado. Aún no se han enviado fotografías a OpenAI.');
    });
  });
  byId('generate').addEventListener('click', function () { action(async function () {
    message(config.simulation ? 'Generando respuesta ficticia, sin OpenAI…' : 'Analizando con OpenAI. Espera sin repetir la solicitud…');
    try { current = await api('/assessments/' + encodeURIComponent(current.id) + '/generate', { version: current.version }); }
    catch (error) { try { current = await api('/assessments/' + encodeURIComponent(current.id)); await refresh(); } catch (_) { /* Keep the last known version; never retry generation. */ } throw error; }
    await refresh(); message(config.simulation ? 'Simulación lista, sin OpenAI ni aprobación posible.' : current.status === 'pending_review' ? 'Borrador de OpenAI listo para revisión.' : 'Consulta el estado y la información pendiente de la valoración.');
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
      if (config.simulation) { byId('configuration').hidden = false; byId('configuration').textContent = 'SIMULACIÓN · Datos ficticios. No se envían fotos a OpenAI ni se permite aprobar.'; byId('generate').textContent = 'Generar simulación'; }
      if (!config.simulation && (!config.enabled || !config.configured)) { byId('configuration').hidden = false; byId('configuration').textContent = 'Puedes preparar borradores. Para analizar falta activar OpenAI y completar su configuración privada en el servidor.'; }
      message(captureIds.length ? visiblePhotos.length === captureIds.length ? 'Fotos de esta sesión seleccionadas. Confirma sus datos para continuar.' : 'Algunas fotos de esta sesión no están disponibles. Regresa a captura y revisa las fotos guardadas.' : 'Expediente listo. Las fotos originales se conservan.');
    } catch (error) { message(error.message, true); }
  })();
}());
