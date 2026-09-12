// Comparación de teléfonos mexicanos.
// En esta base conviven los dos formatos: las citas y tarjetas viejas traen
// 10 dígitos ("4272787303") y las nuevas la lada del país ("524272787303"),
// según por dónde entró la clienta. Comparar las cadenas tal cual haría que
// una cita legítima se viera como "de otra clienta", así que se comparan por
// los últimos 10 dígitos.
export const soloDigitos = (s) => String(s || '').replace(/\D/g, '');

export function mismoTelefono(a, b) {
  const x = soloDigitos(a);
  const y = soloDigitos(b);
  // Menos de 10 dígitos no es un teléfono comparable: mejor decir que no
  // coincide que dejar pasar una liga equivocada por un dato incompleto.
  if (x.length < 10 || y.length < 10) return false;
  return x.slice(-10) === y.slice(-10);
}
