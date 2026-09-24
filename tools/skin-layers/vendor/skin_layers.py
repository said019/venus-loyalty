#!/usr/bin/env python3
"""
skin_layers.py — Genera los mapeos faciales (capas) a partir de las fotos
multiespectrales de un analizador de piel tipo "ZM / Meicet".

Entrada: las fotos que toma el aparato en cada modo de luz.
Salida:  una imagen por capa (overlay de colores sobre la cara),
         un JSON con conteos y puntajes por zona, y una lámina resumen.

Uso:
  python skin_layers.py \
      --blanca      foto_luz_blanca.png \
      --polarizada  foto_polarizada_cruzada.png \
      --paralela    foto_polarizada_paralela.png \
      --uv          foto_uv.png \
      --wood        foto_wood.png \
      --azul        foto_luz_azul.png \
      --out         resultados/

Solo --blanca es obligatoria; cada capa se genera si existe la foto que necesita.
Requiere: mediapipe==0.10.14, opencv-python-headless, numpy, scikit-image
"""
import argparse, json, os
import cv2
import numpy as np
import mediapipe as mp
from skimage.filters import frangi

# ----------------------------------------------------------------------------
# Landmarks de MediaPipe Face Mesh (índices estándar)
# ----------------------------------------------------------------------------
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
             379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
             234, 127, 162, 21, 54, 103, 67, 109]
EYE_L = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
EYE_R = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
BROW_L = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
BROW_R = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]
LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0,
        37, 39, 40, 185]
NOSTRILS = [48, 64, 98, 97, 2, 326, 327, 294, 278, 219, 439]
NOSE = [168, 193, 417, 245, 465, 188, 412, 114, 343, 129, 358, 98, 327, 2]

ZONE_NAMES = {"frente": "Frente", "nariz": "Nariz", "mejilla_izq": "Mejilla izq.",
              "mejilla_der": "Mejilla der.", "menton": "Mentón y boca"}

_mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=True, refine_landmarks=True,
                                        max_num_faces=1, min_detection_confidence=0.3)


def landmarks(img):
    r = _mesh.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    if not r.multi_face_landmarks:
        return None
    h, w = img.shape[:2]
    return np.array([[p.x * w, p.y * h] for p in r.multi_face_landmarks[0].landmark],
                    dtype=np.float32)


def align_to(img, ref_lm):
    """Alinea una foto a la de referencia usando los landmarks (similaridad)."""
    lm = landmarks(img)
    if lm is None:
        return img, False
    M, _ = cv2.estimateAffinePartial2D(lm, ref_lm, method=cv2.LMEDS)
    if M is None:
        return img, False
    h, w = img.shape[:2]
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_REFLECT), True


# ----------------------------------------------------------------------------
# Máscaras
# ----------------------------------------------------------------------------
def poly_mask(shape, pts, hull=False):
    m = np.zeros(shape[:2], np.uint8)
    p = pts.astype(np.int32)
    if hull:
        p = cv2.convexHull(p)
    cv2.fillPoly(m, [p], 255)
    return m


def dilate(m, r):
    r = max(1, int(r))
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return cv2.dilate(m, k)


