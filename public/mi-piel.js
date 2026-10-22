(function () {
  'use strict';
  var cadences = { unica: 'Una sesión', semanal: 'Cada semana', quincenal: 'Cada 15 días', cada_3_semanas: 'Cada 3 semanas', mensual: 'Cada mes' };
  var zoneLabels = { forehead: 'Frente', nose: 'Nariz', right_cheek: 'Mejilla derecha', left_cheek: 'Mejilla izquierda', chin: 'Mentón', right_eye: 'Contorno del ojo derecho', left_eye: 'Contorno del ojo izquierdo', lower_contour: 'Contorno inferior', full_face: 'Rostro completo', unknown: 'Zona no registrada' };
  var layerCopy = {
    poros:       { name: 'Poros', text: 'Puntos donde el poro se ve más abierto, sobre todo en nariz y mejillas.', care: 'Ayuda: limpieza profunda en cabina y exfoliación suave en casa.' },
    textura:     { name: 'Textura', text: 'Zonas donde la superficie de la piel se ve menos uniforme.', care: 'Ayuda: hidratación constante y exfoliación suave.' },
    arrugas:     { name: 'Líneas y arrugas', text: 'Líneas de expresión marcadas sobre la foto. Se notan más al gesticular.', care: 'Ayuda: hidratación y protector solar todos los días.' },
    manchas:     { name: 'Manchas', text: 'Zonas con un poco más de pigmento que el tono a su alrededor.', care: 'Ayuda: protector solar diario y un sérum con vitamina C.' },
    lesiones:    { name: 'Puntos rojos', text: 'Pequeños puntos enrojecidos marcados sobre la foto.', care: 'Ayuda: productos calmantes; evita tocarlos.' },
    zonas_rojas: { name: 'Zonas rojas', text: 'Áreas con más enrojecimiento que el resto del rostro.', care: 'Ayuda: productos calmantes y evitar agua muy caliente.' },
    brillo:      { name: 'Brillo', text: 'Dónde se acumula más grasa durante el día.', care: 'Ayuda: limpieza por la noche e hidratación ligera sin aceites.' }
  };
  var LAYER_ORDER = ['poros', 'textura', 'arrugas', 'manchas', 'lesiones', 'zonas_rojas', 'brillo'];
  var PINS = { forehead: [50, 20], nose: [50, 50], right_cheek: [32, 56], left_cheek: [68, 56], right_eye: [34, 38], left_eye: [66, 38], chin: [50, 82], lower_contour: [50, 92] };
  var PROGRESS = { mejoro: 'Mejoró', se_mantiene: 'Se mantiene', a_cuidar: 'A cuidar' };
  var TABS = [
    { id: 'resumen', label: 'Resumen', icon: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z'] },
    { id: 'mapas', label: 'Mapas', icon: ['M12 3l9 5-9 5-9-5z', 'M3 12.5l9 5 9-5', 'M3 16.5l9 5 9-5'] },
    { id: 'progreso', label: 'Progreso', icon: ['M3 18c3 0 4-9 8-9s4 6 6 6c1.5 0 2.5-3 4-6'] },
    { id: 'plan', label: 'Plan', icon: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'] }
  ];
  var SVGNS = 'http://www.w3.org/2000/svg';

  function node(tag, text, parent, cls) {
    var el = document.createElement(tag);
    if (text !== null && text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    if (parent) parent.appendChild(el);
    return el;
  }
  function button(text, parent, cls, handler) {
    var el = node('button', text, parent, cls); el.type = 'button'; el.setAttribute('aria-pressed', 'false');
    el.addEventListener('click', handler); return el;
  }
  function svgIcon(paths, parent) {
    var svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    paths.forEach(function (d) { var p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); svg.appendChild(p); });
    parent.appendChild(svg); return svg;
  }
  function imageUrl(value) {
    if (typeof value !== 'string' || !value) return '';
    try { var u = new URL(value, location.origin); return (u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' && !u.port || u.origin === location.origin) && !u.username && !u.password ? u.href : ''; }
    catch (_) { return ''; }
  }
  function fmtDate(value) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Fecha no registrada';
  }
  function fmtWeek(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === 'string' ? value : '');
    if (!m) return 'Fecha no registrada';
    var y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]), date = new Date(y, mo, d);
    if (y < 2000 || y > 2100 || date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return 'Fecha no registrada';
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function fmtPrice(value) {
    return typeof value === 'number' && isFinite(value) ? value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '';
  }
  function validDate(value) { return typeof value === 'string' && isFinite(Date.parse(value)); }
  // Solo claves propias: un valor del servidor como "constructor" no debe resolver a Object.prototype.
  function lookup(map, key) { return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined; }
  function lines(text) { return String(text || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }
  function firstAnalyzed(report) {
    var photos = report && Array.isArray(report.photos) ? report.photos : [];
    for (var i = 0; i < photos.length; i++) if (photos[i] && photos[i].analyzed) return photos[i];
    return null;
  }
  function layerUrl(report, photo, key) {
    var list = photo && report.layers && report.layers[photo.id];
    if (!Array.isArray(list)) return '';
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].key === key) return imageUrl(list[i].url);
    return '';
  }
  function layerKeys(report, photo) {
    return LAYER_ORDER.filter(function (key) { return !!layerUrl(report, photo, key); });
  }
  // Marco en arco; si la imagen falla o no hay URL válida, queda el texto y el resto sigue.
  // opts: fail (texto si no carga), alt (descripción de la imagen), onLoad (solo si la imagen cargó).
  function frame(parent, url, opts) {
    opts = opts || {};
    var box = node('div', null, parent, 'mp-frame');
    function empty() { while (box.firstChild) box.removeChild(box.firstChild); node('p', opts.fail || 'Imagen no disponible', box, 'mp-frame-empty'); }
    if (!url) { empty(); return box; }
    var img = document.createElement('img'); img.alt = opts.alt || ''; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
    img.addEventListener('error', empty);
    if (opts.onLoad) img.addEventListener('load', function () { opts.onLoad(box); });
    img.src = url; box.appendChild(img);
    return box;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function chips(parent, items, current, onPick) {
    var wrap = node('div', null, parent, 'mp-chips'), btns = [];
    function mark() { btns.forEach(function (b, i) { b.setAttribute('aria-pressed', String(items[i].key === current())); }); }
    items.forEach(function (item) { btns.push(button(item.label, wrap, 'mp-chip', function () { onPick(item.key); mark(); })); });
    mark(); return wrap;
  }

  function buildResumen(sec, data) {
    var photo = firstAnalyzed(data), obs = Array.isArray(data.observations) ? data.observations : [];
    node('h1', data.clientName ? 'Hola, ' + data.clientName : 'Hola', sec);
    node('p', 'Así se ve tu piel en la valoración de hoy. Tu cosmetóloga revisó cada punto antes de enviártelo.', sec, 'mp-lead');
    // Los destellos se añaden solo cuando la foto cargó; sin foto no hay nada que marcar.
    frame(sec, photo ? imageUrl(photo.url) : '', { fail: 'Original no disponible', alt: 'Tu fotografía con luz blanca', onLoad: function (box) {
      var seen = {};
      obs.forEach(function (o) {
        if (!o) return;
        var at = lookup(PINS, o.zone);
        if (!at || seen[o.zone]) return;
        seen[o.zone] = true;
        var pin = node('span', null, box, 'mp-spark'); pin.style.left = at[0] + '%'; pin.style.top = at[1] + '%';
        svgIcon(['M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z'], pin);
      });
    } });
    node('p', validDate(data.approvedAt) ? 'Fotografía con luz blanca del ' + fmtDate(data.approvedAt) + '. Los destellos marcan las zonas revisadas.' : 'Fotografía con luz blanca. Los destellos marcan las zonas revisadas.', sec, 'mp-cap');
    node('h2', 'Lo que vimos', sec);
    obs.forEach(function (o) {
      if (!o) return;
      var row = node('div', null, sec, 'mp-obs'), dot = node('span', null, row, 'mp-obs-dot'), col = node('div', null, row, 'mp-obs-text');
      svgIcon(['M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z'], dot);
      node('b', lookup(zoneLabels, o.zone) || zoneLabels.unknown, col); node('span', o.description, col);
    });
    var rev = node('div', null, sec, 'mp-card mp-card-soft');
    node('h3', 'Revisado por tu cosmetóloga', rev);
    node('p', 'Venus Cosmetología aprobó este reporte el ' + fmtDate(data.approvedAt), rev);
    if (Array.isArray(data.pendingToConfirm) && data.pendingToConfirm.length) {
      var pend = node('div', null, sec, 'mp-card');
      node('h3', 'Para confirmar en tu siguiente visita', pend);
      var ul = node('ul', null, pend, 'mp-list');
      data.pendingToConfirm.forEach(function (t) { node('li', t, ul); });
    }
    node('p', 'Valoración cosmética. No sustituye una consulta médica.', sec, 'mp-note');
  }

  function buildMapas(sec, data) {
    var photo = firstAnalyzed(data), keys = layerKeys(data, photo), chosen = keys[0] || null;
    node('h1', 'Mapas de tu piel', sec);
    if (!keys.length) { node('p', 'Los mapas de esta valoración no están disponibles.', sec, 'mp-lead'); }
    else {
      var holder = node('div', null, sec), info = node('div', null, sec);
      var draw = function () {
        clear(holder); clear(info);
        frame(holder, layerUrl(data, photo, chosen), { fail: 'Imagen no disponible' });
        var c = lookup(layerCopy, chosen), card = node('div', null, info, 'mp-card');
        node('h3', c.name, card); node('p', c.text, card); node('p', c.care, card);
      };
      chips(sec, keys.map(function (k) { return { key: k, label: lookup(layerCopy, k).name }; }), function () { return chosen; }, function (k) { chosen = k; draw(); });
      sec.appendChild(holder); sec.appendChild(info); draw();
    }
    node('p', 'Los mapas son una guía visual sobre tu fotografía, revisada por tu cosmetóloga. No son una medición médica.', sec, 'mp-note');
  }

  function buildProgreso(sec, data) {
    node('h1', 'Tu progreso', sec);
    var prev = data.previous;
    if (!prev) { node('p', 'Esta es tu primera valoración. En tu próxima visita verás aquí la comparación.', sec, 'mp-lead'); return; }
    var cur = firstAnalyzed(data), old = firstAnalyzed(prev), mode = 'foto';
    var options = [{ key: 'foto', label: 'Foto' }];
    LAYER_ORDER.forEach(function (k) { if (layerUrl(data, cur, k) && layerUrl(prev, old, k)) options.push({ key: k, label: lookup(layerCopy, k).name }); });
    node('h2', 'Qué comparar', sec);
    var holder = node('div', null, sec);
    var draw = function () {
      clear(holder);
      var pair = node('div', null, holder, 'mp-pair'), a = node('div', null, pair), b = node('div', null, pair);
      var urlOf = function (rep, ph) { return mode === 'foto' ? imageUrl(ph && ph.url) : layerUrl(rep, ph, mode); };
      node('p', fmtDate(prev.approvedAt), a, 'mp-cap'); frame(a, urlOf(prev, old), { fail: 'Imagen no disponible' });
      node('p', fmtDate(data.approvedAt) + ', hoy', b, 'mp-cap'); frame(b, urlOf(data, cur), { fail: 'Imagen no disponible' });
    };
    chips(sec, options, function () { return mode; }, function (k) { mode = k; draw(); });
    sec.appendChild(holder); draw();
    var zp = data.zoneProgress && typeof data.zoneProgress === 'object' ? data.zoneProgress : {};
    var zones = Object.keys(zp).filter(function (z) { return !!lookup(PROGRESS, zp[z]); });
    if (zones.length) {
      node('h2', 'Por zona', sec);
      var card = node('div', null, sec, 'mp-card');
      zones.forEach(function (z) {
        var row = node('div', null, card, 'mp-row'); node('span', lookup(zoneLabels, z) || zoneLabels.unknown, row);
        node('span', lookup(PROGRESS, zp[z]), row, 'mp-badge ' + zp[z]);
      });
    }
  }

  function buildPlan(sec, data, options) {
    var plan = Array.isArray(data.plan) ? data.plan : [], home = data.homeRoutine;
    var hasHome = home && (lines(home.morning).length || lines(home.night).length);
    node('h1', 'Tu plan', sec);
    if (!plan.length && !hasHome) node('p', 'Tu cosmetóloga te comparte el plan en tu próxima visita.', sec, 'mp-lead');
    if (plan.length) {
      node('h2', 'En cabina', sec);
      var card = node('div', null, sec, 'mp-card');
      plan.forEach(function (s) {
        if (!s) return;
        var row = node('div', null, card, 'mp-row'), left = node('div', null, row);
        node('span', s.name, left); node('small', lookup(cadences, s.cadence) || '', left);
        var price = fmtPrice(s.price);
        if (price) node('span', price, row, 'mp-price');
      });
    }
    if (hasHome) {
      node('h2', 'En casa', sec);
      var which = lines(home.morning).length ? 'morning' : 'night', holder = node('div', null, sec);
      var draw = function () {
        clear(holder); var ol = node('ol', null, holder, 'mp-steps');
        lines(home[which]).forEach(function (t) { node('li', t, ol); });
      };
      chips(sec, [{ key: 'morning', label: 'Mañana' }, { key: 'night', label: 'Noche' }], function () { return which; }, function (k) { which = k; draw(); });
      sec.appendChild(holder); draw();
    }
    if (data.nextVisitWeek) {
      var next = node('div', null, sec, 'mp-next');
      node('h3', 'Próxima cita sugerida', next); node('p', 'Semana del ' + fmtWeek(data.nextVisitWeek), next);
      if (options.mode === 'card' && options.agendarHref) { var a = node('a', 'Agendar mi próxima cita', next, 'mp-btn'); a.href = options.agendarHref; }
    }
  }

  function render(root, data, options) {
    options = options || {}; data = data || {};
    var mode = options.mode === 'cabina' ? 'cabina' : 'card';
    clear(root);
    var page = node('div', null, root, 'mp mp-' + mode);
    var head = node('header', null, page, 'mp-head');
    var logo = node('img', null, head, 'mp-logo'); logo.src = '/assets/venus-logo-horizontal.png'; logo.alt = 'Venus Cosmetología';
    node('span', fmtDate(data.approvedAt), head, 'mp-date');
    if (mode === 'cabina' && (options.onDone || options.onSendLink)) {
      var bar = node('div', null, page, 'mp-bar');
      if (options.onDone) { var done = node('button', 'Listo', bar, 'mp-btn'); done.type = 'button'; done.addEventListener('click', options.onDone); }
      if (options.onSendLink) { var send = node('button', 'Enviar enlace por WhatsApp', bar, 'mp-btn mp-btn-out'); send.type = 'button'; send.addEventListener('click', options.onSendLink); }
    }
    var nav = document.createElement('nav'); nav.className = 'mp-nav mp-nav-' + mode; nav.setAttribute('aria-label', 'Secciones de tu reporte');
    var secs = [], btns = [];
    if (mode === 'cabina') page.appendChild(nav);
    var builders = { resumen: buildResumen, mapas: buildMapas, progreso: buildProgreso, plan: buildPlan };
    TABS.forEach(function (tab, i) {
      var sec = node('section', null, page, 'mp-sec'); sec.hidden = true; secs.push(sec);
      builders[tab.id](sec, data, options);
      var b = button(null, nav, '', function () { select(i); });
      svgIcon(tab.icon, b); node('span', tab.label, b); btns.push(b);
    });
    if (mode === 'card') page.appendChild(nav);
    function select(index) {
      secs.forEach(function (s, i) { s.hidden = i !== index; btns[i].setAttribute('aria-pressed', String(i === index)); });
      if (mode === 'card') window.scrollTo(0, 0);
    }
    select(0);
  }

  function message(root, text) {
    clear(root);
    var p = node('p', text, node('div', null, root, 'mp'), 'mp-msg');
    p.setAttribute('aria-live', 'polite');
  }

  function boot() {
    var root = document.getElementById('mi-piel');
    if (!root) return;
    var params = new URLSearchParams(location.search), card = params.get('card'), v = params.get('v'), ok = /^[A-Za-z0-9_-]{1,128}$/;
    if (!card || !v || !ok.test(card) || !ok.test(v)) { message(root, 'Este reporte no está disponible.'); return; }
    var token = new URLSearchParams(location.hash.slice(1)).get('skinToken');
    try {
      if (token && /^[a-f0-9]{64}$/.test(token)) {
        sessionStorage.setItem('skin-access:' + card, token);
        history.replaceState(null, '', location.pathname + location.search);
      } else token = sessionStorage.getItem('skin-access:' + card);
    } catch (_) { /* The fragment still works when session storage is unavailable. */ }
    if (!token || !/^[a-f0-9]{64}$/.test(token)) { message(root, 'Solicita a Venus un nuevo enlace privado para ver tu reporte.'); return; }
    fetch('/api/public/card/' + card + '/skin-reports/' + v, { credentials: 'same-origin', headers: { Authorization: 'Bearer ' + token } }).then(function (res) {
      if (res.status === 404) { message(root, 'Este reporte no está disponible.'); return null; }
      if (!res.ok) throw new Error('http');
      return res.json();
    }).then(function (body) {
      if (!body) return;
      if (!body.success || !body.data) { message(root, 'Este reporte no está disponible.'); return; }
      render(root, body.data, { mode: 'card', agendarHref: '/agendar.html', onDone: null, onSendLink: null });
    }).catch(function () { message(root, 'No se pudo cargar tu reporte. Intenta de nuevo.'); });
  }

  window.VenusMiPiel = { render: render, cadences: cadences, zoneLabels: zoneLabels, layerCopy: layerCopy };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
