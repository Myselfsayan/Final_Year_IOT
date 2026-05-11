import { io } from 'socket.io-client';

// Extract base URL from the API URL (strip /api/users)
const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8080/api/users')
  .replace('/api/users', '');

// Create a single shared socket instance (autoConnect: false — components connect manually)
const socket = io(BASE_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
  transports: ['websocket', 'polling'],
});

export default socket;
