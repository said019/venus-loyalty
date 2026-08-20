// public/skin-analysis.js — Lógica standalone de Venus Skin
// Maneja dos vistas: scanner (default) y detalle (?view={analysisId})

(() => {
    'use strict';

    const $ = (id) => document.getElementById(id);

    const state = {
        mode: 'camera',
        selectedCard: null,     // { id, name, phone }
        manualMeta: null,       // { name, phone } si el admin crea cliente nuevo
        detectedShareId: null,
        scanner: null,
        cameraBusy: false,      // arranque de cámara en curso (evita doble toque)
        searchDebounce: null,
    };

    // ═══════════════════════════════════════════════════════════════
    // ROUTING: decidir vista según ?view=
    // ═══════════════════════════════════════════════════════════════
    const params = new URLSearchParams(location.search);
    const viewAnalysisId = params.get('view');
    const cardIdParam = params.get('cardId');

    if (viewAnalysisId) {
        document.addEventListener('DOMContentLoaded', () => loadDetail(viewAnalysisId));
    } else {
        document.addEventListener('DOMContentLoaded', () => initScanner(cardIdParam));
    }

    // ═══════════════════════════════════════════════════════════════
    // UTIL
    // ═══════════════════════════════════════════════════════════════
    function extractShareId(input) {
        if (!input) return null;
        const s = String(input).trim();
        if (/^[a-f0-9]{20,64}$/i.test(s)) return s;
        const m = s.match(/shareId=([a-f0-9]{20,64})/i);
        return m?.[1] ?? null;
    }

    function initials(name) {
        if (!name) return '··';
        return name
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map(w => w[0]?.toUpperCase() || '')
            .join('') || '··';
    }

    function feedback(type, msg) {
        const el = $('feedback');
        el.className = `feedback ${type}`;
        el.innerHTML = `<i class="fas fa-${type === 'ok' ? 'check-circle' : 'exclamation-triangle'}"></i><span>${msg}</span>`;
        el.style.display = 'flex';
    }

    function clearFeedback() {
        const el = $('feedback');
        el.style.display = 'none';
        el.className = 'feedback';
        el.innerHTML = '';
    }

    // Igual que feedback(), pero para la vista de detalle (no tiene el
    // panel #feedback del scanner) — un toast flotante con el mismo lenguaje visual.
    function feedbackDetail(type, msg) {
        const el = $('d-feedback');
        if (!el) { console[type === 'err' ? 'error' : 'log'](msg); return; }
        el.className = `feedback feedback-toast ${type}`;
        el.innerHTML = `<i class="fas fa-${type === 'ok' ? 'check-circle' : 'exclamation-triangle'}"></i><span>${msg}</span>`;
        el.style.display = 'flex';
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.style.display = 'none'; }, 5000);
    }

    // Ojo: todos los accesos al DOM aquí van con ?. a propósito. Si el
    // navegador tiene el HTML viejo en caché y el JS nuevo, estos ids pueden
    // no existir todavía; sin el ?. reventaba antes de mostrar el spinner y
    // se caía toda la acción (importar, cargar reporte, generar PDF).
    function showLoading(show, opts = {}) {
        if (show) {
            const t = $('loading-title');
            const s = $('loading-sub');
            if (t) t.textContent = opts.title || 'Descargando análisis';
            if (s) s.textContent = opts.sub || 'Obteniendo datos del aparato Yiyuan · Traduciendo métricas · Guardando en historial';
        }
        $('loading')?.classList.toggle('visible', show);
    }

    // ═══════════════════════════════════════════════════════════════
    // SCANNER VIEW
    // ═══════════════════════════════════════════════════════════════
    async function initScanner(preselectCardId) {
        bindCardSelector();
        bindModeTabs();
        bindCameraMode();
        bindUploadMode();
        bindUrlMode();
        bindConfirm();

        // La cámara arranca PRIMERO y sin await: antes quedaba esperando a que
        // terminara el fetch de la clienta, así que con internet lento del
        // estudio la cámara ni siquiera intentaba encender.
        startCamera();

        if (preselectCardId) {
            try {
                const res = await fetch(`/api/admin/cards-firebase?id=${encodeURIComponent(preselectCardId)}`, { credentials: 'include' });
                if (res.status === 401) { location.href = '/admin-login.html'; return; }
                const card = ((await res.json()).items || [])[0];
                if (card) selectCard(card);
                else feedback('err', 'No se encontró la clienta enlazada — búscala manualmente arriba');
            } catch { /* ignore */ }
        }
    }

    // ────── Card selector ──────
    function bindCardSelector() {
        const input = $('card-search');
        input.addEventListener('input', () => {
            clearTimeout(state.searchDebounce);
            const q = input.value.trim();
            if (q.length < 2) {
                $('search-results').innerHTML = '';
                return;
            }
            state.searchDebounce = setTimeout(() => searchCards(q), 220);
        });

        $('btn-clear-card').addEventListener('click', clearSelection);
        $('btn-new-client').addEventListener('click', () => {
            $('new-client-form').classList.toggle('visible');
            $('new-name').focus();
        });
        $('btn-create-client').addEventListener('click', createQuickClient);
    }

    async function searchCards(q) {
        try {
            const res = await fetch(`/api/admin/cards-firebase?q=${encodeURIComponent(q)}&limit=20`, {
                credentials: 'include'
            });
            if (res.status === 401) { location.href = '/admin-login.html'; return; }
            if (!res.ok) throw new Error(`http_${res.status}`);
            const json = await res.json();
            renderSearchResults(json.items || []);
        } catch {
            $('search-results').innerHTML = `<div style="padding:14px;color:var(--ink-3);font-size:13px;">
                No se pudo buscar — <button type="button" id="btn-retry-search" style="background:none;border:none;color:var(--accent-soft);text-decoration:underline;cursor:pointer;font:inherit;">reintentar</button>
            </div>`;
            $('btn-retry-search')?.addEventListener('click', () => searchCards(q));
        }
    }

    function renderSearchResults(items) {
        const box = $('search-results');
        if (items.length === 0) {
            box.innerHTML = `<div style="padding:14px;color:var(--ink-3);font-size:13px;">Sin coincidencias</div>`;
            return;
        }
        box.innerHTML = items.map(c => `
            <div class="search-result-item" data-id="${c.id}" data-name="${escapeHtml(c.name)}" data-phone="${c.phone || ''}">
                <div class="avatar-sm">${initials(c.name)}</div>
                <div>
                    <div class="result-name">${escapeHtml(c.name)}</div>
                    <div class="result-phone">${c.phone || 'sin teléfono'}</div>
                </div>
                <span class="result-chip">${c.stamps || 0} sellos</span>
            </div>
        `).join('');

        box.querySelectorAll('.search-result-item').forEach(el => {
            el.addEventListener('click', () => {
                selectCard({
                    id: el.dataset.id,
                    name: el.dataset.name,
                    phone: el.dataset.phone,
                });
            });
        });
    }

    function selectCard(card) {
        state.selectedCard = card;
        state.manualMeta = null;
        $('sel-avatar').textContent = initials(card.name);
        $('sel-name').textContent = card.name;
        $('sel-phone').textContent = card.phone || '—';
        $('selected-card').classList.add('visible');
        $('card-selector').classList.add('has-selection');
        $('card-search').value = '';
        $('search-results').innerHTML = '';
        $('new-client-form').classList.remove('visible');
        // Si ya había un reporte escaneado esperando confirmación, regresa a
        // ese paso mostrando ahora a quién se le va a importar.
        if (state.detectedShareId) showConfirmArea(state.detectedShareId);
    }

    function clearSelection() {
        state.selectedCard = null;
        state.manualMeta = null;
        $('selected-card').classList.remove('visible');
        $('card-selector').classList.remove('has-selection');
        // Sin esto, el panel de confirmar seguía diciendo "Importando para
        // Fulanita" después de quitar a la clienta seleccionada.
        if (state.detectedShareId) showConfirmArea(state.detectedShareId);
    }

    async function createQuickClient() {
        const name = $('new-name').value.trim();
        const phone = $('new-phone').value.trim().replace(/\D/g, '');

        if (!name || phone.length < 10) {
            feedback('err', 'Nombre y teléfono (10 dígitos) son obligatorios');
            (!name ? $('new-name') : $('new-phone')).focus();
            return;
        }

        // Intenta crear via /api/issue (endpoint admin oficial). Si falla,
        // cae a modo manual (el backend de skin-analysis soporta clientName+clientPhone sin Card).
        showLoading(true, { title: 'Creando tarjeta', sub: 'Guardando nombre y teléfono en el sistema…' });
        let created = null;
        try {
            const res = await fetch('/api/issue', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone, max: 8 }),
            });
            if (res.ok) {
                const json = await res.json();
                if (json.cardId) {
                    created = { id: json.cardId, name, phone };
                }
            }
        } catch { /* ignore, fallback below */ }

        if (created) {
            selectCard(created);
            $('new-name').value = '';
            $('new-phone').value = '';
        } else {
            // Análisis sin tarjeta (soportado por /api/skin-analysis/import)
            state.manualMeta = { name, phone };
            state.selectedCard = null;
            $('sel-avatar').textContent = initials(name);
            $('sel-name').textContent = name;
            $('sel-phone').textContent = phone + ' · sin tarjeta';
            $('selected-card').classList.add('visible');
            $('card-selector').classList.add('has-selection');
            $('new-client-form').classList.remove('visible');
            $('new-name').value = '';
            $('new-phone').value = '';
            if (state.detectedShareId) showConfirmArea(state.detectedShareId);
        }
        showLoading(false);
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // ────── Mode tabs ──────
    function bindModeTabs() {
        document.querySelectorAll('.mode-tab').forEach(btn => {
            btn.addEventListener('click', () => switchMode(btn.dataset.mode));
        });
    }

    async function switchMode(mode) {
        if (mode === state.mode) {
            // Volver a tocar la pestaña que ya está activa era un no-op. Es
            // justo lo que hace cualquiera cuando ve la cámara en negro, así
            // que ahora reintenta encenderla.
            if (mode === 'camera' && !state.detectedShareId && state.scanner?.getState?.() !== 2) {
                await startCamera();
            }
            return;
        }
        state.mode = mode;

        document.querySelectorAll('.mode-tab').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === mode);
        });
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        $(`panel-${mode}`).classList.add('active');
        clearFeedback();

        // Ya hay un reporte esperando confirmación — no reactives la cámara y
        // arriesgues pisar ese shareId con un segundo escaneo accidental.
        if (mode === 'camera' && !state.detectedShareId) {
            await startCamera();
        } else {
            await stopCamera();
        }
    }

    // ────── Camera ──────
    const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Navegador embebido dentro de otra app (WhatsApp, Instagram, Facebook).
    // En iOS estos WKWebView suelen tragarse el permiso de cámara sin avisar.
    const IS_IN_APP_BROWSER = /FBAN|FBAV|Instagram|Line|WhatsApp|WeChat/i.test(navigator.userAgent);

    // Instrucciones REALES por plataforma. iOS Safari no tiene el candado 🔒
    // junto a la URL — ese menú es de Chrome/Android, y mandaba a la gente
    // a buscar algo que no existe en su iPhone.
    const PERMISO_BLOQUEADO = IS_IOS
        ? 'Safari tiene bloqueada la cámara para este sitio. Toca "aA" en la barra de direcciones → Ajustes del sitio web → Cámara → Permitir, y vuelve a intentar.'
        : 'El navegador bloqueó el acceso a la cámara. Toca el candado 🔒 junto a la dirección → Permisos → Cámara → Permitir, y vuelve a intentar.';

    const CAMERA_ERROR_COPY = {
        NotAllowedError: PERMISO_BLOQUEADO,
        NotFoundError: 'No se detectó ninguna cámara en este dispositivo.',
        NotReadableError: 'Otra app está usando la cámara ahora mismo. Ciérrala e intenta de nuevo.',
        OverconstrainedError: 'No se encontró una cámara compatible en este dispositivo.',
        AbortError: 'La cámara se interrumpió. Intenta de nuevo.',
        SecurityError: 'Esta página necesita abrirse con https:// para usar la cámara.',
    };

    // html5-qrcode NO rechaza con un Error: manda un texto plano tipo
    // "Error getting userMedia, error = NotAllowedError: ...". Por eso buscar
    // err.name nunca funcionaba y todos estos mensajes en español eran
    // inalcanzables. Aquí buscamos el nombre dentro del texto completo.
    function cameraErrorMessage(err) {
        const texto = [err?.name, err?.message, String(err ?? '')].filter(Boolean).join(' ');
        for (const [nombre, mensaje] of Object.entries(CAMERA_ERROR_COPY)) {
            if (texto.includes(nombre)) return mensaje;
        }
        if (!navigator.mediaDevices) {
            return IS_IN_APP_BROWSER
                ? 'Este navegador no permite usar la cámara. Abre la página en Safari: toca "..." o el botón de compartir → Abrir en Safari.'
                : 'Este navegador no permite usar la cámara. Prueba con Safari o Chrome.';
        }
        return `No se pudo iniciar la cámara: ${err?.message || err}`;
    }

    function showCameraError(msg) {
        const overlay = $('camera-overlay');
        const msgEl = $('camera-overlay-msg');
        if (msgEl) msgEl.textContent = msg;
        // El error se pinta ENCIMA del recuadro negro. Antes salía en un panel
        // ~400px más abajo, fuera de pantalla: el staff solo veía la caja negra.
        if (overlay) overlay.classList.add('visible');
        else feedback('err', msg); // HTML viejo en caché: al menos que salga algo
    }

    function hideCameraError() {
        $('camera-overlay')?.classList.remove('visible');
    }

    async function startCamera() {
        if (state.cameraBusy) return;          // evita doble arranque por doble toque
        if (state.scanner?.getState?.() === 2) return; // ya está escaneando

        state.cameraBusy = true;
        const btn = $('btn-retry-camera');
        if (btn) btn.disabled = true;

        try {
            if (!window.Html5Qrcode) {
                showCameraError('No se pudo cargar el lector de códigos QR. Revisa tu conexión y vuelve a intentar.');
                return;
            }
            const scanner = new Html5Qrcode('qr-camera-region', { verbose: false });
            await scanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 240, height: 240 } },
                (decoded) => handleDecoded(decoded),
                () => { /* per-frame errors: ignore */ }
            );
            // Solo se guarda si de verdad arrancó: antes se guardaba antes del
            // await y una instancia muerta bloqueaba los siguientes intentos.
            state.scanner = scanner;
            hideCameraError();
        } catch (err) {
            console.error('[camera] no arrancó:', err);
            state.scanner = null;
            showCameraError(cameraErrorMessage(err));
        } finally {
            state.cameraBusy = false;
            if (btn) btn.disabled = false;
        }
    }

    async function stopCamera() {
        const s = state.scanner;
        if (!s) return;
        state.scanner = null; // se libera primero para que un start() paralelo no lo pise
        try {
            // getState(): 1 = NOT_STARTED. Antes solo paraba en estado 2
            // (SCANNING), así que en pausa nunca se llamaba stop() y la
            // cámara del teléfono se quedaba encendida hasta recargar.
            if (s.getState?.() !== 1) await s.stop();
            s.clear?.();
        } catch { /* ignore */ }
    }

    function bindCameraMode() {
        $('btn-retry-camera')?.addEventListener('click', startCamera);
    }

    // ────── Upload ──────
    function bindUploadMode() {
        $('qr-file-input').addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            await decodeFromFile(file);
            e.target.value = '';
        });
    }

    // Una sola instancia reutilizable: antes se creaba una nueva por cada foto
    // y la librería nunca liberaba la imagen anterior de memoria.
    let fileScanner = null;

    async function decodeFromFile(file) {
        clearFeedback();
        if (!window.Html5Qrcode) {
            feedback('err', 'No se pudo cargar el lector de códigos QR. Revisa tu conexión y vuelve a intentar.');
            return;
        }
        const label = document.querySelector('label.upload-area');
        const textEl = label?.querySelector('span');
        const original = textEl?.textContent;
        label?.classList.add('busy');
        if (textEl) textEl.textContent = 'Leyendo QR…';

        let decoded = null;
        try {
            if (!fileScanner) fileScanner = new Html5Qrcode('qr-file-reader-temp', { verbose: false });
            decoded = await fileScanner.scanFile(file, false);
        } catch {
            feedback('err', 'No se detectó un QR en la imagen. Acércate más al código y evita reflejos en la pantalla del aparato.');
        } finally {
            label?.classList.remove('busy');
            if (textEl && original) textEl.textContent = original;
        }

        // FUERA del try: si handleDecoded fallaba adentro, el error se reportaba
        // como "no se detectó un QR" aunque el QR se hubiera leído perfecto.
        if (decoded) handleDecoded(decoded);
    }

    // ────── Manual URL ──────
    function bindUrlMode() {
        $('btn-validate-url').addEventListener('click', () => {
            const url = $('manual-url').value.trim();
            if (!url) return;
            handleDecoded(url);
        });
        $('manual-url').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                $('btn-validate-url').click();
            }
        });
    }

    // ────── Decoded ──────
    function handleDecoded(decoded) {
        // La cámara sigue leyendo ~10 veces por segundo hasta que stop()
        // termina. Sin este candado, si el lente se movía a otro QR en ese
        // instante, se cambiaba el reporte detectado sin que nadie lo notara.
        if (state.detectedShareId) return;

        const shareId = extractShareId(decoded);
        if (!shareId) {
            feedback('err', 'El código no es de un reporte Yiyuan válido');
            return;
        }
        state.detectedShareId = shareId;
        try { state.scanner?.pause?.(true); } catch { /* ignore */ }
        stopCamera();
        feedback('ok', `Reporte detectado — ${shareId.slice(0, 12)}…`);
        showConfirmArea(shareId);
    }

    function showConfirmArea(shareId) {
        const idEl = $('confirm-share-id');
        if (idEl) idEl.textContent = shareId;
        const name = state.selectedCard?.name || state.manualMeta?.name;
        $('confirm-client-line')?.classList.toggle('visible', !!name);
        const nameEl = $('confirm-client-name');
        if (name && nameEl) nameEl.textContent = name;
        const area = $('confirm-area');
        if (!area) return;
        area.classList.add('visible');
        area.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    function bindConfirm() {
        $('btn-cancel-import').addEventListener('click', () => {
            state.detectedShareId = null;
            $('confirm-area').classList.remove('visible');
            clearFeedback();
            if (state.mode === 'camera') startCamera();
        });
        $('btn-confirm-import').addEventListener('click', confirmImport);
    }

    async function confirmImport() {
        if (!state.detectedShareId) return;

        if (!state.selectedCard && !state.manualMeta) {
            feedback('err', 'Selecciona primero una clienta (arriba)');
            $('card-selector').scrollIntoView({ behavior: 'smooth' });
            $('card-search').focus();
            return;
        }

        const payload = {
            shareId: state.detectedShareId,
        };
        if (state.selectedCard) {
            payload.cardId = state.selectedCard.id;
        } else {
            payload.clientName = state.manualMeta.name;
            payload.clientPhone = state.manualMeta.phone;
        }

        showLoading(true);
        try {
            const res = await fetch('/api/skin-analysis/import', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();

            if (res.status === 401) {
                location.href = '/admin-login.html';
                return;
            }

            if (!res.ok || !json.success) {
                feedback('err', json.error || 'Error importando el análisis');
                return;
            }

            // Redirigir al detalle
            location.href = `/skin-analysis.html?view=${json.analysisId}`;
        } catch (err) {
            feedback('err', `Error de red: ${err.message}`);
        } finally {
            showLoading(false);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // DETAIL VIEW
    // ═══════════════════════════════════════════════════════════════
    const SEVERITY_LABELS = {
        excellent: 'Excelente',
        good: 'Bueno',
        moderate: 'Moderado',
        concern: 'Preocupante',
        critical: 'Crítico',
    };

    const SEVERITY_ORDER = { critical: 0, concern: 1, moderate: 2, good: 3, excellent: 4 };

    async function loadDetail(id) {
        $('view-scanner').classList.add('hidden');
        $('view-detail').classList.remove('hidden');
        showLoading(true, { title: 'Cargando reporte', sub: 'Obteniendo el análisis guardado…' });

        try {
            const res = await fetch(`/api/skin-analysis/${id}`, { credentials: 'include' });
            if (res.status === 401) {
                location.href = '/admin-login.html';
                return;
            }
            const json = await res.json();
            if (!res.ok || !json.success) {
                feedbackDetail('err', json.error || 'No se pudo cargar el análisis');
                return;
            }
            renderDetail(json.data);
        } catch (err) {
            feedbackDetail('err', `Error de red: ${err.message}`);
        } finally {
            showLoading(false);
        }
    }

    function renderDetail(a) {
        const cardName = a.card?.name || a.clientName || 'Sin nombre';
        const cardPhone = a.card?.phone || a.clientPhone || '—';

        $('d-avatar').textContent = initials(cardName);
        $('d-name').textContent = cardName;

        // Meta
        const analyzedAt = a.analyzedAt ? new Date(a.analyzedAt) : null;
        const fecha = analyzedAt ? analyzedAt.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
        $('d-meta').innerHTML = `
            <span><i class="fas fa-phone"></i> ${escapeHtml(cardPhone)}</span>
            <span><i class="fas fa-calendar-alt"></i> ${fecha}</span>
            ${a.ageReal ? `<span><i class="fas fa-user"></i> ${a.ageReal} años</span>` : ''}
            ${a.card ? `<a href="/admin.html" style="color:var(--accent-soft);text-decoration:none"><i class="fas fa-id-card"></i> Card vinculada</a>` : ''}
        `;

        // Summary grid
        $('d-summary').innerHTML = `
            <div class="summary-cell"><dt>Tipo de piel</dt><dd>${escapeHtml(a.skinType || '—')}</dd></div>
            <div class="summary-cell"><dt>Fototipo</dt><dd>${escapeHtml(a.skinColor || '—')}</dd></div>
            <div class="summary-cell"><dt>Rostro</dt><dd>${escapeHtml(a.faceShape || '—')}</dd></div>
            <div class="summary-cell"><dt>Edad biológica</dt><dd>${a.ageBiological ?? '—'}${a.ageBiological && a.ageReal ? ` <span style="font-size:12px;color:var(--ink-3)">(${a.ageBiological < a.ageReal ? '-' : '+'}${Math.abs(a.ageBiological - a.ageReal)})</span>` : ''}</dd></div>
        `;

        // ── AI narrative ──
        renderAINarrative(a);

        // Sort scores by severity then score asc
        const sorted = [...(a.scores || [])].sort((a, b) => {
            const so = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
            if (so !== 0) return so;
            return Number(a.score) - Number(b.score);
        });
        // Un escaneo sin métricas legibles NO es lo mismo que "piel saludable" —
        // hay que distinguirlos o un aparato/dato roto se ve idéntico a un A+.
        const hasMetrics = sorted.length > 0;
        $('d-score').textContent = hasMetrics ? Math.round(Number(a.overallScore ?? 0)) : '—';

        // Top concerns (critical + concern, top 3)
        const concerns = sorted.filter(s => s.severity === 'critical' || s.severity === 'concern').slice(0, 3);

        if (!hasMetrics) {
            $('d-concerns-sub').textContent = 'Datos incompletos';
            $('d-concerns').innerHTML = `
                <div class="concern-card" style="border-left-color:var(--sev-critical);">
                    <span class="concern-label" style="color:var(--sev-critical)">Datos incompletos</span>
                    <div class="concern-name">El aparato no devolvió métricas legibles</div>
                    <p style="font-size:13px;color:var(--ink-2);line-height:1.5;margin-top:10px;max-width:36ch;">Vuelve a escanear el QR o revisa el aparato Yiyuan — este reporte no tiene datos suficientes para un resultado confiable.</p>
                </div>
            `;
        } else if (concerns.length === 0) {
            $('d-concerns-sub').textContent = 'Ninguna · piel en buen estado';
            $('d-concerns').innerHTML = `
                <div class="concern-card" style="border-left-color:var(--sev-excellent);">
                    <span class="concern-label">Sin preocupaciones</span>
                    <div class="concern-name">Piel saludable</div>
                    <div class="concern-score-row">
                        <div><span class="concern-score" style="color:var(--sev-excellent)">A+</span></div>
                        <span class="concern-badge" style="background:rgba(110,231,183,0.15);color:var(--sev-excellent)">Óptimo</span>
                    </div>
                </div>
            `;
        } else {
            $('d-concerns-sub').textContent = `${concerns.length} área${concerns.length > 1 ? 's' : ''} a tratar`;
            const whyMap = state.concernsWhyMap || {};
            $('d-concerns').innerHTML = concerns.map((c, idx) => {
                const aiWhy = whyMap[c.metric];
                return `
                <div class="concern-card ${c.severity}" style="--delay:${idx * 70}ms">
                    <span class="concern-label">${SEVERITY_LABELS[c.severity]}</span>
                    <div class="concern-name">${escapeHtml(c.labelEs)}</div>
                    ${aiWhy ? `<p style="font-size:13px;color:var(--ink-2);line-height:1.5;margin-top:10px;max-width:36ch;">${escapeHtml(aiWhy)}</p>` : ''}
                    <div class="concern-score-row">
                        <div>
                            <span class="concern-score">${Math.round(Number(c.score))}</span>
                            <span class="concern-over">/100</span>
                        </div>
                        <span class="concern-badge">${SEVERITY_LABELS[c.severity]}</span>
                    </div>
                </div>
                `;
            }).join('');
        }

        const bentoCount = $('d-bento-count');
        if (bentoCount) bentoCount.textContent = `${sorted.length} métrica${sorted.length === 1 ? '' : 's'} clínica${sorted.length === 1 ? '' : 's'}`;

        // Bento grid
        $('d-bento').innerHTML = sorted.map((s, idx) => {
            const sizeClass = (s.severity === 'critical' || s.severity === 'concern')
                ? `tile-${s.severity}`
                : '';
            const pctWidth = Math.min(100, Math.max(0, Number(s.score)));
            return `
                <div class="tile severity-${s.severity} ${sizeClass}">
                    <div>
                        <div class="tile-label">${SEVERITY_LABELS[s.severity]}</div>
                        <div class="tile-name">${escapeHtml(s.labelEs)}</div>
                    </div>
                    <div class="tile-bottom">
                        <div>
                            <span class="tile-score">${Math.round(Number(s.score))}</span>
                            <span class="tile-score-sub">/100</span>
                        </div>
                        ${s.count ? `<span style="font-size:11px;color:var(--ink-3);font-family:monospace">×${s.count}</span>` : ''}
                    </div>
                    <div class="tile-bar">
                        <div class="tile-bar-fill" style="width:${pctWidth}%;--delay:${idx * 30}ms"></div>
                    </div>
                </div>
            `;
        }).join('');

        // Gallery
        const images = a.images || [];
        $('d-images-count').textContent = `${images.length} capturas`;
        $('d-gallery').innerHTML = images.map(img => `
            <div class="gallery-item" data-url="${escapeHtml(img.originalUrl)}" data-caption="${escapeHtml(img.labelEs)}">
                <img src="${escapeHtml(img.originalUrl)}" alt="${escapeHtml(img.labelEs)}" loading="lazy" onerror="this.style.opacity=0.3;this.style.filter='grayscale(1)'">
                <div class="gallery-caption">${escapeHtml(img.labelEs)}</div>
            </div>
        `).join('');

        // Bind lightbox
        $('d-gallery').querySelectorAll('.gallery-item').forEach(el => {
            el.addEventListener('click', () => openLightbox(el.dataset.url, el.dataset.caption));
        });
        $('lightbox-close').addEventListener('click', closeLightbox);
        $('lightbox').addEventListener('click', (e) => {
            if (e.target === $('lightbox')) closeLightbox();
        });

        // WhatsApp button
        $('btn-whatsapp').addEventListener('click', () => sendWhatsAppSummary(a));

        // Regenerate narrative
        $('btn-regenerate').addEventListener('click', () => regenerateNarrative(a.id));

        // PDF buttons
        $('btn-download-pdf').addEventListener('click', () => generatePDF(a, 'download'));
        $('btn-share-pdf').addEventListener('click', () => generatePDF(a, 'share'));

        // Guardar análisis en state para reusar en PDF
        state.currentAnalysis = a;
    }

    // ── AI Narrative renderer ──
    function renderAINarrative(a) {
        const ai = a.aiRecommendations;
        const concernsWhyMap = {};

        const aiBlock = $('d-ai-block');
        if (ai && ai.headline && ai.summary) {
            $('d-ai-headline').textContent = ai.headline;
            $('d-ai-summary').textContent = ai.summary;
            aiBlock.classList.remove('hidden', 'ai-block-empty');

            // Map of metric → why para enriquecer los concern cards
            if (Array.isArray(ai.concerns)) {
                ai.concerns.forEach(c => {
                    if (c.metric) concernsWhyMap[c.metric] = c.why;
                });
            }
        } else {
            // Antes esta sección (y tratamientos/rutina/próximo análisis) solo
            // desaparecía sin avisar — el staff no tenía forma de saber si
            // faltó la IA o si algo se rompió.
            aiBlock.classList.remove('hidden');
            aiBlock.classList.add('ai-block-empty');
            $('d-ai-headline').textContent = 'Interpretación IA no disponible';
            $('d-ai-summary').textContent = 'No se generó una narrativa clínica para este análisis. Los datos numéricos completos siguen disponibles abajo — usa "Regenerar narrativa IA" para intentarlo de nuevo.';
        }

        state.concernsWhyMap = concernsWhyMap;

        // Treatments
        const tSection = $('d-treatments-section');
        const treatments = Array.isArray(ai?.recommendations) ? ai.recommendations : [];
        if (treatments.length > 0) {
            $('d-treatments-sub').textContent = `${treatments.length} del menú Venus`;
            $('d-treatments').innerHTML = treatments.map((t, idx) => `
                <div class="treatment">
                    <span class="treatment-num">${String(idx + 1).padStart(2, '0')}</span>
                    <div class="treatment-main">
                        <div class="name">${escapeHtml(t.treatment || '—')}</div>
                        <div class="why">${escapeHtml(t.why || '')}</div>
                    </div>
                    <div class="treatment-meta">
                        <div class="treatment-sessions">${t.sessions ?? '—'}<small> sesiones</small></div>
                        <div class="treatment-freq">${escapeHtml(t.frequency || '')}</div>
                    </div>
                </div>
            `).join('');
            tSection.classList.remove('hidden');
        } else {
            tSection.classList.add('hidden');
        }

        // Home care
        const hcSection = $('d-homecare-section');
        const homecare = Array.isArray(ai?.homeCare) ? ai.homeCare : [];
        if (homecare.length > 0) {
            $('d-homecare').innerHTML = homecare.map(tip => `
                <li>${escapeHtml(tip)}</li>
            `).join('');
            hcSection.classList.remove('hidden');
        } else {
            hcSection.classList.add('hidden');
        }

        // Next analysis
        const nextBox = $('d-next-analysis-box');
        const weeks = ai?.nextAnalysisIn;
        if (weeks && Number.isFinite(weeks)) {
            const future = new Date();
            future.setDate(future.getDate() + (weeks * 7));
            const fechaFutura = future.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
            $('d-next-analysis-value').textContent = `En ${weeks} semanas · alrededor del ${fechaFutura}`;
            nextBox.classList.remove('hidden');
        } else {
            nextBox.classList.add('hidden');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PDF EXPORT
    // ═══════════════════════════════════════════════════════════════
    const IMAGE_PURPOSE_ES = {
        uv: 'Daño solar acumulado', woods: 'Pigmentación subdérmica',
        blue: 'Poros y producción de sebo', red: 'Vascularidad',
        brown: 'Manchas y melanina', positive: 'Textura ampliada',
        negative: 'Relieve y arrugas', aging_simu: 'Simulación de envejecimiento',
        rgb: 'Luz natural', normal: 'Luz natural', polarized: 'Luz polarizada',
    };
    const SEV_ES = { excellent: 'Excelente', good: 'Bueno', moderate: 'Moderado', concern: 'A tratar', critical: 'Crítico' };

    function pdfScoreQual(n) {
        n = Number(n);
        if (!Number.isFinite(n)) return '';
        if (n >= 85) return 'Excelente estado general';
        if (n >= 70) return 'Buen estado general';
        if (n >= 55) return 'Estado moderado, con áreas a trabajar';
        if (n >= 40) return 'Requiere atención en varias áreas';
        return 'Requiere atención prioritaria';
    }

    // Cabecera y pie de una hoja del PDF. `cont` = hoja de continuación (cabecera compacta).
    function pdfPageShell(a, cont, fecha) {
        const name = escapeHtml(a.card?.name || a.clientName || 'Sin nombre');
        return `
          <header class="pdf-header">
            <div class="pdf-header-brand">
              <img class="pdf-logo" src="/assets/logo.png" alt="Venus">
              <div>
                <div class="pdf-brand-name">Venus</div>
                <div class="pdf-brand-tag">Cosmetología · San Juan del Río</div>
              </div>
            </div>
            <div class="pdf-header-date">
              <strong>${cont ? name : 'Análisis clínico de piel'}</strong>
              <div>${cont ? 'Análisis clínico de piel · ' : ''}${fecha}</div>
            </div>
          </header>
          <div class="pdf-page-body"></div>
          <footer class="pdf-footer">
            <span class="pdf-footer-brand">Venus Cosmetología</span>
            <span>WhatsApp 427 165 7595 · @venuscosmetologia</span>
            <span class="pdf-footer-page"></span>
          </footer>`;
    }

    // Reparte los .pdf-block en hojas A4 midiendo su alto real. Un bloque que no
    // cabe en la hoja actual pasa entero a la siguiente (nunca se parte). Los
    // bloques con data-pdf-keep-with-next se mantienen junto al siguiente.
    function pdfPaginate(a, fecha) {
        const src = $('pdf-blocks');
        const out = $('pdf-pages');
        out.innerHTML = '';
        const blocks = [...src.children];

        // Altura útil de una hoja: 297mm - padding (14mm arriba + 22mm abajo) - cabecera.
        const mm = (v) => v * 96 / 25.4;
        const PAGE_H = mm(297);
        const PAD_TOP = mm(14), PAD_BOTTOM = mm(22);

        let page = null, body = null, used = 0, avail = 0, count = 0;

        const newPage = () => {
            const cont = count > 0;
            page = document.createElement('div');
            page.className = 'pdf-page' + (cont ? ' is-continuation' : '');
            page.innerHTML = pdfPageShell(a, cont, fecha);
            out.appendChild(page);
            body = page.querySelector('.pdf-page-body');
            count++;
            const headerH = page.querySelector('.pdf-header').getBoundingClientRect().height;
            avail = PAGE_H - PAD_TOP - PAD_BOTTOM - headerH;
            used = 0;
        };

        // Medimos cada bloque en su sitio (ya está en el DOM dentro de #pdf-blocks,
        // con el mismo ancho útil que tendrá en la hoja).
        const heights = blocks.map(b => {
            const r = b.getBoundingClientRect();
            const cs = getComputedStyle(b);
            return r.height + parseFloat(cs.marginBottom || 0);
        });

        newPage();
        for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i];
            let need = heights[i];
            // keep-with-next: reserva también el alto del siguiente bloque
            if (b.hasAttribute('data-pdf-keep-with-next') && i + 1 < blocks.length) need += heights[i + 1];
            if (used > 0 && used + need > avail) newPage();
            body.appendChild(b);
            used += heights[i];
        }
        src.innerHTML = '';

        // Numeración en el pie (además del sello vectorial que pone jsPDF).
        const pages = out.querySelectorAll('.pdf-page');
        pages.forEach((p, i) => { p.querySelector('.pdf-footer-page').textContent = `Página ${i + 1} de ${pages.length}`; });
        return pages.length;
    }

    function fillPDFTemplate(a) {
        const cardName = a.card?.name || a.clientName || 'Sin nombre';
        const cardPhone = a.card?.phone || a.clientPhone || '—';
        const analyzedAt = a.analyzedAt ? new Date(a.analyzedAt) : new Date();
        const fecha = analyzedAt.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
        const ai = a.aiRecommendations;
        const scoreNum = a.overallScore != null ? Math.round(Number(a.overallScore)) : null;

        const sorted = [...(a.scores || [])].sort((x, y) => {
            const so = SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity];
            return so !== 0 ? so : Number(x.score) - Number(y.score);
        });
        const whyMap = {};
        if (ai && Array.isArray(ai.concerns)) ai.concerns.forEach(c => { if (c.metric) whyMap[c.metric] = c.why; });
        const topConcerns = sorted.filter(s => s.severity === 'critical' || s.severity === 'concern').slice(0, 3);

        const B = []; // bloques HTML en orden

        // 1) Portada: clienta + score
        const metaParts = [];
        if (a.ageReal) metaParts.push(`<strong>${a.ageReal} años</strong>`);
        metaParts.push(`Tel. ${escapeHtml(cardPhone)}`);
        if (a.skinType) metaParts.push(`Piel <strong>${escapeHtml(a.skinType)}</strong>`);
        if (a.skinColor) metaParts.push(`Fototipo <strong>${escapeHtml(a.skinColor)}</strong>`);
        B.push(`
          <div class="pdf-block pdf-hero">
            <div>
              <div class="pdf-hero-eyebrow">Reporte personalizado · tecnología multiespectral</div>
              <div class="pdf-client-name">${escapeHtml(cardName)}</div>
              <div class="pdf-client-meta">${metaParts.join(' &nbsp;·&nbsp; ')}</div>
            </div>
            <div class="pdf-score-big">
              <div class="pdf-score-number">${scoreNum ?? '—'}<small>/100</small></div>
              <div class="pdf-score-label">Score general</div>
              ${scoreNum != null ? `<div class="pdf-score-qual">${pdfScoreQual(scoreNum)}</div>` : ''}
            </div>
          </div>`);

        // 2) Resumen de 4 datos
        const edadBio = a.ageBiological != null ? a.ageBiological : null;
        const delta = (edadBio != null && a.ageReal) ? ` <span>(${edadBio < a.ageReal ? '−' : '+'}${Math.abs(edadBio - a.ageReal)} vs. real)</span>` : '';
        B.push(`
          <dl class="pdf-block pdf-summary-grid">
            <div class="pdf-summary-cell"><dt>Tipo de piel</dt><dd>${escapeHtml(a.skinType || '—')}</dd></div>
            <div class="pdf-summary-cell"><dt>Fototipo</dt><dd>${escapeHtml(a.skinColor || '—')}</dd></div>
            <div class="pdf-summary-cell"><dt>Rostro</dt><dd>${escapeHtml(a.faceShape || '—')}</dd></div>
            <div class="pdf-summary-cell"><dt>Edad biológica</dt><dd>${edadBio ?? '—'}${delta}</dd></div>
          </dl>`);

        // 3) Narrativa IA
        if (ai && ai.headline && ai.summary) {
            B.push(`
              <div class="pdf-block">
                <h2 class="pdf-h2">Interpretación clínica <small>Asistida por IA</small></h2>
                <div class="pdf-narrative">
                  <div class="pdf-narrative-headline">${escapeHtml(ai.headline)}</div>
                  <p class="pdf-narrative-summary">${escapeHtml(ai.summary)}</p>
                </div>
              </div>`);
        }

        // 4) Preocupaciones principales
        let concernsHTML;
        if (sorted.length === 0) {
            concernsHTML = `<div class="pdf-concern healthy"><div class="pdf-concern-label">—</div><div class="pdf-concern-main"><div class="name">Sin métricas legibles</div><div class="why">El aparato no devolvió datos suficientes para este análisis.</div></div><div class="pdf-concern-score">—</div></div>`;
        } else if (topConcerns.length === 0) {
            concernsHTML = `<div class="pdf-concern healthy"><div class="pdf-concern-label">A+</div><div class="pdf-concern-main"><div class="name">Piel saludable</div><div class="why">Todas las métricas en rango óptimo.</div></div><div class="pdf-concern-score">${scoreNum ?? '—'}<small>/100</small><span class="sev">Óptimo</span></div></div>`;
        } else {
            concernsHTML = topConcerns.map((c, i) => `
              <div class="pdf-concern ${c.severity}">
                <div class="pdf-concern-label">${String(i + 1).padStart(2, '0')}</div>
                <div class="pdf-concern-main">
                  <div class="name">${escapeHtml(c.labelEs)}</div>
                  <div class="why">${escapeHtml(whyMap[c.metric] || (c.severity === 'critical' ? 'Requiere atención prioritaria.' : 'Área a trabajar con tratamiento.'))}</div>
                </div>
                <div class="pdf-concern-score">${Math.round(Number(c.score))}<small>/100</small><span class="sev">${SEV_ES[c.severity] || ''}</span></div>
              </div>`).join('');
        }
        B.push(`
          <div class="pdf-block">
            <h2 class="pdf-h2">Principales preocupaciones <small>${topConcerns.length ? topConcerns.length + ' de ' + sorted.length + ' métricas' : ''}</small></h2>
            <div class="pdf-concerns-list">${concernsHTML}</div>
          </div>`);

        // 5) Panel completo de métricas (con barra)
        if (sorted.length) {
            B.push(`
              <div class="pdf-block">
                <h2 class="pdf-h2">Panel completo <small>${sorted.length} métrica${sorted.length === 1 ? '' : 's'} clínica${sorted.length === 1 ? '' : 's'}</small></h2>
                <div class="pdf-metrics-grid">
                  ${sorted.map(s => { const n = Math.round(Number(s.score)); const w = Math.max(0, Math.min(100, n)); return `
                    <div class="pdf-metric-cell sev-${s.severity}">
                      <span class="label">${escapeHtml(s.labelEs)}</span>
                      <span class="score">${n}</span>
                      <span class="bar"><i style="width:${w}%"></i></span>
                    </div>`; }).join('')}
                </div>
                <div class="pdf-metrics-legend">
                  <span class="l-excellent">Excelente</span><span class="l-good">Bueno</span><span class="l-moderate">Moderado</span><span class="l-concern">A tratar</span><span class="l-critical">Crítico</span>
                </div>
              </div>`);
        }

        // 6) Plan de tratamiento
        const treatments = Array.isArray(ai?.recommendations) ? ai.recommendations : [];
        if (treatments.length) {
            B.push(`
              <div class="pdf-block">
                <h2 class="pdf-h2">Plan de tratamiento sugerido <small>${treatments.length} tratamiento${treatments.length === 1 ? '' : 's'}</small></h2>
                <div class="pdf-treatments">
                  ${treatments.map(t => `
                    <div class="pdf-treatment">
                      <div><div class="name">${escapeHtml(t.treatment || '—')}</div>${t.why ? `<div class="why">${escapeHtml(t.why)}</div>` : ''}</div>
                      <div class="pdf-treatment-meta"><strong>${t.sessions ?? '—'}</strong><span class="u">${t.sessions ? (t.sessions === 1 ? 'sesión' : 'sesiones') : ''}</span>${t.frequency ? `<span class="f">${escapeHtml(t.frequency)}</span>` : ''}</div>
                    </div>`).join('')}
                </div>
              </div>`);
        }

        // 7) Rutina en casa
        const homecare = Array.isArray(ai?.homeCare) ? ai.homeCare : [];
        if (homecare.length) {
            B.push(`
              <div class="pdf-block">
                <h2 class="pdf-h2">Rutina en casa <small>Protocolo personalizado</small></h2>
                <ul class="pdf-homecare">${homecare.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
              </div>`);
        }

        // 8) Cierre: próximo análisis + firma + aviso (un solo bloque para que no se separen)
        const weeks = ai?.nextAnalysisIn;
        let nextHTML = '';
        if (weeks && Number.isFinite(weeks)) {
            const future = new Date(); future.setDate(future.getDate() + weeks * 7);
            const fechaFutura = future.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
            nextHTML = `<div class="pdf-next"><div class="pdf-next-label">Próximo análisis recomendado</div><div class="pdf-next-value">En ${weeks} semanas · alrededor del ${fechaFutura}</div></div>`;
        }
        B.push(`
          <div class="pdf-block">
            ${nextHTML}
            <div class="pdf-signature">
              <div>
                <div class="pdf-sig-line"></div>
                <div class="pdf-sig-name">Alondra Osorno</div>
                <div class="pdf-sig-title">Cosmetóloga profesional</div>
                <div class="pdf-sig-clinic">Venus Cosmetología</div>
              </div>
              <div class="pdf-sig-cta"><strong>Agenda tu siguiente sesión</strong>WhatsApp 427 165 7595<br>San Juan del Río, Querétaro</div>
            </div>
          </div>
          <div class="pdf-block pdf-disclaimer">Este reporte es resultado de un análisis multiespectral con tecnología Yiyuan Skin Analyzer. No sustituye una valoración dermatológica. Si alguna métrica presenta score crítico (&lt;30), agenda una valoración con especialista médico.</div>`);

        // 9) Galería multiespectral: en bloques de 6 (3×2) para que llene hojas enteras
        const images = (a.images || []).slice(0, 12);
        if (images.length) {
            const item = (img) => {
                const proxied = `/api/skin-analysis/image-proxy?url=${encodeURIComponent(img.originalUrl)}`;
                const purpose = IMAGE_PURPOSE_ES[img.imageType] || '';
                return `<div class="pdf-gallery-item"><img src="${proxied}" alt="${escapeHtml(img.labelEs)}"><div class="pdf-gallery-cap"><strong>${escapeHtml(img.labelEs)}</strong>${purpose ? `<span>${escapeHtml(purpose)}</span>` : ''}</div></div>`;
            };
            // Título + intro en su propio bloque (pegado a la primera fila), y
            // luego FILAS de 3 imágenes como bloques independientes: así la
            // galería rellena el aire que quede en la hoja anterior en vez de
            // saltar entera y dejar media hoja en blanco.
            B.push(`
              <div class="pdf-block" data-pdf-keep-with-next>
                <h2 class="pdf-h2">Capturas multiespectrales <small>${images.length} imagen${images.length === 1 ? '' : 'es'}</small></h2>
                <p class="pdf-gallery-intro" style="margin-bottom:0">Capturas obtenidas con iluminación polarizada, ultravioleta y canales cromáticos dedicados. Permiten detectar daño subdérmico, vascularidad y pigmentación no visibles a simple vista.</p>
              </div>`);
            for (let i = 0; i < images.length; i += 3) {
                B.push(`<div class="pdf-block pdf-gallery-grid" style="margin-bottom:10px">${images.slice(i, i + 3).map(item).join('')}</div>`);
            }
        }

        $('pdf-blocks').innerHTML = B.join('');
        return pdfPaginate(a, fecha);
    }

    function pdfFilename(a) {
        const name = (a.card?.name || a.clientName || 'cliente')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        const d = a.analyzedAt ? new Date(a.analyzedAt) : new Date();
        // Día LOCAL: con toISOString (UTC) un análisis en la noche salía
        // con el archivo fechado mañana.
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return `venus-skin-${name}-${ymd}.pdf`;
    }

    async function generatePDF(a, mode) {
        if (!window.html2pdf) {
            alert('La librería de PDF no cargó. Recarga la página.');
            return;
        }

        const btn = mode === 'download' ? $('btn-download-pdf') : $('btn-share-pdf');
        const oldHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando…';
        showLoading(true);

        const root = $('pdf-root');

        // html2canvas desplaza la captura según el scroll actual de la ventana
        // (bug conocido con contenedores fijos). El botón de descarga está al
        // FONDO del reporte, así que el usuario siempre llega con ~2000px de
        // scroll: el contenido salía corrido hacia abajo y las primeras páginas
        // del PDF quedaban en blanco. Capturamos en scroll 0 y restauramos.
        const scrollPrevio = { x: window.scrollX, y: window.scrollY };
        window.scrollTo(0, 0);

        try {
            fillPDFTemplate(a);

            // Ya NO se mueve el template al viewport. html2pdf monta su propia
            // copia en pantalla para fotografiarla; moverlo aquí era innecesario
            // y además le metía position/opacity al clon, que es lo que dejaba
            // el PDF en blanco. El escondite vive en #pdf-stage.

            // Esperar a que fonts y layout estabilicen
            if (document.fonts?.ready) {
                try { await document.fonts.ready; } catch { /* ignore */ }
            }

            // Esperar imágenes (logo + capturas del proxy)
            const pdfImages = root.querySelectorAll('img');
            await Promise.all(
                Array.from(pdfImages).map(img => {
                    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
                    return new Promise(resolve => {
                        const done = () => resolve();
                        img.addEventListener('load', done, { once: true });
                        img.addEventListener('error', done, { once: true });
                        setTimeout(resolve, 6000);
                    });
                })
            );

            // Un frame extra para que el browser reflow termine
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

            const filename = pdfFilename(a);
            const opts = {
                margin: 0,
                filename,
                image: { type: 'jpeg', quality: 0.95 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    logging: false,
                    letterRendering: true,
                    // Forzar dimensiones consistentes (A4 @ 96dpi = 794x1123 px)
                    windowWidth: 794,
                    // Cinturón y tirantes junto con el scrollTo(0,0) de arriba
                    scrollX: 0,
                    scrollY: 0,
                },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
                // UN solo mecanismo de corte. Antes se combinaban 'css' + 'avoid-all'
                // + este selector: como cada .pdf-page mide exactamente una hoja,
                // los tres se sumaban y metían hojas en blanco intercaladas.
                // Cada .pdf-page es una hoja A4 exacta armada por pdfPaginate(): el
                // único corte válido es entre hojas.
                pagebreak: { mode: [], before: '.pdf-page + .pdf-page' },
            };

            // Red de seguridad: si el lienzo sale de 0px, el PDF saldría en blanco
            // SIN error (así fue el bug del 14-ago). Preferimos fallar ruidosamente.
            const worker = html2pdf().set(opts).from(root).toCanvas();
            const canvas = await worker.get('canvas');
            if (!canvas || !canvas.width || !canvas.height) {
                throw new Error(`el template se midió en ${canvas?.width || 0}x${canvas?.height || 0}px, el PDF habría salido en blanco`);
            }

            if (mode === 'download') {
                await worker.toPdf().get('pdf').then(pdf => {
                    pdf.save(filename);
                });
            } else {
                // Share: genera blob y usa navigator.share si está disponible
                const blob = await worker.toPdf().get('pdf').then(pdf => {
                    return pdf.output('blob');
                });
                const file = new File([blob], filename, { type: 'application/pdf' });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: `Análisis de piel — ${a.card?.name || a.clientName || ''}`,
                        text: 'Tu análisis clínico de Venus Cosmetología.',
                    });
                } else {
                    // Fallback: descarga + abre WhatsApp Web con mensaje
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(() => URL.revokeObjectURL(url), 1500);

                    const phone = (a.card?.phone || a.clientPhone || '').replace(/\D/g, '');
                    if (phone) {
                        // "wa.me/...?text=" nunca puede adjuntar un archivo — antes el
                        // mensaje decía "Adjunto el PDF" cuando en realidad no llevaba nada.
                        const msg = `Hola ${a.card?.name || a.clientName || ''} 🌸, tu análisis de piel de Venus Cosmetología ya está listo. Te comparto el PDF a continuación en este chat.`;
                        setTimeout(() => {
                            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
                            feedbackDetail('ok', 'PDF descargado — arrástralo a la conversación de WhatsApp que se acaba de abrir.');
                        }, 800);
                    }
                }
            }
        } catch (err) {
            console.error('[PDF] Error generando:', err);
            feedbackDetail('err', `No se pudo generar el PDF: ${err.message}`);
        } finally {
            window.scrollTo(scrollPrevio.x, scrollPrevio.y);
            btn.disabled = false;
            btn.innerHTML = oldHTML;
            showLoading(false);
        }
    }

    async function regenerateNarrative(analysisId) {
        const btn = $('btn-regenerate');
        const oldHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Regenerando…';

        try {
            const res = await fetch(`/api/skin-analysis/${analysisId}/regenerate-narrative`, {
                method: 'POST',
                credentials: 'include',
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                feedbackDetail('err', json.error || 'No se pudo regenerar la narrativa');
                return;
            }
            // Recarga la vista para ver la nueva narrativa
            location.reload();
        } catch (err) {
            feedbackDetail('err', `Error de red: ${err.message}`);
        } finally {
            btn.disabled = false;
            btn.innerHTML = oldHTML;
        }
    }

    function openLightbox(url, caption) {
        $('lightbox-img').src = url;
        $('lightbox-caption').textContent = caption;
        $('lightbox').classList.add('visible');
    }

    function closeLightbox() {
        $('lightbox').classList.remove('visible');
        $('lightbox-img').src = '';
    }

    function scoreQualifier(score) {
        const n = Number(score);
        if (!Number.isFinite(n)) return '';
        if (n >= 85) return ' (Excelente)';
        if (n >= 70) return ' (Bueno)';
        if (n >= 55) return ' (Moderado)';
        if (n >= 40) return ' (Requiere atención)';
        return ' (Crítico)';
    }

    function sendWhatsAppSummary(a) {
        const phone = a.card?.phone || a.clientPhone;
        if (!phone) {
            feedbackDetail('err', 'Esta clienta no tiene teléfono vinculado');
            return;
        }

        const name = a.card?.name || a.clientName || '';
        const score = a.overallScore ?? '—';
        const skinType = a.skinType || '—';
        const ai = a.aiRecommendations;
        // Antes el mensaje terminaba sin firma ni forma de responder — en un
        // chat de WhatsApp con mucho tráfico, nada marcaba esto como oficial.
        const cierre = `Agenda tu siguiente sesión escribiéndonos por aquí mismo 💬\n— Venus Cosmetología, San Juan del Río`;

        let msg;

        if (ai && ai.summary) {
            // Versión rica con narrativa IA
            const treatmentsTxt = Array.isArray(ai.recommendations)
                ? ai.recommendations
                    .slice(0, 3)
                    .map((t, i) => `${i + 1}. *${t.treatment}* — ${t.sessions} sesiones ${t.frequency ? `(${t.frequency})` : ''}`)
                    .join('\n')
                : '';

            msg = `Hola ${name} 🌸\n\n*Tu análisis de piel — Venus Cosmetología*\n\n` +
                `${ai.summary}\n\n` +
                `*Score general:* ${score}/100${scoreQualifier(score)}\n` +
                `*Tipo de piel:* ${skinType}\n\n` +
                (treatmentsTxt ? `*Tratamientos recomendados:*\n${treatmentsTxt}\n\n` : '') +
                (ai.nextAnalysisIn ? `*Próximo análisis sugerido:* en ${ai.nextAnalysisIn} semanas\n\n` : '') +
                cierre;
        } else {
            // Fallback sin IA
            const concerns = [...(a.scores || [])]
                .filter(s => s.severity === 'critical' || s.severity === 'concern')
                .sort((x, y) => Number(x.score) - Number(y.score))
                .slice(0, 3)
                .map(s => `• ${s.labelEs}: ${Math.round(Number(s.score))}/100`)
                .join('\n');

            msg = `Hola ${name} 🌸\n\nAquí está el resumen de tu análisis de piel en Venus Cosmetología:\n\n` +
                `*Score general:* ${score}/100${scoreQualifier(score)}\n` +
                `*Tipo de piel:* ${skinType}\n\n` +
                (concerns ? `*Áreas a mejorar:*\n${concerns}\n\n` : '') +
                cierre;
        }

        const url = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    }

})();
