# WebSocket Event Schema & Real-Time Collaborative Editing Spec

This specification defines the real-time event schema, conflict resolution strategy, and client-side custom hook interface (`useNoteSocket(noteId)`) for collaborative note editing in **Notch Notes Service**.

---

## 1. Conflict Resolution Strategy: Last-Write-Wins (LWW)

### Strategy Selection
For real-time note editing, we implement the **Last-Write-Wins (LWW)** conflict resolution strategy using ISO server timestamps (`updatedAt`).

### Rationale
- **Simplicity & Reliability:** LWW guarantees eventual consistency across all connected clients without requiring the complexity of Operational Transforms (OT) or Conflict-Free Replicated Data Types (CRDTs).
- **Scope & Interview Defense:** Google Docs and Figma use OT/CRDTs for multi-cursor character-level merging. For an architectural MVP, LWW provides immediate real-time synchronisation with an easily defensible tradeoff: state updates are deterministic, easy to audit, and persist atomically to PostgreSQL.

### Execution Flow
1. Client sends `note:update` with payload `{ noteId, title, content, editedBy }`.
2. Server validates the payload, updates PostgreSQL (`prisma.note.update`), invalidates Redis cache, and sets server `updatedAt`.
3. Server broadcasts `note:updated` with the updated note payload to all other clients in room `note:<noteId>`.
4. Receiving clients update their local draft state / React Query cache.

---

## 2. WebSocket Event Schema Specification

### A. Room Lifecycle Events

#### `join-note` (Client → Server)
- **Description:** Client joins a room dedicated to a specific note.
- **Payload Shape:**
  ```json
  {
    "noteId": "integer | string",
    "userId": "integer",
    "userName": "string"
  }
  ```

#### `leave-note` (Client → Server)
- **Description:** Client leaves the note room upon navigation or unmount.
- **Payload Shape:**
  ```json
  {
    "noteId": "integer | string"
  }
  ```

---

### B. Real-Time Editing Events

#### `note:update` (Client → Server)
- **Description:** Emitted by a client whenever a user edits the note title or content.
- **Payload Shape:**
  ```json
  {
    "noteId": 101,
    "title": "Updated Meeting Notes",
    "content": "Discussed microservices architecture and Socket.io events.",
    "editedBy": {
      "id": 5,
      "name": "Jane Doe",
      "email": "jane@example.com"
    }
  }
  ```

#### `note:updated` (Server → Broadcast to Room Except Sender)
- **Description:** Emitted by the server after validating and persisting changes to PostgreSQL. Broadcast to all other sockets in `note:<noteId>`.
- **Payload Shape:**
  ```json
  {
    "noteId": 101,
    "title": "Updated Meeting Notes",
    "content": "Discussed microservices architecture and Socket.io events.",
    "editedBy": {
      "id": 5,
      "name": "Jane Doe"
    },
    "updatedAt": "2026-08-20T16:15:00.000Z"
  }
  ```

---

### C. Presence & Indicator Events

#### `note:presence` (Server → Room Clients)
- **Description:** Emitted whenever a user joins or leaves room `note:<noteId>`, delivering an updated array of active viewers/editors.
- **Payload Shape:**
  ```json
  {
    "noteId": 101,
    "activeUsers": [
      { "socketId": "2xqIpsYZ...", "userId": 5, "userName": "Jane Doe" },
      { "socketId": "8aB9kxLM...", "userId": 12, "userName": "John Smith" }
    ]
  }
  ```

#### `note:typing` (Client → Server → Room Broadcast)
- **Description:** Signals that a specific user is currently typing in the note editor.
- **Payload Shape:**
  ```json
  {
    "noteId": 101,
    "userId": 5,
    "userName": "Jane Doe",
    "isTyping": true
  }
  ```

---

## 3. Client-Side Custom Hook Spec: `useNoteSocket(noteId)`

### Interface Specification

```typescript
interface UseNoteSocketReturn {
  // Connection & Room Status
  isConnected: boolean;
  
  // Real-Time States
  remoteNoteUpdate: { title: string; content: string; editedBy: { name: string }; updatedAt: string } | null;
  activeUsers: Array<{ socketId: string; userId: number; userName: string }>;
  typingUsers: Array<string>;

  // Outbound Action Dispatchers
  sendNoteUpdate: (data: { title: string; content: string }) => void;
  sendTypingStatus: (isTyping: boolean) => void;
}
```

### Reference Implementation Sketch (`src/hooks/useNoteSocket.js`)

```javascript
import { useEffect, useState, useCallback, useRef } from 'react';
import socket from '../services/socket';
import { useAuth } from '../context/AuthContext';

export const useNoteSocket = (noteId) => {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [remoteNoteUpdate, setRemoteNoteUpdate] = useState(null);
  const [activeUsers, setActiveUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (!noteId) return;

    // Connect handlers
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // Join room
    socket.emit('join-note', {
      noteId,
      userId: user?.id,
      userName: user?.name || user?.email || 'Anonymous',
    });

    // Inbound Listeners
    socket.on('note:updated', (payload) => {
      if (payload.noteId === Number(noteId) || payload.noteId === String(noteId)) {
        setRemoteNoteUpdate(payload);
      }
    });

    socket.on('note:presence', (payload) => {
      setActiveUsers(payload.activeUsers || []);
    });

    socket.on('note:typing', ({ userName, isTyping }) => {
      setTypingUsers((prev) => {
        if (isTyping && !prev.includes(userName)) return [...prev, userName];
        if (!isTyping) return prev.filter((name) => name !== userName);
        return prev;
      });
    });

    // Cleanup: Leave room & remove listeners
    return () => {
      socket.emit('leave-note', { noteId });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('note:updated');
      socket.off('note:presence');
      socket.off('note:typing');
    };
  }, [noteId, user]);

  // Outbound Emitter: Update Note
  const sendNoteUpdate = useCallback(
    (data) => {
      if (!noteId) return;
      socket.emit('note:update', {
        noteId,
        title: data.title,
        content: data.content,
        editedBy: { id: user?.id, name: user?.name },
      });
    },
    [noteId, user]
  );

  // Outbound Emitter: Typing Indicator
  const sendTypingStatus = useCallback(
    (isTyping) => {
      if (!noteId) return;
      socket.emit('note:typing', {
        noteId,
        userId: user?.id,
        userName: user?.name,
        isTyping,
      });

      // Auto-clear typing status after 2s of inactivity
      if (isTyping) {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          socket.emit('note:typing', {
            noteId,
            userId: user?.id,
            userName: user?.name,
            isTyping: false,
          });
        }, 2000);
      }
    },
    [noteId, user]
  );

  return {
    isConnected,
    remoteNoteUpdate,
    activeUsers,
    typingUsers,
    sendNoteUpdate,
    sendTypingStatus,
  };
};
```

---

## 4. Saturday Execution Roadmap

1. **Backend Server (`notes-service/server.js`):** Add `note:update` listener, PostgreSQL persistence, and `io.to('note:' + noteId).emit('note:updated', ...)` broadcasting. Add presence tracking map.
2. **Frontend Hook (`src/hooks/useNoteSocket.js`):** Create the custom hook per specification above.
3. **UI Integration (`src/pages/NoteDetailPage.jsx`):** Connect `useNoteSocket(id)`, display active presence badges, show typing status banner, and sync editor changes in real time.
