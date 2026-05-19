// Capa API del panel admin.
// apiFetch centraliza el boilerplate `credentials: 'include'` de las llamadas
// a /api/*. Es EXACTAMENTE equivalente a:
//     fetch(path, { credentials: 'include', ...opts })
// No parsea la respuesta ni lanza en !ok: el comportamiento de los llamadores
// no cambia. Es el punto único donde luego se podrá añadir auth/headers/errores.
window.apiFetch = function (path, opts) {
  return fetch(path, Object.assign({ credentials: 'include' }, opts || {}));
};
