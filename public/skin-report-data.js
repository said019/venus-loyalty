(function (root) {
  'use strict';
  var modes = { image: 'Luz blanca', image_positive: 'Modo positivo', image_negative: 'Modo negativo', image_uv: 'UV', image_woods: 'Wood', image_blue: 'Azul' };
  var areas = { A01: 'Perfil visible', A02: 'Brillo superficial', A03: 'Resequedad visible', A04: 'Enrojecimiento', A05: 'Brotes visibles', A06: 'Posibles obstrucciones', A07: 'Poros visibles', A08: 'Tono y manchas', A09: 'Textura', A10: 'Marcas aparentes', A11: 'Líneas visibles', A12: 'Área de ojos', A13: 'Contorno inferior' };
  function modeOf(photo) {
    var match = /(?:^|\|)\s*modo=([a-z_]+)/.exec(photo.description || '');
    return match && modes[match[1]] ? match[1] : 'unknown';
  }
  function captures(row, recordPhotos) {
    var selected = row.input && Array.isArray(row.input.photos) ? row.input.photos : [];
    var catalog = Array.isArray(recordPhotos) ? recordPhotos : [];
    var anchors = selected.map(function (p) { return Date.parse(p.sourceTakenAt || p.capturedAt); }).filter(Number.isFinite);
    var result = selected.map(function (p) {
      var source = catalog.find(function (candidate) { return candidate.id === p.id && candidate.url === p.sourceUrl; });
      return Object.assign({}, p, { url: p.sourceUrl, mode: source ? modeOf(source) : 'unknown', analyzed: true, nearby: false });
    });
    // Older captures lack a native session ID. Do not silently claim temporal proximity is a session.
    catalog.forEach(function (p) {
      var time = Date.parse(p.takenAt), mode = modeOf(p);
      if (mode === 'unknown' || !Number.isFinite(time) || result.some(function (item) { return item.id === p.id; })) return;
      if (!anchors.some(function (anchor) { return Math.abs(anchor - time) <= 10 * 60 * 1000; })) return;
      result.push({ id: p.id, url: p.url, mode: mode, capturedAt: p.takenAt, orientation: 'unknown', lateralityResolved: false, analyzed: false, nearby: true });
    });
    return result.slice(0, 24);
  }
  root.VenusReportData = { modes: modes, areas: areas, captures: captures, modeOf: modeOf };
}(typeof window !== 'undefined' ? window : this));
