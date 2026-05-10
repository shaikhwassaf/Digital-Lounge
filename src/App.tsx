import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [isHost, setIsHost] = useState(false);
  const [currentLounge, setCurrentLounge] = useState<any>(null);
  
  // SESSION & SYNC STATES
  const [syncPosition, setSyncPosition] = useState('00:00'); 
  const [sessionStatus, setSessionStatus] = useState('active');
  const [questions, setQuestions] = useState<any[]>([]);
  const [pollActive, setPollActive] = useState(false);
  const [pollResults, setPollResults] = useState({ yes: 0, total: 0 });

  // FILE SHARING STATES
  const [files, setFiles] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);

  const [myId] = useState(() => {
    const id = localStorage.getItem('user_uuid') || crypto.randomUUID();
    localStorage.setItem('user_uuid', id);
    return id;
  });

  // REAL-TIME ENGINE
  useEffect(() => {
    if (view === 'room' && currentLounge) {
      const channel = supabase.channel(`room-${currentLounge.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'active_lounges', filter: `id=eq.${currentLounge.id}` }, 
          (p) => {
            setSyncPosition(p.new.last_timestamp);
            setPollActive(p.new.poll_active);
            setSessionStatus(p.new.session_status);
          })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => fetchRoomData())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shared_files' }, (p) => {
          if (!p.new.recipient_id || p.new.recipient_id === myId || isHost) {
            setFiles(prev => [...prev, p.new]);
          }
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [view, currentLounge]);

  const fetchRoomData = async () => {
    const { data: qData } = await supabase.from('participants').select('*').eq('lounge_id', currentLounge.id);
    if (qData) {
      setQuestions(qData.filter(p => p.question_text));
      setParticipants(qData);
      const responses = qData.filter(p => p.poll_response);
      setPollResults({ yes: responses.filter(r => r.poll_response === 'YES').length, total: responses.length });
    }
  };

  // --- TEACHER ACTIONS ---
  const score = pollResults.total > 0 ? Math.round((pollResults.yes / pollResults.total) * 100) : 0;

  const affixBookMark = async () => {
    if (questions.length > 0) return alert(`Answer all questions first!`);
    if (pollActive && score <= 80) return alert(`Understanding is only ${score}%. Need >80% to move.`);

    const time = prompt("Enter Time Stamp for this Book Mark (e.g. 05:45):");
    if (time) {
      await supabase.from('participants').update({ question_text: null, poll_response: null }).eq('lounge_id', currentLounge.id);
      await supabase.from('active_lounges').update({ last_timestamp: time, poll_active: false }).eq('id', currentLounge.id);
    }
  };

  const handleFileShare = async (recipientId: string | null) => {
    const url = prompt("Enter File URL:");
    const name = prompt("Enter File Name:");
    if (url && name) {
      await supabase.from('shared_files').insert([{
        lounge_id: currentLounge.id,
        sender_id: myId,
        recipient_id: recipientId,
        file_url: url,
        file_name: name
      }]);
    }
  };

  if (sessionStatus === 'break') return <div style={{textAlign:'center', padding:'100px'}}><h1>SESSION ON BREAK</h1>{isHost && <button onClick={() => supabase.from('active_lounges').update({session_status:'active'}).eq('id', currentLounge.id)}>Resume</button>}</div>;
  if (sessionStatus === 'ended') return <div style={{textAlign:'center', padding:'100px'}}><h1>CLASS ENDED</h1><button onClick={() => setView('lobby')}>Return to Lobby</button></div>;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      {/* MAIN SYNC PANEL */}
      <div style={{ flex: 2, background: '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <p>BOOK MARK</p>
        <h1 style={{ fontSize: '120px', margin: '20px 0' }}>{syncPosition}</h1>
        
        {isHost && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => supabase.from('active_lounges').update({poll_active: true}).eq('id', currentLounge.id)}>Run Poll</button>
            <button onClick={affixBookMark} style={{background: (score > 80 || !pollActive) ? 'green' : 'grey', color: 'white'}}>Next Book Mark</button>
            <button onClick={() => supabase.from('active_lounges').update({session_status:'break'}).eq('id', currentLounge.id)}>Break</button>
            <button onClick={() => supabase.from('active_lounges').update({session_status:'ended'}).eq('id', currentLounge.id)}>End Class</button>
          </div>
        )}

        {!isHost && pollActive && (
          <div style={{padding:'20px', background:'white', borderRadius:'10px', boxShadow:'0 4px 10px rgba(0,0,0,0.1)'}}>
            <h3>Understand?</h3>
            <button onClick={() => supabase.from('participants').update({poll_response:'YES'}).eq('peer_id', myId)}>Yes</button>
            <button onClick={() => supabase.from('participants').update({poll_response:'NO'}).eq('peer_id', myId)}>No</button>
          </div>
        )}
      </div>

      {/* INTERACTION PANEL */}
      <div style={{ flex: 1, borderLeft: '1px solid #ddd', padding: '20px', display:'flex', flexDirection:'column' }}>
        <h3>Questions ({questions.length}) | Score: {score}%</h3>
        <div style={{flex: 1, overflowY:'auto'}}>
           {questions.map((q, i) => (
             <div key={i} style={{padding:'10px', background:'#eee', margin:'5px 0'}}>
               {q.question_text}
               {isHost && <button onClick={() => supabase.from('participants').update({question_text: null}).eq('id', q.id)}>Resolved</button>}
             </div>
           ))}
        </div>

        <h3>Resources</h3>
        <div style={{flex: 1, overflowY:'auto'}}>
          {files.map((f, i) => (
            <div key={i}><a href={f.file_url} target="_blank">{f.file_name}</a></div>
          ))}
        </div>

        <div style={{display:'flex', gap:'5px', marginTop:'10px'}}>
           {!isHost && <button onClick={() => handleFileShare(currentLounge.host_id)}>Share with Teacher</button>}
           {isHost && <button onClick={() => handleFileShare(null)}>Share with All</button>}
           {!isHost && <input placeholder="Ask question..." onKeyDown={e => e.key === 'Enter' && supabase.from('participants').update({question_text: e.currentTarget.value}).eq('peer_id', myId)} />}
        </div>
      </div>
    </div>
  );
}
