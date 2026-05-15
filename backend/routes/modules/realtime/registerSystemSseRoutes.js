const jwt = require('jsonwebtoken');

function resolveUserIdFromRequest(req) {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const queryToken = req.query?.token ? String(req.query.token) : null;
    const token = bearerToken || queryToken;

    if (!token) {
        return { error: 'No token provided', status: 401 };
    }

    try {
        const decoded = jwt.verify(token, process.env.ACCESS_SECRET);
        return { userId: decoded.id };
    } catch (error) {
        if (error?.name === 'TokenExpiredError') {
            return { error: 'Token expired', status: 401 };
        }
        return { error: 'Invalid token', status: 403 };
    }
}

function registerSystemSseRoutes(router, deps) {
    const {
        findSystemForUser,
        findSystemForParticipant,
        registerSystemTaskEventClient,
        unregisterSystemTaskEventClient,
        registerSystemUpdateEventClient,
        unregisterSystemUpdateEventClient,
    } = deps;

    router.get('/:systemId/tasks/events', async (req, res) => {
        try {
            const { systemId } = req.params;
            const authResult = resolveUserIdFromRequest(req);
            if (authResult.error) {
                return res.status(authResult.status || 401).json({ message: authResult.error });
            }
            const userId = authResult.userId;

            const { system, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders?.();

            const systemKey = String(system._id);
            registerSystemTaskEventClient(systemKey, res);

            res.write(`data: ${JSON.stringify({ type: 'connected', systemId: systemKey, timestamp: new Date().toISOString() })}\n\n`);

            const heartbeat = setInterval(() => {
                try {
                    res.write(': heartbeat\n\n');
                } catch (error) {
                    clearInterval(heartbeat);
                    unregisterSystemTaskEventClient(systemKey, res);
                }
            }, 20000);

            req.on('close', () => {
                clearInterval(heartbeat);
                unregisterSystemTaskEventClient(systemKey, res);
                res.end();
            });
        } catch (error) {
            console.error('Create task SSE stream error:', error);
            return res.status(500).json({ message: 'Failed to create SSE stream', error: error.message });
        }
    });

    router.get('/:systemId/updates/events', async (req, res) => {
        try {
            const { systemId } = req.params;
            const authResult = resolveUserIdFromRequest(req);
            if (authResult.error) {
                return res.status(authResult.status || 401).json({ message: authResult.error });
            }
            const userId = authResult.userId;

            const { system, error, status } = await findSystemForParticipant(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders?.();

            const systemKey = String(system._id);
            registerSystemUpdateEventClient(systemKey, res);
            res.write(`data: ${JSON.stringify({ type: 'connected', systemId: systemKey, timestamp: new Date().toISOString() })}\n\n`);

            const heartbeat = setInterval(() => {
                try {
                    res.write(': heartbeat\n\n');
                } catch (error) {
                    clearInterval(heartbeat);
                    unregisterSystemUpdateEventClient(systemKey, res);
                }
            }, 20000);

            req.on('close', () => {
                clearInterval(heartbeat);
                unregisterSystemUpdateEventClient(systemKey, res);
                res.end();
            });
        } catch (error) {
            console.error('Create update SSE stream error:', error);
            return res.status(500).json({ message: 'Failed to create update SSE stream', error: error.message });
        }
    });
}

module.exports = registerSystemSseRoutes;
