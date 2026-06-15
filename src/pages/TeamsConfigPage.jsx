import * as microsoftTeams from '@microsoft/teams-js';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function TeamsConfigPage() {
  const [boards, setBoards] = useState([]);
  const [selectedBoard, setSelectedBoard] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const selectedBoardRef = useRef('');

  useEffect(() => {
    microsoftTeams.app.initialize().then(async () => {
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

      await checkSessionAndFetchBoards();
    });
  }, []);

  const checkSessionAndFetchBoards = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsLoggedIn(true);
        const { data } = await supabase.from('boards').select('id, name').order('created_at');
        setBoards(data || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    setAuthError('');
    try {
      await microsoftTeams.authentication.authenticate({
        url: `${window.location.origin}/login?teams_popup=true`,
        width: 600,
        height: 535,
      });
      // Popup closed successfully — session is now in localStorage
      await checkSessionAndFetchBoards();
    } catch {
      setAuthError('Sign in failed or was cancelled. Please try again.');
    }
  };

  const handleSelect = (boardId) => {
    selectedBoardRef.current = boardId;
    setSelectedBoard(boardId);
    microsoftTeams.pages.config.setValidityState(!!boardId);
  };

  if (loading) {
    return (
      <div style={{ padding: 32, fontFamily: 'Inter, sans-serif', color: '#666', fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div style={{ padding: 32, fontFamily: 'Inter, sans-serif', maxWidth: 480 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#0073ea', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>DT</span>
        </div>
        <h2 style={{ fontSize: 20, marginBottom: 6, color: '#111' }}>Add DegiTask Board</h2>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
          Sign in to your DegiTask account to choose a board for this channel.
        </p>
        {authError && (
          <p style={{ color: '#d93025', fontSize: 13, marginBottom: 12 }}>{authError}</p>
        )}
        <button
          onClick={handleSignIn}
          style={{
            padding: '10px 20px',
            background: '#0073ea',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Sign in to DegiTask
        </button>
      </div>
    );
  }

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
          No boards found. Create a board in DegiTask first.
        </p>
      )}
    </div>
  );
}
