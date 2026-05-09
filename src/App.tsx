import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [lounges, setLounges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLoungeData() {
      // 1. Fetch lounges from the 'active_lounges' table
      const { data: loungeData, error: loungeError } = await supabase
        .from('active_lounges')
        .select('*');

      if (loungeError) {
        console.error('Error fetching lounges:', loungeError.message);
      } else {
        // 2. For each lounge, let's count participants from the 'participants' table
        const loungesWithCounts = await Promise.all((loungeData || []).map(async (lounge) => {
          const { count } = await supabase
            .from('participants')
            .select('*', { count: 'exact', head: true })
            .eq('lounge_id', lounge.id); // Assuming 'lounge_id' is your link column
          
          return { ...lounge, participantCount: count || 0 };
        }));

        setLounges(loungesWithCounts);
      }
      setLoading(false);
    }

    fetchLoungeData();
  }, []);

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <header style={{ borderBottom: '2px solid #333', marginBottom: '30px' }}>
        <h1 style={{ marginBottom: '5px' }}>Digital Lounge</h1>
        <p style={{ color: '#666', marginTop: '0' }}>Welcome to the central hub.</p>
      </header>
      
      <div style={{ marginBottom: '25px' }}>
        <button style={{ 
          background: '#000', color: '#fff', padding: '12px 20px', 
          borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold' 
        }}>
          + Host New Lounge
        </button>
      </div>

      <div>
        <h3 style={{ fontSize: '18px', color: '#444' }}>Live Lounges</h3>
        
        {loading ? (
          <p style={{ color: '#888', fontStyle: 'italic' }}>Scanning for active lounges...</p>
        ) : lounges.length > 0 ? (
          lounges.map((lounge) => (
            <div key={lounge.id} style={{ 
              background: '#fff', border: '1px solid #eee', padding: '20px', 
              borderRadius: '12px', marginBottom: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  {/* Correctly mapping to your Supabase column: lounge_name */}
                  <h2 style={{ margin: '0 0 5px 0', fontSize: '20px' }}>
                    {lounge.lounge_name || 'Unnamed Lounge'}
                  </h2>
                  {/* Correctly mapping to your Supabase column: host_name */}
                  <p style={{ margin: '0', color: '#555', fontSize: '14px' }}>
                    Hosted by: <strong>{lounge.host_name || 'Good boy'}</strong>
                  </p>
                </div>
                <span style={{ fontSize: '12px', color: '#2e7d32', background: '#e8f5e9', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                  ● ACTIVE
                </span>
              </div>

              <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#888' }}>
                   👥 {lounge.participantCount} participants
                </span>
                <button style={{ 
                  padding: '6px 12px', border: '1px solid #000', background: 'transparent', 
                  borderRadius: '4px', cursor: 'pointer', fontSize: '13px' 
                }}>
                  Join Lounge
                </button>
              </div>
              
              {/* Optional: Show Peer ID for tech verification */}
              <div style={{ marginTop: '10px', fontSize: '10px', color: '#ccc' }}>
                Signal ID: {lounge.peer_id}
              </div>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '50px', background: '#fcfcfc', borderRadius: '12px', border: '1px dashed #ddd' }}>
            <p style={{ color: '#999' }}>The lounge area is currently empty.</p>
          </div>
        )}
      </div>
    </div>
  );
}
