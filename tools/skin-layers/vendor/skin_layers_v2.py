#!/usr/bin/env python3
"""
skin_layers_v2.py — Réplica de las capas del analizador (estilo del fabricante)
+ detecciones propias.

Capas "filtro" (misma receta de color que el fabricante, aprendida de un reporte real):
  rojez, wood, uv, acne, pigmento
Capas con marcas dentro de las zonas del fabricante (zona T, mejillas, mentón):
  poros (puntos morados), textura (líneas blancas finas)
Detecciones propias (del v1): manchas, arrugas, porfirinas, brillo, zonas rojas, lesiones.

Uso:
  python skin_layers_v2.py --blanca B.png --polarizada P.png --uv UV.png --wood W.png --out resultados/

  --blanca      luz blanca normal (con brillo en la nariz)   -> poros, textura, brillo
  --polarizada  polarizada cruzada (sin brillo)               -> pigmento, rojez propia, manchas
  --uv          toma UV verdosa/brillante                      -> capa UV, capa acné
  --wood        toma UV oscura con puntitos rojos (Wood)       -> capa rojez, capa Wood, porfirinas

IMPORTANTE: usa las fotos a resolución completa del aparato (≈2448x3264).
Con fotos reducidas los conteos de poros salen mucho más bajos.
"""
import argparse, json, os
import cv2
import numpy as np

import skin_layers as v1  # detectores y utilidades del v1

HERE = os.path.dirname(os.path.abspath(__file__))
FW_CAL = 1044.0          # ancho de cara (px) al que se calibró todo
CYAN = (215, 211, 66)    # color de contorno de zonas del fabricante (BGR)
PURPLE = (142, 42, 87)   # color de los puntos de poros (BGR)
# umbral black-hat relativo al brillo medio, por zona (calibrado contra el reporte del fabricante)
PORE_T_REL = {"zona_t": 0.07, "mejilla_izq": 0.05, "mejilla_der": 0.05, "menton": 0.05}

RECETAS = json.load(open(os.path.join(HERE, "filtros_calibracion.json")))
ZONAS = json.load(open(os.path.join(HERE, "zonas_plantilla.json")))


# ----------------------------------------------------------------------------
# Normalización de escala y alineación
# ----------------------------------------------------------------------------
def face_width(lm):
    return float(np.linalg.norm(lm[234] - lm[454]))


def normalize(img):
    """Reescala para que la cara mida FW_CAL px (así valen los umbrales calibrados)."""
    if img is None or img.size == 0:
        raise ValueError("No se pudo leer la foto original")
    if img.shape[0] * img.shape[1] > 24000000:
        raise ValueError("La foto supera 24 megapixeles")
    lm = v1.landmarks(img)
    if lm is None:
        raise SystemExit("No se detectó la cara en la foto de referencia.")
    s = FW_CAL / face_width(lm)
    out = cv2.resize(img, None, fx=s, fy=s,
                     interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    normalized_lm = v1.landmarks(out)
    if normalized_lm is None:
        raise ValueError("No se pudo localizar el rostro normalizado")
    return out, normalized_lm, face_width(lm)


def align(img, ref_lm, shape):
    if img is None or img.size == 0:
        raise ValueError("No se pudo leer la captura complementaria")
    lm = v1.landmarks(img)
    if lm is None:
        return None
    M, _ = cv2.estimateAffinePartial2D(lm, ref_lm, method=cv2.LMEDS)
    if M is None or not np.isfinite(M).all():
        return None
    return cv2.warpAffine(img, M, (shape[1], shape[0]), flags=cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_REPLICATE)


# ----------------------------------------------------------------------------
# Capas filtro
# ----------------------------------------------------------------------------
def aplicar_receta(r, img):
    s = img.astype(np.float32)
    if r.get("sharpen"):
        s = s + r["sharpen"] * (s - cv2.GaussianBlur(s, (0, 0), 12))
    s = np.clip(s, 0, 255) / 255
    if r["clahe"]:
        lab = cv2.cvtColor((s * 255).astype(np.uint8), cv2.COLOR_BGR2LAB)
        lab[..., 0] = cv2.createCLAHE(3.0, (8, 8)).apply(lab[..., 0])
        s = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR).astype(np.float32) / 255
    M = np.array(r["M"], np.float32)
    h, w = s.shape[:2]
    mixed = np.clip(np.c_[s.reshape(-1, 3), np.ones(h * w, np.float32)] @ M, 0, 1).reshape(h, w, 3)
    out = np.empty_like(mixed)
    for c in range(3):
        lut = np.array(r["luts"][c], np.float32)
        out[..., c] = lut[(mixed[..., c] * 255).astype(np.uint8)]
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)


