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
    const code = Math.floor(100000 +
