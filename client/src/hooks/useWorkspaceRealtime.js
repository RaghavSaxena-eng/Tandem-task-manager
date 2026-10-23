import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE } from '../api.js';
import { useAuth } from '../auth.jsx';

const EVENTS = [
  'task:created',
  'task:updated',
  'task:deleted',
  'board:created',
  'board:updated',
  'board:deleted',
  'member:changed',
  'workspace:updated',
  'workspace:deleted',
];

/**
 * Subscribes to a workspace's live events over Socket.io.
 * `handlers` maps event names (e.g. 'task:updated') to callbacks; `onReconnect`
 * runs after a dropped connection is restored so the page can refetch what it missed.
 * Returns whether the live connection is currently established.
 */
export function useWorkspaceRealtime(workspaceId, handlers) {
  const { token } = useAuth();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!workspaceId || !token) return undefined;

    const socket = io(API_BASE || undefined, { auth: { token } });
    let joinedBefore = false;

    EVENTS.forEach((event) => socket.on(event, (payload) => handlersRef.current[event]?.(payload)));

    socket.on('connect', () => {
      socket.emit('workspace:join', workspaceId, (res) => {
        setLive(Boolean(res?.ok));
        if (res?.ok && joinedBefore) handlersRef.current.onReconnect?.();
        if (res?.ok) joinedBefore = true;
      });
    });
    socket.on('disconnect', () => setLive(false));

    return () => {
      socket.disconnect();
      setLive(false);
    };
  }, [workspaceId, token]);

  return live;
}
