// Venus Cosmetología Landing Page - Booking Logic
let services = [];
let businessHours = { start: '09:00', end: '20:00', interval: 60, closedDays: [0] };
let businessConfig = {};
let selectedService = null;
let selectedDate = null;
let selectedTime = null;
let currentMonth = new Date();
let busySlots = {};
let whatsappUrl = '';
let currentCategory = null;
let expandedServiceList = false;

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await loadServices();
    renderCalendar();
    setupEventListeners();
    setupNavigation();
});

function setupNavigation() {
    // Smooth scroll
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // Mobile menu
    const mobileBtn = document.getElementById('mobile-menu-btn');
    if (mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            const links = document.querySelector('.nav-links');
            links.classList.toggle('active');
        });
    }

    // Navbar scroll effect
    window.addEventListener('scroll', () => {
        const nav = document.querySelector('nav');
        if (window.scrollY > 50) {
            nav.style.boxShadow = '0 5px 30px rgba(0,0,0,0.1)';
        } else {
            nav.style.boxShadow = '0 2px 20px rgba(0,0,0,0.05)';
        }
    });
}

function setupEventListeners() {
    document.getElementById('btn-prev-month')?.addEventListener('click', prevMonth);
    document.getElementById('btn-next-month')?.addEventListener('click', nextMonth);
    document.getElementById('btn-step1')?.addEventListener('click', () => goToStep(2));
    document.getElementById('btn-step2')?.addEventListener('click', () => goToStep(3));
    document.getElementById('btn-back-to-1')?.addEventListener('click', () => goToStep(1));
    document.getElementById('btn-back-to-2')?.addEventListener('click', () => goToStep(2));
    document.getElementById('btn-submit')?.addEventListener('click', submitRequest);
    document.getElementById('btn-whatsapp')?.addEventListener('click', openWhatsApp);
}

async function loadConfig() {
    try {
        const res = await fetch('/api/public/config');
        const json = await res.json();
        if (json.success && json.data) {
            businessConfig = json.data;
            if (json.data.businessHours) businessHours = json.data.businessHours;
        }
    } catch (e) {
        console.error('Error loading config:', e);
    }
}

async function loadServices() {
    try {
        const res = await fetch('/api/public/services');
        const json = await res.json();
        if (json.success) {
            services = json.data || [];
            renderServicesPreview();
            renderServices();
        }
    } catch (e) {
        document.getElementById('services-list').innerHTML = '<p style="color:#ef4444;">Error al cargar</p>';
    }
}

function renderServicesPreview() {
    const grid = document.getElementById('services-grid');
    if (!grid || services.length === 0) return;

    const groups = getServiceGroups().slice(0, 6);
    grid.innerHTML = groups.map((group, index) => {
        const names = group.services.slice(0, 3).map(s => `<li>${escapeHTML(s.name)}</li>`).join('');
        return `
        <div class="service-preview-card service-group-card" style="--i:${index}" onclick="scrollToCategory('${escapeAttr(group.category)}')">
            <div class="service-group-topline">
                <span>${group.count} opciones</span>
                <span>${group.priceRange}</span>
            </div>
            <h3>${escapeHTML(group.label)}</h3>
            <p>${escapeHTML(group.description)}</p>
            <ul>${names}</ul>
            <div class="meta">
                <span><i class="far fa-clock"></i> ${group.durationRange}</span>
                <span class="price">Ver opciones</span>
            </div>
        </div>
        `;
    }).join('') + `
        <div class="service-preview-card service-group-card cafe-preview-card" onclick="document.getElementById('cafeteria').scrollIntoView({behavior:'smooth'})">
            <div class="service-group-topline">
                <span>Nuevo</span>
                <span>Venus Café</span>
            </div>
            <h3>Cafetería como experiencia</h3>
            <p>Una pausa breve antes o después de tu cita, pensada para que la visita se sienta más completa.</p>
            <ul>
                <li>Bebidas calientes y frías.</li>
                <li>Paquetes para clientas de lealtad.</li>
                <li>Espera más cómoda para acompañantes.</li>
            </ul>
            <div class="meta">
                <span><i class="fas fa-mug-hot"></i> Propuesta</span>
                <span class="price">Ver café</span>
            </div>
        </div>
    `;
}

