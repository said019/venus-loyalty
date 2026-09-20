(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var flow = window.VenusCaptureFlow.session(), native = /VenusMoji\/0\.8\./.test(navigator.userAgent);
  var clienta = null, recordId = null, stream = null, track = null, busy = false, selection = 0, cameraEpoch = 0;
  var rotation = Number(localStorage.getItem('capturaRotacion') || 90), timer, searchEpoch = 0, previewUrl = null;
  var lightRequest = 0, pendingLight = null;
  var nativeStill = /VenusNativeStill\/1/.test(navigator.userAgent), pendingStill = null;
  var sessionPhotos = [];
  var imported = [], importUrls = [];
  function clearImport() {
    imported = []; importUrls.forEach(function (url) { URL.revokeObjectURL(url); }); importUrls = [];
    $('import-preview').textContent = ''; $('moji-files').value = ''; $('b-import-save').hidden = true;
  }
  if ([0, 90, 180, 270].indexOf(rotation) === -1) rotation = 90;
  function show(id, yes) {
    $(id).classList.toggle('oculto', !yes);
    if (yes && (id === 's-clienta' || id === 's-camara')) {
      $('step-clienta').removeAttribute('aria-current'); $('step-fotos').removeAttribute('aria-current');
      $(id === 's-camara' ? 'step-fotos' : 'step-clienta').setAttribute('aria-current', 'step');
    }
  }
  function status(id, text, bad) { $(id).textContent = text; $(id).className = 'estado ' + (bad ? 'mal' : 'ok'); }
  function later(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function bounded(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timeout = setTimeout(function () { reject(new Error('La operación tardó demasiado. Inténtalo de nuevo.')); }, ms);
      Promise.resolve(promise).then(function (value) { clearTimeout(timeout); resolve(value); }, function (err) { clearTimeout(timeout); reject(err); });
    });
  }
  async function json(url, options) {
    return bounded((async function () {
      var response = await fetch(url, options || { credentials: 'same-origin' });
      if (response.status === 401) throw new Error('Tu sesión venció. Vuelve a entrar en Venus.');
      if (response.status === 403) throw new Error('Tu cuenta no tiene permiso para esta acción. Entra con una cuenta administradora.');
      var data = await response.json();
      if (!response.ok || data.success === false) throw new Error('Venus no pudo completar la operación.');
      return data;
    }()), 25000);
  }
  function controls() {
    $('capture-format').textContent = nativeStill ? 'JPEG nativo · Luz blanca' : 'Captura facial';
    $('b-tomar').textContent = busy ? 'Procesando captura…' : 'Capturar y guardar';
    $('s-camara').setAttribute('aria-busy', busy ? 'true' : 'false');
    $('b-import').disabled = busy || !recordId; $('b-import-save').disabled = busy || !recordId || !imported.length;
    ['b-cambiar', 'b-girar', 'modo', 'categoria', 'area', 'desc', 'b-otra', 'b-ficha'].forEach(function (id) { $(id).disabled = busy; });
    $('b-tomar').disabled = busy || !stream || !recordId || ($('modo').value === 'analisis' && flow.photos().length >= 4);
    $('b-analizar').disabled = busy || !flow.photos().length || $('modo').value !== 'analisis';
    Array.prototype.forEach.call($('tipo').querySelectorAll('button'), function (b) { b.disabled = busy; });
    Array.prototype.forEach.call($('session-photos').querySelectorAll('button'), function (b) { b.disabled = busy; });
  }
  function renderSessionPhotos() {
    $('photo-count').textContent = sessionPhotos.length + (sessionPhotos.length === 1 ? ' fotografía' : ' fotografías');
    $('session-photos').textContent = '';
    sessionPhotos.forEach(function (p, i) {
      var li = document.createElement('li');
      if (p.url && /^https:\/\//.test(p.url)) {
        var thumbnail = document.createElement('img'); thumbnail.src = p.url; thumbnail.alt = 'Foto ' + (i + 1) + ' del expediente'; thumbnail.loading = 'lazy'; li.appendChild(thumbnail);
      }
      var label = document.createElement('span'); label.textContent = 'Foto ' + (i + 1) + ' guardada'; li.appendChild(label);
      var remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Eliminar foto ' + (i + 1);
      var cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Conservar'; cancel.hidden = true;
      var confirming = false;
      cancel.onclick = function () { confirming = false; remove.textContent = 'Eliminar foto ' + (i + 1); cancel.hidden = true; };
      remove.onclick = async function () {
        if (busy) return;
        if (!confirming) { confirming = true; remove.textContent = 'Confirmar eliminación del expediente'; cancel.hidden = false; return; }
        busy = true; controls(); var ticket = flow.ticket();
        try {
          await json('/api/client-records/photos/' + encodeURIComponent(p.id), { method: 'DELETE', credentials: 'same-origin' });
          if (!flow.current(ticket)) return;
          flow.remove(ticket, p.id);
          sessionPhotos = sessionPhotos.filter(function (photo) { return photo.id !== p.id; });
          // The large preview may be the removed photo; never leave a deleted image displayed.
          if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
          $('mini').removeAttribute('src'); show('mini', false);
          renderSessionPhotos(); status('e-tomar', 'Foto eliminada del expediente.');
        } catch (e) { status('e-tomar', e.message + ' La foto sigue en la lista; verifica el expediente antes de reintentar.', true); }
        finally { busy = false; controls(); }
      };
      li.appendChild(remove); li.appendChild(cancel); $('session-photos').appendChild(li);
    });
  }
  function off() {
    if (pendingStill) { var capture = pendingStill; pendingStill = null; clearTimeout(capture.timer); capture.reject(new Error('Captura nativa cancelada.')); }
    if (pendingLight) { var p = pendingLight; pendingLight = null; clearTimeout(p.timer); p.reject(new Error('Captura con luz cancelada.')); }
    if (native) location.href = 'venus-moji://off';
  }
  function takeNativeStill() {
    // Stop WebView ownership before requesting Camera1, retaining the click gesture.
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null; track = null; $('video').srcObject = null;
    return new Promise(function (resolve, reject) {
      var request = ++lightRequest;
      pendingStill = { request: request, resolve: resolve, reject: reject, timer: setTimeout(function () {
        if (pendingStill && pendingStill.request === request) { pendingStill = null; off(); reject(new Error('La cámara nativa no respondió.')); }
      }, 13000) };
      location.href = 'venus-moji://still?request=' + request + '&rotation=' + rotation;
    });
  }
  window.venusNativeStillResult = async function (result) {
    if (!pendingStill || !result || result.request !== pendingStill.request) return;
    var pending = pendingStill;
    try {
      if (result.ok !== true) throw new Error(result.error || 'No se pudo tomar la foto nativa.');
      var response = await bounded(fetch('/__native-capture/' + result.request + '.jpg', { cache: 'no-store' }), 4000);
      if (!response.ok || (response.headers.get('Content-Type') || '').indexOf('image/jpeg') !== 0) throw new Error('La cámara no entregó el JPEG.');
      var blob = await response.blob();
      if (pendingStill !== pending) return;
      clearTimeout(pending.timer); pendingStill = null; pending.resolve(blob);
    } catch (error) {
      if (pendingStill !== pending) return;
      clearTimeout(pending.timer); pendingStill = null; pending.reject(error);
    }
  };
  function pulse() {
    // Called directly inside the operator's click; native rejects non-gesture ON.
    return new Promise(function (resolve, reject) {
      var request = ++lightRequest;
      pendingLight = { request: request, resolve: resolve, reject: reject, timer: setTimeout(function () {
        if (pendingLight && pendingLight.request === request) { pendingLight = null; off(); reject(new Error('La app no confirmó el pulso de luz. No se tomó la foto.')); }
      }, 1400) };
      location.href = 'venus-moji://white?request=' + request;
    });
  }
  window.venusMojiLightResult = function (result) {
    if (!pendingLight || !result || result.command !== 'white' || result.request !== pendingLight.request) return;
    var p = pendingLight; pendingLight = null; clearTimeout(p.timer);
    if (result.ok === true) p.resolve(); else p.reject(new Error('No se pudo encender la luz. No se tomó la foto.'));
  };
  function closeCamera() {
    cameraEpoch += 1; off();
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null; track = null; $('video').srcObject = null; controls();
  }
  function rotate() { $('video').style.transform = 'rotate(' + rotation + 'deg)' + (rotation % 180 ? ' scale(1.34)' : ''); }
  async function openCamera() {
    if (stream) return;
    var token = ++cameraEpoch, acquired = null, expired = false;
    status('e-camara', 'Abriendo cámara…');
    try {
      var opening = navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment', width: { ideal: 2064 }, height: { ideal: 1548 } } });
      opening.then(function (s) { if (expired || token !== cameraEpoch) s.getTracks().forEach(function (t) { t.stop(); }); }, function () {});
      acquired = await bounded(opening, 10000);
      if (token !== cameraEpoch) { acquired.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = acquired; track = stream.getVideoTracks()[0]; $('video').srcObject = stream; rotate();
      await bounded($('video').play(), 5000);
      if (token !== cameraEpoch) return;
      status('e-camara', 'Cámara lista. Centra el rostro y confirma la orientación.');
      track.onended = function () { closeCamera(); status('e-camara', 'La cámara se cerró. Vuelve a elegir la clienta para abrirla.', true); };
    } catch (e) { expired = true; if (token === cameraEpoch) { closeCamera(); status('e-camara', 'No se pudo abrir la cámara. Revisa su permiso y cierra la app Moji original.', true); } }
    controls();
  }
  async function choose(c) {
    if (busy) return;
    searchEpoch += 1; clearTimeout(timer);
    closeCamera(); var token = ++selection; flow.reset(null); recordId = null; clienta = null;
    status('e-clienta', 'Abriendo expediente…');
    try {
      var j = await json('/api/client-records/card/' + encodeURIComponent(c.id));
      if (token !== selection) return;
      var rec = j.data || j; if (!rec.id) throw new Error('Expediente no disponible.');
      clienta = c; recordId = rec.id; flow.reset(rec.id);
      clearImport();
      sessionPhotos = (rec.photos || []).slice();
      $('nombre-clienta').textContent = c.name; $('session-photos').textContent = '';
      renderSessionPhotos();
      $('area').value = ''; $('desc').value = '';
      show('s-clienta', false); show('s-camara', true); show('mini', false); show('despues', false); status('e-tomar', '');
      await openCamera();
    } catch (e) { if (token === selection) status('e-clienta', e.message, true); }
  }
  function search() {
    clearTimeout(timer); var epoch = ++searchEpoch, q = $('q').value.trim(); $('resultados').textContent = '';
    if (q.length < 2) return;
    timer = setTimeout(async function () {
      try {
        var j = await json('/api/admin/cards-firebase?page=1&limit=6&q=' + encodeURIComponent(q));
        if (epoch !== searchEpoch) return;
        (j.items || []).forEach(function (c) { var b = document.createElement('button'); b.textContent = c.name + ' · ' + (c.phone || ''); b.onclick = function () { choose(c); }; $('resultados').appendChild(b); });
        status('e-clienta', (j.items || []).length ? '' : 'Sin resultados.');
      } catch (e) { if (epoch === searchEpoch) status('e-clienta', e.message, true); }
    }, 250);
  }
  async function photo(useVideo) {
    var source = $('video'), objectUrl = null;
    try {
      if (!useVideo && window.ImageCapture && track) {
        try {
          var blob = await bounded(new ImageCapture(track).takePhoto(), 5000);
          objectUrl = URL.createObjectURL(blob); var img = document.createElement('img');
          await bounded(new Promise(function (resolve, reject) { img.onload = resolve; img.onerror = reject; img.src = objectUrl; }), 5000); source = img;
        } catch (_) { source = $('video'); }
      }
      var w = source.videoWidth || source.naturalWidth, h = source.videoHeight || source.naturalHeight;
      if (!w || !h) throw new Error('La cámara no entregó una imagen.');
      var canvas = document.createElement('canvas'), turn = rotation % 180 !== 0;
      canvas.width = turn ? h : w; canvas.height = turn ? w : h;
      var ctx = canvas.getContext('2d'); ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(rotation * Math.PI / 180); ctx.drawImage(source, -w / 2, -h / 2, w, h);
      var result = await bounded(new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', .92); }), 4000);
      if (!result) throw new Error('No se pudo preparar la foto.'); return result;
    } finally { if (objectUrl) URL.revokeObjectURL(objectUrl); }
  }
  async function take() {
    if (busy || !stream || !recordId || $('b-tomar').disabled) return;
    busy = true; controls(); var ticket = flow.ticket(), camera = cameraEpoch, nativeStart = Date.now();
    var typeButton = $('tipo').querySelector('.on');
    var details = { type: typeButton.getAttribute('data-v'), category: $('categoria').value, area: $('area').value.trim(), description: $('desc').value.trim() };
    status('e-tomar', native ? 'Preparando luz blanca y foto…' : 'Tomando foto…');
    try {
      var nativeBlob = null;
      if (nativeStill) nativeBlob = await takeNativeStill();
      else if (native) { await pulse(); await later(250); }
      if (!flow.current(ticket) || camera !== cameraEpoch || document.hidden) throw new Error('Captura cancelada.');
      if (native && !nativeStill && Date.now() - nativeStart > 1500) throw new Error('El pulso venció. Repite la captura.');
      // Native mode snapshots the preview within the tested pulse, no slow takePhoto call.
      var blob = nativeBlob || await photo(native); off();
      if (!flow.current(ticket) || camera !== cameraEpoch) throw new Error('Captura cancelada.');
      status('e-tomar', 'Guardando en el expediente…');
      var fd = new FormData(); fd.append('photo', blob, 'venus-moji-' + Date.now() + '.jpg');
      Object.keys(details).forEach(function (key) { fd.append(key, details[key]); });
      var j = await json('/api/client-records/' + encodeURIComponent(ticket.recordId) + '/photos', { method: 'POST', credentials: 'same-origin', body: fd });
      if (!flow.current(ticket)) return;
      if ($('modo').value === 'analisis' && !flow.add(ticket, j.data)) throw new Error('La foto se guardó, pero no se pudo añadir al análisis. Revisa el expediente.');
      if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(blob); $('mini').src = previewUrl;
      show('mini', true); show('despues', true);
      sessionPhotos.push(j.data); renderSessionPhotos();
      status('e-tomar', 'Foto guardada para ' + clienta.name + '.');
    } catch (e) { if (flow.current(ticket)) status('e-tomar', e.message + ' Si falló la conexión al guardar, revisa el expediente antes de repetir.', true); }
    finally { off(); busy = false; controls(); if (nativeStill && recordId && !document.hidden && !stream) openCamera(); }
  }
  $('b-login').onclick = async function () {
    $('b-login').disabled = true; status('e-login', 'Entrando…');
    try { await json('/api/admin/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('email').value.trim(), password: $('pass').value }) }); $('pass').value = ''; show('s-login', false); show('s-clienta', true); }
    catch (_) { status('e-login', 'No se pudo iniciar sesión. Revisa tus datos y conexión.', true); } finally { $('b-login').disabled = false; }
  };
  $('pass').onkeydown = function (e) { if (e.key === 'Enter') $('b-login').click(); };
  $('q').oninput = search;
  $('b-import').onclick = function () { if (!busy && recordId) { closeCamera(); $('moji-files').click(); } };
  $('moji-files').onchange = function () {
    var files = Array.prototype.slice.call(this.files || []); clearImport();
    try {
      imported = window.VenusMojiImport.inspect(files);
      imported.forEach(function (item) {
        var figure = document.createElement('figure'), img = document.createElement('img'), caption = document.createElement('figcaption');
        var url = URL.createObjectURL(item.file); importUrls.push(url); img.src = url; img.alt = item.label; img.width = 120; img.height = 150; img.style.objectFit = 'contain';
        caption.textContent = item.label + ' · ' + item.source; figure.appendChild(img); figure.appendChild(caption); $('import-preview').appendChild(figure);
      });
      $('b-import-save').textContent = 'Guardar seis fotos en el expediente de ' + clienta.name; $('b-import-save').hidden = false;
      status('e-import', 'Confirma que las seis imágenes corresponden a ' + clienta.name + '.');
    } catch (e) { status('e-import', e.message, true); }
    controls();
  };
  $('b-import-save').onclick = async function () {
    if (busy || !recordId || !imported.length) return;
    busy = true; controls(); var ticket = flow.ticket(), saved = 0;
    try {
      // Validate every image before the first upload; original files are never edited.
      for (var i = 0; i < imported.length; i++) {
        await bounded(new Promise(function (resolve, reject) { var img = new Image(); img.onload = resolve; img.onerror = function () { reject(new Error('Una imagen no se puede abrir.')); }; img.src = importUrls[i]; }), 5000);
      }
      for (var n = 0; n < imported.length; n++) {
        if (!flow.current(ticket)) throw new Error('La clienta cambió. Importación cancelada.');
        var item = imported[n];
        status('e-import', 'Guardando ' + item.label + ' (' + (n + 1) + '/6)…');
        var fd = new FormData(); fd.append('photo', item.file, item.source); fd.append('type', 'progress'); fd.append('category', 'facial');
        fd.append('description', 'Bitmoji original | modo=' + item.mode + ' | archivo=' + item.source + ' | archivoModificado=' + item.file.lastModified);
        var response = await json('/api/client-records/' + encodeURIComponent(ticket.recordId) + '/photos', { method: 'POST', credentials: 'same-origin', body: fd });
        sessionPhotos.push(response.data); saved++; renderSessionPhotos();
        // The advisor is white-light only; never pass UV or derived modalities as white.
        if (item.mode === 'image' && $('modo').value === 'analisis') flow.add(ticket, response.data);
      }
      status('e-import', 'Se guardaron las seis imágenes originales. La valoración con IA utiliza solo la blanca.');
    } catch (e) { status('e-import', e.message + ' Confirmadas: ' + saved + ' de 6. Revisa el expediente antes de repetir para evitar duplicados.', true); }
    finally { clearImport(); busy = false; controls(); }
  };
  $('b-tomar').onclick = take;
  $('b-apagar').onclick = function () { cameraEpoch += 1; off(); status('e-luces', 'Apagado solicitado. Comprueba que la luz esté apagada.'); };
  $('b-girar').onclick = function () { rotation = (rotation + 90) % 360; localStorage.setItem('capturaRotacion', String(rotation)); rotate(); };
  $('b-cambiar').onclick = function () { if (busy) return; closeCamera(); selection += 1; searchEpoch += 1; clearTimeout(timer); flow.reset(null); clienta = null; recordId = null; show('s-camara', false); show('s-clienta', true); $('q').value = ''; $('resultados').textContent = ''; controls(); };
  $('b-otra').onclick = function () { show('mini', false); show('despues', false); status('e-tomar', ''); };
  $('b-ficha').onclick = function () { if (clienta) { closeCamera(); location.href = '/admin/clientas/' + encodeURIComponent(clienta.id); } };
  $('modo').onchange = function () { flow.reset(recordId); renderSessionPhotos(); controls(); };
  Array.prototype.forEach.call($('tipo').querySelectorAll('button'), function (b) { b.onclick = function () { Array.prototype.forEach.call($('tipo').querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); }); }; });
  $('b-analizar').onclick = function () { if (busy || !clienta) return; closeCamera(); location.href = flow.advisorUrl(clienta.id); };
  window.addEventListener('pagehide', closeCamera);
  document.addEventListener('visibilitychange', function () { if (document.hidden) closeCamera(); });
  show('native-help', !native); $('b-apagar').hidden = !native;
  $('b-ficha').hidden = native;
  $('b-tomar').textContent = native ? 'Luz blanca + tomar foto' : 'Tomar foto (sin control de luces)';
  $('e-luces').textContent = native ? 'Luz blanca: pulso máximo de 2 segundos. Confirma físicamente que ilumina al tomar. No se utiliza UV.' : 'Chrome no controla los LEDs. Usa iluminación blanca comprobada o abre la app Venus para el pulso automático.';
  (async function () { try { await json('/api/admin/me'); show('s-clienta', true); } catch (_) { show('s-login', true); } }());
}());
