function createSystemRouteMiddlewares(deps) {
    const {
        findSystemForUser,
        findSystemForParticipant,
        findMemberByUserId,
    } = deps;

    const loadOwnerSystem = async (req, res, next) => {
        try {
            const { systemId } = req.params;
            const userId = req.user.id;

            const { system, profile, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            req.system = system;
            req.profile = profile;
            return next();
        } catch (error) {
            return next(error);
        }
    };

    const loadParticipantSystem = async (req, res, next) => {
        try {
            const { systemId } = req.params;
            const userId = req.user.id;

            const { system, profile, isOwner, error, status } = await findSystemForParticipant(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            req.system = system;
            req.profile = profile;
            req.isOwner = isOwner;
            return next();
        } catch (error) {
            return next(error);
        }
    };

    const requireMember = (req, res, next) => {
        const userId = req.user.id;
        const member = findMemberByUserId(req.system, userId);

        if (!member) {
            return res.status(403).json({ message: 'Only members can access this endpoint.' });
        }

        req.member = member;
        return next();
    };

    return {
        loadOwnerSystem,
        loadParticipantSystem,
        requireMember,
    };
}

module.exports = createSystemRouteMiddlewares;