# ----------------------------------------------------------------------------
# Zonas del fabricante (plantilla anclada a la malla facial)
# ----------------------------------------------------------------------------
def zonas(lm, shape):
    polys, masks = {}, {}
    for name, recs in ZONAS.items():
        P = np.array([lm[a] * u + lm[b] * v + lm[c] * w for a, b, c, u, v, w in recs])
        P = cv2.approxPolyDP(P.astype(np.float32).reshape(-1, 1, 2), 1.0, True).reshape(-1, 2)
        polys[name] = P.astype(np.int32)
        m = np.zeros(shape[:2], np.uint8)
        cv2.fillPoly(m, [polys[name]], 255)
        masks[name] = m > 0
    return polys, masks


def dibujar_zonas(img, polys):
    for P in polys.values():
        cv2.polylines(img, [P], True, CYAN, 2, cv2.LINE_AA)
    return img


# ----------------------------------------------------------------------------
# Poros y textura (estilo fabricante)
# ----------------------------------------------------------------------------
def detectar_poros(img, Z, zmasks):
    g = img[:, :, 1]
    k = int(FW_CAL * .0086) | 1
    bh = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT,
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))).astype(np.float32)
    bh = cv2.GaussianBlur(bh, (0, 0), 1.0)
    med = np.median(g[Z])
    m = np.zeros_like(Z)
    for z, zm in zmasks.items():
        m |= (bh > PORE_T_REL[z] * med) & zm
    _, blobs = v1.components(m, 3, np.pi * (FW_CAL * .008) ** 2, min_circ=.3)
    return blobs


def capa_poros(img, polys, Z, zmasks):
    blobs = detectar_poros(img, Z, zmasks)
    out = img.copy()
    for x, y, _ in blobs:
        cv2.circle(out, (int(x), int(y)), 2, PURPLE, -1, cv2.LINE_AA)
    return dibujar_zonas(out, polys), blobs


def capa_textura(img, polys, Z):
    from skimage.morphology import skeletonize
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    dog = cv2.GaussianBlur(g, (0, 0), 3) - cv2.GaussianBlur(g, (0, 0), 1)   # surcos = positivo
    thr = np.percentile(dog[Z], 85)
    lines = skeletonize((dog > thr) & Z)
    out = img.astype(np.float32)
    out[lines] = out[lines] * .45 + 255 * .55
    rugosidad = float(dog[Z].std())
    return dibujar_zonas(out.astype(np.uint8), polys), rugosidad


# ----------------------------------------------------------------------------
def rotulo(img, titulo, detalle=""):
    out = img.copy()
    h, w = out.shape[:2]
    cv2.rectangle(out, (0, h - 56), (w, h), (20, 20, 20), -1)
    cv2.putText(out, titulo, (16, h - 30), cv2.FONT_HERSHEY_SIMPLEX, .8, (255, 255, 255), 2, cv2.LINE_AA)
    if detalle:
        cv2.putText(out, detalle, (16, h - 10), cv2.FONT_HERSHEY_SIMPLEX, .5, (200, 200, 200), 1, cv2.LINE_AA)
    return out