function scrollToBooking(serviceId) {
    const service = services.find(s => s.id === serviceId);
    if (service) {
        selectedService = service;
        currentCategory = service.category || 'Otros';
        renderServices();
        document.getElementById('btn-step1').disabled = false;
        updateSummary();
    }
    document.getElementById('agendar').scrollIntoView({ behavior: 'smooth' });
}

function scrollToCategory(category) {
    currentCategory = category;
    expandedServiceList = false;
    renderServices();
    document.getElementById('agendar')?.scrollIntoView({ behavior: 'smooth' });
}

function renderServices() {
    const el = document.getElementById('services-list');
    const tabsEl = document.getElementById('category-tabs');
    if (!el) return;

    if (services.length === 0) {
        el.innerHTML = '<p style="color:var(--muted);">No hay servicios disponibles</p>';
        return;
    }

    const categories = ['Todos', ...new Set(services.map(s => s.category || 'Otros'))];
    categories.splice(0, categories.length, 'Todos', ...sortCategories(categories.filter(cat => cat !== 'Todos')));

    if (!currentCategory) currentCategory = categories[1] || 'Todos';

    if (tabsEl) {
        tabsEl.innerHTML = categories.map(cat => `
            <button class="category-tab ${cat === currentCategory ? 'active' : ''}" onclick="setCategory('${cat}')">${cat}</button>
        `).join('');
    }

    const filtered = currentCategory === 'Todos' ? services : services.filter(s => (s.category || 'Otros') === currentCategory);
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    const limit = currentCategory === 'Todos' ? 10 : 8;
    const visible = expandedServiceList ? filtered : filtered.slice(0, limit);
    const hiddenCount = Math.max(filtered.length - visible.length, 0);

    el.innerHTML = `
        <div class="services-list-summary">
            <strong>${filtered.length} servicios en ${escapeHTML(currentCategory)}</strong>
            <span>Mostramos primero las opciones más fáciles de comparar. Puedes abrir la lista completa si ya sabes qué buscar.</span>
        </div>
        ${visible.map(s => `
        <div class="service-item ${selectedService?.id === s.id ? 'selected' : ''}" data-id="${escapeAttr(s.id)}" onclick="selectService('${escapeAttr(s.id)}')">
            <div class="service-name">${escapeHTML(s.name)}</div>
            <div class="service-meta-row">
                <span class="service-duration"><i class="far fa-clock"></i> ${s.durationMinutes || s.duration}m</span>
                <span class="service-price">$${s.price}</span>
            </div>
            ${s.discount ? `<p class="service-note">${escapeHTML(s.discount)}</p>` : ''}
        </div>
        `).join('')}
        ${hiddenCount ? `<button class="show-more-services" type="button" onclick="toggleServicesList()">Ver ${hiddenCount} servicios más</button>` : ''}
    `;
}

window.setCategory = function (cat) {
    currentCategory = cat;
    expandedServiceList = false;
    renderServices();
};

window.selectService = function (id) {
    document.querySelectorAll('.service-item').forEach(e => e.classList.remove('selected'));
    const el = document.querySelector(`.service-item[data-id="${cssEscape(id)}"]`);
    if (el) el.classList.add('selected');
    selectedService = services.find(s => s.id === id);
    document.getElementById('btn-step1').disabled = false;
    updateSummary();
};

window.toggleServicesList = function () {
    expandedServiceList = true;
    renderServices();
};

window.scrollToBooking = scrollToBooking;
window.scrollToCategory = scrollToCategory;

function getServiceGroups() {
    const map = new Map();
    services.forEach(service => {
        const category = service.category || 'Otros';
        if (!map.has(category)) map.set(category, []);
        map.get(category).push(service);
    });

    return sortCategories([...map.keys()]).map(category => {
        const list = map.get(category).slice().sort((a, b) => a.name.localeCompare(b.name));
        const prices = list.map(s => Number(s.price)).filter(n => !Number.isNaN(n));
        const durations = list.map(s => Number(s.durationMinutes || s.duration)).filter(n => !Number.isNaN(n));
        return {
            category,
            label: categoryLabel(category),
            description: categoryDescription(category),
            services: list,
            count: list.length,
            priceRange: rangeLabel(prices, '$'),
            durationRange: rangeLabel(durations, '', 'min')
        };
    });
}

