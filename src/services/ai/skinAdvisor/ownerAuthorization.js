const validId = (id) => typeof id === 'string'
  && id.length > 0
  && id.length <= 128
  && id === id.trim();

// Call only after authentication middleware has populated req.admin.
export function reviewerFromAuthenticatedRequest(req) {
  const id = req?.admin?.uid;
  return validId(id) ? Object.freeze({ id }) : null;
}

export function createOwnerReviewAuthorizer({ approverId, findAdminById } = {}) {
  if (typeof findAdminById !== 'function') throw new TypeError('findAdminById callback is required.');
  const ownerId = approverId;

  return async (actor) => {
    const actorId = actor?.id;
    if (!validId(ownerId) || !validId(actorId) || actorId !== ownerId) return false;
    try {
      const account = await findAdminById(actorId);
      return account?.id === actorId && account.role === 'admin';
    } catch {
      return false;
    }
  };
}
