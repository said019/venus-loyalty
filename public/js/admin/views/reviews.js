// Vista RESEÑAS del panel admin.
// Movida verbatim desde admin.html (paso 4 del refactor). Script clásico:
// funciones globales (window.*) -> los onclick="loadReviews()/filterReviews()"
// del HTML resuelven igual. reviewsCache/reviewsStats son estado privado de
// este script (solo lo usan estas funciones; verificado: sin refs externas).

    /* ===== RESEÑAS ===== */
    let reviewsCache = [];
    let reviewsStats = {};

    async function loadReviews() {
      const listEl  = document.getElementById('reviews-list');
      const statsEl = document.getElementById('reviews-stats');
      listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa;"><i class="fas fa-spinner fa-spin" style="font-size:28px;"></i></div>';

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
        listEl.innerHTML = `<div style="text-align:center;padding:32px;color:#e74c3c;">❌ ${e.message}</div>`;
      }
    }

    function renderReviewsStats(stats) {
      const el = document.getElementById('reviews-stats');
      if (!stats || !el) return;

      const stars = Math.round(stats.avgRating || 0);
      const starsHtml = Array.from({length:5}, (_,i) =>
        `<span style="color:${i < stars ? '#f5a623' : '#ddd'}">★</span>`
      ).join('');

      el.innerHTML = `
        <div style="background:linear-gradient(135deg,#f5a62320,#f5a62308);border:1px solid #f5a62330;border-radius:14px;padding:16px;text-align:center;">
          <div style="font-size:32px;font-weight:700;color:#f5a623;">${stats.avgRating || 0}</div>
          <div style="font-size:18px;margin:4px 0;">${starsHtml}</div>
          <div style="font-size:12px;color:#888;">${stats.total} reseña${stats.total !== 1 ? 's' : ''}</div>
        </div>
        ${[5,4,3,2,1].map(n => {
          const count = (stats.dist || {})[n] || 0;
          const pct   = stats.total > 0 ? Math.round(count / stats.total * 100) : 0;
          return `
            <div style="background:#fff;border:1px solid #f0ece8;border-radius:14px;padding:14px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="font-size:16px;color:#f5a623;">${'★'.repeat(n)}</span>
                <span style="font-size:12px;color:#aaa;">${n} estrella${n>1?'s':''}</span>
              </div>
              <div style="background:#f0ece8;border-radius:4px;height:6px;margin-bottom:4px;">
                <div style="background:#f5a623;height:6px;border-radius:4px;width:${pct}%;transition:width .4s;"></div>
              </div>
              <div style="font-size:12px;color:#888;">${count} (${pct}%)</div>
            </div>`;
        }).join('')}
      `;
    }

    function renderReviewsList(list) {
      const el = document.getElementById('reviews-list');
      if (!list.length) {
        el.innerHTML = '<div style="text-align:center;padding:48px;color:#ccc;"><i class="fas fa-star" style="font-size:36px;display:block;margin-bottom:12px;"></i>Aún no hay reseñas</div>';
        return;
      }
      el.innerHTML = list.map(rev => renderReviewCard(rev)).join('');
    }

    function renderReviewCard(rev) {
      const stars = Array.from({length:5}, (_,i) =>
        `<span style="color:${i < (rev.rating||0) ? '#f5a623' : '#ddd'};font-size:18px;">★</span>`
      ).join('');

      const chipsHtml = (rev.highlights || []).map(h =>
        `<span style="background:#f5f0eb;border:1px solid #e8e0d8;border-radius:16px;padding:3px 10px;font-size:12px;color:#666;">${h}</span>`
      ).join('');

      const dateStr = rev.createdAt
        ? new Date(rev.createdAt).toLocaleDateString('es-MX', {day:'numeric',month:'long',year:'numeric'})
        : '';

      const replyHtml = rev.replied
        ? `<div style="background:#f5f0eb;border-left:3px solid #9A9F82;border-radius:0 10px 10px 0;padding:10px 14px;margin-top:10px;font-size:13px;color:#555;">
             <strong style="color:#9A9F82;">💬 Respuesta Venus:</strong><br>${rev.reply}
           </div>`
        : `<div style="margin-top:10px;display:flex;gap:8px;">
             <input id="reply-input-${rev.id}" type="text" placeholder="Escribe una respuesta..." style="flex:1;border:1.5px solid #e8e0d8;border-radius:10px;padding:7px 12px;font-size:13px;outline:none;" />
             <button onclick="sendReviewReply('${rev.id}')" style="background:#9A9F82;color:#fff;border:none;border-radius:10px;padding:7px 14px;font-size:12px;cursor:pointer;font-weight:600;">Responder</button>
           </div>`;

      return `
        <div style="background:#fff;border:1px solid #f0ece8;border-radius:16px;padding:18px 20px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
                <span style="font-weight:700;font-size:15px;">${rev.clientName || 'Clienta'}</span>
                ${rev.replied ? '<span style="background:#e8f5e9;color:#27ae60;font-size:10px;font-weight:700;border-radius:8px;padding:2px 7px;">✓ Respondida</span>' : ''}
              </div>
              <div style="font-size:12px;color:#aaa;">${rev.serviceName || ''} · ${dateStr}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div>${stars}</div>
              <button onclick="deleteReview('${rev.id}')" style="background:none;border:none;color:#ccc;cursor:pointer;font-size:13px;" title="Eliminar">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>

          ${chipsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">${chipsHtml}</div>` : ''}

          ${rev.comment ? `<p style="margin-top:10px;font-size:14px;color:#444;line-height:1.55;">${rev.comment}</p>` : ''}

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
        else alert('❌ Error al responder: ' + d.error);
      } catch (e) {
        alert('❌ ' + e.message);
      }
    }

    async function deleteReview(id) {
      if (!confirm('¿Eliminar esta reseña?')) return;
      try {
        await fetch(`/api/admin/reviews/${id}`, { method: 'DELETE', credentials: 'include' });
        loadReviews();
      } catch (e) {
        alert('❌ ' + e.message);
      }
    }

    // Cargar cuando se abre el tab
    document.addEventListener('DOMContentLoaded', () => {
      const reviewsBtn = document.querySelector('[data-tab="reviews"]');
      if (reviewsBtn) {
        reviewsBtn.addEventListener('click', () => loadReviews());
      }
    });