function sortCategories(categories) {
    const catOrder = ['Faciales', 'Corporales', 'Depilación', 'Masajes', 'Paquetes', 'Cafetería', 'Cafe', 'Café', 'Otros'];
    return categories.sort((a, b) => {
        const ia = catOrder.indexOf(a), ib = catOrder.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });
}

function categoryLabel(category) {
    const normalized = category.toLowerCase();
    if (normalized.includes('facial')) return 'Piel y faciales';
    if (normalized.includes('corporal')) return 'Cuerpo y moldeado';
    if (normalized.includes('depi')) return 'Depilación';
    if (normalized.includes('masaje')) return 'Masajes y pausa';
    if (normalized.includes('paquete')) return 'Paquetes Venus';
    if (normalized.includes('cafe') || normalized.includes('café')) return 'Venus Café';
    return category;
}

function categoryDescription(category) {
    const normalized = category.toLowerCase();
    if (normalized.includes('facial')) return 'Limpieza, luminosidad, acné, textura y protocolos personalizados.';
    if (normalized.includes('corporal')) return 'Opciones para zonas específicas, cuidado corporal y seguimiento.';
    if (normalized.includes('depi')) return 'Servicios claros por zona para elegir sin revisar toda la lista.';
    if (normalized.includes('masaje')) return 'Tratamientos para bajar tensión y cerrar la visita con calma.';
    if (normalized.includes('paquete')) return 'Combinaciones listas para decidir rápido y regalar mejor.';
    if (normalized.includes('cafe') || normalized.includes('café')) return 'Bebidas y pausas para acompañar la experiencia.';
    return 'Servicios agrupados para comparar por intención, duración y precio.';
}

function rangeLabel(values, prefix = '', suffix = '') {
    if (!values.length) return 'Consultar';
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) return `${prefix}${min}${suffix}`;
    return `${prefix}${min}-${prefix}${max}${suffix}`;
}

