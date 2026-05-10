import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [lounges, setLounges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Modal Visibility States
  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  
  // Form Inputs
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [selectedLoungeId, setSelectedLoungeId] = useState<string | null>(null);

  // Phase 4: Integration - Fetching logic
  const fetchLoungeData = async () => {
    setLoading(true);
    const { data: loungeData, error } = await supabase.from('active_lounges').select('*');

    if (error) {
      console.error('Fetch Error:', error.message);
    } else if (loungeData) {
      // Mapping participants count from the participants table
      const loungesWithCounts = await Promise.all(loungeData.map(async (lounge) => {
        const { count } = await supabase
          .from('participants')
          .select('*', { count: 'exact', head: true })
          .eq('lounge_id', lounge.id);
        return { ...lounge, participantCount: count || 0 };
      }));
      setLounges(loungesWithCounts);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLoungeData(); }, []);

  // Phase 5: Functional Logic - Create Lounge
  const handleCreateLounge = async () => {
    if (!newLoungeName || !newHostName) return alert("Please fill in all fields");
    setActionLoading(true);
    
    const { error } = await supabase.from('active_lounges').insert([{ 
      lounge_name: newLoungeName, 
      host_name: newHostName,
      host_id: '123e4567-e89b-12d3-a456-426614174000', // Temporary dummy UUID
      peer_id: `peer-${Math.random().toString(36).substr(2, 9)}`
    }]);

    if (error) {
      alert("Error: " + error.message);
    } else {
      setShowHostModal(false);
      setNewLoungeName('');
      setNewHostName('');
      await fetchLoungeData();
    }
    setActionLoading(false);
  };

  // Phase 5: Functional Logic - Join Lounge
  const handleJoinLounge = async () => {
    if (!guestName || !selectedLoungeId) return alert("Please enter your name");
    setActionLoading(true);

    const { error } = await supabase.from('participants').insert([{
      lounge_id: selectedLoungeId,
      user_name: guestName,
      peer_id: `guest-${Math.random().toString(36).substr(2, 9)}`
    }]);

    if (error) {
      alert("Join Error: " + error.message);
    } else {
      setShowJoinModal(false);
      setGuestName('');
      setSelectedLoungeId(null);
      await fetchLoungeData();
    }
    setActionLoading(false);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif', color: '#333' }}>
      <header style={{ borderBottom: '2px solid #eee', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Digital Lounge</h1>
        <button 
          onClick={() => setShowHostModal(true)} 
          style={{ background: '#000', color: '#fff', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}
        >
          + Host
        </button>
      </header>

      {/* HOST MODAL */}
      {showHostModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '15px', width: '320px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h2 style={{ marginTop: 0 }}>Start a Session</h2>
            <input placeholder="Lounge Topic" value={newLoungeName} onChange={(e) => setNewLoungeName(e.target.value)} style={{ width: '100%', marginBottom: '15px', padding: '12px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc' }} />
            <input placeholder="Your Name" value={newHostName} onChange={(e) => setNewHostName(e.target.value)} style={{ width: '100%', marginBottom: '20px', padding: '12px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc' }} />
            <button disabled={actionLoading} onClick={handleCreateLounge} style={{ width: '100%', padding: '12px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              {actionLoading ? 'Creating...' : 'Go Live'}
            </button>
            <button onClick={() => setShowHostModal(false)} style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* JOIN MODAL */}
      {showJoinModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '15px', width: '320px' }}>
            <h2 style={{ marginTop: 0 }}>Join Lounge</h2>
            <p style={{ fontSize: '14px', color: '#666' }}>What should we call you?</p>
            <input placeholder="Your Display Name" value={guestName} onChange={(e) => setGuestName(e.target.value)} style={{ width: '100%', marginBottom: '20px', padding: '12px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #ccc' }} />
            <button disabled={actionLoading} onClick={handleJoinLounge} style={{ width: '100%', padding: '12px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              {actionLoading ? 'Joining...' : 'Enter Lounge'}
            </button>
            <button onClick={() => { setShowJoinModal(false); setSelectedLoungeId(null); }} style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* LOUNGE FEED */}
      <div style={{ display: 'grid', gap: '15px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#888' }}>Scanning active lounges...</p>
        ) : lounges.length > 0 ? (
          lounges.map(lounge => (
            <div key={lounge.id} style={{ border: '1px solid #eee', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '18px' }}>{lounge.lounge_name}</h3>
                <span style={{ color: '#28a745', fontSize: '12px', fontWeight: 'bold' }}>● LIVE</span>
              </div>
              <p style={{ margin: '8px 0', color: '#666', fontSize: '14px' }}>Host: <strong>{lounge.host_name}</strong></p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px' }}>
                <span style={{ fontSize: '14px', color: '#444', background: '#f8f9fa', padding: '4px 10px', borderRadius: '20px' }}>
                  👥 {lounge.participantCount} Present
                </span>
                <button 
                  onClick={() => { setSelectedLoungeId(lounge.id); setShowJoinModal(true); }} 
                  style={{ padding: '8px 20px', borderRadius: '6px', border: '1px solid #000', background: 'transparent', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Join
                </button>
              </div>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '50px', background: '#fdfdfd', border: '1px dashed #ccc', borderRadius: '12px' }}>
            <p style={{ color: '#999' }}>No active lounges. Start one to get moving!</p>
          </div>
        )}
      </div>
    </div>
  );
}
