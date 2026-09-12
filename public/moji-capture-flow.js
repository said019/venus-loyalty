(function (root) {
  'use strict';
  function session() {
    var epoch = 0, record = null, photos = [];
    return {
      reset: function (id) { epoch += 1; record = id || null; photos = []; return epoch; },
      ticket: function () { return { epoch: epoch, recordId: record }; },
      current: function (ticket) { return !!ticket && ticket.epoch === epoch && ticket.recordId === record; },
      add: function (ticket, photo) {
        if (!this.current(ticket) || !record || !photo || typeof photo.id !== 'string') return false;
        if (photos.some(function (p) { return p.id === photo.id; })) return false;
        if (photos.length >= 4) return false;
        photos.push({ id: photo.id }); return true;
      },
      photos: function () { return photos.slice(); },
      advisorUrl: function (cardId) {
        if (!record || !photos.length) throw new Error('Primero toma una foto.');
        return '/skin-advisor.html?capture=1&recordId=' + encodeURIComponent(record) + '&cardId=' + encodeURIComponent(cardId) + '&photoIds=' + encodeURIComponent(photos.map(function (p) { return p.id; }).join(','));
      }
    };
  }
  function selectedIds(search) {
    var query = new URLSearchParams(search);
    if (query.get('capture') !== '1') return [];
    var ids = (query.get('photoIds') || '').split(',').filter(function (id) { return /^[a-zA-Z0-9_-]{1,120}$/.test(id); });
    return ids.filter(function (id, i) { return ids.indexOf(id) === i; }).slice(0, 4);
  }
  root.VenusCaptureFlow = { session: session, selectedIds: selectedIds };
}(typeof window === 'undefined' ? globalThis : window));
