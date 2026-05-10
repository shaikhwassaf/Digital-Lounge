import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [lounges, setLounges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // NAVIGATION & SELECTION STATE
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [currentLounge, setCurrentLounge] = useState<any>(null);

  // MODAL & FORM STATES
  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [guestName, setGuestName] = useState('');

  // 1. DATA FETCHING (LOBBY)
  const fetchLoungeData = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('active_lounges').select('*');
    if (error) console.error(error);
    else if (data) {
      const withCounts = await Promise.all(data.map(async (l) => {
        const { count } = await supabase.from('participants').select('*', { count: 'exact', head: true }).eq('lounge_id', l.id);
        return { ...l, participantCount: count || 0 };
      }));
      setLounges(withCounts);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLoungeData(); }, []);

  // 2. ACTION LOGIC
  const handleCreate = async () => {
    if (!newLoungeName || !newHostName) return alert("Missing fields");
    const { data, error } = await supabase.from('active_lounges').insert([{
      lounge_name: newLoungeName,
      host_name: newHostName,
      host_id: '123e4567-e89b-12d3-a456-426614174000',
      peer_id: `host-${Math.random().toString(36).substring(2, 7)}`
    }]).select();

    if (!error && data) {
      setShowHostModal(false);
      setCurrentLounge(data[0]);
      setView('room'); // Auto-enter the room you just created
    }
  };

  const handleJoin = async () => {
    if (!guestName || !currentLounge) return;
    const { error } = await supabase.from('participants').insert([{
      lounge_id: currentLounge.id,
      user_name: guestName,
      peer_id: `guest-${Math.random().toString(36).substring(2, 7)}`
    }]);
    if (!error) {
      setShowJoinModal(false);
      setView('room');
    }
  };

  // --- VIEW: LOBBY ---
  if (view === 'lobby') {
    return (
      <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '2.5rem' }}>Digital Lounge Hub</h1>
          <button onClick={() => setShowHostModal(true)} style={{ background: '#000', color: '#fff', padding: '12px 25px', borderRadius: '8px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>+ Host New Lounge</button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {loading ? <p>Scanning for live sessions...</p> : lounges.map(l => (
            <div key={l.id} style={{ border: '1px solid #eee', padding: '20px', borderRadius: '15px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              <h2 style={{ margin: '0 0 10px 0' }}>{l.lounge_name}</h2>
              <p style={{ color: '#666' }}>Host: <strong>{l.host_name}</strong></p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                <span style={{ fontSize: '14px', background: '#f0f0f0', padding: '5px 12px', borderRadius: '20px' }}>👥 {l.participantCount}</span>
                <button onClick={() => { setCurrentLounge(l); setShowJoinModal(true); }} style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', border: '1px solid #000', background: 'transparent' }}>Join</button>
              </div>
            </div>
          ))}
        </div>

        {/* HOST MODAL */}
        {showHostModal && (
          <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '15px', width: '350px' }}>
              <h2>Start a Lounge</h2>
              <input placeholder="Lounge Topic" value={newLoungeName} onChange={e => setNewLoungeName(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', boxSizing: 'border-box' }} />
              <input placeholder="Your Name" value={newHostName} onChange={e => setNewHostName(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '20px', boxSizing: 'border-box' }} />
              <button onClick={handleCreate} style={{ width: '100%', padding: '12px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>Go Live</button>
              <button onClick={() => setShowHostModal(false)} style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: '#999' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* JOIN MODAL */}
        {showJoinModal && (
          <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '15px', width: '350px' }}>
              <h2>Join {currentLounge?.lounge_name}</h2>
              <input placeholder="Your Display Name" value={guestName} onChange={e => setGuestName(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '20px', boxSizing: 'border-box' }} />
              <button onClick={handleJoin} style={{ width: '100%', padding: '12px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>Enter Lounge</button>
              <button onClick={() => { setShowJoinModal(false); setGuestName(''); }} style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: '#999' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- VIEW: THE LOUNGE ROOM (STREAMING + OVERLAYS) ---
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#121212', color: '#fff', overflow: 'hidden' }}>
      <header style={{ padding: '15px 25px', background: '#1e1e1e', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{ color: '#28a745', fontSize: '12px' }}>● LIVE</span>
          <h2 style={{ margin: 0 }}>{currentLounge.lounge_name}</h2>
        </div>
        <button onClick={() => { setView('lobby'); fetchLoungeData(); }} style={{ background: '#ff4d4d', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer' }}>Leave Lounge</button>
      </header>

      <div style={{ flex: 1, display: 'flex' }}>
        {/* SIDEBAR: STREAMING SERVICES */}
        <div style={{ width: '320px', background: '#181818', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', padding: '20px', gap: '20px' }}>
          <div style={{ width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #444' }}>
            <p style={{ color: '#666', fontSize: '14px' }}>Video Feed Loading...</p>
          </div>
          
          <div style={{ flex: 1, background: '#222', borderRadius: '10px', padding: '15px', overflowY: 'auto' }}>
            <h4 style={{ margin: '0 0 15px 0', borderBottom: '1px solid #444', paddingBottom: '10px' }}>Participants</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px' }}>
               <p>👑 {currentLounge.host_name} (Host)</p>
               {guestName && <p>👤 {guestName} (You)</p>}
            </div>
          </div>
        </div>

        {/* MAIN STAGE: PDF & APP OVERLAYS */}
        <div style={{ flex: 1, background: '#f5f5f5', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '15px', display: 'flex', gap: '10px', background: '#fff', borderBottom: '1px solid #ddd', zIndex: 10 }}>
            <button style={{ padding: '8px 15px', borderRadius: '5px', border: '1px solid #ccc', cursor: 'pointer' }}>📂 Load PDF</button>
            <button style={{ padding: '8px 15px', borderRadius: '5px', border: '1px solid #ccc', cursor: 'pointer' }}>🖥️ Share Screen</button>
            <button style={{ padding: '8px 15px', borderRadius: '5px', border: '1px solid #ccc', cursor: 'pointer' }}>🧮 Calculator</button>
          </div>

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* THIS AREA WILL RENDER THE PDF OR APP */}
            <div style={{ textAlign: 'center', color: '#aaa' }}>
              <div style={{ fontSize: '50px', marginBottom: '10px' }}>📄</div>
              <p>No Tool Active.<br/>Click a service above to launch the overlay.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
