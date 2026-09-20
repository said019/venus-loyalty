(function (root) {
  'use strict';
  var modes = { image: 'Blanca', image_positive: 'Positiva', image_negative: 'Negativa', image_blue: 'Azul', image_uv: 'UV', image_woods: 'Wood' };
  function inspect(files) {
    files = Array.prototype.slice.call(files || []);
    if (files.length !== 6) throw new Error('Selecciona las seis imágenes de una misma captura.');
    var session, seen = {};
    var result = files.map(function (file) {
      var match = /^(\d{6})-(image(?:_positive|_negative|_blue|_uv|_woods)?)\.jpg$/i.exec(file.name);
      if (!match || !file.size || file.size > 10 * 1024 * 1024) throw new Error('Archivo no válido: ' + file.name);
      var mode = match[2].toLowerCase();
      if (session && session !== match[1]) throw new Error('Las imágenes pertenecen a capturas diferentes.');
      if (seen[mode]) throw new Error('Hay un modo repetido. Selecciona una sola captura.');
      seen[mode] = true; session = match[1];
      return { file: file, mode: mode, label: modes[mode], source: file.name, session: session };
    });
    return result.sort(function (a, b) { return Object.keys(modes).indexOf(a.mode) - Object.keys(modes).indexOf(b.mode); });
  }
  root.VenusMojiImport = { inspect: inspect };
}(typeof window === 'undefined' ? globalThis : window));
