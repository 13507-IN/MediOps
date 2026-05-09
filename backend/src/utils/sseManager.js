// SSE (Server-Sent Events) event manager for real-time updates

// Store connected clients by userId
const clients = new Map();

/**
 * Register a new SSE client
 */
export function addClient(userId, req, res) {
  if (!clients.has(userId)) {
    clients.set(userId, []);
  }
  clients.get(userId).push(res);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sendToClient(res, 'connected', { message: 'SSE connection established', timestamp: new Date().toISOString() });

  req.on('close', () => {
    removeClient(userId, res);
  });

  const heartbeat = setInterval(() => {
    sendToClient(res, 'heartbeat', { timestamp: new Date().toISOString() });
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
}

/**
 * Remove a disconnected client
 */
export function removeClient(userId, res) {
  const userClients = clients.get(userId);
  if (userClients) {
    const index = userClients.indexOf(res);
    if (index > -1) {
      userClients.splice(index, 1);
    }
    if (userClients.length === 0) {
      clients.delete(userId);
    }
  }
}

/**
 * Send an event to a specific client connection
 */
function sendToClient(res, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  res.write(payload);
}

/**
 * Emit an event to all clients for a specific user
 */
export function emitToUser(userId, event, data) {
  const userClients = clients.get(userId);
  if (userClients) {
    const disconnected = [];

    userClients.forEach((client) => {
      try {
        sendToClient(client, event, data);
      } catch (error) {
        disconnected.push(client);
      }
    });

    disconnected.forEach((client) => {
      const idx = userClients.indexOf(client);
      if (idx > -1) userClients.splice(idx, 1);
    });

    if (userClients.length === 0) {
      clients.delete(userId);
    }
  }
}

/**
 * Emit an event to all connected clients
 */
export function emitToAll(event, data) {
  clients.forEach((_, userId) => {
    emitToUser(userId, event, data);
  });
}

/**
 * Get count of connected clients
 */
export function getConnectedCount() {
  let count = 0;
  clients.forEach((userClients) => {
    count += userClients.length;
  });
  return count;
}

export const SSE_EVENTS = Object.freeze({
  CONNECTED: 'connected',
  HEARTBEAT: 'heartbeat',
  DOCUMENT_UPLOADING: 'document:uploading',
  DOCUMENT_PROCESSING: 'document:processing',
  DOCUMENT_COMPLETED: 'document:completed',
  DOCUMENT_FAILED: 'document:failed',
  RESOURCE_UPLOADING: 'resource:uploading',
  RESOURCE_COMPLETED: 'resource:completed',
  RESOURCE_FAILED: 'resource:failed',
  ALLOCATION_CREATED: 'allocation:created',
  ALLOCATION_DEALLOCATED: 'allocation:deallocated',
  ALLOCATION_LIFECYCLE_CHANGE: 'allocation:lifecycle-change',
  ALERT_LOW_STOCK: 'alert:low-stock',
});
