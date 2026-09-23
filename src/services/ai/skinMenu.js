export const SKIN_MENU_CATEGORIES = ['Básicos Venus', 'Especializados'];

export async function loadSkinMenu(prisma) {
    return prisma.service.findMany({
        where: { isActive: true, category: { in: SKIN_MENU_CATEGORIES } },
        select: { id: true, name: true, description: true, price: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
}
export function validateRecommendations(recommendations, menu, logger = console) {
    return (Array.isArray(recommendations) ? recommendations : []).filter(item => {
        const valid = item && menu.some(s => s.id === item.serviceId && s.name === item.treatment);
        if (!valid) logger.warn('[SkinAnalysis] Recomendación descartada: servicio fuera del menú');
        return valid;
    }).slice(0, 3);
}
export function resolveRecommendations(recommendations, menu) {
    return (Array.isArray(recommendations) ? recommendations : []).filter(Boolean).map(item => {
        const service = item.serviceId ? menu.find(s => s.id === item.serviceId) : menu.find(s => s.name === item.treatment);
        return { treatment: service?.name || item.treatment, why: item.why, sessions: item.sessions, frequency: item.frequency, serviceId: service?.id || null, price: service ? Number(service.price) : null };
    });
}
