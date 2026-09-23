(function () {
    'use strict';
    // Broad guides calibrated against three Moji captures; not anatomical landmarks.
    const positions = { frente: [50, 32, 190, 65], entrecejo: [50, 46, 45, 48], nariz: [50, 64, 48, 95], mejilla_izq: [72, 67, 88, 85], mejilla_der: [28, 67, 88, 85], menton: [50, 92, 95, 40], ojo_izq: [65, 52, 80, 65], ojo_der: [35, 52, 80, 65], surco_nasogeniano: [64, 78, 40, 60] };
    const statuses = { ok: 'Sin prioridad', watch: 'Atención', focus: 'Prioridad' };
    const el = (tag, text, className) => {
        const node = document.createElement(tag);
        if (text != null) node.textContent = text;
        if (className) node.className = className;
        return node;
    };
    function proxy(url) {
        try {
            const u = new URL(url);
            if (u.protocol !== 'https:' || !['m.yiyuan.ai', 'zm.yiyuan.ai', 'yiyuan.ai'].includes(u.hostname)) return '';
            return '/api/skin-analysis/image-proxy?url=' + encodeURIComponent(url);
        } catch { return ''; }
    }
    function findings(zone) {
        const list = el('ul');
        for (const f of zone.findings) list.append(el('li', `${f.labelEs}: ${f.levelEs}${f.score != null ? ` · ${f.score}/100` : ''}${f.count != null ? ` · ${f.count} registros` : ''}${f.shared ? ' (ambos ojos; sin desglose por lado)' : ''}`));
        return list;
    }
    function mount(root, analysis, openImage) {
        root.replaceChildren();
        const map = analysis.zoneMap || { zones: [], global: [] };
        const photo = proxy((analysis.images || []).find(i => i.imageType === 'positive')?.originalUrl);
        const zones = (map.zones || []).filter(z => positions[z.key] && z.findings?.length);
        root.hidden = !zones.length && !(map.global || []).length;
        if (root.hidden) return;
        root.append(el('h2', 'Tu piel por zonas', 'section-title'));
        if (zones.length) {
            const layout = el('div', null, 'sz-layout');
            const figure = el('div', null, 'sz-photo');
            figure.hidden = true;
            const image = el('img');
            image.alt = 'Captura frontal del aparato';
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 1000 1000');
            svg.setAttribute('preserveAspectRatio', 'none');
            svg.setAttribute('aria-hidden', 'true');
            const info = el('div', null, 'sz-info');
            info.setAttribute('aria-live', 'polite');
            const list = el('div', null, 'sz-list');
            const select = zone => {
                info.replaceChildren(el('h3', zone.labelEs), findings(zone));
                for (const b of layout.querySelectorAll('button[data-zone]')) b.setAttribute('aria-pressed', String(b.dataset.zone === zone.key));
            };
            for (const zone of zones) {
                const [x, y, rx, ry] = positions[zone.key];
                const shape = document.createElementNS(svg.namespaceURI, 'ellipse');
                for (const [k, v] of Object.entries({ cx: x * 10, cy: y * 10, rx, ry, class: `sz-shape sz-${zone.status || 'unknown'}` })) shape.setAttribute(k, v);
                svg.append(shape);
                if (zone.key === 'surco_nasogeniano') {
                    const other = shape.cloneNode(); other.setAttribute('cx', '360'); svg.append(other);
                }
                const button = el('button', zone.labelEs, `sz-pin sz-${zone.status || 'unknown'}`);
                button.type = 'button';
                button.dataset.zone = zone.key;
                button.setAttribute('aria-label', `${zone.labelEs}: ${statuses[zone.status] || 'Sin nivel disponible'}`);
                button.style.left = x + '%'; button.style.top = y + '%';
                button.onclick = () => select(zone);
                figure.append(button);
                const row = el('details');
                row.append(el('summary', `${zone.labelEs} · ${statuses[zone.status] || 'Sin nivel disponible'}`), findings(zone));
                list.append(row);
            }
            figure.prepend(image, svg);
            if (photo) {
                image.onload = () => { figure.hidden = false; };
                image.onerror = () => { figure.hidden = true; };
                image.src = photo;
            }
            const side = el('div'); side.append(info, list);
            layout.append(figure, side); root.append(layout);
            select(zones[0]);
            root.append(el('p', 'Zonas orientativas. Las mediciones corresponden al aparato; los trazos no delimitan lesiones.', 'sz-note'));
        }
        const chips = el('div', null, 'sz-chips');
        for (const f of map.global || []) {
            const url = proxy(f.imageUrl);
            const chip = el(url ? 'button' : 'span', `${f.labelEs}${f.score != null ? ` · ${f.score}/100` : ''}`, 'sz-chip');
            if (url) { chip.type = 'button'; chip.onclick = () => openImage(url, f.labelEs + ' · Cara completa'); }
            chips.append(chip);
        }
        root.append(el('h3', 'Cara completa'), chips);
    }
    function progress(root, data, openImage) {
        root.replaceChildren(); root.hidden = !data;
        if (!data) return;
        root.append(el('h2', 'Tu avance', 'section-title'), el('p', `${data.days} días entre escaneos`, 'sz-note'));
        const rows = el('div', null, 'sz-progress-list');
        const comparison = el('div', null, 'sz-comparison');
        const show = metric => {
            comparison.replaceChildren();
            for (const [label, url] of [['Antes', metric.beforeImageUrl], ['Ahora', metric.afterImageUrl]]) {
                const figure = el('figure'); figure.append(el('figcaption', `${label} · ${metric.labelEs}`));
                const src = proxy(url);
                if (src) {
                    const button = el('button'); button.type = 'button'; button.setAttribute('aria-label', `Ampliar ${label.toLowerCase()}: ${metric.labelEs}`);
                    const image = el('img'); image.src = src; image.alt = `${label}: ${metric.labelEs}`;
                    image.onerror = () => button.replaceWith(el('p', 'Imagen no disponible'));
                    button.append(image); button.onclick = () => openImage(src, image.alt); figure.append(button);
                } else figure.append(el('p', 'Sin imagen para esta métrica'));
                comparison.append(figure);
            }
            for (const b of rows.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.metric === metric.metric));
        };
        for (const m of data.metrics || []) {
            const button = el('button', `${m.labelEs}: ${m.before} → ${m.after} · ${m.trend} (${m.delta > 0 ? '+' : ''}${m.delta})`, 'sz-progress-row');
            button.dataset.metric = m.metric; button.type = 'button'; button.onclick = () => show(m); rows.append(button);
        }
        root.append(rows, comparison);
        if (data.metrics?.length) show(data.metrics[0]);
        else root.append(el('p', 'No hay métricas comparables en estos escaneos.'));
        for (const zone of data.zones || []) {
            const details = el('details'); details.append(el('summary', zone.labelEs));
            for (const f of zone.findings) details.append(el('p', `${f.labelEs}: ${f.before} → ${f.after} · ${f.trend}${f.shared ? ' (ambos ojos)' : ''}`));
            root.append(details);
        }
    }
    window.VenusSkinZones = { mount, progress };
})();
