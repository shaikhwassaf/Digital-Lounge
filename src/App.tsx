import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [lounges, setLounges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getLounges() {
      // 1. Fetch from your specific 'active_lounges' table
      const { data, error } = await supabase
        .from('active_lounges')
        .select('*');

      if (error) {
        console.error('Supabase Error:', error.message);
      } else {
        setLounges(data || []);
      }
      setLoading(false);
    }

    getLounges();
  }, []);

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ borderBottom: '2px solid #333', paddingBottom: '10px' }}>Digital Lounge</h1>
      
      <div style={{ margin: '20px 0' }}>
        <button style={{ background: '#000', color: '#fff', padding: '10px 15px', borderRadius: '5px', cursor: 'pointer' }}>
          + Host New Lounge
        </button>
      </div>

      <div>
        <h3>Live Lounges</h3>
        {loading ? (
          <p>Scanning for active lounges...</p>
        ) : lounges.length > 0 ? (
          lounges.map((lounge) => (
            <div key={lounge.id} style={{ 
              background: '#fff', 
              border: '1px solid #ddd', 
              padding: '15px', 
              borderRadius: '8px',
              marginBottom: '10px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{lounge.name || 'Unnamed Lounge'}</strong>
                <span style={{ fontSize: '12px', color: '#2e7d32', fontWeight: 'bold' }}>● ACTIVE</span>
              </div>
              <p style={{ fontSize: '14px', color: '#666', margin: '8px 0' }}>{lounge.topic || 'No topic set'}</p>
              <button style={{ fontSize: '12px', cursor: 'pointer' }}>Join Lounge</button>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
            <p>The lounge area is currently empty.</p>
          </div>
        )}
      </div>
    </div>
  );
}
