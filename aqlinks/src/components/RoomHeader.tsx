import React from 'react';
import { ConnectionState } from '../types';

interface RoomHeaderProps {
  isConnected: boolean;
  connectionState: ConnectionState;
  room: string;
  isJoining: boolean;
  onRoomChange: (room: string) => void;
  onJoinRoom: () => void;
  onLeaveRoom: () => void;
}

export function RoomHeader({
  isConnected,
  connectionState,
  room,
  isJoining,
  onRoomChange,
  onJoinRoom,
  onLeaveRoom,
}: RoomHeaderProps) {
  const connectionStatusColor = (() => {
    switch (connectionState) {
      case 'connected': return 'bg-green-400';
      case 'connecting':
      case 'reconnecting': return 'bg-yellow-400 animate-pulse';
      case 'failed': return 'bg-red-400';
      default: return 'bg-gray-400';
    }
  })();

  return (
    <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">AqLinks Video Conference</h1>
          {isConnected && (
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connectionStatusColor}`} />
              <span className="text-sm text-gray-300 capitalize">{connectionState}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          {!isConnected ? (
            <div className="flex items-center gap-3">
              <input
                id="room"
                type="text"
                value={room}
                onChange={(e) => onRoomChange(e.target.value)}
                placeholder="Room name"
                className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                disabled={isConnected}
              />
              <button
                onClick={onJoinRoom}
                disabled={isConnected || isJoining}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isJoining ? 'Joining...' : 'Join Room'}
              </button>
            </div>
          ) : (
            <button
              onClick={onLeaveRoom}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
            >
              Leave Room
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