def main():
    ap = argparse.ArgumentParser()
    for k in ["blanca", "polarizada", "uv", "wood"]:
        ap.add_argument(f"--{k}")
    ap.add_argument("--out", default="resultados_v2")
    ap.add_argument("--sin-extras", action="store_true", help="solo capas estilo fabricante")
    a = ap.parse_args()
    if not a.blanca:
        ap.error("--blanca es obligatoria")
    os.makedirs(a.out, exist_ok=True)

    ref, ref_lm, fw_nativo = normalize(cv2.imread(a.blanca))
    if fw_nativo < 1500:
        print(f"[aviso] la cara mide {fw_nativo:.0f}px en la foto original; con resolución "
              "completa (~2000px) los conteos serán más confiables.")
    fotos = {"blanca": ref}
    for k in ["polarizada", "uv", "wood"]:
        p = getattr(a, k)
        if p:
            im = align(cv2.imread(p), ref_lm, ref.shape)
            if im is None:
                print(f"[aviso] no se detectó cara en '{k}', se omite")
            else:
                fotos[k] = im

    polys, zmasks = zonas(ref_lm, ref.shape)
    Z = np.zeros(ref.shape[:2], bool)
    for m in zmasks.values():
        Z |= m

    reporte, capas = {}, []

    def guardar(key, img):
        cv2.imwrite(os.path.join(a.out, f"{key}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        capas.append(key)

    # --- Capas filtro
    nombres = {"rojez": "Rojez", "wood": "Wood", "uv": "UV", "acne": "Acne", "pigmento": "Pigmento"}
    # fondo atenuado (fuera de la cara) como en el fabricante
    ov = v1.poly_mask(ref.shape, ref_lm[v1.FACE_OVAL]).astype(np.float32) / 255
    ov = cv2.GaussianBlur(cv2.dilate(ov, np.ones((41, 41), np.uint8)), (0, 0), 25)[..., None]
    for key, r in RECETAS.items():
        if r["source"] in fotos:
            f = aplicar_receta(r, fotos[r["source"]]).astype(np.float32)
            f = f * (ov + (1 - ov) * .3)
            guardar(key, rotulo(f.astype(np.uint8), nombres[key]))

    # --- Poros
    img, blobs = capa_poros(ref, polys, Z, zmasks)
    por_zona = {z: sum(1 for x, y, _ in blobs if m[int(y), int(x)]) for z, m in zmasks.items()}
    reporte["poros"] = {"conteo": len(blobs), "por_zona": por_zona}
    guardar("poros", rotulo(img, "Poros: candidatos", f"{len(blobs)} marcas por revisar"))

    # --- Textura
    img, rug = capa_textura(ref, polys, Z)
    reporte["textura"] = {"rugosidad": round(rug, 3)}
    guardar("textura", rotulo(img, "Textura"))

    # --- Detecciones propias (v1)
    if not a.sin_extras:
        skin_full, skin, zonas_v1, fw = v1.build_masks(ref.shape, ref_lm, ref)
        pol = fotos.get("polarizada", ref)
        m, bl = v1.det_manchas(pol, skin, fw)
        guardar("manchas", rotulo(v1.render_mask(pol, m, (30, 90, 160), outline=True),
                                  "Contraste pigmentado", f"{len(bl)} regiones por revisar"))
        reporte["manchas"] = {"conteo": len(bl)}
        m, bl = v1.det_acne(pol, skin, fw)
        guardar("lesiones", rotulo(v1.render_circles(pol, bl, (60, 60, 255), fw),
                                   "Puntos rojos", f"{len(bl)} candidatos por revisar"))
        reporte["lesiones_inflamadas"] = {"conteo": len(bl)}
        inten, _ = v1.det_rojez(pol, skin, fw)
        guardar("zonas_rojas", rotulo(v1.render_heat(pol, inten, (40, 40, 230)), "Zonas rojas"))
        reporte["zonas_rojas"] = {"porcentaje": round(100 * float((inten > 0).sum()) / (skin > 0).sum(), 2)}
        if "wood" in fotos:
            m, bl = v1.det_porfirinas(fotos["wood"], skin, fw)
            guardar("porfirinas", rotulo(v1.render_dots(fotos["wood"], bl, (0, 140, 255)),
                                         "Porfirinas", f"{len(bl)} puntos"))
            reporte["porfirinas"] = {"conteo": len(bl)}
        if "uv" in fotos:
            m, bl = v1.det_manchas_uv(fotos["uv"], skin, fw)
            guardar("manchas_uv", rotulo(v1.render_mask(fotos["uv"], m, (255, 80, 200), outline=True),
                                         "Manchas UV", f"{len(bl)} manchas"))
            reporte["manchas_uv"] = {"conteo": len(bl)}
        inten, _ = v1.det_brillo(ref, fotos.get("polarizada"), skin, fw)
        guardar("brillo", rotulo(v1.render_heat(ref, inten, (0, 230, 255)), "Brillo / grasa"))

    json.dump(reporte, open(os.path.join(a.out, "reporte.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    # Lámina
    tiles = [cv2.resize(cv2.imread(os.path.join(a.out, f"{k}.jpg")), (408, 544)) for k in capas]
    while len(tiles) % 4:
        tiles.append(np.full_like(tiles[0], 25))
    cv2.imwrite(os.path.join(a.out, "lamina.jpg"),
                np.vstack([np.hstack(tiles[i:i + 4]) for i in range(0, len(tiles), 4)]),
                [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(json.dumps(reporte, ensure_ascii=False))


if __name__ == "__main__":
    main()
