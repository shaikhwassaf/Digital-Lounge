import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [lounges, setLounges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [currentLounge, setCurrentLounge] = useState<any>(null);

  // FORM & SECURITY STATES
  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [inputCode, setInputCode] = useState(''); // The code the guest types
  const [generatedCode, setGeneratedCode] = useState(''); // The code shown to host

  // SYNC STATE
  const [localTimestamp, setLocalTimestamp] = useState(0);

  const fetchLoungeData = async () => {
    setLoading(true);
    const { data } = await supabase.from('active_lounges').select('*');
    if (data) {
      const withCounts = await Promise.all(data.map(async (l) => {
        const { count } = await supabase.from('participants').select('*', { count: 'exact', head: true }).eq('lounge_id', l.id);
        return { ...l, participantCount: count || 0 };
      }));
      setLounges(withCounts);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLoungeData(); }, []);

  // REAL-TIME SYNC LISTENER
  useEffect(() => {
    if (view === 'room' && currentLounge) {
      const channel = supabase
        .channel(`lounge-${currentLounge.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'active_lounges', filter: `id=eq.${currentLounge.id}` }, 
        (payload) => {
          if (payload.new.last_timestamp !== undefined) {
            setLocalTimestamp(payload.new.last_timestamp);
          }
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [view, currentLounge]);

  // HOST: Create Lounge with Unique Code
  const handleCreate = async () => {
    if (!newLoungeName || !newHostName) return alert("Missing fields");
    
    // Generate a 6-digit unique entry code
    const uniqueCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    const { data, error } = await supabase.from('active_lounges').insert([{
      lounge_name: newLoungeName,
      host_name: newHostName,
      host_id: '123e4567-e89b-12d3-a456-426614174000',
      entry_code: uniqueCode, // Ensure this column exists in Supabase!
      last_timestamp: 0
    }]).select();

    if (!error && data) {
      setGeneratedCode(uniqueCode);
      setCurrentLounge(data[0]);
      setShowHostModal(false);
      setView('room');
    } else {
      alert("Error: " + error?.message);
    }
  };

  // GUEST: Verify Code before Entry
  const handleJoinVerify = async () => {
    if (inputCode === currentLounge.entry_code) {
      const { error } = await supabase.from('participants').insert([{
        lounge_id: currentLounge.id,
        user_name: guestName || 'Guest'
      }]);
      if (!error) {
        setShowJoinModal(false);
        setView('room');
      }
    } else {
      alert("Invalid Entry Code! Please ask the Host for the correct 6-digit code.");
    }
  };

  if (view === 'lobby') {
    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Lounge Hub</h1>
          <button onClick={() => setShowHostModal(true)} style={{ background: '#000', color: '#fff', padding: '10px 15px', borderRadius: '8px' }}>+ Host</button>
        </header>

        <div style={{ marginTop: '20px' }}>
          {lounges.map(l => (
            <div key={l.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '10px', marginBottom: '10px' }}>
              <h3>{l.lounge_name} 🔒</h3>
              <button onClick={() => { setCurrentLounge(l); setShowJoinModal(true); }}>Join Session</button>
            </div>
          ))}
        </div>

        {/* HOST MODAL */}
        {showHostModal && (
          <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '300px' }}>
              <h2>Host Lounge</h2>
              <input placeholder="Topic" value={newLoungeName} onChange={e => setNewLoungeName(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px' }} />
              <input placeholder="Your Name" value={newHostName} onChange={e => setNewHostName(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '20px' }} />
              <button onClick={handleCreate} style={{ width: '100%', padding: '12px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '8px' }}>Generate Code & Start</button>
            </div>
          </div>
        )}

        {/* JOIN MODAL */}
        {showJoinModal && (
          <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '300px' }}>
              <h2>Enter Lounge Code</h2>
              <p>Session: <strong>{currentLounge?.lounge_name}</strong></p>
              <input placeholder="Your Name" value={guestName} onChange={e => setGuestName(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px' }} />
              <input placeholder="6-Digit Code" value={inputCode} onChange={e => setInputCode(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '20px', textAlign: 'center', fontSize: '20px', letterSpacing: '5px' }} />
              <button onClick={handleJoinVerify} style={{ width: '100%', padding: '12px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '8px' }}>Verify & Enter</button>
              <button onClick={() => setShowJoinModal(false)} style={{ width: '100%', marginTop: '10px', border: 'none', background: 'none' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- ROOM VIEW ---
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', textAlign: 'center', background: '#f4f4f4' }}>
      <header style={{ padding: '15px', background: '#000', color: '#fff', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <strong>{currentLounge?.lounge_name}</strong>
          {generatedCode && <span style={{ marginLeft: '20px', color: '#28a745' }}>Access Code: {generatedCode}</span>}
        </div>
        <button onClick={() => setView('lobby')} style={{ background: 'red', color: '#fff', border: 'none', padding: '5px 15px' }}>Exit</button>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', padding: '50px', borderRadius: '30px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
          <p>Local File/App Sync Position:</p>
          <h1 style={{ fontSize: '120px', margin: '20px 0' }}>{localTimestamp}</h1>
          
          {/* SIMULATED HOST CONTROLLER */}
          <div style={{ display: 'flex', gap: '20px' }}>
            <button onClick={() => {
              const newTime = localTimestamp + 1;
              setLocalTimestamp(newTime);
              supabase.from('active_lounges').update({ last_timestamp: newTime }).eq('id', currentLounge.id).then();
            }} style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer' }}>Next Page/Step</button>
          </div>
        </div>
        <p style={{ marginTop: '20px', color: '#666' }}>Participants must have their own specific local file/app open.</p>
      </div>
    </div>
  );
}
