import cron from 'node-cron';
import { AppointmentModel } from '../models/index.js';
import { WhatsAppService } from '../services/whatsapp-v2.js';
import { prisma } from '../db/index.js';
import { NotificationsRepo } from '../db/repositories.js';
import { config } from '../config/config.js';
import { reconcilePollVotes, normalizePhone } from '../services/pollVotes.js';

/**
 * Obtiene la fecha de mañana en formato YYYY-MM-DD en hora de México
 */
function getTomorrowDateMexico() {
    const now = new Date();
    // Convertir a hora de México (UTC-6)
    const mexicoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    mexicoNow.setDate(mexicoNow.getDate() + 1);
    const y = mexicoNow.getFullYear();
    const m = String(mexicoNow.getMonth() + 1).padStart(2, '0');
    const d = String(mexicoNow.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Obtiene la fecha de hoy en formato YYYY-MM-DD en hora de México
 */
function getTodayDateMexico() {
    const now = new Date();
    const mexicoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    const y = mexicoNow.getFullYear();
    const m = String(mexicoNow.getMonth() + 1).padStart(2, '0');
    const d = String(mexicoNow.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Obtiene la hora actual en México como número (ej: 9, 14, 20)
 */
function getCurrentHourMexico() {
    const now = new Date();
    const mexicoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    return mexicoNow.getHours();
}

// Interruptor de la cadena de confirmación automática: encuesta → alerta 4h →
// auto-cancelación (las 3 patas van juntas: sin encuesta nadie puede confirmar
// y el auto-cancel borraría citas). Se apagó el 2026-07-10 y Said pidió
// regresarla el 2026-07-11 ("si tiene que llevar encuesta"): queda ACTIVA.
const AUTO_CONFIRMACION_ACTIVA = true;

// Interruptor del mensaje de evaluación/reseña post-cita (spec
// 2026-07-16-desactivar-mensaje-resenas-design.md; Said lo pidió el 17-jul:
// "quita los mensajes de evaluación"). Apagado: el cron de reseñas sale antes
// de consultar citas o llamar a Evolution. Las reseñas existentes, la página
// pública y el panel siguen intactos; citas con reviewSentAt no se tocan.
const RESENAS_AUTO_ACTIVAS = false;

export function startScheduler() {
    console.log('⏰ Scheduler de recordatorios WhatsApp iniciado');
    if (!AUTO_CONFIRMACION_ACTIVA) console.log('🔕 Cadena de confirmación automática (encuesta 9AM / alerta 4h / auto-cancel) DESACTIVADA');
    if (!RESENAS_AUTO_ACTIVAS) console.log('🔕 Envío automático de link de evaluación/reseña post-cita DESACTIVADO');

    // Helper para convertir a ISO con offset de México (-06:00)
    const toMexicoCityISO = (date) => {
        const ts = date.getTime();
        const mexicoOffset = 6 * 60 * 60 * 1000;
        const localDate = new Date(ts - mexicoOffset);
        return localDate.toISOString().replace('Z', '-06:00');
    };

    // ========================================================================
    // RECONCILIACIÓN DE VOTOS DE ENCUESTA — cada 3 min
    // Evolution descifra y guarda los votos en su store pero NO los empuja al
    // webhook de forma confiable. Barremos el store y confirmamos/cancelamos/
    // reagendamos según el voto. Idempotente y sin enviar mensajes a clientas.
    // ========================================================================
    cron.schedule('*/3 * * * *', async () => {
        try {
            const { changes } = await reconcilePollVotes({ apply: true });
            if (changes.length > 0) {
                console.log(`🗳️ [reconcile] ${changes.length} cita(s) actualizada(s) por voto de encuesta:`,
                    changes.map(c => `${c.client}→${c.to}`).join(', '));
                for (const c of changes) {
                    const tipo = c.to === 'confirmed' ? 'cita' : 'alerta';
                    const icon = c.to === 'confirmed' ? 'calendar-check' : (c.to === 'cancelled' ? 'calendar-times' : 'calendar-alt');
                    const title = c.to === 'confirmed' ? 'Cita confirmada' : (c.to === 'cancelled' ? 'Cita cancelada' : 'Solicitud de reagendamiento');
                    await NotificationsRepo.create({
                        type: tipo, icon, title,
                        message: `${c.client} ${c.to === 'confirmed' ? 'confirmó' : (c.to === 'cancelled' ? 'canceló' : 'quiere reagendar')} ${c.service} (encuesta)`,
                        read: false, entityId: c.appointmentId
                    }).catch(() => {});
                }
            }
        } catch (err) {
            console.error('❌ [reconcile] Error reconciliando votos:', err.message);
        }
    });

    // ========================================================================
    // ENCUESTA DE CONFIRMACIÓN — 9:00 AM hora México para citas de MAÑANA
    // Agrupa por teléfono para no mandar múltiples mensajes al mismo cliente
    // ========================================================================
    // 15-23 UTC = 9AM-5PM México, cada hora. La query es idempotente
    // (sent24hAt null → se marca al enviar), así que las corridas extra solo
    // recuperan encuestas que la de las 9AM no alcanzó a mandar (deploy caído,
    // server dormido, o el apagón del 10-11 jul 2026).
    cron.schedule('0 15-23 * * *', async () => {
        if (!AUTO_CONFIRMACION_ACTIVA) return;
        console.log('📋 [9AM] Enviando encuestas de confirmación para citas de mañana...');

        try {
            const tomorrow = getTomorrowDateMexico();
            console.log(`📅 [9AM] Fecha de mañana (México): ${tomorrow}`);

            // Buscar citas de mañana que tengan sendWhatsApp24h=true y no se hayan enviado
            const pendingAppts = await prisma.appointment.findMany({
                where: {
                    date: tomorrow,
                    sendWhatsApp24h: true,
                    sent24hAt: null,
                    status: { in: ['scheduled', 'confirmed'] }
                },
                orderBy: { startDateTime: 'asc' }
            });

            console.log(`📅 [9AM] ${pendingAppts.length} citas pendientes de encuesta para ${tomorrow}`);

            // Agrupar por teléfono NORMALIZADO (521/52/10 dígitos): sin esto la
            // misma clienta guardada con y sin lada recibía dos encuestas.
            const byPhone = new Map();
            for (const appt of pendingAppts) {
                const phone = normalizePhone(appt.clientPhone);
                if (!byPhone.has(phone)) {
                    byPhone.set(phone, []);
                }
                byPhone.get(phone).push(appt);
            }

            for (const [phone, appts] of byPhone) {
                try {
                    if (appts.length === 1) {
                        // 1 sola cita → encuesta normal con poll
                        const result = await WhatsAppService.sendReminder24h(appts[0]);
                        if (result.success) {
                            await prisma.appointment.update({
                                where: { id: appts[0].id },
                                data: { sent24hAt: new Date() }
                            });
                            console.log(`✅ [9AM] Encuesta enviada a ${appts[0].clientName}`);
                        }
                    } else {
                        // Múltiples citas → 1 mensaje consolidado + 1 poll
                        const nombre = appts[0].clientName;
                        const citasTexto = appts.map(a => `  • *${a.serviceName}* a las *${a.time}*`).join('\n');
                        const fecha = WhatsAppService.formatearFechaLegible(appts[0].date);
                        const mensaje = `Hola ${nombre} 👋\n\nQueremos confirmar tu asistencia para el *${fecha}*:\n\n${citasTexto}\n\n📍 *Lugar:* ${config.venus.location}`;

                        const { sendPollViaEvolution, sendViaEvolution } = await import('../services/whatsapp-v2.js');
                        const { getEvolutionClient } = await import('../services/whatsapp-evolution.js');
                        const evo = getEvolutionClient();

                        // Enviar texto con detalle
                        await evo.sendText(appts[0].clientPhone, mensaje);
                        await new Promise(r => setTimeout(r, 1000));

                        // Enviar poll referenciando la primera cita
                        try {
                            const pollResult = await evo.sendPoll(
                                appts[0].clientPhone,
                                '¿Nos confirmas tu asistencia?',
                                ['Confirmar asistencia', 'Reagendar', 'Cancelar'],
                                1
                            );

                            // Guardar mapeo poll→cita para TODAS las citas del grupo
                            const pollMsgId = pollResult?.key?.id || pollResult?.message?.key?.id || null;
                            if (!pollMsgId) console.warn('[9AM] sendPoll consolidado SIN key.id — sin mapeo poll→cita. Shape:', JSON.stringify(pollResult || {}).slice(0, 300));
                            const pollOpts = ['Confirmar asistencia', 'Reagendar', 'Cancelar'];
                            if (pollMsgId) {
                                for (const a of appts) {
                                    try {
                                        await prisma.pendingPoll.create({
                                            data: {
                                                id: `${pollMsgId}_${a.id}`,
                                                appointmentId: a.id,
                                                phone: a.clientPhone,
                                                options: JSON.stringify(pollOpts),
                                                expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
                                            }
                                        });
                                    } catch (e) {
                                        // Solo los duplicados (P2002) son esperables; cualquier otro
                                        // error deja la cita SIN mapeo poll→cita y hay que saberlo.
                                        if (e?.code !== 'P2002') console.error('[9AM] pendingPoll consolidado NO guardado para cita', a.id, ':', e.message);
                                    }
                                }
                            }
                        } catch (pollErr) {
                            console.warn('[9AM] Error enviando poll consolidado:', pollErr.message);
                        }

                        // Marcar todas como enviadas
                        for (const a of appts) {
                            await prisma.appointment.update({
                                where: { id: a.id },
                                data: { sent24hAt: new Date() }
                            });
                        }
                        console.log(`✅ [9AM] Encuesta consolidada enviada a ${nombre} (${appts.length} citas)`);
                    }
                } catch (err) {
                    console.error(`❌ [9AM] Error enviando encuesta a ${phone}:`, err.message);
                }
            }
        } catch (error) {
            console.error('❌ Error en scheduler 9AM encuestas:', error);
        }
    });

    // ========================================================================
    // INDICACIONES DEPILACIÓN 48H — cada hora, ventana 47-49h
    // Solo envía 1 mensaje por teléfono aunque tenga múltiples citas de depilación
    // ========================================================================
    cron.schedule('0 * * * *', async () => {
        const now = new Date();

        try {
            const date48hStart = new Date(now.getTime() + 47 * 60 * 60 * 1000);
            const date48hEnd = new Date(now.getTime() + 49 * 60 * 60 * 1000);

            const start48h = toMexicoCityISO(date48hStart);
            const end48h = toMexicoCityISO(date48hEnd);

            const pending48h = await AppointmentModel.getPendingReminders('send48h', start48h, end48h);
            console.log(`📅 Encontrados ${pending48h.length} recordatorios 48h depilación pendientes`);

            // Agrupar por teléfono para evitar duplicados
            const byPhone48 = new Map();
            for (const appt of pending48h) {
                if (appt.status === 'cancelled') continue;
                const phone = (appt.clientPhone || '').replace(/\D/g, '');
                if (!byPhone48.has(phone)) {
                    byPhone48.set(phone, []);
                }
                byPhone48.get(phone).push(appt);
            }

            for (const [phone, appts] of byPhone48) {
                // Enviar instrucciones solo 1 vez (usando la primera cita del grupo)
                const result = await WhatsAppService.sendReminderDepilacion48h(appts[0]);
                if (result.success) {
                    // Marcar TODAS las citas del grupo como enviadas
                    for (const a of appts) {
                        await AppointmentModel.markReminderSent(a.id, '48h');
                    }
                    console.log(`✅ Recordatorio 48h depilación enviado a ${appts[0].clientName} (${appts.length} citas)`);
                }
            }
        } catch (error) {
            console.error('❌ Error en scheduler 48h depilación:', error);
        }
    });

    // ========================================================================
    // RECORDATORIO 2 HORAS — cada hora, ventana 1h50m-2h10m
    // ========================================================================
    cron.schedule('0 * * * *', async () => {
        const now = new Date();

        try {
            const date2hStart = new Date(now.getTime() + 1 * 60 * 60 * 1000 + 50 * 60 * 1000);
            const date2hEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000 + 10 * 60 * 1000);

            const start2h = toMexicoCityISO(date2hStart);
            const end2h = toMexicoCityISO(date2hEnd);

            const pending2h = await AppointmentModel.getPendingReminders('send2h', start2h, end2h);
            console.log(`📅 Encontrados ${pending2h.length} recordatorios 2h pendientes`);

            for (const appt of pending2h) {
                if (appt.status !== 'cancelled') {
                    const result = await WhatsAppService.sendReminder2h(appt);
                    if (result.success) {
                        await AppointmentModel.markReminderSent(appt.id, '2h');
                        console.log(`✅ Recordatorio 2h enviado para cita ${appt.id}`);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error en scheduler 2h:', error);
        }
    });

    // ========================================================================
    // ALERTA 4H: Confirmar o se cancela — cada 10 min
    // Solo envía si la cita sigue en 'scheduled' (no si ya está confirmed)
    // ========================================================================
    cron.schedule('*/10 * * * *', async () => {
        if (!AUTO_CONFIRMACION_ACTIVA) return;
        const now = new Date();

        try {
            const rangeStart = toMexicoCityISO(new Date(now.getTime() + 3 * 60 * 60 * 1000 + 50 * 60 * 1000));
            const rangeEnd = toMexicoCityISO(new Date(now.getTime() + 4 * 60 * 60 * 1000 + 10 * 60 * 1000));

            const pendingAlerts = await AppointmentModel.getPendingConfirmationAlert(rangeStart, rangeEnd);

            if (pendingAlerts.length > 0) {
                console.log(`⚠️ [4h-alert] ${pendingAlerts.length} citas sin confirmar — barrido de votos + alerta`);
                // Antes de molestar con "Confirmación pendiente": barrer votos del
                // store. Si la clienta YA votó y el webhook lo perdió, el barrido
                // la confirma (y le manda acuse) y abajo saltamos su alerta.
                // Pasó con Francisca Reyes (10 jul): votó "Confirmar" y a las 4h
                // le llegó la amenaza de cancelación de todos modos.
                try { await reconcilePollVotes({ apply: true }); }
                catch (e) { console.warn('[4h-alert] barrido de votos falló (sigo con alertas):', e.message); }
            }

            for (const appt of pendingAlerts) {
                // Re-verificar contra la DB: el barrido de arriba (o el webhook en
                // paralelo) pudo haberla confirmado hace un instante.
                try {
                    const fresh = await prisma.appointment.findUnique({
                        where: { id: appt.id }, select: { status: true }
                    });
                    if (!fresh || fresh.status !== 'scheduled') {
                        console.log(`✅ [4h-alert] ${appt.clientName} ya no está 'scheduled' (${fresh?.status}) — skip alerta`);
                        continue;
                    }
                } catch { /* si falla el re-check, seguimos con el flujo normal */ }

                const result = await WhatsAppService.sendAlertaCancelacion(appt);
                if (result.success) {
                    await AppointmentModel.markConfirmationAlertSent(appt.id);

                    await NotificationsRepo.create({
                        type: 'alerta',
                        icon: 'exclamation-triangle',
                        title: 'Alerta de confirmación enviada',
                        message: `Se envió alerta a ${appt.clientName} — ${appt.serviceName} a las ${appt.time || ''}. Se cancelará si no confirma.`,
                        read: false,
                        entityId: appt.id
                    });
                    console.log(`⚠️ Alerta de cancelación enviada a ${appt.clientName} (cita ${appt.id})`);
                }
            }
        } catch (error) {
            console.error('❌ Error en scheduler alerta 4h:', error);
        }
    });

    // ========================================================================
    // AUTO-CANCELACIÓN 1h — cada 10 min
    // ========================================================================
    cron.schedule('*/10 * * * *', async () => {
        if (!AUTO_CONFIRMACION_ACTIVA) return;
        const now = new Date();

        try {
            const rangeStart = toMexicoCityISO(new Date(now.getTime() + 50 * 60 * 1000));
            const rangeEnd = toMexicoCityISO(new Date(now.getTime() + 70 * 60 * 1000));

            const pendingCancel = await AppointmentModel.getPendingAutoCancelation(rangeStart, rangeEnd);

            if (pendingCancel.length > 0) {
                console.log(`❌ [auto-cancel] ${pendingCancel.length} citas sin confirmar — barrido de votos + cancelación`);
                // ÚLTIMA LÍNEA DE DEFENSA antes de cancelar: barrer votos del store.
                // Cancelar la cita de una clienta que SÍ votó "Confirmar" es el peor
                // desenlace posible del bug de votos perdidos; el barrido lo evita.
                try { await reconcilePollVotes({ apply: true }); }
                catch (e) { console.warn('[auto-cancel] barrido de votos falló (sigo):', e.message); }
            }

            for (const appt of pendingCancel) {
                // Re-verificar contra la DB: el barrido (o el webhook) pudo haberla
                // confirmado hace un instante. Solo cancelamos si sigue 'scheduled'.
                try {
                    const fresh = await prisma.appointment.findUnique({
                        where: { id: appt.id }, select: { status: true }
                    });
                    if (!fresh || fresh.status !== 'scheduled') {
                        console.log(`✅ [auto-cancel] ${appt.clientName} ya no está 'scheduled' (${fresh?.status}) — skip cancelación`);
                        continue;
                    }
                } catch { /* si falla el re-check, mejor NO cancelar este tick */ continue; }

                await prisma.appointment.update({
                    where: { id: appt.id },
                    data: {
                        status: 'cancelled',
                        autoCancelledAt: new Date(),
                        cancelledVia: 'auto-no-confirmation',
                        updatedAt: new Date()
                    }
                });

                try {
                    const { deleteEvent } = await import('../services/googleCalendarService.js');
                    const { config } = await import('../config/config.js');

                    if (appt.googleCalendarEventId) {
                        await deleteEvent(appt.googleCalendarEventId, config.google.calendarOwner1).catch(() => {});
                    }
                    if (appt.googleCalendarEventId2) {
                        await deleteEvent(appt.googleCalendarEventId2, config.google.calendarOwner2).catch(() => {});
                    }
                } catch (calErr) {
                    console.error('⚠️ Error eliminando eventos del calendario:', calErr.message);
                }

                await NotificationsRepo.create({
                    type: 'alerta',
                    icon: 'calendar-times',
                    title: 'Cita cancelada automáticamente',
                    message: `La cita de ${appt.clientName} — ${appt.serviceName} fue cancelada por no confirmar.`,
                    read: false,
                    entityId: appt.id
                });

                const fecha = WhatsAppService.formatearFechaLegible(appt.date || appt.startDateTime);
                const hora = appt.time || WhatsAppService.formatearHora(appt.startDateTime);
                const msgCancelacion = `❌ Hola ${appt.clientName}, tu cita de *${appt.serviceName}* del ${fecha} a las ${hora} fue *cancelada automáticamente* porque no se recibió confirmación.\n\nSi deseas agendar de nuevo, con gusto te atendemos. 🌸`;

                try {
                    const { getEvolutionClient } = await import('../services/whatsapp-evolution.js');
                    const evo = getEvolutionClient();
                    await evo.sendText(appt.clientPhone, msgCancelacion);
                } catch (wErr) {
                    console.error('⚠️ No se pudo notificar cancelación automática:', wErr.message);
                }

                console.log(`❌ Cita ${appt.id} de ${appt.clientName} cancelada automáticamente`);
            }
        } catch (error) {
            console.error('❌ Error en scheduler auto-cancelación:', error);
        }
    });

    console.log('✅ Sistema de notificaciones WhatsApp con Evolution API listo');

    // ========================================================================
    // ENVÍO DE LINK DE EVALUACIÓN POST-CITA — cada 10 min
    // ========================================================================
    cron.schedule('*/10 * * * *', async () => {
        if (!RESENAS_AUTO_ACTIVAS) return;
        try {
            const now = new Date();
            const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

            const pendingReviewSend = await prisma.appointment.findMany({
                where: {
                    status: 'completed',
                    reviewSentAt: null,
                    endDateTime: { gte: threeDaysAgo }
                },
                take: 20
            });

            if (pendingReviewSend.length > 0) {
                console.log(`⭐ [review-cron] ${pendingReviewSend.length} citas completadas pendientes de evaluación`);
            }

            const baseUrl = config.baseUrl || 'https://venus-loyalty.onrender.com';

            for (const appt of pendingReviewSend) {
                const reviewUrl = `${baseUrl}/review.html?id=${appt.id}`;
                const mensaje = `💆‍♀️ ¡Hola ${appt.clientName}! Gracias por visitarnos hoy.\n\n⭐ Nos encantaría saber cómo fue tu experiencia con tu *${appt.serviceName}*.\n\n👉 Evalúa aquí (30 segundos): ${reviewUrl}\n\nTu opinión nos ayuda a mejorar. ¡Gracias! 🌸`;

                try {
                    const { getEvolutionClient } = await import('../services/whatsapp-evolution.js');
                    const evo = getEvolutionClient();
                    await evo.sendText(appt.clientPhone, mensaje);
                    console.log(`⭐ [review] Link de evaluación enviado a ${appt.clientName}`);
                } catch (evoErr) {
                    console.warn(`⚠️ [review] Error enviando review a ${appt.clientName}:`, evoErr.message);
                }

                await prisma.appointment.update({
                    where: { id: appt.id },
                    data: { reviewSentAt: new Date() }
                });

                try {
                    await prisma.review.create({
                        data: {
                            appointmentId: appt.id,
                            clientName: appt.clientName,
                            clientPhone: appt.clientPhone,
                            serviceName: appt.serviceName,
                            stars: 0,
                            sentAt: new Date()
                        }
                    });
                } catch (revErr) {
                    if (!revErr.message?.includes('Unique constraint')) {
                        console.error('⚠️ [review] Error creando registro de review:', revErr.message);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error en scheduler de evaluaciones:', error);
        }
    });

    // ========================================================================
    // NOTIFICACIONES AUTOMÁTICAS (cada hora)
    // ========================================================================
    cron.schedule('0 * * * *', async () => {
        console.log('🔔 Ejecutando chequeo de notificaciones automáticas...');

        try {
            await checkBirthdays();
            await checkCompletedCards();
            await checkLowStock();
            await checkExpiringGiftCards();
        } catch (error) {
            console.error('❌ Error en notificaciones automáticas:', error);
        }
    });

    // ========================================================================
    // REINTENTO DE PDFs DE EXPEDIENTE PENDIENTES DE SUBIR A DRIVE — cada 30 min
    // Cuando una clienta firma ficha/consent y la subida a Drive falla (o Drive
    // no estaba configurado), el row queda con driveUploadPending=true. Aquí lo
    // reintentamos: reconstruimos el PDF, aseguramos la carpeta del cliente y
    // subimos. Idempotente y fire-and-forget.
    // ========================================================================
    // Reintento de PDFs de expediente que no pudieron subirse a Drive
    cron.schedule('*/30 * * * *', async () => {
        try {
            const { isDriveConfigured } = await import('../services/driveService.js');
            if (!isDriveConfigured()) return;
            const { buildIntakePdf, buildConsentPdf } = await import('../services/expedientePdf.js');
            const { ensureClientFolder, uploadBuffer } = await import('../services/driveService.js');

            const pendingIntakes = await prisma.intakeForm.findMany({
                where: { driveUploadPending: true, status: 'signed' },
                include: { record: true }, take: 10,
            });
            const pendingConsents = await prisma.consentDoc.findMany({
                where: { driveUploadPending: true, status: 'signed' },
                include: { record: true }, take: 10,
            });
            for (const item of [...pendingIntakes.map(x => ({ x, kind: 'intake' })), ...pendingConsents.map(x => ({ x, kind: 'consent' }))]) {
                try {
                    const card = await prisma.card.findUnique({ where: { id: item.x.record.cardId } });
                    if (!card) continue;
                    const pdf = item.kind === 'intake' ? await buildIntakePdf(item.x, card) : await buildConsentPdf(item.x, card);
                    const folderId = await ensureClientFolder(card);
                    const name = `${item.kind === 'intake' ? 'Ficha Clínica' : 'Consentimiento Láser'} – ${new Date(item.x.signedAt).toISOString().slice(0, 10)}.pdf`;
                    const up = await uploadBuffer({ folderId, name, mimeType: 'application/pdf', buffer: pdf });
                    const data = { pdfDriveFileId: up.id, pdfWebViewLink: up.webViewLink, driveUploadPending: false };
                    if (item.kind === 'intake') await prisma.intakeForm.update({ where: { id: item.x.id }, data });
                    else await prisma.consentDoc.update({ where: { id: item.x.id }, data });
                    const existing = await prisma.clientDocument.findFirst({ where: { driveFileId: up.id } });
                    if (!existing) {
                        await prisma.clientDocument.create({ data: { recordId: item.x.record.id, name, mimeType: 'application/pdf', driveFileId: up.id, webViewLink: up.webViewLink, source: 'generated' } });
                    }
                    console.log(`📁 [drive-retry] subido: ${name}`);
                } catch (e) { console.warn('[drive-retry] item falló:', e.message); }
            }
        } catch (e) { console.error('[drive-retry] error:', e.message); }
    });
}

// ========== CUMPLEAÑOS (próximos 7 días) ==========
async function checkBirthdays() {
    try {
        const now = new Date();

        const cards = await prisma.card.findMany({ where: { status: 'active' } });

        const birthdays = [];
        for (const card of cards) {
            if (card.birthday) {
                const [month, day] = card.birthday.split('-').map(Number);
                const birthdayThisYear = new Date(now.getFullYear(), month - 1, day);
                const daysUntil = Math.ceil((birthdayThisYear - now) / (1000 * 60 * 60 * 24));
                if (daysUntil >= 0 && daysUntil <= 7) {
                    birthdays.push({ id: card.id, name: card.name, phone: card.phone, daysUntil });
                }
            }
        }

        if (birthdays.length > 0) {
            const today = now.toISOString().split('T')[0];
            const existingNotif = await prisma.notification.findFirst({
                where: { type: 'cumpleaños', createdAt: { gte: new Date(today) } }
            });
            if (!existingNotif) {
                await NotificationsRepo.create({
                    type: 'cumpleaños',
                    icon: 'birthday-cake',
                    title: `${birthdays.length} cumpleaños próximos`,
                    message: birthdays.map(b => `${b.name} (en ${b.daysUntil} días)`).join(', '),
                    read: false,
                    entityId: null
                });
                console.log(`🎂 Notificación de cumpleaños creada: ${birthdays.length} clientes`);
            }
        }
    } catch (error) {
        console.error('Error checking birthdays:', error);
    }
}

// ========== TARJETAS COMPLETADAS (últimas 24h) ==========
async function checkCompletedCards() {
    try {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const redeems = await prisma.event.findMany({
            where: { type: 'redeem', timestamp: { gte: yesterday } }
        });

        if (redeems.length > 0) {
            await NotificationsRepo.create({
                type: 'premio',
                icon: 'gift',
                title: `${redeems.length} tarjeta${redeems.length > 1 ? 's' : ''} completada${redeems.length > 1 ? 's' : ''}`,
                message: `${redeems.map(r => r.clientName || 'Cliente').join(', ')} ${redeems.length > 1 ? 'completaron' : 'completó'} su tarjeta`,
                read: false,
                entityId: null
            });
            console.log(`🎁 Notificación de tarjetas completadas: ${redeems.length}`);
        }
    } catch (error) {
        console.error('Error checking completed cards:', error);
    }
}

// ========== STOCK BAJO ==========
async function checkLowStock() {
    try {
        const products = await prisma.product.findMany();

        const lowStockProducts = products.filter(p => {
            const stock = p.stock || 0;
            const minStock = p.minStock || 5;
            return stock <= minStock && stock > 0;
        }).map(p => ({ id: p.id, name: p.name, stock: p.stock || 0, minStock: p.minStock || 5 }));

        if (lowStockProducts.length > 0) {
            const today = new Date().toISOString().split('T')[0];
            const existingNotif = await prisma.notification.findFirst({
                where: { type: 'stock', createdAt: { gte: new Date(today) } }
            });
            if (!existingNotif) {
                await NotificationsRepo.create({
                    type: 'stock',
                    icon: 'exclamation-triangle',
                    title: `${lowStockProducts.length} producto${lowStockProducts.length > 1 ? 's' : ''} con stock bajo`,
                    message: lowStockProducts.map(p => `${p.name} (${p.stock} unidades)`).join(', '),
                    read: false,
                    entityId: null
                });
                console.log(`⚠️ Notificación de stock bajo: ${lowStockProducts.length} productos`);
            }
        }
    } catch (error) {
        console.error('Error checking low stock:', error);
    }
}

// ========== GIFT CARDS POR VENCER (próximos 7 días) ==========
async function checkExpiringGiftCards() {
    try {
        const now = new Date();
        const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const expiring = await prisma.giftCard.findMany({
            where: { status: 'pending', expiresAt: { lte: in7Days, gte: now } }
        });

        if (expiring.length > 0) {
            const expiringCards = expiring.map(gc => ({
                id: gc.id,
                code: gc.code,
                serviceName: gc.serviceName,
                recipientName: gc.recipientName || 'Sin nombre',
                daysUntil: Math.ceil((new Date(gc.expiresAt) - now) / (1000 * 60 * 60 * 24))
            }));

            const today = now.toISOString().split('T')[0];
            const existingNotif = await prisma.notification.findFirst({
                where: { type: 'giftcard', createdAt: { gte: new Date(today) } }
            });
            if (!existingNotif) {
                await NotificationsRepo.create({
                    type: 'giftcard',
                    icon: 'clock',
                    title: `${expiringCards.length} gift card${expiringCards.length > 1 ? 's' : ''} por vencer`,
                    message: expiringCards.map(gc => `${gc.code} - ${gc.serviceName} (${gc.daysUntil} días)`).join(', '),
                    read: false,
                    entityId: null
                });
                console.log(`⏰ Notificación de gift cards por vencer: ${expiringCards.length}`);
            }
        }
    } catch (error) {
        console.error('Error checking expiring gift cards:', error);
    }
}
