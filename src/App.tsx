import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [lounges, setLounges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [currentLounge, setCurrentLounge] = useState<any>(null);

  // --- SECURITY & FORM STATES ---
  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [inputCode, setInputCode] = useState(''); 
  const [generatedCode, setGeneratedCode] = useState('');

  // --- SYNC ENGINE STATE ---
  // This tracks the "Timestamp" or "Page Number" to sync local files/apps
  const [localTimestamp, setLocalTimestamp] = useState(0);

  // 1. Fetch Active Lounges for the Lobby
  const fetchLoungeData = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('active_lounges').select('*');
    if (error) {
      console.error('Error fetching lounges:', error.message);
    } else if (data) {
      // Map participants count for UI feedback
      const withCounts = await Promise.all(data.map(async (l) => {
        const { count } = await supabase
          .from('participants')
          .select('*', { count: 'exact', head: true })
          .eq('lounge_id', l.id);
        return { ...l, participantCount: count || 0 };
      }));
      setLounges(withCounts);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLoungeData(); }, []);

  // 2. Real-Time Listener (Slaves the Participant to the Host's position)
  useEffect(() => {
    if (view === 'room' && currentLounge) {
      const channel = supabase
        .channel(`lounge-sync-${currentLounge.id}`)
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'active_lounges', 
          filter: `id=eq.${currentLounge.id}` 
        }, (payload) => {
          if (payload.new.last_timestamp !== undefined) {
            setLocalTimestamp(payload.new.last_timestamp);
          }
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [view, currentLounge]);

  // 3. Helper: Generate valid UUID to prevent "invalid input syntax for type uuid"
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // 4. Host Action: Create Gated Lounge
  const handleCreateLounge = async () => {
    if (!newLoungeName || !newHostName) return alert("Please enter both topic and name.");
    
    const uniqueEntryCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hostId = generateUUID();

    const { data, error } = await supabase.from('active_lounges').insert([{
      lounge_name: newLoungeName,
      host_name: newHostName,
      host_id: hostId,
      entry_code: uniqueEntryCode,
      last_timestamp: 0,
      peer_id: `host-${Math.random().toString(36).substring(2, 7)}`
    }]).select();

    if (error) {
      alert("Database Error: " + error.message);
    } else if (data) {
      setGeneratedCode(uniqueEntryCode);
      setCurrentLounge(data[0]);
      setShowHostModal(false);
      setView('room');
    }
  };

  // 5. Guest Action: Verify Code & Enter
  const handleJoinVerify = async () => {
    if (!inputCode) return alert("Please enter the access code.");
    
    // Strict string comparison to prevent type mismatch
    if (inputCode.trim() === currentLounge.entry_code.toString().trim()) {
      const { error } = await supabase.from('participants').insert([{
        lounge_id: currentLounge.id,
        user_name: guestName || 'Anonymous Guest',
        peer_id: `guest-${Math.random().toString(36).substring(2, 7)}`
      }]);

      if (!error) {
        setShowJoinModal(false);
        setView('room');
      } else {
        alert("Join Error: " + error.message);
      }
    } else {
      alert("Invalid Entry Code! Please check with the Host.");
    }
  };

  // 6. Sync Action: Update Position (Host Only)
  const syncPosition = async (newVal: number) => {
    setLocalTimestamp(newVal);
    // This update triggers the real-time listener for all participants
    await supabase
      .from('active_lounges')
      .update({ last_timestamp: newVal })
      .eq('id', currentLounge.id);
  };

  // --- RENDERING: LOBBY VIEW ---
  if (view === 'lobby') {
    return (
      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif', color: '#333' }}>
        <header style={{ borderBottom: '2px solid #eee', paddingBottom: '20px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0 }}>Digital Lounge</h1>
            <p style={{ margin: 0, color: '#666' }}>Welcome to the central hub.</p>
          </div>
          <button onClick={() => setShowHostModal(true)} style={{ background: '#000', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            + Host New Lounge
          </button>
        </header>

        <section>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '15px' }}>Live Lounges</h2>
          {loading ? (
            <p>Scanning...</p>
          ) : lounges.length > 0 ? (
            <div style={{ display: 'grid', gap: '15px' }}>
              {lounges.map(l => (
                <div key={l.id} style={{ border: '1px solid #eee', padding: '20px', borderRadius: '15px', background: '#fff', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: '0 0 5px 0' }}>{l.lounge_name}</h3>
                    <p style={{ margin: 0, fontSize: '14px', color: '#888' }}>Hosted by: <strong>{l.host_name}</strong></p>
                    <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#28a745' }}>👥 {l.participantCount} participants</p>
                  </div>
                  <button onClick={() => { setCurrentLounge(l); setShowJoinModal(true); }} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #000', background: 'transparent', fontWeight: 'bold', cursor: 'pointer' }}>
                    Join Lounge
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#999', textAlign: 'center', padding: '40px' }}>No active lounges at the moment.</p>
          )}
        </section>

        {/* MODAL: HOSTING */}
        {showHostModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '20px', width: '340px' }}>
              <h2 style={{ marginTop: 0 }}>Host a Lounge</h2>
              <input placeholder="Lounge Name (e.g. Letter of Credit)" value={newLoungeName} onChange={e => setNewLoungeName(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid #ccc' }} />
              <input placeholder="Your Name" value={newHostName} onChange={e => setNewHostName(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '20px', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid #ccc' }} />
              <button onClick={handleCreateLounge} style={{ width: '100%', padding: '14px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Save & Go Live</button>
              <button onClick={() => setShowHostModal(false)} style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* MODAL: JOINING (CODE GATE) */}
        {showJoinModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '20px', width: '340px' }}>
              <h2 style={{ marginTop: 0 }}>Enter Lounge Code</h2>
              <p style={{ fontSize: '14px', color: '#666' }}>Secure entry for: <strong>{currentLounge?.lounge_name}</strong></p>
              <input placeholder="Your Name" value={guestName} onChange={e => setGuestName(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid #ccc' }} />
              <input placeholder="6-Digit Code" value={inputCode} onChange={e => setInputCode(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '20px', textAlign: 'center', fontSize: '24px', fontWeight: 'bold', letterSpacing: '4px', boxSizing: 'border-box', borderRadius: '8px', border: '2px solid #000' }} />
              <button onClick={handleJoinVerify} style={{ width: '100%', padding: '14px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Verify & Join</button>
              <button onClick={() => { setShowJoinModal(false); setInputCode(''); }} style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- RENDERING: LOUNGE ROOM VIEW ---
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f9f9f9', fontFamily: 'sans-serif' }}>
      <header style={{ padding: '15px 25px', background: '#000', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ color: '#28a745', marginRight: '10px' }}>● LIVE</span>
          <strong style={{ fontSize: '1.1rem' }}>{currentLounge?.lounge_name}</strong>
          <span style={{ marginLeft: '20px', opacity: 0.7, fontSize: '14px' }}>
            Access Code: <span style={{ color: '#ffcc00', fontWeight: 'bold' }}>{generatedCode || currentLounge?.entry_code}</span>
          </span>
        </div>
        <button onClick={() => { setView('lobby'); fetchLoungeData(); }} style={{ background: '#ff4d4d', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
          Leave Lounge
        </button>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', padding: '60px', borderRadius: '40px', boxShadow: '0 20px 50px rgba(0,0,0,0.05)', textAlign: 'center', border: '1px solid #eee' }}>
          <p style={{ margin: 0, color: '#888', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '12px' }}>Local Sync Position</p>
          <h1 style={{ fontSize: '180px', margin: '10px 0', fontWeight: '800', fontFamily: 'monospace', color: '#000' }}>
            {localTimestamp}
          </h1>
          
          <div style={{ marginTop: '20px', display: 'flex', gap: '15px', justifyContent: 'center' }}>
            <button 
              onClick={() => syncPosition(localTimestamp - 1)}
              style={{ padding: '15px 30px', borderRadius: '12px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}
            >
              Previous
            </button>
            <button 
              onClick={() => syncPosition(localTimestamp + 1)}
              style={{ padding: '15px 40px', borderRadius: '12px', border: 'none', background: '#000', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Next Step
            </button>
          </div>
        </div>

        <div style={{ marginTop: '40px', maxWidth: '500px', textAlign: 'center', color: '#666' }}>
          <p style={{ fontSize: '14px', lineHeight: '1.6' }}>
            <strong>How it works:</strong> This number syncs in real-time. Use it to map your local PDF, 
            Streaming Service, or Apps to the exact same position as the Host. No files are stored or shared.
          </p>
        </div>
      </main>

      <footer style={{ padding: '15px', textAlign: 'center', background: '#fff', borderTop: '1px solid #eee', fontSize: '12px', color: '#aaa' }}>
        Secure Local-Sync Technology | Powered by Supabase Real-time
      </footer>
    </div>
  );
}
