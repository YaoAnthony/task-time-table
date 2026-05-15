/**
 * profileEventBus — singleton per-user SSE event bus.
 *
 * Singleton so both profile.js (SSE registration) and system.js routes
 * (event emission after task completion) share the same client registry.
 *
 * Usage:
 *   const profileEventBus = require('./profileEventBus');
 *   profileEventBus.register(userId, res);   // in SSE endpoint
 *   profileEventBus.emit(userId, 'game_chest_spawned', { chest });
 */

/** userId (string) → Set of SSE response objects */
const clients = new Map();

function register(userId, res) {
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(res);
}

function unregister(userId, res) {
    const set = clients.get(userId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) clients.delete(userId);
}

function emit(userId, eventType, data) {
    const set = clients.get(userId);
    if (!set || set.size === 0) return;
    const payload = `data: ${JSON.stringify({ type: eventType, ...data })}\n\n`;
    for (const res of set) {
        try { res.write(payload); } catch { /* client disconnected — ignore */ }
    }
}

module.exports = { register, unregister, emit };
