import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_GATEWAY_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/api\/v1\/?$/, '');

/**
 * Custom React Hook for Real-time Collaborative Editing (Block 1)
 * Manages socket connection, room join/leave lifecycle, and event listeners.
 */
export function useNoteSocket(noteId, onRemoteUpdate) {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);

  const onRemoteUpdateRef = useRef(onRemoteUpdate);
  useEffect(() => {
    onRemoteUpdateRef.current = onRemoteUpdate;
  }, [onRemoteUpdate]);

  useEffect(() => {
    if (!noteId) return;

    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join-note', noteId);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('note:updated', (payload) => {
      if (onRemoteUpdateRef.current) {
        onRemoteUpdateRef.current(payload);
      }
    });

    return () => {
      socket.emit('leave-note', noteId);
      socket.disconnect();
    };
  }, [noteId]);

  const emitNoteUpdate = useCallback(
    (data) => {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('note:update', {
          noteId,
          ...data,
        });
      }
    },
    [noteId]
  );

  return { socketRef, isConnected, emitNoteUpdate };
}

export default useNoteSocket;