def build_masks(shape, lm, img=None):
    fw = float(np.linalg.norm(lm[234] - lm[454]))  # ancho de cara en px
    # El óvalo de MediaPipe corta la frente muy abajo: se extiende hacia arriba
    ov = lm[FACE_OVAL].copy()
    y_bridge, y_top = lm[168][1], ov[:, 1].min()
    up = ov[:, 1] < y_bridge
    ov[up, 1] -= fw * .13 * (y_bridge - ov[up, 1]) / (y_bridge - y_top + 1e-6)
    oval = poly_mask(shape, ov)
    oval = cv2.erode(oval, cv2.getStructuringElement(cv2.MORPH_ELLIPSE,
                                                     (int(fw * .03) | 1,) * 2))
    excl = np.zeros(shape[:2], np.uint8)
    for idx, r in [(EYE_L, .045), (EYE_R, .045), (BROW_L, .025), (BROW_R, .025),
                   (LIPS, .03), (NOSTRILS, .012)]:
        excl |= dilate(poly_mask(shape, lm[idx], hull=True), fw * r)
    skin = cv2.bitwise_and(oval, cv2.bitwise_not(excl))
    if img is not None:  # quita pelo, diadema y fondo por color (la piel tiene croma)
        L, A, B = lab_f(img)
        medL = np.median(L[skin > 0])
        ok = (L > medL * .55) & (L < medL * 1.6) & ((A - 128) + (B - 128) > 2)
        ok = cv2.morphologyEx(ok.astype(np.uint8) * 255, cv2.MORPH_CLOSE,
                              cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
        ok = cv2.morphologyEx(ok, cv2.MORPH_OPEN,
                              cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
        skin = cv2.bitwise_and(skin, ok)
    # "core": piel lejos del contorno (las sombras del borde dan falsos positivos)
    dist = cv2.distanceTransform(oval, cv2.DIST_L2, 5)
    core = cv2.bitwise_and(skin, ((dist > fw * .06) * 255).astype(np.uint8))

    h, w = shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    brow_top = min(lm[BROW_L][:, 1].min(), lm[BROW_R][:, 1].min())
    eye_bot = max(lm[EYE_L][:, 1].max(), lm[EYE_R][:, 1].max())
    nose_base = lm[2][1]
    mx_l, mx_r = lm[61][0] - fw * .06, lm[291][0] + fw * .06

    nose = poly_mask(shape, lm[NOSE], hull=True) > 0
    s = skin > 0
    zones = {
        "frente": s & ((yy < brow_top) | ((yy < eye_bot - fw * .05) &
                                         (xx > lm[107][0]) & (xx < lm[336][0]))) & ~nose,
        "nariz": s & nose,
        "menton": s & (yy > nose_base) & (xx > mx_l) & (xx < mx_r) & ~nose,
    }
    rest = s & (yy > eye_bot - fw * .02) & ~zones["nariz"] & ~zones["menton"]
    cx = lm[1][0]
    # "izq." = izquierda de la clienta (derecha de la imagen)
    zones["mejilla_izq"] = rest & (xx > cx)
    zones["mejilla_der"] = rest & (xx < cx)
    return skin, core, zones, fw


# ----------------------------------------------------------------------------
# Utilidades de imagen
# ----------------------------------------------------------------------------
def local_base(ch, mask, sigma):
    """Promedio local ponderado solo con piel (evita bordes con fondo/ojos)."""
    m = (mask > 0).astype(np.float32)
    num = cv2.GaussianBlur(ch * m, (0, 0), sigma)
    den = cv2.GaussianBlur(m, (0, 0), sigma) + 1e-6
    return num / den


def robust_thr(vals, k):
    med = np.median(vals)
    mad = np.median(np.abs(vals - med)) * 1.4826 + 1e-6
    return med + k * mad


def components(binary, min_area, max_area=None, min_circ=0.0):
    n, lab, stats, cent = cv2.connectedComponentsWithStats(binary.astype(np.uint8), 8)
    keep = np.zeros_like(binary, dtype=bool)
    blobs = []
    for i in range(1, n):
        a = stats[i, cv2.CC_STAT_AREA]
        if a < min_area or (max_area and a > max_area):
            continue
        comp = lab == i
        if min_circ > 0:
            cnts, _ = cv2.findContours(comp.astype(np.uint8), cv2.RETR_EXTERNAL,
                                       cv2.CHAIN_APPROX_NONE)
            per = cv2.arcLength(cnts[0], True) + 1e-6
            if 4 * np.pi * a / per ** 2 < min_circ:
                continue
        keep |= comp
        blobs.append((float(cent[i][0]), float(cent[i][1]), int(a)))
    return keep, blobs


def lab_f(img):
    return [c.astype(np.float32) for c in cv2.split(cv2.cvtColor(img, cv2.COLOR_BGR2LAB))]


# ----------------------------------------------------------------------------
# Detectores (una función por capa). Devuelven (mapa_bool o float, blobs)
# ----------------------------------------------------------------------------
def det_rojez(img, skin, fw):
    """Zonas rojas / sensibilidad: exceso de a* sobre la piel (luz polarizada)."""
    L, A, B = lab_f(img)
    A = cv2.GaussianBlur(A, (0, 0), fw * .006)
    thr = robust_thr(A[skin > 0], 1.6)
    inten = np.clip((A - thr) / 12.0, 0, 1) * (skin > 0)
    m = inten > 0
    m, _ = components(m, (fw * .008) ** 2)
    return inten * m, []


def det_acne(img, skin, fw):
    """Granitos/inflamación: puntos rojos compactos respecto a su entorno."""
    L, A, B = lab_f(img)
    dA = A - local_base(A, skin, fw * .03)
    dA = cv2.GaussianBlur(dA, (0, 0), 1.2)
    m = (dA > max(4.0, robust_thr(dA[skin > 0], 3.5))) & (skin > 0)
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN,
                         cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))) > 0
    return components(m, np.pi * (fw * .004) ** 2, np.pi * (fw * .035) ** 2, min_circ=.35)


