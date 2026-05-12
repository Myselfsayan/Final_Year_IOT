import { io } from 'socket.io-client';

// Extract base URL from the API URL (strip /api/users)
const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8080/api/users')
  .replace('/api/users', '');

// Single shared socket instance for the entire app lifetime.
// autoConnect: false so we control when it connects.
// We call .connect() once here at module load — subsequent calls are no-ops.
const socket = io(BASE_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 3000,
  transports: ['websocket', 'polling'],
});

// Connect eagerly at module load — ready before any component mounts.
// This is a singleton; calling connect() again when already connected is safe (no-op).
socket.connect();

export default socket;

