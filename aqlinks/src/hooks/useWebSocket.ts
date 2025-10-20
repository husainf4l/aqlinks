import { useRef, useCallback, useState } from 'react';
import { WebRTCSignalingMessage } from '../types';

export interface UseWebSocketReturn {
  ws: WebSocket | null;
  isConnected: boolean;
  connect: (url: string, userId: string, onMessage: (msg: WebRTCSignalingMessage) => void) => Promise<void>;
  disconnect: () => void;
  send: (message: WebRTCSignalingMessage) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const messageBufferRef = useRef<string>('');

  const connect = useCallback(async (url: string, userId: string, onMessage: (msg: WebRTCSignalingMessage) => void): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Append userId to the WebSocket URL
      const urlWithUser = `${url}&userId=${encodeURIComponent(userId)}`;
      console.log('Connecting to WebSocket:', urlWithUser);

      const connectionTimeout = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
          console.error('❌ WebSocket connection timeout');
          wsRef.current.close();
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      wsRef.current = new WebSocket(urlWithUser);

      wsRef.current.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        clearTimeout(connectionTimeout);
        setIsConnected(true);
        messageBufferRef.current = ''; // Reset buffer on new connection
        resolve();
      };

      wsRef.current.onmessage = (event: MessageEvent) => {
        try {
          // Handle potential message fragmentation
          let data = event.data;
          
          // If we have buffered data, prepend it
          if (messageBufferRef.current) {
            data = messageBufferRef.current + data;
            messageBufferRef.current = '';
          }

          // Try to parse the message
          try {
            const msg: WebRTCSignalingMessage = JSON.parse(data);
            console.log('📨 Received WebSocket message:', msg.type);
            onMessage(msg);
          } catch (parseError) {
            // If parsing fails, it might be a fragmented message
            // Buffer it and wait for the next message
            messageBufferRef.current = data;
            console.warn('⚠️ Buffering incomplete message');
          }
        } catch (err) {
          console.error('❌ Failed to handle WebSocket message:', err);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        clearTimeout(connectionTimeout);
        setIsConnected(false);
        messageBufferRef.current = '';
        reject(new Error('WebSocket connection failed'));
      };

      wsRef.current.onclose = (event) => {
        console.log('❌ WebSocket closed:', { code: event.code, reason: event.reason, wasClean: event.wasClean });
        clearTimeout(connectionTimeout);
        setIsConnected(false);
        messageBufferRef.current = '';
      };
    });
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      console.log('🛑 Closing WebSocket');
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;

        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close(1000, 'cleanup');
        }
      } catch (err) {
        console.error('❌ Error closing WebSocket:', err);
      }
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const send = useCallback((message: WebRTCSignalingMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error('❌ WebSocket not connected');
    }
  }, []);

  return {
    ws: wsRef.current,
    isConnected,
    connect,
    disconnect,
    send,
  };
}
