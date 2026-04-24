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

    function showLoading(show) {
        $('loading').classList.toggle('visible', show);
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

        if (preselectCardId) {
            try {
                const res = await fetch(`/api/admin/cards-firebase?q=&limit=100`, { credentials: 'include' });
                const json = await res.json();
                const card = (json.items || []).find(c => c.id === preselectCardId);
                if (card) selectCard(card);
            } catch { /* ignore */ }
        }

        // Iniciar cámara por default
        await startCamera();
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
            if (!res.ok) throw new Error('auth');
            const json = await res.json();
            renderSearchResults(json.items || []);
        } catch (err) {
            if (err.message === 'auth') {
                location.href = '/admin-login.html';
                return;
            }
            $('search-results').innerHTML = `<div style="padding:14px;color:var(--ink-3);font-size:13px;">Error buscando</div>`;
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
    }

    function clearSelection() {
        state.selectedCard = null;
        state.manualMeta = null;
        $('selected-card').classList.remove('visible');
        $('card-selector').classList.remove('has-selection');
    }

    async function createQuickClient() {
        const name = $('new-name').value.trim();
        const phone = $('new-phone').value.trim().replace(/\D/g, '');

        if (!name || phone.length < 10) {
            alert('Nombre y teléfono (10 dígitos) son obligatorios');
            return;
        }

        // Intenta crear via /api/issue (endpoint admin oficial). Si falla,
        // cae a modo manual (el backend de skin-analysis soporta clientName+clientPhone sin Card).
        showLoading(true);
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
        if (mode === state.mode) return;
        state.mode = mode;

        document.querySelectorAll('.mode-tab').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === mode);
        });
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        $(`panel-${mode}`).classList.add('active');
        clearFeedback();

        if (mode === 'camera') {
            await startCamera();
        } else {
            await stopCamera();
        }
    }

    // ────── Camera ──────
    async function startCamera() {
        if (!window.Html5Qrcode) {
            feedback('err', 'No se pudo cargar el lector QR (revisa tu conexión)');
            return;
        }
        if (state.scanner && state.scanner.getState?.() === 2) return;

        try {
            const scanner = new Html5Qrcode('qr-camera-region', { verbose: false });
            state.scanner = scanner;
            await scanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 240, height: 240 } },
                (decoded) => handleDecoded(decoded),
                () => { /* per-frame errors: ignore */ }
            );
        } catch (err) {
            feedback('err', `No se pudo iniciar la cámara: ${err.message || err}`);
        }
    }

    async function stopCamera() {
        const s = state.scanner;
        if (!s) return;
        try {
            if (s.getState?.() === 2) await s.stop();
            s.clear?.();
        } catch { /* ignore */ }
        state.scanner = null;
    }

    function bindCameraMode() { /* no-op, startCamera se llama en initScanner */ }

    // ────── Upload ──────
    function bindUploadMode() {
        $('qr-file-input').addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            await decodeFromFile(file);
            e.target.value = '';
        });
    }

    async function decodeFromFile(file) {
        clearFeedback();
        if (!window.Html5Qrcode) {
            feedback('err', 'Lector QR no disponible');
            return;
        }
        try {
            const tempScanner = new Html5Qrcode('qr-file-reader-temp', { verbose: false });
            const decoded = await tempScanner.scanFile(file, false);
            handleDecoded(decoded);
        } catch (err) {
            feedback('err', 'No se detectó un QR en la imagen. Prueba con otra foto.');
        }
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
        const shareId = extractShareId(decoded);
        if (!shareId) {
            feedback('err', 'El código no es de un reporte Yiyuan válido');
            return;
        }
        state.detectedShareId = shareId;
        stopCamera();
        feedback('ok', `Reporte detectado — ${shareId.slice(0, 12)}…`);
        showConfirmArea(shareId);
    }

    function showConfirmArea(shareId) {
        $('confirm-share-id').textContent = shareId;
        $('confirm-area').classList.add('visible');
        $('confirm-area').scrollIntoView({ behavior: 'smooth', block: 'end' });
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
        showLoading(true);

        try {
            const res = await fetch(`/api/skin-analysis/${id}`, { credentials: 'include' });
            if (res.status === 401) {
                location.href = '/admin-login.html';
                return;
            }
            const json = await res.json();
            if (!res.ok || !json.success) {
                alert(json.error || 'No se pudo cargar el análisis');
                return;
            }
            renderDetail(json.data);
        } catch (err) {
            alert(`Error de red: ${err.message}`);
        } finally {
            showLoading(false);
        }
    }

    function renderDetail(a) {
        const cardName = a.card?.name || a.clientName || 'Sin nombre';
        const cardPhone = a.card?.phone || a.clientPhone || '—';

        $('d-avatar').textContent = initials(cardName);
        $('d-name').textContent = cardName;
        $('d-score').textContent = a.overallScore ?? '—';

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

        // Top concerns (critical + concern, top 3)
        const concerns = sorted.filter(s => s.severity === 'critical' || s.severity === 'concern').slice(0, 3);
        $('d-concerns-sub').textContent = concerns.length === 0 ? 'Ninguna · piel en buen estado' : `${concerns.length} área${concerns.length > 1 ? 's' : ''} a tratar`;

        if (concerns.length === 0) {
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
            const whyMap = state.concernsWhyMap || {};
            $('d-concerns').innerHTML = concerns.map(c => {
                const aiWhy = whyMap[c.metric];
                return `
                <div class="concern-card ${c.severity}">
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
    }

    // ── AI Narrative renderer ──
    function renderAINarrative(a) {
        const ai = a.aiRecommendations;
        const concernsWhyMap = {};

        const aiBlock = $('d-ai-block');
        if (ai && ai.headline && ai.summary) {
            $('d-ai-headline').textContent = ai.headline;
            $('d-ai-summary').textContent = ai.summary;
            aiBlock.classList.remove('hidden');

            // Map of metric → why para enriquecer los concern cards
            if (Array.isArray(ai.concerns)) {
                ai.concerns.forEach(c => {
                    if (c.metric) concernsWhyMap[c.metric] = c.why;
                });
            }
        } else {
            aiBlock.classList.add('hidden');
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
                alert(json.error || 'No se pudo regenerar la narrativa');
                return;
            }
            // Recarga la vista para ver la nueva narrativa
            location.reload();
        } catch (err) {
            alert(`Error de red: ${err.message}`);
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

    function sendWhatsAppSummary(a) {
        const phone = a.card?.phone || a.clientPhone;
        if (!phone) {
            alert('Esta clienta no tiene teléfono vinculado');
            return;
        }

        const name = a.card?.name || a.clientName || '';
        const score = a.overallScore ?? '—';
        const skinType = a.skinType || '—';
        const ai = a.aiRecommendations;

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
                `*Score general:* ${score}/100\n` +
                `*Tipo de piel:* ${skinType}\n\n` +
                (treatmentsTxt ? `*Tratamientos recomendados:*\n${treatmentsTxt}\n\n` : '') +
                (ai.nextAnalysisIn ? `*Próximo análisis sugerido:* en ${ai.nextAnalysisIn} semanas\n\n` : '') +
                `Agenda tu cita cuando quieras ✨`;
        } else {
            // Fallback sin IA
            const concerns = [...(a.scores || [])]
                .filter(s => s.severity === 'critical' || s.severity === 'concern')
                .sort((x, y) => Number(x.score) - Number(y.score))
                .slice(0, 3)
                .map(s => `• ${s.labelEs}: ${Math.round(Number(s.score))}/100`)
                .join('\n');

            msg = `Hola ${name} 🌸\n\nAquí está el resumen de tu análisis de piel en Venus Cosmetología:\n\n` +
                `*Score general:* ${score}/100\n` +
                `*Tipo de piel:* ${skinType}\n\n` +
                (concerns ? `*Áreas a mejorar:*\n${concerns}\n\n` : '') +
                `Agenda tu próxima sesión para empezar un plan personalizado. ✨`;
        }

        const url = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    }

})();
