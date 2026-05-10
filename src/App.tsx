import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [lounges, setLounges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form State for Hosting
  const [showModal, setShowModal] = useState(false);
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');

  // Function to fetch lounges and count participants
  const fetchLoungeData = async () => {
    setLoading(true);
    const { data: loungeData, error: loungeError } = await supabase
      .from('active_lounges')
      .select('*');

    if (loungeError) {
      console.error('Error fetching lounges:', loungeError.message);
    } else {
      // Integration: Check participants table for each lounge
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

  // Function to handle creating a new lounge (Fixes host_id error)
  const handleCreateLounge = async () => {
    if (!newLoungeName || !newHostName) return alert("Please fill in all fields!");

    const { error } = await supabase
      .from('active_lounges')
      .insert([
        { 
          lounge_name: newLoungeName, 
          host_name: newHostName,
          // Temporary ID to satisfy the 'Not Null' database constraint
          host_id: '123e4567-e89b-12d3-a456-426614174000', 
          peer_id: `peer-${Math.random().toString(36).substr(2, 9)}`
        }
      ]);

    if (error) {
      alert("Database Error: " + error.message);
    } else {
      // Success: Close modal, clear inputs, and refresh list
      setShowModal(false);
      setNewLoungeName('');
      setNewHostName('');
      fetchLoungeData();
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <header style={{ borderBottom: '2px solid #333', marginBottom: '30px', paddingBottom: '10px' }}>
        <h1 style={{ margin: 0 }}>Digital Lounge</h1>
        <p style={{ color: '#666', marginTop: '5px' }}>Live Collaboration Hub</p>
      </header>
      
      <button 
        onClick={() => setShowModal(true)}
        style={{ 
          background: '#000', color: '#fff', padding: '12px 24px', 
          borderRadius: '8px', border: 'none', cursor: 'pointer', 
          fontWeight: 'bold', fontSize: '16px', marginBottom: '30px' 
        }}
      >
        + Host New Lounge
      </button>

      {/* MODAL WINDOW */}
      {showModal && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(0,0,0,0.7)', display: 'flex', 
          alignItems: 'center', justifyContent: 'center', zIndex: 1000 
        }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '16px', width: '90%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h2 style={{ marginTop: 0 }}>Lounge Details</h2>
            
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>Lounge Topic</label>
            <input 
              placeholder="e.g. Letter of Credit Discussion" 
              value={newLoungeName} 
              onChange={(e) => setNewLoungeName(e.target.value)}
              style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
            
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>Your Name</label>
            <input 
              placeholder="Enter host name" 
              value={newHostName} 
              onChange={(e) => setNewHostName(e.target.value)}
              style={{ width: '100%', padding: '12px', marginBottom: '25px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleCreateLounge} style={{ flex: 2, padding: '12px', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                Go Live
              </button>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '12px', background: '#f5f5f5', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DYNAMIC LIST OF LOUNGES */}
      <div>
        <h3 style={{ color: '#444', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>Active Sessions</h3>
        {loading ? (
          <p style={{ color: '#888' }}>Refreshing lounge data...</p>
        ) : lounges.length > 0 ? (
          lounges.map((lounge) => (
            <div key={lounge.id} style={{ 
              background: '#fff', border: '1px solid #eee', padding: '20px', 
              borderRadius: '12px', marginBottom: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: '0 0 5px 0', fontSize: '18px', color: '#111' }}>{lounge.lounge_name}</h2>
                  <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Hosted by: <strong>{lounge.host_name}</strong></p>
                </div>
                <span style={{ fontSize: '10px', background: '#e8f5e9', color: '#2e7d32', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                  ONLINE
                </span>
              </div>
              
              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: '#555' }}>👥 {lounge.participantCount} participants</span>
                <button style={{ padding: '8px 16px', background: '#fff', border: '1px solid #000', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  Join Lounge
                </button>
              </div>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', background: '#fafafa', borderRadius: '12px' }}>
            <p style={{ color: '#999' }}>No lounges active. Be the first to host one!</p>
          </div>
        )}
      </div>
    </div>
  );
}
