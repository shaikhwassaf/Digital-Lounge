import { useEffect, useState, useRef } from 'react';
import { supabase } from './lib/supabaseClient';

// --- Interfaces ---
interface Question { id?: string; user_name: string; question_text: string; bookmark_number: number; answered: boolean; }
interface FileShare { file_name: string; file_url: string; from_name: string; }
interface PollResult { understanding_percentage: number; total_responses: number; }

export default function App() {
  // NAVIGATION & ROLE
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [isHost, setIsHost] = useState(false);
  const [currentLounge, setCurrentLounge] = useState<any>(null);
  const [lounges, setLounges] = useState<any[]>([]);

  // MODAL STATES
  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);

  // ROOM STATE
  const [currentBookmark, setCurrentBookmark] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sharedFiles, setSharedFiles] = useState<FileShare[]>([]);
  const [pollResults, setPollResults] = useState<PollResult>({ understanding_percentage: 0, total_responses: 0 });

  // WEBRTC STATE
  const pc = useRef<RTCPeerConnection | null>(null);
  const [sendChannel, setSendChannel] = useState<RTCDataChannel | null>(null);
  const [connectionStatus, setConnectionStatus] = useState('Offline');

  // INPUTS
  const [questionInput, setQuestionInput] = useState('');
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [inputCode, setInputCode] = useState('');

  const [myId] = useState(() => {
    const id = localStorage.getItem('lounge_session_id') || crypto.randomUUID();
    localStorage.setItem('lounge_session_id', id);
    return id;
  });

  // --- 1. INITIAL FETCH ---
  useEffect(() => {
    fetchLounges();
  }, []);

  const fetchLounges = async () => {
    const { data } = await supabase.from('active_lounges').select('*');
    if (data) setLounges(data);
  };

  // --- 2. WEBRTC & REAL-TIME SYNC ---
  useEffect(() => {
    if (view === 'room' && currentLounge) {
      initWebRTC();
      
      const channel = supabase.channel(`lounge-${currentLounge.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookmarks' }, (p) => {
          setCurrentBookmark(p.new.bookmark_number);
        })
        .subscribe();

      return () => {
        pc.current?.close();
        supabase.removeChannel(channel);
      };
    }
  }, [view, currentLounge]);

  const initWebRTC = () => {
    pc.current = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    if (isHost) {
      const dc = pc.current.createDataChannel("classroom_io");
      setupDataChannel(dc);
    } else {
      pc.current.ondatachannel = (event) => {
        setupDataChannel(event.channel);
      };
    }

    pc.current.onconnectionstatechange = () => setConnectionStatus(pc.current?.connectionState || 'Unknown');
  };

  const setupDataChannel = (channel: RTCDataChannel) => {
    channel.onopen = () => setConnectionStatus('Live (P2P)');
    channel.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'QUESTION') setQuestions(prev => [data.payload, ...prev]);
      if (data.type === 'FILE') setSharedFiles(prev => [data.payload, ...prev]);
    };
    setSendChannel(channel);
  };

  // --- 3. HANDLERS ---
  const handleCreateLounge = async () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const { data, error } = await supabase.from('active_lounges').insert([{
      lounge_name: newLoungeName, host_name: newHostName, host_id: myId, entry_code: code
    }]).select();

    if (data) {
      setCurrentLounge(data[0]);
      setIsHost(true);
      setView('room');
    }
  };

  const handleSendQuestion = async () => {
    if (!questionInput.trim()) return;
    const payload: Question = {
      user_name: isHost ? "Teacher" : (guestName || "Student"),
      question_text: questionInput,
      bookmark_number: currentBookmark,
      answered: false
    };

    if (sendChannel?.readyState === 'open') {
      sendChannel.send(JSON.stringify({ type: 'QUESTION', payload }));
    }
    setQuestions(prev => [payload, ...prev]);
    await supabase.from('questions').insert([{ ...payload, lounge_id: currentLounge.id }]);
    setQuestionInput('');
  };

  const handleNextBookmark = async () => {
    const hasUnresolved = questions.some(q => !q.answered);
    if (hasUnresolved) return alert("Please resolve all questions first.");
    
    await supabase.from('bookmarks').insert([{
      lounge_id: currentLounge.id,
      bookmark_number: currentBookmark + 1,
      timestamp: Date.now()
    }]);
  };

  const handleShareFile = () => {
    const name = prompt("File Name:");
    const url = prompt("Link (URL):");
    if (name && url) {
      const payload = { file_name: name, file_url: url, from_name: isHost ? "Teacher" : (guestName || "Student") };
      if (sendChannel?.readyState === 'open') {
        sendChannel.send(JSON.stringify({ type: 'FILE', payload }));
      }
      setSharedFiles(prev => [payload, ...prev]);
    }
  };

  // --- 4. UI COMPONENTS ---
  if (view === 'lobby') {
    return (
      <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h1>🎓 Universal Lounge</h1>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '30px' }}>
          <button onClick={() => setShowHostModal(true)} style={{ padding: '15px 30px', background: '#000', color: '#fff', borderRadius: '8px' }}>Host Class</button>
          <button onClick={() => setShowJoinModal(true)} style={{ padding: '15px 30px', background: '#fff', border: '1px solid #000', borderRadius: '8px' }}>Join Class</button>
        </div>

        {showHostModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '350px' }}>
              <h3>Host New Lounge</h3>
              <input placeholder="Lounge Name" onChange={e => setNewLoungeName(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px' }} />
              <input placeholder="Your Name" onChange={e => setNewHostName(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '15px' }} />
              <button onClick={handleCreateLounge} style={{ width: '100%', padding: '10px', background: '#000', color: '#fff', borderRadius: '5px' }}>Launch</button>
              <button onClick={() => setShowHostModal(false)} style={{ marginTop: '10px', background: 'none', border: 'none', color: '#666' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' }}>
      <header style={{ background: '#111', color: '#fff', padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><strong>{currentLounge?.lounge_name}</strong> | <small style={{ color: '#aaa' }}>{connectionStatus}</small></div>
        <button onClick={() => setView('lobby')} style={{ background: 'red', color: '#fff', border: 'none', padding: '5px 15px', borderRadius: '5px' }}>Exit</button>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Main Interaction Area */}
        <div style={{ flex: 2, background: '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <p style={{ color: '#888', letterSpacing: '1px' }}>SESSION SYNC</p>
            <h1 style={{ fontSize: '100px', margin: '10px 0' }}>#{currentBookmark}</h1>
            {isHost && (
              <button onClick={handleNextBookmark} style={{ padding: '10px 20px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>Advance to Next Part</button>
            )}
          </div>

          <div style={{ width: '100%', maxWidth: '450px', background: '#fff', padding: '25px', borderRadius: '15px', boxShadow: '0 8px 24px rgba(0,0,0,0.05)' }}>
            <textarea 
              value={questionInput}
              onChange={e => setQuestionInput(e.target.value)}
              placeholder="Type a question or message..."
              style={{ width: '100%', height: '70px', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '10px', resize: 'none' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleSendQuestion} style={{ flex: 1, padding: '12px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>❓ Send</button>
              <button onClick={handleShareFile} style={{ flex: 1, padding: '12px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>📤 Share File</button>
            </div>
          </div>
        </div>

        {/* Sidebar Feed */}
        <div style={{ flex: 1, background: '#fff', borderLeft: '1px solid #eee', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #eee' }}>
            <h3 style={{ margin: 0 }}>Class Stream</h3>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            <h4>Questions</h4>
            {questions.map((q, i) => (
              <div key={i} style={{ padding: '12px', background: '#fff3cd', borderRadius: '8px', marginBottom: '10px', borderLeft: '4px solid #ff9800' }}>
                <small><strong>{q.user_name}</strong></small>
                <p style={{ margin: '5px 0' }}>{q.question_text}</p>
              </div>
            ))}

            <h4 style={{ marginTop: '25px' }}>Shared Files</h4>
            {sharedFiles.map((f, i) => (
              <div key={i} style={{ padding: '10px', background: '#e7f3ff', borderRadius: '8px', marginBottom: '10px' }}>
                <a href={f.file_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: '#0056b3', fontWeight: '500' }}>📄 {f.file_name}</a>
                <br/><small>Shared by {f.from_name}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