function escapeHTML(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function escapeAttr(value = '') {
    return escapeHTML(value).replace(/`/g, '&#096;');
}

function cssEscape(value = '') {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, '\\$&');
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    document.getElementById('calendar-month').textContent = `${MONTHS[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    let html = DAYS.map(d => `<div class="day-name">${d}</div>`).join('');
    for (let i = 0; i < firstDay; i++) html += '<div class="day empty"></div>';

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dateStr = formatDateISO(date);
        const isPast = date < today;
        const isClosed = businessHours.closedDays?.includes(date.getDay());
        const isToday = date.toDateString() === today.toDateString();
        const isSelected = selectedDate === dateStr;

        let cls = 'day';
        if (isToday) cls += ' today';
        if (isSelected) cls += ' selected';
        if (isPast || isClosed) cls += ' disabled';

        html += `<div class="${cls}" data-date="${dateStr}">${d}</div>`;
    }

    grid.innerHTML = html;

    grid.querySelectorAll('.day:not(.disabled):not(.empty)').forEach(day => {
        day.addEventListener('click', function () {
            if (this.dataset.date) selectDate(this.dataset.date);
        });
    });
}

function prevMonth() {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderCalendar();
}

async function selectDate(dateStr) {
    selectedDate = dateStr;
    selectedTime = null;
    document.getElementById('btn-step2').disabled = true;
    renderCalendar();

    document.getElementById('time-grid').innerHTML = '<p class="time-placeholder">Cargando...</p>';

    try {
        const res = await fetch(`/api/public/availability?date=${dateStr}`);
        const json = await res.json();
        busySlots[dateStr] = json.success ? json.busy : [];
    } catch (e) {
        busySlots[dateStr] = [];
    }

    renderTimeSlots(dateStr);
    updateSummary();
}

function renderTimeSlots(dateStr) {
    const busy = busySlots[dateStr] || [];
    const date = new Date(dateStr + 'T00:00:00');
    document.getElementById('time-title').textContent = date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });

    const startH = parseInt(businessHours.start?.split(':')[0]) || 9;
    const endH = parseInt(businessHours.end?.split(':')[0]) || 20;

    let html = '';
    for (let h = startH; h < endH; h++) {
        const time = `${h.toString().padStart(2, '0')}:00`;
        const display = h === 12 ? '12:00 PM' : h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`;
        const isBusy = busy.includes(time);
        html += `<div class="time-slot ${isBusy ? 'disabled' : ''}" data-time="${time}">${display}</div>`;
    }

    document.getElementById('time-grid').innerHTML = html;

    document.querySelectorAll('.time-slot:not(.disabled)').forEach(slot => {
        slot.addEventListener('click', function () {
            selectTime(this.dataset.time, this);
        });
    });
}

function selectTime(time, el) {
    document.querySelectorAll('.time-slot').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    selectedTime = time;
    document.getElementById('btn-step2').disabled = false;
    updateSummary();
}

function updateSummary() {
    if (selectedService) {
        document.getElementById('sum-service').textContent = selectedService.name;
        document.getElementById('sum-price').textContent = '$' + selectedService.price;
    }
    if (selectedDate) {
        const d = new Date(selectedDate + 'T00:00:00');
        document.getElementById('sum-date').textContent = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    if (selectedTime) {
        const h = parseInt(selectedTime.split(':')[0]);
        document.getElementById('sum-time').textContent = h === 12 ? '12:00 PM' : h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`;
    }
}

async function submitRequest() {
    const name = document.getElementById('input-name').value.trim();
    const phone = document.getElementById('input-phone').value.trim().replace(/\D/g, '');
    const email = document.getElementById('input-email').value.trim();
    const birthday = document.getElementById('input-birthday').value;

    if (!name) { alert('Ingresa tu nombre'); return; }
    if (phone.length < 10) { alert('Ingresa tu WhatsApp (10 dígitos)'); return; }

    const btn = document.getElementById('btn-submit');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;display:inline-block;margin-right:8px;"></div> Enviando...';

    try {
        const res = await fetch('/api/public/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serviceId: selectedService.id,
                serviceName: selectedService.name,
                servicePrice: selectedService.price,
                serviceDuration: selectedService.durationMinutes || selectedService.duration,
                date: selectedDate,
                time: selectedTime,
                clientName: name,
                clientPhone: phone,
                clientEmail: email || null,
                clientBirthday: birthday || null
            })
        });

        const json = await res.json();
        if (json.success) {
            whatsappUrl = json.whatsappUrl;
            showConfirmation();
        } else {
            alert('Error: ' + json.error);
            btn.disabled = false;
            btn.innerHTML = 'Solicitar <i class="fas fa-paper-plane"></i>';
        }
    } catch (e) {
        alert('Error de conexión');
        btn.disabled = false;
        btn.innerHTML = 'Solicitar <i class="fas fa-paper-plane"></i>';
    }
}

function showConfirmation() {
    document.getElementById('conf-service').textContent = selectedService.name;
    document.getElementById('conf-price').textContent = '$' + selectedService.price;

    const d = new Date(selectedDate + 'T00:00:00');
    const h = parseInt(selectedTime.split(':')[0]);
    const timeStr = h === 12 ? '12:00 PM' : h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`;
    document.getElementById('conf-datetime').textContent = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }) + ', ' + timeStr;

    goToStep(4);
}

function openWhatsApp() {
    if (whatsappUrl) window.open(whatsappUrl, '_blank');
}

function goToStep(n) {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    document.getElementById(`step-${n}`).classList.add('active');

    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById(`dot-${i}`);
        dot.className = 'progress-dot';
        if (i < n) dot.classList.add('completed');
        else if (i === n) dot.classList.add('active');
    }

    document.getElementById('agendar').scrollIntoView({ behavior: 'smooth' });
}

function formatDateISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
