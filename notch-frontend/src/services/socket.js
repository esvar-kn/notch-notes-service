import { io } from 'socket.io-client';

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_GATEWAY_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/api\/v1\/?$/, '');

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('⚡ [Frontend Socket] Connected to Socket.io server with ID:', socket.id);
});

socket.on('disconnect', () => {
  console.log('⚡ [Frontend Socket] Disconnected from Socket.io server');
});

export default socket;
