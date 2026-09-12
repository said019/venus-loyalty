/* Shared, read-only image viewer. ES2018 syntax for the Moji's Chrome 70. */
(function (root) {
    'use strict';
    var GROUPS = [
        { id: 'all', label: 'Todas' },
        { id: 'capture', label: 'Capturas' },
        { id: 'map', label: 'Mapas procesados' },
        { id: 'simulation', label: 'Simulaciones' },
        { id: 'unknown', label: 'Sin clasificar' }
    ];
    function classify(type) {
        if (['normal', 'positive', 'negative', 'uv', 'woods'].indexOf(type) !== -1) return 'capture';
        if (['blue', 'brown', 'red', 'face_atriums', 'face_eyes'].indexOf(type) !== -1) return 'map';
        return type === 'aging_simu' ? 'simulation' : 'unknown';
    }
    function safeUrl(value) {
        if (typeof value !== 'string') return null;
        try {
            var url = new URL(value);
            return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
        } catch (_) { return null; }
    }
    function normalize(images) {
        return (Array.isArray(images) ? images : []).map(function (image, index) {
            image = image || {};
            return {
                index: index,
                url: safeUrl(image.originalUrl),
                label: typeof image.labelEs === 'string' && image.labelEs.trim() ? image.labelEs.trim() : 'Imagen sin etiqueta',
                group: classify(image.imageType)
            };
        });
    }
    function description(group) {
        if (group === 'simulation') return 'Simulación de Moji. No es una fotografía de un cambio real ni una predicción validada del envejecimiento.';
        if (group === 'map') return 'Mapa procesado por Moji. Los colores y trazos pertenecen al informe del fabricante; no son mediciones nuevas de Venus IA.';
        if (group === 'capture') return 'Captura importada del informe Moji. La modalidad indicada procede del fabricante; no confirma que Venus pueda generar esta toma.';
        return 'Imagen importada de Moji. Su tipo no está identificado; requiere revisión antes de interpretarla.';
    }
    function mount(container, images) {
        if (container.venusGalleryDestroy) container.venusGalleryDestroy();
        var doc = container.ownerDocument;
        var items = normalize(images);
        var filter = 'all';
        var selected = 0;
        var alive = true;
        var restoreFocus = null;
        container.textContent = '';
        container.className = 'venus-gallery';
        function element(tag, className, text, parent) {
            var node = doc.createElement(tag);
            if (className) node.className = className;
            if (text) node.textContent = text;
            if (parent) parent.appendChild(node);
            return node;
        }
        function button(text, parent, handler, className) {
            var node = element('button', className || 'vg-button', text, parent);
            node.type = 'button';
            node.addEventListener('click', handler);
            return node;
        }
        if (!items.length) {
            element('p', 'vg-empty', 'Este informe no tiene imágenes. No se generarán fotos ni mapas para completar la galería.', container);
            container.venusGalleryDestroy = function () { alive = false; };
            return;
        }
        var filters = element('div', 'vg-filters', '', container);
        filters.setAttribute('role', 'group');
        filters.setAttribute('aria-label', 'Filtrar imágenes por procedencia');
        var stage = element('div', 'vg-stage', '', container);
        var figure = element('figure', 'vg-figure', '', stage);
        var imageBox = element('div', 'vg-image-box', '', figure);
        var caption = element('figcaption', 'vg-caption', '', figure);
        var label = element('h3', '', '', caption);
        var count = element('span', 'vg-count', '', caption);
        var controls = element('div', 'vg-controls', '', stage);
        var previous = button('← Anterior', controls, function () { step(-1); });
        var enlarge = button('Ampliar imagen', controls, open, 'vg-button vg-primary');
        var next = button('Siguiente →', controls, function () { step(1); });
        var note = element('p', 'vg-provenance', '', container);
        note.setAttribute('aria-live', 'polite');
        var strip = element('div', 'vg-thumbnails', '', container);
        strip.setAttribute('role', 'group');
        strip.setAttribute('aria-label', 'Elegir imagen');
        var overlay = element('div', 'vg-overlay', '', doc.body);
        overlay.hidden = true;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Imagen ampliada del informe Moji');
        var close = button('Cerrar ×', overlay, dismiss, 'vg-button vg-close');
        var large = element('img', 'vg-large', '', overlay);
        large.referrerPolicy = 'no-referrer';
        var largeCaption = element('p', 'vg-large-caption', '', overlay);
        large.addEventListener('error', function () {
            if (!overlay.hidden) largeCaption.textContent = 'No se pudo cargar la ampliación. Cierra el visor para volver a la galería. ' + description(current().group);
        });
        var filterButtons = [];
        function visible() { return items.filter(function (item) { return filter === 'all' || item.group === filter; }); }
        function current() { return visible()[selected]; }
        function step(delta) { selected += delta; render(); }
        function dismiss() {
            overlay.hidden = true;
            large.removeAttribute('src');
            if (restoreFocus && doc.contains(restoreFocus)) restoreFocus.focus();
        }
        function open() {
            var item = current();
            if (!item || !item.url || enlarge.disabled) return;
            restoreFocus = doc.activeElement;
            large.src = item.url;
            large.alt = item.label;
            largeCaption.textContent = item.label + ' — ' + description(item.group);
            overlay.hidden = false;
            close.focus();
        }
        function keyboard(event) {
            if (overlay.hidden) return;
            if (event.key === 'Escape') dismiss();
            if (event.key === 'Tab') { event.preventDefault(); close.focus(); }
        }
        overlay.addEventListener('click', function (event) { if (event.target === overlay) dismiss(); });
        doc.addEventListener('keydown', keyboard);
        GROUPS.forEach(function (group) {
            var amount = items.filter(function (item) { return group.id === 'all' || item.group === group.id; }).length;
            if (!amount) return;
            var node = button(group.label + ' · ' + amount, filters, function () { filter = group.id; selected = 0; render(); }, 'vg-filter');
            filterButtons.push({ node: node, id: group.id });
        });
        function render() {
            var list = visible();
            selected = Math.max(0, Math.min(selected, list.length - 1));
            var item = list[selected];
            imageBox.textContent = '';
            label.textContent = item.label;
            count.textContent = (selected + 1) + ' de ' + list.length;
            note.textContent = description(item.group);
            note.className = 'vg-provenance' + (item.group === 'simulation' ? ' vg-warning' : '');
            previous.disabled = selected === 0;
            next.disabled = selected === list.length - 1;
            enlarge.disabled = !item.url;
            if (item.url) {
                imageBox.setAttribute('aria-busy', 'true');
                var loading = element('p', 'vg-empty', 'Cargando imagen…', imageBox);
                var img = element('img', 'vg-main-image', '', imageBox);
                img.hidden = true;
                img.alt = item.label;
                img.referrerPolicy = 'no-referrer';
                img.addEventListener('load', function () {
                    if (!alive || !imageBox.contains(img)) return;
                    loading.remove();
                    img.hidden = false;
                    imageBox.setAttribute('aria-busy', 'false');
                });
                img.addEventListener('error', function () {
                    if (!alive || !imageBox.contains(img)) return;
                    imageBox.setAttribute('aria-busy', 'false');
                    imageBox.textContent = '';
                    element('p', 'vg-empty', 'No se pudo cargar esta imagen. El original permanece en el informe; no lo sustituimos por una imagen generada.', imageBox);
                    enlarge.disabled = true;
                });
                img.src = item.url;
            } else {
                imageBox.setAttribute('aria-busy', 'false');
                element('p', 'vg-empty', 'Imagen no disponible: el enlace del original no es válido.', imageBox);
            }
            filterButtons.forEach(function (entry) { entry.node.setAttribute('aria-pressed', String(entry.id === filter)); });
            strip.textContent = '';
            list.forEach(function (entry, index) {
                var thumb = button('', strip, function () { selected = index; render(); strip.children[index].focus(); }, 'vg-thumbnail');
                thumb.setAttribute('aria-label', entry.label);
                thumb.setAttribute('aria-pressed', String(index === selected));
                if (entry.url) {
                    var mini = element('img', '', '', thumb);
                    mini.alt = '';
                    mini.loading = 'lazy';
                    mini.referrerPolicy = 'no-referrer';
                    mini.src = entry.url;
                }
                element('span', '', entry.label, thumb);
            });
        }
        container.venusGalleryDestroy = function () {
            alive = false;
            doc.removeEventListener('keydown', keyboard);
            overlay.remove();
        };
        render();
    }
    root.VenusSkinGallery = { mount: mount, normalize: normalize, classify: classify, description: description };
}(typeof window !== 'undefined' ? window : this));