def det_manchas(img, skin, fw):
    """Manchas pigmentadas (café): más oscuras que su entorno y no rojas."""
    L, A, B = lab_f(img)
    dL = local_base(L, skin, fw * .03) - L
    dA = A - local_base(A, skin, fw * .03)
    dL = cv2.GaussianBlur(dL, (0, 0), 1.0)
    thr = max(5.0, robust_thr(dL[skin > 0], 3.0))
    m = (dL > thr) & (dA < 5.0) & (skin > 0)
    return components(m, np.pi * (fw * .003) ** 2, np.pi * (fw * .03) ** 2, min_circ=.3)


def det_poros(img, skin, fw):
    """Poros: puntos oscuros pequeños (black-hat) en luz blanca/paralela."""
    g = img[:, :, 1]
    k = int(fw * .014) | 1
    bh = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT,
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))).astype(np.float32)
    bh = cv2.GaussianBlur(bh, (0, 0), .8)
    thr = np.percentile(bh[skin > 0], 94)
    m = (bh > thr) & (skin > 0)
    return components(m, 2, np.pi * (fw * .006) ** 2, min_circ=.3)


def det_arrugas(img, skin, fw):
    """Líneas y arrugas: crestas oscuras alargadas (filtro de Frangi)."""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.
    g = cv2.createCLAHE(2.0, (8, 8)).apply((g * 255).astype(np.uint8)).astype(np.float32) / 255.
    s = fw / 700.
    fr = frangi(g, sigmas=[1.5 * s, 2.5 * s, 3.5 * s], black_ridges=True)
    fr[skin == 0] = 0
    thr = np.percentile(fr[skin > 0], 97)
    m = fr > thr
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
    keep = np.zeros_like(m)
    lines = []
    for i in range(1, n):
        w_, h_ = stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
        length = max(w_, h_)
        a = stats[i, cv2.CC_STAT_AREA]
        if length > fw * .045 and a / (w_ * h_ + 1e-6) < .45:
            keep |= lab == i
            lines.append((int(stats[i, 0] + w_ / 2), int(stats[i, 1] + h_ / 2), int(length)))
    return keep, lines


def det_textura(img, skin, fw):
    """Textura/rugosidad: variación local de la piel tras quitar el tono."""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    hp = g - cv2.GaussianBlur(g, (0, 0), fw * .01)
    var = np.sqrt(local_base(hp ** 2, skin, fw * .02))
    lo, hi = np.percentile(var[skin > 0], [20, 98])
    return np.clip((var - lo) / (hi - lo + 1e-6), 0, 1) * (skin > 0), []


def det_brillo(img_std, img_pol, skin, fw):
    """Brillo/grasa: el reflejo especular es más claro y menos saturado que la piel
    de alrededor. Se mide en luz blanca y se resta lo que queda en la polarizada
    cruzada (que elimina el reflejo), así solo queda la grasa/brillo real."""
    def spec(img):
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
        S, V = hsv[..., 1], hsv[..., 2]
        dv = V - local_base(V, skin, fw * .04)
        ds = (local_base(S, skin, fw * .04) - S) / (local_base(S, skin, fw * .04) + 1)
        return np.clip(dv, 0, None) * np.clip(ds, 0, None)
    d = spec(img_std)
    if img_pol is not None:
        d = d - spec(img_pol)
    d = cv2.GaussianBlur(d, (0, 0), fw * .005)
    thr = max(1.0, np.percentile(d[skin > 0], 93))
    return np.clip((d - thr) / (thr * 2), 0, 1) * (skin > 0), []


def det_porfirinas(img, skin, fw):
    """Porfirinas (bacteria del acné): puntitos rosa-naranja fluorescentes en UV.
    Los puntos azules brillantes (pelusa/fibras) se descartan."""
    b, g, r = [c.astype(np.float32) for c in cv2.split(img)]
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    th = lambda x: cv2.morphologyEx(x, cv2.MORPH_TOPHAT, k)
    tr, tg, tb = th(r), th(g), th(b)
    thr = max(7.0, np.percentile(tr[skin > 0], 98))
    m = (tr > thr) & (tr > tb * 1.2) & (tr > tg * .9) & (skin > 0)
    return components(m, 1, np.pi * (fw * .006) ** 2)


