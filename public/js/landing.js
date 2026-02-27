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
            links.style.display = links.style.display === 'flex' ? 'none' : 'flex';
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

    // Mapeo de categorías a filtros y datos visuales
    const categoryMap = {
        'Básicos Venus':  { filter: 'facial',     icon: 'fas fa-spa',           color: '#8C9668' },
        'Especializados': { filter: 'facial',     icon: 'fas fa-star',           color: '#6b7a4e' },
        'Corporales':     { filter: 'corporal',   icon: 'fas fa-hand-sparkles',  color: '#C4A77D' },
        'Holísticos':     { filter: 'holistico',  icon: 'fas fa-yin-yang',       color: '#a8b485' },
        'Paquetes':       { filter: 'paquetes',   icon: 'fas fa-gift',           color: '#D4C5B9' },
        'Depilación':     { filter: 'depilacion', icon: 'fas fa-feather-alt',    color: '#8C9668' },
    };

    const categoryOrder = ['Básicos Venus', 'Especializados', 'Corporales', 'Holísticos', 'Paquetes', 'Depilación'];

    // Agrupar por categoría
    const grouped = {};
    services.forEach(s => {
        const cat = s.category || 'Otros';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(s);
    });

    const sortedCategories = Object.keys(grouped).sort((a, b) => {
        const ia = categoryOrder.indexOf(a), ib = categoryOrder.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1; if (ib === -1) return -1;
        return ia - ib;
    });

    // Generar cards
    let allCards = '';
    sortedCategories.forEach(cat => {
        const meta = categoryMap[cat] || { filter: 'otros', icon: 'fas fa-concierge-bell', color: '#8C9668' };
        const catServices = grouped[cat].sort((a, b) => a.name.localeCompare(b.name));

        catServices.forEach(s => {
            const price = s.price ? `$${Math.round(s.price)}` : 'Consultar';
            const duration = s.durationMinutes || s.duration || '';
            const desc = s.description || '';
            allCards += `
                <div class="service-card-new" data-filter="${meta.filter}" onclick="scrollToBooking('${s.id}')">
                    <div class="service-card-accent" style="background:${meta.color}"></div>
                    <div class="service-card-icon-wrap" style="background:${meta.color}15;border-color:${meta.color}30">
                        <i class="${meta.icon}" style="color:${meta.color}"></i>
                    </div>
                    <div class="service-card-body">
                        <span class="service-card-category">${cat}</span>
                        <h3 class="service-card-name">${s.name}</h3>
                        ${desc ? `<p class="service-card-description">${desc.length > 80 ? desc.slice(0, 80) + '…' : desc}</p>` : ''}
                        <div class="service-card-footer">
                            <div class="service-card-meta">
                                ${duration ? `<span class="service-meta-pill"><i class="far fa-clock"></i> ${duration} min</span>` : ''}
                                <span class="service-meta-price">${price}</span>
                            </div>
                            <button class="service-card-btn">
                                Agendar <i class="fas fa-arrow-right"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    });

    grid.innerHTML = allCards || '<p style="color:var(--muted);text-align:center;padding:2rem;">No hay servicios disponibles</p>';

    // Activar filtros
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.dataset.filter;
            document.querySelectorAll('.service-card-new').forEach(card => {
                if (filter === 'all' || card.dataset.filter === filter) {
                    card.style.display = '';
                    card.style.animation = 'fadeInUp 0.4s ease both';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });
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

function renderServices() {
    const el = document.getElementById('services-list');
    const tabsEl = document.getElementById('category-tabs');
    if (!el) return;

    if (services.length === 0) {
        el.innerHTML = '<p style="color:var(--muted);">No hay servicios disponibles</p>';
        return;
    }

    const categories = ['Todos', ...new Set(services.map(s => s.category || 'Otros'))];
    const catOrder = ['Todos', 'Básicos Venus', 'Especializados', 'Corporales', 'Holísticos', 'Paquetes', 'Depilación', 'Otros'];
    categories.sort((a, b) => {
        const ia = catOrder.indexOf(a), ib = catOrder.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

    if (!currentCategory) currentCategory = categories[1] || 'Todos';

    if (tabsEl) {
        tabsEl.innerHTML = categories.map(cat => `
            <button class="category-tab ${cat === currentCategory ? 'active' : ''}" onclick="setCategory('${cat}')">${cat}</button>
        `).join('');
    }

    const filtered = currentCategory === 'Todos' ? services : services.filter(s => (s.category || 'Otros') === currentCategory);
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    el.innerHTML = filtered.map(s => `
        <div class="service-item ${selectedService?.id === s.id ? 'selected' : ''}" onclick="selectService('${s.id}')">
            <div class="service-name">${s.name}</div>
            ${s.description ? `<div class="service-desc-booking">${s.description}</div>` : ''}
            <div class="service-meta-row">
                <span class="service-duration"><i class="far fa-clock"></i> ${s.durationMinutes || s.duration}m</span>
                <span class="service-price">$${Math.round(s.price)}</span>
            </div>
        </div>
    `).join('');
}

window.setCategory = function (cat) {
    currentCategory = cat;
    renderServices();
};

window.selectService = function (id) {
    document.querySelectorAll('.service-item').forEach(e => e.classList.remove('selected'));
    const el = document.querySelector(`.service-item[onclick*="${id}"]`);
    if (el) el.classList.add('selected');
    selectedService = services.find(s => s.id === id);
    document.getElementById('btn-step1').disabled = false;
    updateSummary();
};

window.scrollToBooking = scrollToBooking;

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
