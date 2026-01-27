import nodemailer from "nodemailer";
import { config } from '../config/config.js';

/**
 * Branded HTML Template Wrapper
 */
function getEmailWrapper(content) {
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { margin: 0; padding: 0; background-color: #faf8f5; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #1a1a1f; }
        .wrapper { width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background-color: #8c9668; padding: 40px 20px; text-align: center; color: white; }
        .header h1 { margin: 0; font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 500; letter-spacing: 1px; }
        .content { padding: 40px 30px; line-height: 1.6; }
        .content h2 { color: #8c9668; font-family: 'Playfair Display', serif; font-size: 22px; margin-top: 0; }
        .details-box { background-color: #f9f9f7; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 25px 0; }
        .details-item { margin-bottom: 10px; display: flex; align-items: flex-start; }
        .details-label { font-weight: 600; min-width: 80px; color: #6b7280; font-size: 14px; text-transform: uppercase; }
        .details-value { font-weight: 500; color: #1a1a1f; }
        .footer { background-color: #faf8f5; border-top: 1px solid #e5e7eb; padding: 30px 20px; text-align: center; font-size: 12px; color: #9ca3af; }
        .btn { display: inline-block; background-color: #8c9668; color: white !important; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; margin-top: 20px; box-shadow: 0 4px 12px rgba(140, 150, 104, 0.2); }
        .social-links { margin-top: 20px; }
        .social-links a { margin: 0 10px; color: #8c9668; text-decoration: none; font-weight: 500; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>Venus Cosmetología</h1>
          <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.9;">Professional Care & Beauty</span>
        </div>
        <div class="content">
          ${content}
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Venus Cosmetología. Todos los derechos reservados.</p>
          <p>Cactus 50, San Juan del Río, Qro.</p>
          <div class="social-links">
            <a href="https://instagram.com/venuscosmetologia">Instagram</a>
            <a href="https://wa.me/524271657595">WhatsApp</a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Core sendMail function (supports Resend and SMTP)
 */
async function sendMail({ to, subject, text, html }) {
    if (process.env.RESEND_API_KEY) {
        const from = process.env.RESEND_FROM || "Venus Admin <onboarding@resend.dev>";
        try {
            const resp = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    from,
                    to: Array.isArray(to) ? to : [to],
                    subject,
                    text,
                    html,
                }),
            });
            const data = await resp.json().catch(() => ({}));
            if (resp.ok) return { channel: "resend", id: data?.id || null };
            console.error("[Resend Error]", data);
        } catch (err) {
            console.error("[Resend Exception]", err);
        }
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !port || !user || !pass) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error("No hay SMTP ni Resend API Key configurada");
        } else {
            console.warn("⚠️ Email service not configured. Returning mock success.");
            return { channel: "mock", id: "mock-id" };
        }
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        connectionTimeout: 15000,
    });

    const from = process.env.SMTP_FROM || `Venus Admin <${process.env.SMTP_USER}>`;
    const info = await transporter.sendMail({ from, to, subject, text, html });
    return { channel: "smtp", id: info?.messageId || null };
}

export const EmailService = {
    /**
     * Send appointment confirmation to client
     */
    async sendConfirmation(appt) {
        if (!appt.clientEmail || appt.clientEmail === 'sin email') {
            console.log(`[Email] Saltando confirmación para ${appt.clientName} (sin email)`);
            return;
        }

        const subject = `Tu cita en Venus Cosmetología — Confirmada ✅`;
        const content = `
      <h2>¡Hola, ${appt.clientName}!</h2>
      <p>Tu cita ha sido agendada con éxito. Estamos emocionados por recibirte y brindarte el mejor cuidado.</p>
      
      <div class="details-box">
        <div class="details-item">
          <span class="details-label">Servicio</span>
          <span class="details-value">${appt.serviceName}</span>
        </div>
        <div class="details-item">
          <span class="details-label">Fecha</span>
          <span class="details-value">${appt.date}</span>
        </div>
        <div class="details-item">
          <span class="details-label">Hora</span>
          <span class="details-value">${appt.time}</span>
        </div>
        <div class="details-item">
          <span class="details-label">Lugar</span>
          <span class="details-value">Cactus 50, San Juan del Río</span>
        </div>
      </div>
      
      <p>Si necesitas reprogramar o cancelar, por favor avísanos con al menos 24 horas de anticipación vía WhatsApp.</p>
      
      <div style="text-align: center;">
        <a href="https://wa.me/524271657595" class="btn">Contactar vía WhatsApp</a>
      </div>
    `;

        try {
            await sendMail({
                to: appt.clientEmail,
                subject,
                text: `Hola ${appt.clientName}, tu cita para ${appt.serviceName} el ${appt.date} a las ${appt.time} ha sido confirmada.`,
                html: getEmailWrapper(content)
            });
            console.log(`[Email] Confirmación enviada a ${appt.clientEmail}`);
        } catch (error) {
            console.error(`[Email Error] No se pudo enviar confirmación a ${appt.clientEmail}:`, error.message);
        }
    },

    /**
     * Send new request notification to Admin
     */
    async sendNewRequestNotification(request) {
        const adminEmail = process.env.ADMIN_EMAIL || "saidromero19@gmail.com";
        const subject = `🆕 Nueva Solicitud de Cita: ${request.clientName}`;

        const content = `
      <h2>Nueva Solicitud Recibida</h2>
      <p>Se ha recibido una nueva solicitud de cita desde la página pública.</p>
      
      <div class="details-box">
        <div class="details-item">
          <span class="details-label">Cliente</span>
          <span class="details-value">${request.clientName}</span>
        </div>
        <div class="details-item">
          <span class="details-label">Teléfono</span>
          <span class="details-value">${request.clientPhone}</span>
        </div>
        <div class="details-item">
          <span class="details-label">Servicio</span>
          <span class="details-value">${request.serviceName}</span>
        </div>
        <div class="details-item">
          <span class="details-label">Fecha/Hora</span>
          <span class="details-value">${request.date} a las ${request.time}</span>
        </div>
      </div>
      
      <p>Entra al panel de administración para ver los detalles y confirmar la cita.</p>
      
      <div style="text-align: center;">
        <a href="${process.env.BASE_URL || 'https://venus-loyalty.onrender.com'}/admin" class="btn">Ir al Panel Admin</a>
      </div>
    `;

        try {
            await sendMail({
                to: adminEmail,
                subject,
                text: `Nueva solicitud de ${request.clientName} para ${request.serviceName} el ${request.date} a las ${request.time}.`,
                html: getEmailWrapper(content)
            });
            console.log(`[Email] Notificación de nueva solicitud enviada al admin`);
        } catch (error) {
            console.error(`[Email Error] No se pudo enviar notificación al admin:`, error.message);
        }
    }
};
