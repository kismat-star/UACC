"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import type { FileShape, SessionShape } from "@/lib/types";

export interface AdminSocketEvents {
  "file-uploaded": (data: { file: FileShape }) => void;
  "file-deleted": (data: { fileId: string }) => void;
  "file-printed": (data: { file: FileShape }) => void;
  "session-updated": (data: { session: SessionShape }) => void;
}

/**
 * Connects to the file-notify WebSocket service (port 3003 via gateway) and
 * subscribes to the "admin" room. Attaches the provided event handlers.
 * Reconnects automatically. Safe to call from the admin dashboard only.
 */
export function useAdminSocket(
  handlers: AdminSocketEvents,
  onStatus?: (connected: boolean) => void,
) {
  // Keep stable refs to the latest handlers so the socket isn't recreated
  // whenever a parent re-renders. Refs are updated inside an effect (the new
  // React compiler / lint rule disallows writing refs during render).
  const handlersRef = useRef(handlers);
  const onStatusRef = useRef(onStatus);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);
  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    // Path "/" + XTransformPort=3003 is REQUIRED by the Caddy gateway.
    const socket: Socket = io("/?XTransformPort=3003", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 8000,
      timeout: 10000,
    });

    socket.on("connect", () => {
      socket.emit("subscribe", { room: "admin" });
      onStatusRef.current?.(true);
    });
    socket.on("disconnect", () => onStatusRef.current?.(false));

    // Receiving any server-pushed event is a heartbeat proving the live
    // connection works — flip status true (overrides spurious false from
    // transport-upgrade hiccups).
    const heartbeat = () => onStatusRef.current?.(true);
    socket.on("file-uploaded", (data: { file: FileShape }) => {
      heartbeat();
      handlersRef.current["file-uploaded"](data);
    });
    socket.on("file-deleted", (data: { fileId: string }) => {
      heartbeat();
      handlersRef.current["file-deleted"](data);
    });
    socket.on("file-printed", (data: { file: FileShape }) => {
      heartbeat();
      handlersRef.current["file-printed"](data);
    });
    socket.on("session-updated", (data: { session: SessionShape }) => {
      heartbeat();
      handlersRef.current["session-updated"](data);
    });

    return () => {
      socket.disconnect();
    };
  }, []);
}
