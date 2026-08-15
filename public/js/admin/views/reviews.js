// Vista RESEÑAS del panel admin.
// Movida verbatim desde admin.html (paso 4 del refactor). Script clásico:
// funciones globales (window.*) -> los onclick="loadReviews()/filterReviews()"
// del HTML resuelven igual. reviewsCache/reviewsStats son estado privado de
// este script (solo lo usan estas funciones; verificado: sin refs externas).

    /* ===== RESEÑAS ===== */
    // Dorado AA para estrellas/histograma: ≥3:1 en AMBOS temas
    // (re-auditoría a11y: #f5a623 daba 1.74:1; 52% pasaba en claro pero daba
    // 2.47:1 sobre la tarjeta oscura — 58% da 3.73:1 claro / 3.18:1 oscuro,
    // verificado con cálculo WCAG). Estrella vacía: var(--line-strong).
    const REVIEWS_GOLD = 'oklch(58% 0.11 80)';
    let reviewsCache = [];
    let reviewsStats = {};

    async function loadReviews() {
      const listEl  = document.getElementById('reviews-list');
      const statsEl = document.getElementById('reviews-stats');
      listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);"><i class="fas fa-spinner fa-spin" style="font-size:28px;"></i></div>';

      try {
        const r = await apiFetch('/api/admin/reviews?limit=100');
        const d = await r.json();
        if (!d.success) throw new Error(d.error);

        reviewsCache = d.data;
        reviewsStats = d.stats;

        renderReviewsStats(d.stats);
        renderReviewsList(d.data);

        // Badge en sidebar
        const badge = document.getElementById('reviews-badge');
        if (badge) {
          const unread = d.data.filter(rev => !rev.replied).length;
          badge.textContent = unread;
          badge.style.display = unread > 0 ? '' : 'none';
        }

      } catch (e) {
        listEl.innerHTML = `<div style="text-align:center;padding:32px;color:var(--error);"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> ${e.message}</div>`;
      }
    }

    function renderReviewsStats(stats) {
      const el = document.getElementById('reviews-stats');
      if (!stats || !el) return;

      const stars = Math.round(stats.avgRating || 0);
      const starsHtml = Array.from({length:5}, (_,i) =>
        `<span style="color:${i < stars ? REVIEWS_GOLD : 'var(--line-strong)'}">★</span>`
      ).join('');

      // Histograma SIN tarjetas interiores (re-auditoría anti-patrones:
      // un solo nivel de superficie — tipografía + espaciado, sin chrome).
      el.innerHTML = `
        <div style="padding:14px;text-align:center;">
          <div style="font-size:32px;font-weight:700;color:${REVIEWS_GOLD};">${stats.avgRating || 0}</div>
          <div style="font-size:18px;margin:4px 0;">${starsHtml}</div>
          <div style="font-size:12px;color:var(--muted);">${stats.total} reseña${stats.total !== 1 ? 's' : ''}</div>
        </div>
        ${[5,4,3,2,1].map(n => {
          const count = (stats.dist || {})[n] || 0;
          const pct   = stats.total > 0 ? Math.round(count / stats.total * 100) : 0;
          return `
            <div style="padding:14px 4px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="font-size:16px;color:${REVIEWS_GOLD};">${'★'.repeat(n)}</span>
                <span style="font-size:12px;color:var(--muted);">${n} estrella${n>1?'s':''}</span>
              </div>
              <div style="background:var(--line);border-radius:4px;height:6px;margin-bottom:4px;">
                <div style="background:${REVIEWS_GOLD};height:6px;border-radius:4px;width:${pct}%;transition:width .4s;"></div>
              </div>
              <div style="font-size:12px;color:var(--muted);">${count} (${pct}%)</div>
            </div>`;
        }).join('')}
      `;
    }

    function renderReviewsList(list) {
      const el = document.getElementById('reviews-list');
      if (!list.length) {
        el.innerHTML = '<div style="text-align:center;padding:48px;color:var(--muted);"><i class="fas fa-star" style="font-size:36px;display:block;margin-bottom:12px;"></i>Aún no hay reseñas</div>';
        return;
      }
      el.innerHTML = list.map(rev => renderReviewCard(rev)).join('');
    }

    function renderReviewCard(rev) {
      const stars = Array.from({length:5}, (_,i) =>
        `<span style="color:${i < (rev.rating||0) ? REVIEWS_GOLD : 'var(--line-strong)'};font-size:18px;">★</span>`
      ).join('');

      const chipsHtml = (rev.highlights || []).map(h =>
        `<span style="background:var(--olive-soft);border:1px solid var(--line);border-radius:16px;padding:3px 10px;font-size:12px;color:var(--muted);">${h}</span>`
      ).join('');

      const dateStr = rev.createdAt
        ? new Date(rev.createdAt).toLocaleDateString('es-MX', {day:'numeric',month:'long',year:'numeric'})
        : '';

      const replyHtml = rev.replied
        ? `<div style="background:var(--olive-soft);border-radius:10px;padding:10px 14px;margin-top:10px;font-size:13px;color:var(--muted);">
             <strong style="color:var(--ink);"><i class="fas fa-reply" aria-hidden="true"></i> Respuesta Venus:</strong><br>${rev.reply}
           </div>`
        : `<div style="margin-top:10px;display:flex;gap:8px;">
             <input id="reply-input-${rev.id}" type="text" placeholder="Escribe una respuesta..." aria-label="Respuesta a la reseña" style="flex:1;border:1.5px solid var(--line-strong);border-radius:10px;padding:7px 12px;font-size:13px;outline:none;" />
             <button onclick="sendReviewReply('${rev.id}')" style="background:var(--olive-deep);color:#fff;border:none;border-radius:10px;padding:7px 14px;font-size:12px;cursor:pointer;font-weight:600;">Responder</button>
           </div>`;

      // Fila plana (sin tarjeta anidada dentro del section.card de Reseñas):
      // espaciado + regla inferior de 1px.
      return `
        <div style="padding:16px 4px;border-bottom:1px solid var(--line);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
                <span style="font-weight:700;font-size:15px;">${rev.clientName || 'Clienta'}</span>
                ${rev.replied ? '<span style="background:oklch(94% 0.022 120);color:oklch(40% 0.085 120);font-size:10px;font-weight:700;border-radius:8px;padding:2px 7px;"><i class="fas fa-check" aria-hidden="true"></i> Respondida</span>' : ''}
              </div>
              <div style="font-size:12px;color:var(--muted);">${rev.serviceName || ''} · ${dateStr}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div>${stars}</div>
              <button onclick="deleteReview('${rev.id}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;" title="Eliminar reseña" aria-label="Eliminar reseña">
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          </div>

          ${chipsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">${chipsHtml}</div>` : ''}

          ${rev.comment ? `<p style="margin-top:10px;font-size:14px;color:var(--ink);line-height:1.55;">${rev.comment}</p>` : ''}

          ${replyHtml}
        </div>`;
    }

    function filterReviews(val) {
      const filtered = val
        ? reviewsCache.filter(r => r.rating === parseInt(val))
        : reviewsCache;
      renderReviewsList(filtered);
    }

    async function sendReviewReply(id) {
      const input = document.getElementById(`reply-input-${id}`);
      const reply = (input?.value || '').trim();
      if (!reply) return;

      try {
        const r = await fetch(`/api/admin/reviews/${id}/reply`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ reply })
        });
        const d = await r.json();
        if (d.success) loadReviews();
        else alert('Error al responder: ' + d.error);
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }

    async function deleteReview(id) {
      if (!confirm('¿Eliminar esta reseña?')) return;
      try {
        await fetch(`/api/admin/reviews/${id}`, { method: 'DELETE', credentials: 'include' });
        loadReviews();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }

    // Cargar cuando se abre el tab
    document.addEventListener('DOMContentLoaded', () => {
      const reviewsBtn = document.querySelector('[data-tab="reviews"]');
      if (reviewsBtn) {
        reviewsBtn.addEventListener('click', () => loadReviews());
      }
    });