def det_manchas_uv(img, skin, fw):
    """Manchas UV (pigmento profundo aún no visible): zonas oscuras bajo UV."""
    L = lab_f(img)[0]
    dL = local_base(L, skin, fw * .035) - L
    dL = cv2.GaussianBlur(dL, (0, 0), 1.2)
    thr = max(4.0, robust_thr(dL[skin > 0], 3.0))
    m = (dL > thr) & (skin > 0)
    return components(m, np.pi * (fw * .004) ** 2, np.pi * (fw * .04) ** 2, min_circ=.3)


# ----------------------------------------------------------------------------
# Render tipo "app": base atenuada + marcas de color
# ----------------------------------------------------------------------------
def base_img(img):
    g = cv2.cvtColor(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    return cv2.addWeighted(img, .45, g, .55, 0)


def render_heat(img, inten, color, alpha=.75):
    out = base_img(img).astype(np.float32)
    a = (inten * alpha)[..., None]
    out = out * (1 - a) + np.array(color, np.float32) * a
    return out.astype(np.uint8)


def render_mask(img, m, color, outline=False, alpha=.85):
    out = base_img(img)
    if outline:
        cnts, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        cv2.drawContours(out, cnts, -1, color, 2, cv2.LINE_AA)
    else:
        m2 = dilate(m.astype(np.uint8) * 255, 1) > 0
        out[m2] = (out[m2] * (1 - alpha) + np.array(color) * alpha).astype(np.uint8)
    return out


def render_dots(img, blobs, color):
    out = base_img(img)
    for x, y, a in blobs:
        cv2.circle(out, (int(x), int(y)), 3, color, -1, cv2.LINE_AA)
    return out


def render_circles(img, blobs, color, fw):
    out = base_img(img)
    for x, y, a in blobs:
        r = max(int(np.sqrt(a / np.pi) * 1.8), int(fw * .01))
        cv2.circle(out, (int(x), int(y)), r, color, 2, cv2.LINE_AA)
    return out


def label(img, title, score, extra=""):
    out = img.copy()
    h, w = out.shape[:2]
    cv2.rectangle(out, (0, 0), (w, 70), (25, 25, 25), -1)
    cv2.putText(out, title, (18, 32), cv2.FONT_HERSHEY_SIMPLEX, .9, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(out, f"Puntaje {score}/100  {extra}", (18, 60), cv2.FONT_HERSHEY_SIMPLEX, .6,
                (200, 200, 200), 1, cv2.LINE_AA)
    return out


# ----------------------------------------------------------------------------
# Puntajes (referencia, NO calibrados clínicamente)
# ----------------------------------------------------------------------------
def score_from(frac, k):
    """frac = fracción de piel afectada (0-1). k = sensibilidad de la capa."""
    return int(round(100 * np.exp(-k * frac)))


def zone_stats(mapa, blobs, zones):
    res = {}
    m = mapa > 0 if mapa.dtype != bool else mapa
    for z, zm in zones.items():
        area = zm.sum()
        if area == 0:
            continue
        n = sum(1 for x, y, _ in blobs if zm[int(y), int(x)]) if blobs else None
        res[ZONE_NAMES[z]] = {"porcentaje_afectado": round(100 * float((m & zm).sum()) / area, 2),
                              **({"conteo": n} if n is not None else {})}
    return res


# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    for k in ["blanca", "polarizada", "paralela", "uv", "wood", "azul"]:
        ap.add_argument(f"--{k}")
    ap.add_argument("--out", default="resultados")
    a = ap.parse_args()
    if not a.blanca:
        ap.error("--blanca es obligatoria (se usa como referencia de alineación)")
    os.makedirs(a.out, exist_ok=True)

    ref = cv2.imread(a.blanca)
    ref_lm = landmarks(ref)
    if ref_lm is None:
        raise SystemExit("No se detectó la cara en la foto de luz blanca.")
    skin_full, skin, zones, fw = build_masks(ref.shape, ref_lm, ref)
    zones = {z: zm & (skin > 0) for z, zm in zones.items()}

    fotos = {"blanca": ref}
    for k in ["polarizada", "paralela", "uv", "wood", "azul"]:
        p = getattr(a, k)
        if p:
            im = cv2.imread(p)
            im, ok = align_to(im, ref_lm)
            if not ok:
                print(f"[aviso] no se pudo alinear '{k}', se usa tal cual")
            fotos[k] = im

    pol = fotos.get("polarizada", ref)
    par = fotos.get("paralela", ref)
    uvimg = fotos.get("wood") if "wood" in fotos else fotos.get("uv")

    capas, reporte = [], {}

    def add(key, titulo, img_render, frac, k, zdata, extra="", conteo=None):
        sc = score_from(frac, k)
        cv2.imwrite(os.path.join(a.out, f"{key}.png"), label(img_render, titulo, sc, extra))
        capas.append((key, titulo))
        reporte[key] = {"titulo": titulo, "puntaje": sc,
                        "porcentaje_afectado": round(100 * frac, 2),
                        **({"conteo": conteo} if conteo is not None else {}),
                        "por_zona": zdata}

    sk = skin > 0
    npx = sk.sum()

    inten, _ = det_rojez(pol, skin, fw)
    add("zonas_rojas", "Zonas rojas / sensibilidad", render_heat(pol, inten, (40, 40, 230)),
        (inten > 0).sum() / npx, 6, zone_stats(inten > 0, [], zones))

    m, blobs = det_acne(pol, skin, fw)
    add("acne", "Acne / inflamacion", render_circles(pol, blobs, (60, 60, 255), fw),
        m.sum() / npx, 40, zone_stats(m, blobs, zones), f"{len(blobs)} lesiones", len(blobs))

    m, blobs = det_manchas(pol, skin, fw)
    add("manchas", "Manchas pigmentadas", render_mask(pol, m, (30, 90, 160), outline=True),
        m.sum() / npx, 25, zone_stats(m, blobs, zones), f"{len(blobs)} manchas", len(blobs))

    m, blobs = det_poros(par, skin, fw)
    add("poros", "Poros", render_mask(par, m, (255, 200, 0)),
        m.sum() / npx, 18, zone_stats(m, blobs, zones), f"{len(blobs)} poros", len(blobs))

    m, lines = det_arrugas(par, skin, fw)
    add("arrugas", "Lineas y arrugas", render_mask(par, m, (0, 200, 255)),
        m.sum() / npx, 60, zone_stats(m, lines, zones), f"{len(lines)} lineas", len(lines))

    inten, _ = det_textura(par, skin, fw)
    add("textura", "Textura", render_heat(par, inten, (200, 120, 255), .6),
        float(inten[sk].mean()), 2.2, zone_stats(inten > .5, [], zones))

    inten, _ = det_brillo(ref, fotos.get("polarizada"), skin, fw)
    add("brillo", "Brillo / grasa", render_heat(ref, inten, (0, 230, 255)),
        (inten > 0).sum() / npx, 8, zone_stats(inten > 0, [], zones))

    if uvimg is not None:
        src = fotos.get("uv", uvimg)
        m, blobs = det_porfirinas(uvimg, skin, fw)
        if "uv" in fotos and "wood" in fotos:  # combina ambas tomas UV
            m2, b2 = det_porfirinas(fotos["uv"], skin, fw)
            m, blobs = m | m2, blobs + [b for b in b2 if not m[int(b[1]), int(b[0])]]
        add("porfirinas", "Porfirinas", render_dots(uvimg, blobs, (0, 140, 255)),
            len(blobs) / (npx / 1e4) / 100, 6, zone_stats(m, blobs, zones),
            f"{len(blobs)} puntos", len(blobs))

        m, blobs = det_manchas_uv(src, skin, fw)
        add("manchas_uv", "Manchas UV (profundas)", render_mask(src, m, (255, 80, 200), outline=True),
            m.sum() / npx, 25, zone_stats(m, blobs, zones), f"{len(blobs)} manchas", len(blobs))

    # Puntaje global = promedio
    reporte["_global"] = {"puntaje": int(round(np.mean([v["puntaje"] for v in reporte.values()])))}
    with open(os.path.join(a.out, "reporte.json"), "w", encoding="utf-8") as f:
        json.dump(reporte, f, ensure_ascii=False, indent=2)

    # Lámina resumen
    tiles = [cv2.resize(cv2.imread(os.path.join(a.out, f"{k}.png")), (445, 600)) for k, _ in capas]
    while len(tiles) % 3:
        tiles.append(np.full_like(tiles[0], 30))
    rows = [np.hstack(tiles[i:i + 3]) for i in range(0, len(tiles), 3)]
    cv2.imwrite(os.path.join(a.out, "lamina.jpg"), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 88])

    # Máscara de zonas (para depurar)
    dbg = base_img(ref)
    cols = [(0, 200, 255), (255, 120, 0), (0, 255, 120), (255, 0, 200), (80, 80, 255)]
    for (z, zm), c in zip(zones.items(), cols):
        dbg[zm] = (dbg[zm] * .5 + np.array(c) * .5).astype(np.uint8)
    cv2.imwrite(os.path.join(a.out, "_zonas.png"), dbg)

    print(json.dumps({k: v["puntaje"] for k, v in reporte.items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
