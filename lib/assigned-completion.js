// Account-specific permission requested by the owner; does not expand reception roles.
export const assignedCompletionOnly = user => user?.uid === 'adm_1780514118062';
export function assignedRequestAllowed(method, path) {
  if (method === 'GET') return ['/api/admin/me', '/api/assigned-appointments', '/api/clinic-inventory', '/api/clinic-inventory/'].includes(path) || /^\/api\/clinic-inventory\/usage\/[^/]+$/.test(path);
  return (method === 'PUT' && /^\/api\/clinic-inventory\/usage\/[^/]+$/.test(path)) || (method === 'POST' && path === '/api/admin/logout');
}
