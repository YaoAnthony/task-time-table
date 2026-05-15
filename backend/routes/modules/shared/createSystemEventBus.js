function createSystemEventBus() {
    const taskEventClients = new Map();
    const updateEventClients = new Map();

    const registerClient = (map, systemId, client) => {
        if (!map.has(systemId)) {
            map.set(systemId, new Set());
        }
        map.get(systemId).add(client);
    };

    const unregisterClient = (map, systemId, client) => {
        const clients = map.get(systemId);
        if (!clients) return;
        clients.delete(client);
        if (clients.size === 0) {
            map.delete(systemId);
        }
    };

    const emit = (map, systemId, payload, errorPrefix) => {
        const clients = map.get(systemId);
        if (!clients || clients.size === 0) return;

        const data = `data: ${JSON.stringify(payload)}\n\n`;
        for (const client of clients) {
            try {
                client.write(data);
            } catch (error) {
                console.error(`${errorPrefix}:`, error.message);
            }
        }
    };

    const registerSystemTaskEventClient = (systemId, client) => registerClient(taskEventClients, systemId, client);
    const unregisterSystemTaskEventClient = (systemId, client) => unregisterClient(taskEventClients, systemId, client);
    const emitSystemTaskEvent = (systemId, payload) => emit(taskEventClients, systemId, payload, 'SSE push error');

    const registerSystemUpdateEventClient = (systemId, client) => registerClient(updateEventClients, systemId, client);
    const unregisterSystemUpdateEventClient = (systemId, client) => unregisterClient(updateEventClients, systemId, client);
    const emitSystemUpdateEvent = (systemId, payload) => emit(updateEventClients, systemId, payload, 'System update SSE push error');

    return {
        registerSystemTaskEventClient,
        unregisterSystemTaskEventClient,
        emitSystemTaskEvent,
        registerSystemUpdateEventClient,
        unregisterSystemUpdateEventClient,
        emitSystemUpdateEvent,
    };
}

module.exports = createSystemEventBus;
