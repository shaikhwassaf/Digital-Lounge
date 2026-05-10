import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [lounges, setLounges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [showModal, setShowModal] = useState(false);
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');

  const fetchLoungeData = async () => {
    setLoading(true);
    const { data: loungeData, error: loungeError } = await supabase
      .from('active_lounges')
      .select('*');

    if (loungeError) {
      console.error('Error:', loungeError.message);
    } else {
      const loungesWithCounts = await Promise.all((loungeData || []).map(async (lounge) => {
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

  useEffect(() => {
    fetchLoungeData();
  }, []);

  const handleCreateLounge = async () => {
    if (!newLoungeName || !newHostName) return alert("Please fill in both fields!");

    const { error } = await supabase
      .from('active_lounges')
      .insert([
        { 
          lounge_name: newLoungeName, 
          host_name: newHostName,
          peer_id: `peer-${Math.random().toString(36).substr(2, 9)}` // Auto-generating a Peer ID
        }
      ]);

    if (error) {
      alert("Error creating lounge: " + error.message);
    } else {
      setShowModal(false);
      setNewLoungeName('');
      setNewHostName('');
      fetchLoungeData(); // Refresh the list
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <header style={{ borderBottom: '2px solid #333', marginBottom: '30px' }}>
        <h1>Digital Lounge</h1>
      </header>
      
      <button 
        onClick={() => setShowModal(true)}
        style={{ background: '#000', color: '#fff', padding: '12px 20px', borderRadius: '6px', cursor: 'pointer', marginBottom: '20px' }}
      >
        + Host New Lounge
      </button>

      {/* MODAL OVERLAY */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '400px' }}>
            <h2>Host a New Lounge</h2>
            <input 
              placeholder="Lounge Name (e.g. Talk Shawk)" 
              value={newLoungeName} 
              onChange={(e) => setNewLoungeName(e.target.value)}
              style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }}
            />
            <input 
              placeholder="Your Name (Host)" 
              value={newHostName} 
              onChange={(e) => setNewHostName(e.target.value)}
              style={{ width: '100%', padding: '10px', marginBottom: '20px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleCreateLounge} style={{ flex: 1, padding: '10px', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: '4px' }}>Save & Go Live</button>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '10px', background: '#eee', border: 'none', borderRadius: '4px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* LOUNGE LIST */}
      <div>
        {loading ? <p>Updating lounge list...</p> : lounges.map((lounge) => (
          <div key={lounge.id} style={{ border: '1px solid #eee', padding: '20px', borderRadius: '12px', marginBottom: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
            <h3>{lounge.lounge_name}</h3>
            <p>Hosted by: <strong>{lounge.host_name}</strong></p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>👥 {lounge.participantCount} participants</span>
              <button style={{ padding: '6px 12px', borderRadius: '4px' }}>Join</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
