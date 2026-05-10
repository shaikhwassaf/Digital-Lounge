import { useEffect, useState, useRef } from 'react';
import { supabase } from './lib/supabaseClient';

interface Question {
  id?: string;
  user_name: string;
  question_text: string;
  bookmark_number: number;
  answered: boolean;
}

interface FileShare {
  file_name: string;
  file_url: string;
  from_name: string;
}

interface SyncPosition {
  type: 'video' | 'page' | 'chapter' | 'custom';
  value: string;
  label: string;
}

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

const POSITION_ICONS: Record<string, string> = {
  video: '▶',
  page: '📖',
  chapter: '📌',
  custom: '📍',
};

const POSITION_HINTS: Record<string, string> = {
  video: 'e.g. 12:34 or 1:02:15',
  page: 'e.g. 45 or 45-48',
  chapter: 'e.g. Chapter 3 or Unit 2',
  custom: 'e.g. Slide 7, Exercise 4...',
};

export default function App() {
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [isHost, setIsHost] = useState(false);
  const isHostRef = useRef(false);
  const [currentLounge, setCurrentLounge] = useState<any>(null);
  const [lounges, setLounges] = useState<any[]>([]);

  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const [currentBookmark, setCurrentBookmark] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sharedFiles, setSharedFiles] = useState<FileShare[]>([]);
  const [sessionStatus, setSessionStatus] = useState<'not_started' | 'active' | 'on_break' | 'ended'>('not_started');

  // Position sync
  const [positionType, setPositionType] = useState<SyncPosition['type']>('video');
  const [positionValue, setPositionValue] = useState('');
  const [currentPosition, setCurrentPosition] = useState<SyncPosition | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncPosition[]>([]);

  // WebRTC media
  const localStream = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const signalingChannel = useRef<any>(null);
  const dbChannel = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const hostVideoRef = useRef<HTMLVideoElement>(null);
  const [hostStream, setHostStream] = useState<MediaStream | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [camActive, setCamActive] = useState(false);
  const [connectedStudents, setConnectedStudents] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState('Offline');
  const [mediaError, setMediaError] = useState('');

  const [questionInput, setQuestionInput] = useState('');
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');

  const [myId] = useState(() => {
    let id = localStorage.getItem('lounge_session_id');
    if (!id) {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      localStorage.setItem('lounge_session_id', id);
    }
    return id;
  });

  // ─── URL-based auto-join (WhatsApp link) ──────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setInputCode(code);
      setCurrentLounge(null);
      setShowJoinModal(true);
      // Clean up the URL without reloading
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  useEffect(() => {
    if (hostVideoRef.current && hostStream) {
      hostVideoRef.current.srcObject = hostStream;
    }
  }, [hostStream]);

  useEffect(() => { fetchLounges(); }, []);

  const fetchLounges = async () => {
    try {
      const { data } = await supabase.from('active_lounges').select('*');
      if (data) setLounges(data);
    } catch (err) {
      console.error('Error fetching lounges:', err);
    }
  };

  // ─── Room Setup / Teardown ─────────────────────────────────────────────────

  useEffect(() => {
    if (view === 'room' && currentLounge) {
      setupRoom();
      return () => cleanupRoom();
    }
  }, [view, currentLounge]);

  const sendSignal = (event: string, payload: any) => {
    signalingChannel.current?.send({ type: 'broadcast', event, payload });
  };

  const createConnectionForStudent = async (studentId: string) => {
    if (peerConnections.current.has(studentId)) return;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.current.set(studentId, pc);
    localStream.current?.getTracks().forEach(track => pc.addTrack(track, localStream.current!));
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal('ice-candidate', { from: myId, target: studentId, candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnectedStudents(prev => [...new Set([...prev, studentId])]);
        setConnectionStatus('Live (P2P)');
        // Send current position to newly connected student
        if (currentPosition) sendSignal('position-sync', { position: currentPosition, to: studentId });
      } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        setConnectedStudents(prev => prev.filter(id => id !== studentId));
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal('offer', { from: myId, to: studentId, sdp: pc.localDescription });
  };

  const handleIncomingOffer = async (hostId: string, sdp: any) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.current.set(hostId, pc);
    localStream.current?.getTracks().forEach(track => pc.addTrack(track, localStream.current!));
    pc.ontrack = (e) => {
      if (e.streams?.[0]) {
        setHostStream(e.streams[0]);
        if (hostVideoRef.current) hostVideoRef.current.srcObject = e.streams[0];
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal('ice-candidate', { from: myId, target: hostId, candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setConnectionStatus('Live (P2P)');
      else if (['disconnected', 'failed'].includes(pc.connectionState)) setConnectionStatus('Disconnected');
    };
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal('answer', { from: myId, to: hostId, sdp: pc.localDescription });
  };

  const setupRoom = async () => {
    const dbc = supabase.channel(`lounge-db-${currentLounge.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookmarks' }, (p) => {
        setCurrentBookmark(p.new.bookmark_number);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'questions' }, (p) => {
        setQuestions(prev => [p.new as Question, ...prev]);
      })
      .subscribe();
    dbChannel.current = dbc;

    const sc = supabase.channel(`signals-${currentLounge.id}`, {
      config: { broadcast: { self: false } }
    });

    sc.on('broadcast', { event: 'peer-join' }, async ({ payload }: any) => {
      if (!isHostRef.current) return;
      await createConnectionForStudent(payload.peerId);
    });
    sc.on('broadcast', { event: 'offer' }, async ({ payload }: any) => {
      if (isHostRef.current) return;
      if (payload.to !== myId) return;
      await handleIncomingOffer(payload.from, payload.sdp);
    });
    sc.on('broadcast', { event: 'answer' }, async ({ payload }: any) => {
      if (!isHostRef.current) return;
      if (payload.to !== myId) return;
      const pc = peerConnections.current.get(payload.from);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    });
    sc.on('broadcast', { event: 'ice-candidate' }, async ({ payload }: any) => {
      if (payload.target !== myId) return;
      const pc = peerConnections.current.get(payload.from);
      if (pc && payload.candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch (_) {}
      }
    });
    // Position sync received by students
    sc.on('broadcast', { event: 'position-sync' }, ({ payload }: any) => {
      if (isHostRef.current) return;
      if (payload.to && payload.to !== myId) return;
      setCurrentPosition(payload.position);
      setSyncHistory(prev => [payload.position, ...prev.slice(0, 9)]);
    });

    await sc.subscribe();
    signalingChannel.current = sc;

    if (isHostRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream.current = stream;
        setCamActive(true);
        setMicActive(true);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        setMediaError('');
      } catch {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStream.current = stream;
          setMicActive(true);
          setMediaError('Camera not available — audio only.');
        } catch {
          setMediaError('Microphone/camera access denied.');
        }
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStream.current = stream;
        setMicActive(true);
        setMediaError('');
      } catch {
        setMediaError('Microphone access denied.');
      }
      setTimeout(() => {
        sendSignal('peer-join', { peerId: myId });
        setConnectionStatus('Connecting...');
      }, 800);
    }
  };

  const cleanupRoom = () => {
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    peerConnections.current.forEach(pc => pc.close());
    peerConnections.current.clear();
    if (dbChannel.current) { supabase.removeChannel(dbChannel.current); dbChannel.current = null; }
    if (signalingChannel.current) { supabase.removeChannel(signalingChannel.current); signalingChannel.current = null; }
    setHostStream(null);
    setConnectedStudents([]);
    setMicActive(false);
    setCamActive(false);
    setConnectionStatus('Offline');
    setMediaError('');
    setCurrentPosition(null);
    setSyncHistory([]);
  };

  const toggleMic = () => {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicActive(prev => !prev);
  };

  const toggleCam = () => {
    localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamActive(prev => !prev);
  };

  // ─── Position Sync ────────────────────────────────────────────────────────

  const handleSyncPosition = () => {
    if (!positionValue.trim()) return alert('Please enter a position value.');
    const pos: SyncPosition = {
      type: positionType,
      value: positionValue.trim(),
      label: `${POSITION_ICONS[positionType]} ${positionType === 'video' ? 'Video' : positionType === 'page' ? 'Page' : positionType === 'chapter' ? 'Chapter' : 'Position'}: ${positionValue.trim()}`
    };
    setCurrentPosition(pos);
    setSyncHistory(prev => [pos, ...prev.slice(0, 9)]);
    sendSignal('position-sync', { position: pos });
    setPositionValue('');
  };

  // ─── WhatsApp Share ───────────────────────────────────────────────────────

  const handleShareWhatsApp = () => {
    const code = generatedCode || currentLounge?.entry_code;
    const joinUrl = `${window.location.origin}?code=${code}`;
    const text = `Join "${currentLounge?.lounge_name}" on Digital Lounge!\n\nEntry Code: *${code}*\n\nOr tap this link to join directly:\n${joinUrl}\n\n_(No app needed — opens in your browser)_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleCopyLink = () => {
    const code = generatedCode || currentLounge?.entry_code;
    const joinUrl = `${window.location.origin}?code=${code}`;
    navigator.clipboard.writeText(joinUrl).then(() => alert('Join link copied to clipboard!'));
  };

  // ─── Other Handlers ────────────────────────────────────────────────────────

  const handleCreateLounge = async () => {
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const { data, error } = await supabase.from('active_lounges').insert([{
        lounge_name: newLoungeName, host_name: newHostName, host_id: myId, entry_code: code
      }]).select();
      if (error) throw error;
      if (data) {
        setGeneratedCode(code);
        setCurrentLounge(data[0]);
        isHostRef.current = true;
        setIsHost(true);
        setView('room');
        setShowHostModal(false);
      }
    } catch (error) { alert('Error creating lounge: ' + (error as any)?.message); }
  };

  const handleJoinLounge = async () => {
    try {
      if (!guestName.trim()) return alert('Please enter your name.');
      if (!inputCode.trim()) return alert('Please enter the entry code.');
      let lounge = currentLounge;
      if (lounge) {
        if (inputCode.trim() !== lounge.entry_code.toString())
          return alert('Wrong entry code for this lounge. Please check the code and try again.');
      } else {
        const { data, error } = await supabase.from('active_lounges').select('*').eq('entry_code', inputCode.trim()).single();
        if (error || !data) { console.error('Join error:', error); return alert('No lounge found with that entry code.'); }
        lounge = data;
      }
      isHostRef.current = false;
      setIsHost(false);
      setCurrentLounge(lounge);
      setView('room');
      setShowJoinModal(false);
    } catch (error) { alert('Error joining lounge: ' + (error as any)?.message); }
  };

  const handleStartClass = async () => {
    try {
      const { error } = await supabase.from('class_sessions').insert([{
        lounge_id: currentLounge.id, status: 'active', current_bookmark: 0,
        started_at: new Date().toISOString(), last_updated: new Date().toISOString()
      }]);
      if (error) throw error;
      setSessionStatus('active');
    } catch (error) { alert('Error starting class: ' + (error as any)?.message); }
  };

  const handleSendQuestion = async () => {
    try {
      if (!questionInput.trim()) return alert('Question cannot be empty');
      const payload: Question = {
        user_name: isHost ? newHostName : (guestName || 'Student'),
        question_text: questionInput, bookmark_number: currentBookmark, answered: false
      };
      const { error } = await supabase.from('questions').insert([{ ...payload, lounge_id: currentLounge.id, peer_id: myId }]);
      if (error) throw error;
      setQuestions(prev => [payload, ...prev]);
      setQuestionInput('');
    } catch (error) { alert('Error sending question: ' + (error as any)?.message); }
  };

  const handleAnswerQuestion = async (questionId: string) => {
    try {
      const { error } = await supabase.from('questions').update({ answered: true }).eq('id', questionId);
      if (error) throw error;
      setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, answered: true } : q));
    } catch (error) { alert('Error answering question: ' + (error as any)?.message); }
  };

  const handleShareFile = async () => {
    try {
      const name = prompt('File Name:');
      const url = prompt('Link (URL):');
      if (!name || !url) return;
      const payload: FileShare = { file_name: name, file_url: url, from_name: isHost ? newHostName : (guestName || 'Student') };
      const { error } = await supabase.from('file_shares').insert([{
        lounge_id: currentLounge.id, from_peer_id: myId, from_name: payload.from_name,
        to_peer_id: null, file_name: name, file_url: url, created_at: new Date().toISOString()
      }]);
      if (error) throw error;
      setSharedFiles(prev => [payload, ...prev]);
    } catch (error) { alert('Error sharing file: ' + (error as any)?.message); }
  };

  const handleBreak = async () => {
    try {
      const { error } = await supabase.from('class_sessions')
        .update({ status: 'on_break', last_updated: new Date().toISOString() }).eq('lounge_id', currentLounge.id);
      if (error) throw error;
      setSessionStatus('on_break');
    } catch (error) { alert('Error: ' + (error as any)?.message); }
  };

  const handleResume = async () => {
    try {
      const { error } = await supabase.from('class_sessions')
        .update({ status: 'active', last_updated: new Date().toISOString() }).eq('lounge_id', currentLounge.id);
      if (error) throw error;
      setSessionStatus('active');
    } catch (error) { alert('Error: ' + (error as any)?.message); }
  };

  const handleDeleteLounge = async (loungeId: string) => {
    try {
      const { error } = await supabase.from('active_lounges').delete().eq('id', loungeId);
      if (error) throw error;
      await fetchLounges();
    } catch (error) { alert('Error ending lounge: ' + (error as any)?.message); }
  };

  const handleExit = async () => {
    try {
      if (isHost && currentLounge) {
        const endIt = window.confirm("Do you want to end this lounge? Click Cancel to just leave without ending it.");
        if (endIt) await supabase.from('active_lounges').delete().eq('id', currentLounge.id);
      }
      setView('lobby');
      setCurrentLounge(null);
      isHostRef.current = false;
      setIsHost(false);
      setGeneratedCode('');
      setQuestions([]);
      setSharedFiles([]);
      setCurrentBookmark(0);
      setSessionStatus('not_started');
      await fetchLounges();
    } catch (error) { console.error('Error exiting:', error); }
  };

  // ─── Lobby View ───────────────────────────────────────────────────────────

  if (view === 'lobby') {
    return (
      <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h1>🎓 Digital Lounge</h1>
        <p style={{ color: '#666', marginTop: '-10px' }}>Students join via WhatsApp link — no app needed</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '30px' }}>
          <button onClick={() => setShowHostModal(true)}
            style={{ padding: '15px 30px', background: '#000', color: '#fff', borderRadius: '8px', cursor: 'pointer', border: 'none', fontSize: '16px', fontWeight: 'bold' }}>
            Host Class
          </button>
          <button onClick={() => { setCurrentLounge(null); setInputCode(''); setShowJoinModal(true); }}
            style={{ padding: '15px 30px', background: '#fff', border: '2px solid #000', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>
            Join Class
          </button>
        </div>

        <div style={{ maxWidth: '600px', margin: '40px auto' }}>
          <h3>Active Sessions</h3>
          {lounges.length === 0 ? <p style={{ color: '#999' }}>No active sessions</p> : (
            lounges.map((lounge: any) => (
              <div key={lounge.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px', marginBottom: '10px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0' }}>{lounge.lounge_name}</h4>
                    <p style={{ margin: '0 0 10px 0', color: '#555' }}>Host: {lounge.host_name}</p>
                  </div>
                  {lounge.host_id === myId && <span style={{ background: '#28a745', color: '#fff', fontSize: '11px', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' }}>YOUR LOUNGE</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {lounge.host_id === myId ? (
                    <>
                      <button onClick={() => { setCurrentLounge(lounge); setGeneratedCode(lounge.entry_code); isHostRef.current = true; setIsHost(true); setView('room'); }}
                        style={{ padding: '8px 15px', background: '#28a745', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none' }}>
                        Rejoin as Host
                      </button>
                      <button onClick={() => { if (window.confirm('End this lounge?')) handleDeleteLounge(lounge.id); }}
                        style={{ padding: '8px 15px', background: '#dc3545', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none' }}>
                        End
                      </button>
                    </>
                  ) : (
                    <button onClick={() => { setCurrentLounge(lounge); setInputCode(''); setShowJoinModal(true); }}
                      style={{ padding: '8px 15px', background: '#007bff', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none' }}>
                      Join
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {showHostModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '350px' }}>
              <h3>Host New Lounge</h3>
              <input placeholder="Lounge Name" value={newLoungeName} onChange={e => setNewLoungeName(e.target.value)}
                style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc' }} />
              <input placeholder="Your Name" value={newHostName} onChange={e => setNewHostName(e.target.value)}
                style={{ width: '100%', padding: '10px', marginBottom: '15px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc' }} />
              <button onClick={handleCreateLounge}
                style={{ width: '100%', padding: '10px', background: '#000', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none', fontWeight: 'bold', marginBottom: '10px' }}>
                Launch
              </button>
              <button onClick={() => setShowHostModal(false)}
                style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '14px' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {showJoinModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '350px' }}>
              <h3>Join Lounge</h3>
              <p style={{ color: '#666', fontSize: '13px', marginTop: 0 }}>Open your content on this device — the host will sync your position.</p>
              <input placeholder="Your Name" value={guestName} onChange={e => setGuestName(e.target.value)}
                style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc' }} />
              <input placeholder="Entry Code" value={inputCode} onChange={e => setInputCode(e.target.value)}
                style={{ width: '100%', padding: '10px', marginBottom: '15px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc', fontSize: '18px', textAlign: 'center' }} />
              <button onClick={handleJoinLounge}
                style={{ width: '100%', padding: '10px', background: '#007bff', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none', fontWeight: 'bold', marginBottom: '10px' }}>
                Join
              </button>
              <button onClick={() => setShowJoinModal(false)}
                style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '14px' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Room View ────────────────────────────────────────────────────────────

  const code = generatedCode || currentLounge?.entry_code;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', background: '#f8f9fa' }}>
      {/* Header */}
      <header style={{ background: '#111', color: '#fff', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <strong>{currentLounge?.lounge_name}</strong>
          <span style={{ color: '#aaa', fontSize: '12px' }}>Code: {code}</span>
          {isHost && <span style={{ background: '#28a745', padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>HOST</span>}
          <span style={{ color: connectionStatus === 'Live (P2P)' ? '#4caf50' : '#aaa', fontSize: '11px' }}>● {connectionStatus}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          {isHost && (
            <>
              <button onClick={handleShareWhatsApp}
                style={{ background: '#25D366', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                📲 WhatsApp
              </button>
              <button onClick={handleCopyLink}
                style={{ background: '#555', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }}>
                🔗 Copy Link
              </button>
            </>
          )}
          {isHost && sessionStatus === 'not_started' && (
            <button onClick={handleStartClass} style={{ background: '#28a745', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '5px', cursor: 'pointer' }}>Start</button>
          )}
          {isHost && sessionStatus === 'active' && (
            <button onClick={handleBreak} style={{ background: '#ff9800', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '5px', cursor: 'pointer' }}>Break</button>
          )}
          {isHost && sessionStatus === 'on_break' && (
            <button onClick={handleResume} style={{ background: '#2196f3', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '5px', cursor: 'pointer' }}>Resume</button>
          )}
          <button onClick={handleExit} style={{ background: '#dc3545', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '5px', cursor: 'pointer' }}>Exit</button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Main Area */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Audio/Video Bar */}
          <div style={{ background: '#1a1a1a', padding: '10px 14px', display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
            {isHost ? (
              <>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <video ref={localVideoRef} autoPlay muted playsInline
                    style={{ width: '160px', height: '100px', borderRadius: '6px', background: '#333', objectFit: 'cover', display: camActive ? 'block' : 'none' }} />
                  {!camActive && (
                    <div style={{ width: '160px', height: '100px', borderRadius: '6px', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '30px' }}>🎙️</span>
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: '5px', left: '5px', display: 'flex', gap: '4px' }}>
                    <button onClick={toggleMic}
                      style={{ background: micActive ? '#28a745' : '#dc3545', border: 'none', borderRadius: '3px', padding: '3px 6px', cursor: 'pointer', fontSize: '12px' }}>
                      {micActive ? '🎙️' : '🔇'}
                    </button>
                    <button onClick={toggleCam}
                      style={{ background: camActive ? '#28a745' : '#dc3545', border: 'none', borderRadius: '3px', padding: '3px 6px', cursor: 'pointer', fontSize: '12px' }}>
                      {camActive ? '📹' : '📷'}
                    </button>
                  </div>
                  <span style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '10px', padding: '1px 5px', borderRadius: '3px' }}>You</span>
                </div>
                <div style={{ color: '#ccc', fontSize: '12px' }}>
                  <p style={{ margin: '0 0 6px 0', color: '#fff', fontWeight: 'bold' }}>Students: {connectedStudents.length}</p>
                  {connectedStudents.length === 0
                    ? <span style={{ color: '#888' }}>Waiting for students...</span>
                    : connectedStudents.map((id, i) => (
                      <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#333', padding: '3px 8px', borderRadius: '20px', marginRight: '5px', marginBottom: '4px', fontSize: '11px' }}>
                        <span style={{ color: '#4caf50' }}>🎙️</span> Student {i + 1}
                      </span>
                    ))}
                  {mediaError && <p style={{ color: '#ff9800', margin: '6px 0 0 0' }}>⚠️ {mediaError}</p>}
                </div>
              </>
            ) : (
              <>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <video ref={hostVideoRef} autoPlay playsInline
                    style={{ width: '200px', height: '120px', borderRadius: '6px', background: '#333', objectFit: 'cover', display: hostStream ? 'block' : 'none' }} />
                  {!hostStream && (
                    <div style={{ width: '200px', height: '120px', borderRadius: '6px', background: '#333', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '24px' }}>📡</span>
                      <span style={{ color: '#888', fontSize: '11px' }}>{connectionStatus === 'Connecting...' ? 'Connecting...' : 'Waiting for host'}</span>
                    </div>
                  )}
                  <span style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '10px', padding: '1px 5px', borderRadius: '3px' }}>
                    {currentLounge?.host_name}
                  </span>
                </div>
                <div style={{ color: '#ccc' }}>
                  <button onClick={toggleMic}
                    style={{ background: micActive ? '#28a745' : '#dc3545', border: 'none', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', fontSize: '14px', color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {micActive ? '🎙️ Mic On' : '🔇 Mic Off'}
                  </button>
                  <p style={{ color: connectionStatus === 'Live (P2P)' ? '#4caf50' : '#888', fontSize: '11px', margin: '6px 0 0 0' }}>
                    {connectionStatus === 'Live (P2P)' ? '✓ Connected to host' : connectionStatus}
                  </p>
                  {mediaError && <p style={{ color: '#ff9800', fontSize: '11px', margin: '4px 0 0 0' }}>⚠️ {mediaError}</p>}
                </div>
              </>
            )}
          </div>

          {/* Position Sync Panel */}
          {isHost ? (
            <div style={{ background: '#fff', borderBottom: '1px solid #eee', padding: '12px 16px', flexShrink: 0 }}>
              <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '13px', color: '#333' }}>
                📍 Sync Content Position
                <span style={{ marginLeft: '8px', fontWeight: 'normal', color: '#888', fontSize: '12px' }}>
                  Each student uses their own device — you're just telling them where to navigate.
                </span>
              </p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={positionType} onChange={e => setPositionType(e.target.value as SyncPosition['type'])}
                  style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', cursor: 'pointer' }}>
                  <option value="video">▶ Video</option>
                  <option value="page">📖 Page</option>
                  <option value="chapter">📌 Chapter</option>
                  <option value="custom">📍 Custom</option>
                </select>
                <input
                  value={positionValue}
                  onChange={e => setPositionValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSyncPosition()}
                  placeholder={POSITION_HINTS[positionType]}
                  style={{ flex: 1, minWidth: '120px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
                />
                <button onClick={handleSyncPosition}
                  style={{ padding: '8px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                  🔁 Sync to All
                </button>
              </div>
              {currentPosition && (
                <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#555' }}>
                  Last synced: <strong>{currentPosition.label}</strong>
                </p>
              )}
            </div>
          ) : (
            /* Student: current sync position display */
            currentPosition && (
              <div style={{ background: '#1a1a2e', color: '#fff', padding: '14px 20px', flexShrink: 0, borderBottom: '1px solid #333' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '11px', letterSpacing: '1px', color: '#aaa' }}>HOST SAYS — GO TO</p>
                <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold' }}>{currentPosition.label}</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#aaa' }}>
                  Open your content on this device and navigate to this position.
                </p>
              </div>
            )
          )}

          {/* Q&A + file share */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <p style={{ color: '#888', letterSpacing: '1px', margin: 0, fontSize: '12px' }}>SECTION</p>
              <h1 style={{ fontSize: '60px', margin: '4px 0', fontWeight: 'bold' }}>#{currentBookmark}</h1>
            </div>
            <div style={{ width: '100%', maxWidth: '420px', background: '#fff', padding: '18px', borderRadius: '14px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
              <textarea value={questionInput} onChange={e => setQuestionInput(e.target.value)}
                placeholder="Ask a question..."
                style={{ width: '100%', height: '65px', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '10px', resize: 'none', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleSendQuestion}
                  style={{ flex: 1, padding: '11px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                  ❓ Ask
                </button>
                <button onClick={handleShareFile}
                  style={{ flex: 1, padding: '11px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                  📤 Share Link
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ flex: 1, background: '#fff', borderLeft: '1px solid #eee', display: 'flex', flexDirection: 'column', minWidth: '240px' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #eee' }}>
            <h3 style={{ margin: 0 }}>Class Stream</h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>

            {/* Sync history (host only) */}
            {isHost && syncHistory.length > 0 && (
              <>
                <h4 style={{ fontSize: '13px', color: '#555', marginTop: 0 }}>🕐 Sync History</h4>
                {syncHistory.map((p, i) => (
                  <div key={i} style={{ padding: '6px 10px', background: i === 0 ? '#e8f5e9' : '#f5f5f5', borderRadius: '6px', marginBottom: '6px', fontSize: '12px', cursor: 'pointer', borderLeft: `3px solid ${i === 0 ? '#28a745' : '#ccc'}` }}
                    onClick={() => { sendSignal('position-sync', { position: p }); setCurrentPosition(p); }}>
                    {p.label}
                    {i === 0 && <span style={{ marginLeft: '6px', color: '#28a745', fontSize: '10px' }}>● current</span>}
                  </div>
                ))}
                <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid #eee' }} />
              </>
            )}

            <h4 style={{ fontSize: '13px', color: '#555', marginTop: 0 }}>❓ Questions ({questions.length})</h4>
            {questions.length === 0 ? (
              <p style={{ color: '#999', fontSize: '13px' }}>No questions yet</p>
            ) : (
              questions.map((q, i) => (
                <div key={i} style={{ padding: '10px', background: '#fff3cd', borderRadius: '8px', marginBottom: '8px', borderLeft: '4px solid #ff9800' }}>
                  <small><strong>{q.user_name}</strong></small>
                  <p style={{ margin: '4px 0', fontSize: '13px' }}>{q.question_text}</p>
                  {isHost && !q.answered && (
                    <button onClick={() => q.id && handleAnswerQuestion(q.id)}
                      style={{ padding: '3px 8px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>
                      Mark Answered
                    </button>
                  )}
                  {q.answered && <span style={{ color: '#4caf50', fontSize: '11px' }}>✓ Answered</span>}
                </div>
              ))
            )}

            <h4 style={{ marginTop: '16px', fontSize: '13px', color: '#555' }}>📁 Shared Links ({sharedFiles.length})</h4>
            {sharedFiles.length === 0 ? (
              <p style={{ color: '#999', fontSize: '13px' }}>No links shared</p>
            ) : (
              sharedFiles.map((f, i) => (
                <div key={i} style={{ padding: '8px', background: '#e7f3ff', borderRadius: '8px', marginBottom: '8px' }}>
                  <a href={f.file_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: '#0056b3', fontWeight: '500', fontSize: '13px' }}>📄 {f.file_name}</a>
                  <br /><small style={{ color: '#888' }}>By {f.from_name}</small>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
