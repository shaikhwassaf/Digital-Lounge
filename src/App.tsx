import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [loading, setLoading] = useState(true);

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <header style={{ borderBottom: '2px solid #eee', marginBottom: '20px' }}>
        <h1 style={{ color: '#111' }}>Digital Lounge</h1>
        <p style={{ color: '#666' }}>Welcome to the central hub.</p>
      </header>

      <main>
        <div style={{ padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
          <h3>Lounge Status: Online</h3>
          <p>The system is ready to manage your digital spaces.</p>
          <button 
            onClick={() => alert('Feature coming soon!')}
            style={{ padding: '10px 20px', background: '#000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Create New Lounge Room
          </button>
        </div>
      </main>
    </div>
  );
}
