import * as microsoftTeams from '@microsoft/teams-js';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function TeamsConfigPage() {
  const [boards, setBoards] = useState([]);
  const [selectedBoard, setSelectedBoard] = useState('');
  // Ref so the save handler always reads the current selection (avoids stale closure)
  const selectedBoardRef = useRef('');

  useEffect(() => {
    microsoftTeams.app.initialize().then(() => {
      microsoftTeams.pages.config.registerOnSaveHandler((saveEvent) => {
        const boardId = selectedBoardRef.current;
        microsoftTeams.pages.config.setConfig({
          entityId: `degitask-board-${boardId}`,
          contentUrl: `https://degitasks.degitrans.com/board/${boardId}?teams=true`,
          suggestedDisplayName: 'DegiTask',
          websiteUrl: `https://degitasks.degitrans.com/board/${boardId}`,
        });
        saveEvent.notifySuccess();
      });
    });

    supabase
      .from('boards')
      .select('id, name')
      .then(({ data }) => setBoards(data || []));
  }, []);

  const handleSelect = (boardId) => {
    selectedBoardRef.current = boardId;
    setSelectedBoard(boardId);
    microsoftTeams.pages.config.setValidityState(!!boardId);
  };

  return (
    <div style={{ padding: 32, fontFamily: 'Inter, sans-serif', maxWidth: 480 }}>
      <h2 style={{ fontSize: 20, marginBottom: 8, color: '#111' }}>Add DegiTask Board</h2>
      <p style={{ color: '#666', marginBottom: 20, fontSize: 14 }}>
        Choose which board to display in this Teams channel tab
      </p>
      <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
        Select Board
      </label>
      <select
        value={selectedBoard}
        onChange={(e) => handleSelect(e.target.value)}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 6,
          border: '1px solid #ddd',
          fontSize: 14,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        <option value="">-- Select a board --</option>
        {boards.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {boards.length === 0 && (
        <p style={{ marginTop: 12, fontSize: 13, color: '#999' }}>
          No boards found. Please log in to DegiTask first to see your boards.
        </p>
      )}
    </div>
  );
}
