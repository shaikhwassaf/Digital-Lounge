import { useEffect, useState, useRef } from 'react';
import { supabase } from './lib/supabaseClient';

// ─── Color Palette ─────────────────────────────────────────────────────────
const C = {
  headerBg:   '#0f172a',   // deep slate
  primary:    '#6366f1',   // indigo
  primaryDk:  '#4f46e5',
  teal:       '#0d9488',
  amber:      '#d97706',
  purple:     '#7c3aed',
  emerald:    '#059669',
  red:        '#dc2626',
  rose:       '#e11d48',
  gold:       '#ca8a04',
  whatsapp:   '#25D366',
  bg:         '#f1f5f9',
  card:       '#ffffff',
  border:     '#e2e8f0',
  text:       '#0f172a',
  muted:      '#64748b',
  slate2:     '#1e293b',
  indigo10:   'rgba(99,102,241,0.10)',
  indigo20:   'rgba(99,102,241,0.20)',
};

// ─── Interfaces ────────────────────────────────────────────────────────────
interface Question { id?: string; user_name: string; question_text: string; bookmark_number: number; answered: boolean; peer_id?: string; }
interface FileShare { file_name: string; file_url: string; from_name: string; }
interface BookmarkPosition { type: 'video' | 'page' | 'chapter' | 'custom'; value: string; label: string; }
interface QuizQuestion { id: number; type: 'mc' | 'short' | 'long' | 'diagram' | 'derive'; text: string; options: [string, string, string, string]; correctOption: 'A' | 'B' | 'C' | 'D'; requiresDiagram: boolean; }
interface Quiz { id: string; type: 'short' | 'long'; title: string; subject: string; questions: QuizQuestion[]; timeLimit: number; bookmarkRef: number; createdAt: string; }
interface QuizSubmission { studentName: string; peerId: string; answers: Record<number, string>; diagramUrls: Record<number, string>; submittedAt: string; mcScore?: number; }
interface ExitTicketResponse { studentName: string; peerId: string; mainIdea: string; unclear: string; rating: number; }
interface LeaderboardEntry { peerId: string; name: string; points: number; }

// ─── Constants ─────────────────────────────────────────────────────────────
const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
const TYPE_ICONS: Record<string, string> = { video: '▶', page: '📖', chapter: '📌', custom: '📍' };
const TYPE_HINTS: Record<string, string> = { video: 'e.g. 12:34', page: 'e.g. 45', chapter: 'e.g. Chapter 3', custom: 'e.g. Slide 7' };
const TYPE_LABELS: Record<string, string> = { video: 'Video', page: 'Page', chapter: 'Chapter', custom: 'Position' };
const STEM_SUBJECTS = ['physics', 'chemistry', 'biology', 'maths', 'geometry', 'trigonometry', 'engineering'];
const Q_TYPE_LABELS: Record<string, string> = { mc: 'Multiple Choice', short: 'Short Answer', long: 'Long Answer', diagram: 'Diagram + Label', derive: 'Derive / Prove' };

const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const blankQ = (id: number, stem: boolean): QuizQuestion => ({ id, type: 'mc', text: '', options: ['', '', '', ''], correctOption: 'A', requiresDiagram: stem });

// ─── Formula Parser ─────────────────────────────────────────────────────────
function parseMath(t: string): string {
  return t
    .replace(/\\alpha/g,'α').replace(/\\beta/g,'β').replace(/\\gamma/g,'γ').replace(/\\delta/g,'δ')
    .replace(/\\epsilon/g,'ε').replace(/\\eta/g,'η').replace(/\\theta/g,'θ').replace(/\\kappa/g,'κ')
    .replace(/\\lambda/g,'λ').replace(/\\mu/g,'μ').replace(/\\nu/g,'ν').replace(/\\xi/g,'ξ')
    .replace(/\\pi/g,'π').replace(/\\rho/g,'ρ').replace(/\\sigma/g,'σ').replace(/\\tau/g,'τ')
    .replace(/\\phi/g,'φ').replace(/\\chi/g,'χ').replace(/\\psi/g,'ψ').replace(/\\omega/g,'ω')
    .replace(/\\Delta/g,'Δ').replace(/\\Gamma/g,'Γ').replace(/\\Lambda/g,'Λ').replace(/\\Pi/g,'Π')
    .replace(/\\Sigma/g,'Σ').replace(/\\Phi/g,'Φ').replace(/\\Psi/g,'Ψ').replace(/\\Omega/g,'Ω')
    .replace(/\^0/g,'⁰').replace(/\^1/g,'¹').replace(/\^2/g,'²').replace(/\^3/g,'³').replace(/\^4/g,'⁴')
    .replace(/\^5/g,'⁵').replace(/\^6/g,'⁶').replace(/\^7/g,'⁷').replace(/\^8/g,'⁸').replace(/\^9/g,'⁹')
    .replace(/\^n/g,'ⁿ').replace(/\^-1/g,'⁻¹').replace(/\^-2/g,'⁻²')
    .replace(/_0/g,'₀').replace(/_1/g,'₁').replace(/_2/g,'₂').replace(/_3/g,'₃').replace(/_4/g,'₄')
    .replace(/_5/g,'₅').replace(/_6/g,'₆').replace(/_7/g,'₇').replace(/_8/g,'₈').replace(/_9/g,'₉').replace(/_n/g,'ₙ')
    .replace(/\\sqrt/g,'√').replace(/\\pm/g,'±').replace(/\\mp/g,'∓').replace(/\\times/g,'×').replace(/\\div/g,'÷')
    .replace(/\\cdot/g,'·').replace(/\\neq/g,'≠').replace(/\\leq/g,'≤').replace(/\\geq/g,'≥').replace(/\\approx/g,'≈')
    .replace(/\\equiv/g,'≡').replace(/\\infty/g,'∞').replace(/\\degree/g,'°').replace(/\\angle/g,'∠')
    .replace(/\\perp/g,'⊥').replace(/\\parallel/g,'∥').replace(/\\triangle/g,'△')
    .replace(/\\rightarrow/g,'→').replace(/\\leftarrow/g,'←').replace(/\\Rightarrow/g,'⇒')
    .replace(/\\therefore/g,'∴').replace(/\\because/g,'∵').replace(/\\int/g,'∫').replace(/\\partial/g,'∂').replace(/\\nabla/g,'∇');
}

// ─── Shared UI ─────────────────────────────────────────────────────────────
function Overlay({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.72)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, overflowY: 'auto', padding: '24px 0', backdropFilter: 'blur(2px)' }}>{children}</div>;
}
function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: C.card, padding: '28px', borderRadius: '16px', width: '360px', maxWidth: '94vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <h3 style={{ marginTop: 0, color: C.text }}>{title}</h3>{children}
      </div>
    </div>
  );
}

// Style helpers
const iStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', marginBottom: '10px', boxSizing: 'border-box', borderRadius: '8px', border: `1.5px solid ${C.border}`, fontSize: '14px', background: '#f8fafc' };
const bStyle = (bg: string, color = '#fff'): React.CSSProperties => ({ width: '100%', padding: '11px', background: bg, color, borderRadius: '9px', cursor: 'pointer', border: 'none', fontWeight: '600', marginBottom: '10px', fontSize: '14px', letterSpacing: '0.3px' });
const lblStyle: React.CSSProperties = { fontSize: '12px', fontWeight: '600', color: C.muted, display: 'block', marginBottom: '4px', letterSpacing: '0.3px' };
const thStyle: React.CSSProperties = { padding: '9px 11px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: C.muted, letterSpacing: '0.3px' };
const tdStyle: React.CSSProperties = { padding: '9px 11px', fontSize: '13px' };

const card = (extra?: React.CSSProperties): React.CSSProperties => ({ background: C.card, borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: `1px solid ${C.border}`, ...extra });
const hdrBtn = (bg: string, color = '#fff'): React.CSSProperties => ({ background: bg, color, border: 'none', padding: '5px 11px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' });
const pill = (bg: string, color: string): React.CSSProperties => ({ background: bg, color, borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: '700' });

// ─── App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [isHost, setIsHost] = useState(false);
  const isHostRef = useRef(false);
  const [currentCorridor, setCurrentCorridor] = useState<any>(null);
  const [corridors, setCorridors] = useState<any[]>([]);
  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Bookmark
  const [currentBookmark, setCurrentBookmark] = useState(0);
  const [currentPosition, setCurrentPosition] = useState<BookmarkPosition | null>(null);
  const [bookmarkHistory, setBookmarkHistory] = useState<Array<{ num: number; pos: BookmarkPosition }>>([]);
  const [nextType, setNextType] = useState<BookmarkPosition['type']>('video');
  const [nextValue, setNextValue] = useState('');

  // Questions / Class
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [sharedFiles, setSharedFiles] = useState<FileShare[]>([]);
  const [classStatus, setClassStatus] = useState<'not_started' | 'active' | 'on_break' | 'ended'>('not_started');

  // Poll
  const [pollActive, setPollActive] = useState(false);
  const [pollResponses, setPollResponses] = useState({ yes: 0, no: 0 });
  const [pollResponseDetails, setPollResponseDetails] = useState<{ peerId: string; name: string; understood: boolean }[]>([]);
  const [pollComplete, setPollComplete] = useState(false);
  const [pollScore, setPollScore] = useState<number | null>(null);
  const [studentPollAnswer, setStudentPollAnswer] = useState<boolean | null>(null);

  // Quiz Creator
  const [showQuizCreator, setShowQuizCreator] = useState(false);
  const [quizCreatorType, setQuizCreatorType] = useState<'short' | 'long'>('short');
  const [quizTitle, setQuizTitle] = useState('');
  const [quizSubject, setQuizSubject] = useState('general');
  const [quizTimeLimit, setQuizTimeLimit] = useState(5);
  const [draftQuestions, setDraftQuestions] = useState<QuizQuestion[]>([]);
  const [draftQIdCounter, setDraftQIdCounter] = useState(1);

  // Active Quiz
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [studentAnswers, setStudentAnswers] = useState<Record<number, string>>({});
  const [studentDiagramUrls, setStudentDiagramUrls] = useState<Record<number, string>>({});
  const [quizTimeLeft, setQuizTimeLeft] = useState<number | null>(null);
  const [studentQuizSubmitted, setStudentQuizSubmitted] = useState(false);
  const [quizSubmissions, setQuizSubmissions] = useState<QuizSubmission[]>([]);
  const [showQuizResults, setShowQuizResults] = useState(false);

  // Exit Ticket
  const [showExitTicket, setShowExitTicket] = useState(false);
  const [exitAnswer, setExitAnswer] = useState({ mainIdea: '', unclear: '', rating: 0 });
  const [exitSubmitted, setExitSubmitted] = useState(false);
  const [exitResponses, setExitResponses] = useState<ExitTicketResponse[]>([]);
  const [showExitSummary, setShowExitSummary] = useState(false);

  // Progress
  const [showProgress, setShowProgress] = useState(false);

  // Spaced Repetition
  const [showReminder, setShowReminder] = useState(false);
  const [reminderQuiz, setReminderQuiz] = useState<Quiz | null>(null);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const leaderboardRef = useRef<LeaderboardEntry[]>([]);
  useEffect(() => { leaderboardRef.current = leaderboard; }, [leaderboard]);
  useEffect(() => { if (isHost && view === 'room' && leaderboard.length > 0) sendSignal('leaderboard-update', { entries: leaderboard }); }, [leaderboard]);

  // Class timer
  const [classElapsed, setClassElapsed] = useState(0);
  const [showRefreshReminder, setShowRefreshReminder] = useState(false);

  // WebRTC
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

  // Forms
  const [newCorridorName, setNewCorridorName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');

  const [myId] = useState(() => {
    let id = localStorage.getItem('lms_session_id');
    if (!id) { id = makeId(); localStorage.setItem('lms_session_id', id); }
    return id;
  });

  // Derived
  const unansweredCount = questions.filter(q => q.bookmark_number === currentBookmark && !q.answered).length;
  const totalPollResponses = pollResponses.yes + pollResponses.no;
  const canRunPoll = unansweredCount === 0 && currentBookmark > 0;
  const canAdvance = unansweredCount === 0 && pollComplete && (pollScore ?? 0) >= 80 && nextValue.trim().length > 0;
  const isStemSubject = STEM_SUBJECTS.includes(quizSubject);
  const currentBmQs = questions.filter(q => q.bookmark_number === currentBookmark);
  const pastQs = questions.filter(q => q.bookmark_number !== currentBookmark);
  const avgRating = exitResponses.length > 0 ? (exitResponses.reduce((s, r) => s + r.rating, 0) / exitResponses.length).toFixed(1) : null;

  // ─── Leaderboard helper ─────────────────────────────────────────────────
  const awardPoints = (peerId: string, name: string, pts: number) => {
    setLeaderboard(prev => {
      const exists = prev.find(e => e.peerId === peerId);
      const updated = exists
        ? prev.map(e => e.peerId === peerId ? { ...e, points: e.points + pts } : e)
        : [...prev, { peerId, name, points: pts }];
      return updated.sort((a, b) => b.points - a.points);
    });
  };

  // ─── Effects ────────────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) { setInputCode(code); setCurrentCorridor(null); setShowJoinModal(true); window.history.replaceState({}, '', window.location.pathname); }
  }, []);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { if (hostVideoRef.current && hostStream) hostVideoRef.current.srcObject = hostStream; }, [hostStream]);
  useEffect(() => { fetchCorridors(); }, []);

  useEffect(() => {
    if (classStatus !== 'active' || !isHost) return;
    const t = setInterval(() => {
      setClassElapsed(prev => { const n = prev + 1; if (n > 0 && n % (35 * 60) === 0) setShowRefreshReminder(true); return n; });
    }, 1000);
    return () => clearInterval(t);
  }, [classStatus, isHost]);

  useEffect(() => {
    if (quizTimeLeft === null || quizTimeLeft <= 0) {
      if (quizTimeLeft === 0 && !isHost && !studentQuizSubmitted && activeQuiz?.type === 'short') handleStudentSubmitQuiz(true);
      return;
    }
    const t = setTimeout(() => setQuizTimeLeft(p => (p ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [quizTimeLeft]);

  useEffect(() => { if (view === 'room' && currentCorridor) { setupRoom(); return () => cleanupRoom(); } }, [view, currentCorridor]);

  // ─── Room ────────────────────────────────────────────────────────────────
  const sendSignal = (event: string, payload: any) => signalingChannel.current?.send({ type: 'broadcast', event, payload });

  const createConnectionForStudent = async (studentId: string) => {
    if (peerConnections.current.has(studentId)) return;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.current.set(studentId, pc);
    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current!));
    pc.onicecandidate = (e) => { if (e.candidate) sendSignal('ice-candidate', { from: myId, target: studentId, candidate: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnectedStudents(prev => [...new Set([...prev, studentId])]);
        setConnectionStatus('Live (P2P)');
        if (currentPosition) sendSignal('bookmark-sync', { bookmark: currentBookmark, position: currentPosition, to: studentId });
        if (leaderboardRef.current.length > 0) sendSignal('leaderboard-update', { entries: leaderboardRef.current });
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
    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current!));
    pc.ontrack = (e) => { if (e.streams?.[0]) { setHostStream(e.streams[0]); if (hostVideoRef.current) hostVideoRef.current.srcObject = e.streams[0]; } };
    pc.onicecandidate = (e) => { if (e.candidate) sendSignal('ice-candidate', { from: myId, target: hostId, candidate: e.candidate.toJSON() }); };
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
    const dbc = supabase.channel(`lounge-db-${currentCorridor.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'questions' }, (p) => {
        setQuestions(prev => prev.some(q => q.id === p.new.id) ? prev : [p.new as Question, ...prev]);
        if (isHostRef.current && p.new.peer_id && p.new.user_name) awardPoints(p.new.peer_id, p.new.user_name, 3);
      }).subscribe();
    dbChannel.current = dbc;

    const sc = supabase.channel(`signals-${currentCorridor.id}`, { config: { broadcast: { self: false } } });

    sc.on('broadcast', { event: 'peer-join' }, async ({ payload }: any) => { if (!isHostRef.current) return; await createConnectionForStudent(payload.peerId); });
    sc.on('broadcast', { event: 'offer' }, async ({ payload }: any) => { if (isHostRef.current || payload.to !== myId) return; await handleIncomingOffer(payload.from, payload.sdp); });
    sc.on('broadcast', { event: 'answer' }, async ({ payload }: any) => {
      if (!isHostRef.current || payload.to !== myId) return;
      const pc = peerConnections.current.get(payload.from);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    });
    sc.on('broadcast', { event: 'ice-candidate' }, async ({ payload }: any) => {
      if (payload.target !== myId) return;
      const pc = peerConnections.current.get(payload.from);
      if (pc && payload.candidate) { try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch (_) {} }
    });
    sc.on('broadcast', { event: 'bookmark-sync' }, ({ payload }: any) => {
      if (isHostRef.current) return;
      if (payload.to && payload.to !== myId) return;
      setCurrentBookmark(payload.bookmark); setCurrentPosition(payload.position);
      setBookmarkHistory(prev => [{ num: payload.bookmark, pos: payload.position }, ...prev]);
      setPollActive(false); setPollComplete(false); setPollScore(null); setStudentPollAnswer(null);
    });
    sc.on('broadcast', { event: 'poll-start' }, () => { if (isHostRef.current) return; setStudentPollAnswer(null); setPollActive(true); });
    sc.on('broadcast', { event: 'poll-response' }, ({ payload }: any) => {
      if (!isHostRef.current) return;
      setPollResponses(prev => payload.understood ? { ...prev, yes: prev.yes + 1 } : { ...prev, no: prev.no + 1 });
      setPollResponseDetails(prev => [...prev, { peerId: payload.peerId, name: payload.name || 'Student', understood: payload.understood }]);
      awardPoints(payload.peerId, payload.name || 'Student', 2);
    });
    sc.on('broadcast', { event: 'poll-end' }, () => { if (isHostRef.current) return; setPollActive(false); });
    sc.on('broadcast', { event: 'quiz-launch' }, ({ payload }: any) => {
      if (isHostRef.current) return;
      const q: Quiz = payload.quiz;
      setActiveQuiz(q); setStudentAnswers({}); setStudentDiagramUrls({}); setStudentQuizSubmitted(false); setShowQuizModal(true);
      if (q.type === 'short' && q.timeLimit) setQuizTimeLeft(q.timeLimit * 60);
    });
    sc.on('broadcast', { event: 'quiz-submit' }, ({ payload }: any) => {
      if (!isHostRef.current) return;
      let correct = 0, mcCount = 0;
      (payload.quiz?.questions ?? []).forEach((q: QuizQuestion) => { if (q.type === 'mc') { mcCount++; if (payload.answers[q.id] === q.correctOption) correct++; } });
      const mcScore = mcCount > 0 ? Math.round((correct / mcCount) * 100) : undefined;
      setQuizSubmissions(prev => [...prev, { studentName: payload.studentName, peerId: payload.peerId, answers: payload.answers, diagramUrls: payload.diagramUrls ?? {}, submittedAt: new Date().toISOString(), mcScore }]);
      const pts = payload.quizType === 'long' ? 5 : correct * 10;
      if (pts > 0) awardPoints(payload.peerId, payload.studentName, pts);
      if (payload.quizType === 'long' && payload.quizId) {
        supabase.from('quiz_submissions').insert([{ quiz_id: payload.quizId, student_name: payload.studentName, peer_id: payload.peerId, answers: payload.answers, submitted_at: new Date().toISOString() }])
          .then(({ error }) => { if (error) console.warn('Submission DB:', error.message); });
      }
    });
    sc.on('broadcast', { event: 'quiz-end' }, () => { if (isHostRef.current) return; setShowQuizModal(false); setActiveQuiz(null); setQuizTimeLeft(null); });
    sc.on('broadcast', { event: 'exit-ticket-start' }, () => {
      if (isHostRef.current) return;
      setExitAnswer({ mainIdea: '', unclear: '', rating: 0 }); setExitSubmitted(false); setShowExitTicket(true);
    });
    sc.on('broadcast', { event: 'exit-ticket-submit' }, ({ payload }: any) => {
      if (!isHostRef.current) return;
      setExitResponses(prev => [...prev, payload]);
      awardPoints(payload.peerId, payload.studentName, 2);
    });
    sc.on('broadcast', { event: 'exit-ticket-end' }, () => { if (isHostRef.current) return; setShowExitTicket(false); });
    sc.on('broadcast', { event: 'leaderboard-update' }, ({ payload }: any) => { if (isHostRef.current) return; setLeaderboard(payload.entries); });

    await sc.subscribe();
    signalingChannel.current = sc;

    if (isHostRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream.current = stream; setCamActive(true); setMicActive(true);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream; setMediaError('');
      } catch {
        try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); localStream.current = stream; setMicActive(true); setMediaError('Camera unavailable.'); }
        catch { setMediaError('Microphone/camera access denied.'); }
      }
    } else {
      try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); localStream.current = stream; setMicActive(true); setMediaError(''); }
      catch { setMediaError('Microphone access denied.'); }
      setTimeout(() => { sendSignal('peer-join', { peerId: myId }); setConnectionStatus('Connecting...'); }, 800);
    }
  };

  const cleanupRoom = () => {
    localStream.current?.getTracks().forEach(t => t.stop()); localStream.current = null;
    peerConnections.current.forEach(pc => pc.close()); peerConnections.current.clear();
    if (dbChannel.current) { supabase.removeChannel(dbChannel.current); dbChannel.current = null; }
    if (signalingChannel.current) { supabase.removeChannel(signalingChannel.current); signalingChannel.current = null; }
    setHostStream(null); setConnectedStudents([]); setMicActive(false); setCamActive(false);
    setConnectionStatus('Offline'); setMediaError(''); setCurrentPosition(null); setBookmarkHistory([]);
    setPollActive(false); setPollComplete(false); setPollScore(null); setStudentPollAnswer(null);
    setPollResponses({ yes: 0, no: 0 }); setPollResponseDetails([]);
    setActiveQuiz(null); setShowQuizModal(false); setShowQuizResults(false); setQuizSubmissions([]); setQuizTimeLeft(null);
    setClassElapsed(0); setShowRefreshReminder(false);
    setLeaderboard([]); setShowLeaderboard(false);
    setExitResponses([]); setShowExitSummary(false); setShowExitTicket(false);
    setShowProgress(false); setShowReminder(false);
  };

  const toggleMic = () => { localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setMicActive(p => !p); };
  const toggleCam = () => { localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setCamActive(p => !p); };
  const fetchCorridors = async () => { try { const { data } = await supabase.from('active_lounges').select('*'); if (data) setCorridors(data); } catch (e) { console.error(e); } };

  // ─── Bookmark / Poll ─────────────────────────────────────────────────────
  const advanceBookmark = async () => {
    const nextNum = currentBookmark + 1;
    const pos: BookmarkPosition = { type: nextType, value: nextValue.trim(), label: `${TYPE_ICONS[nextType]} ${TYPE_LABELS[nextType]}: ${nextValue.trim()}` };
    try { await supabase.from('bookmarks').insert([{ lounge_id: currentCorridor.id, bookmark_number: nextNum, timestamp: Date.now(), created_at: new Date().toISOString() }]); } catch {}
    sendSignal('bookmark-sync', { bookmark: nextNum, position: pos });
    setCurrentBookmark(nextNum); setCurrentPosition(pos);
    setBookmarkHistory(prev => [{ num: nextNum, pos }, ...prev]);
    setNextValue('');
    setPollActive(false); setPollComplete(false); setPollScore(null); setPollResponses({ yes: 0, no: 0 }); setPollResponseDetails([]);
  };

  const handleStartPoll = () => {
    if (!canRunPoll) return;
    setPollActive(true); setPollComplete(false); setPollResponses({ yes: 0, no: 0 }); setPollScore(null); setPollResponseDetails([]);
    sendSignal('poll-start', { bookmark: currentBookmark });
  };

  const handleClosePoll = () => {
    const total = pollResponses.yes + pollResponses.no;
    const score = total > 0 ? Math.round((pollResponses.yes / total) * 100) : 0;
    setPollScore(score); setPollComplete(true); setPollActive(false);
    sendSignal('poll-end', {});
  };

  const handlePollResponse = (understood: boolean) => {
    if (studentPollAnswer !== null) return;
    setStudentPollAnswer(understood);
    sendSignal('poll-response', { peerId: myId, name: guestName || 'Student', understood });
  };

  // ─── Quiz ────────────────────────────────────────────────────────────────
  const openQuizCreator = (type: 'short' | 'long') => {
    setQuizCreatorType(type); setQuizTitle(''); setQuizSubject('general'); setQuizTimeLimit(5);
    setDraftQuestions([blankQ(1, false)]); setDraftQIdCounter(2); setShowQuizCreator(true);
  };

  const addDraftQ = () => { const id = draftQIdCounter; setDraftQIdCounter(p => p + 1); setDraftQuestions(prev => [...prev, blankQ(id, isStemSubject)]); };
  const removeDraftQ = (id: number) => setDraftQuestions(prev => prev.filter(q => q.id !== id));
  const updateDraftQ = (id: number, changes: Partial<QuizQuestion>) => setDraftQuestions(prev => prev.map(q => q.id === id ? { ...q, ...changes } : q));
  const updateDraftOpt = (qId: number, idx: number, val: string) =>
    setDraftQuestions(prev => prev.map(q => { if (q.id !== qId) return q; const opts = [...q.options] as [string, string, string, string]; opts[idx] = val; return { ...q, options: opts }; }));

  const handleLaunchQuiz = async () => {
    if (!quizTitle.trim()) return alert('Please enter a quiz title.');
    if (draftQuestions.length === 0) return alert('Please add at least one question.');
    if (draftQuestions.some(q => !q.text.trim())) return alert('All questions must have text.');
    if (draftQuestions.some(q => q.type === 'mc' && q.options.some(o => !o.trim()))) return alert('Fill in all MC options.');
    const quiz: Quiz = { id: makeId(), type: quizCreatorType, title: quizTitle, subject: quizSubject, questions: draftQuestions, timeLimit: quizTimeLimit, bookmarkRef: currentBookmark, createdAt: new Date().toISOString() };
    if (quizCreatorType === 'long') {
      try {
        const { data } = await supabase.from('quizzes').insert([{ lounge_id: currentCorridor.id, type: quiz.type, title: quiz.title, subject: quiz.subject, questions: quiz.questions, time_limit: quiz.timeLimit, bookmark_ref: quiz.bookmarkRef }]).select();
        if (data?.[0]?.id) quiz.id = data[0].id;
      } catch (e) { console.warn('Quiz DB:', (e as any)?.message); }
    }
    setActiveQuiz(quiz); setQuizSubmissions([]); setShowQuizCreator(false); setShowQuizResults(true);
    sendSignal('quiz-launch', { quiz });
    if (quizCreatorType === 'short') setQuizTimeLeft(quizTimeLimit * 60);
    if (quizCreatorType === 'long') { setReminderQuiz(quiz); setShowReminder(false); }
  };

  const handleStudentSubmitQuiz = (autoSubmit = false) => {
    if (studentQuizSubmitted) return;
    setStudentQuizSubmitted(true); setQuizTimeLeft(null);
    sendSignal('quiz-submit', { quizId: activeQuiz?.id, quizType: activeQuiz?.type, quiz: activeQuiz, studentName: guestName || 'Student', peerId: myId, answers: studentAnswers, diagramUrls: studentDiagramUrls });
    if (!autoSubmit) setShowQuizModal(false);
  };

  const handleEndQuiz = () => {
    sendSignal('quiz-end', {}); setShowQuizResults(false); setActiveQuiz(null); setQuizTimeLeft(null);
    if (reminderQuiz) setShowReminder(true);
  };

  // ─── Exit Ticket ─────────────────────────────────────────────────────────
  const handleSendExitTicket = () => { setExitResponses([]); setShowExitSummary(true); sendSignal('exit-ticket-start', {}); };
  const handleSubmitExitTicket = () => {
    if (!exitAnswer.rating) return alert('Please give a star rating.');
    setExitSubmitted(true);
    sendSignal('exit-ticket-submit', { studentName: guestName || 'Student', peerId: myId, mainIdea: exitAnswer.mainIdea, unclear: exitAnswer.unclear, rating: exitAnswer.rating });
  };
  const handleCloseExitTicket = () => { sendSignal('exit-ticket-end', {}); setShowExitSummary(false); };

  // ─── Corridor / Class ─────────────────────────────────────────────────────
  const handleCreateCorridor = async () => {
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const { data, error } = await supabase.from('active_lounges').insert([{ lounge_name: newCorridorName, host_name: newHostName, host_id: myId, entry_code: code }]).select();
      if (error) throw error;
      if (data) { setGeneratedCode(code); setCurrentCorridor(data[0]); isHostRef.current = true; setIsHost(true); setView('room'); setShowHostModal(false); }
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleJoinCorridor = async () => {
    try {
      if (!guestName.trim()) return alert('Please enter your name.');
      if (!inputCode.trim()) return alert('Please enter the entry code.');
      let corridor = currentCorridor;
      if (corridor) { if (inputCode.trim() !== corridor.entry_code.toString()) return alert('Wrong entry code.'); }
      else {
        const { data, error } = await supabase.from('active_lounges').select('*').eq('entry_code', inputCode.trim()).single();
        if (error || !data) return alert('No corridor found with that entry code.');
        corridor = data;
      }
      isHostRef.current = false; setIsHost(false); setCurrentCorridor(corridor); setView('room'); setShowJoinModal(false);
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleSendQuestion = async () => {
    try {
      if (!questionInput.trim()) return alert('Question cannot be empty');
      const q: Question = { user_name: isHost ? newHostName : (guestName || 'Student'), question_text: questionInput, bookmark_number: currentBookmark, answered: false };
      const { data, error } = await supabase.from('questions').insert([{ ...q, lounge_id: currentCorridor.id, peer_id: myId }]).select();
      if (error) throw error;
      setQuestions(prev => [data?.[0] ?? q as Question, ...prev]);
      setQuestionInput('');
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleAnswerQuestion = async (qId: string) => {
    try {
      await supabase.from('questions').update({ answered: true }).eq('id', qId);
      setQuestions(prev => prev.map(q => q.id === qId ? { ...q, answered: true } : q));
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleShareFile = async () => {
    const name = prompt('Resource Name:'); const url = prompt('Link (URL):');
    if (!name || !url) return;
    const f: FileShare = { file_name: name, file_url: url, from_name: isHost ? newHostName : (guestName || 'Student') };
    try {
      await supabase.from('file_shares').insert([{ lounge_id: currentCorridor.id, from_peer_id: myId, from_name: f.from_name, to_peer_id: null, file_name: name, file_url: url, created_at: new Date().toISOString() }]);
      setSharedFiles(prev => [f, ...prev]);
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleStartClass = async () => {
    try {
      await supabase.from('class_sessions').insert([{ lounge_id: currentCorridor.id, status: 'active', current_bookmark: 0, started_at: new Date().toISOString(), last_updated: new Date().toISOString() }]);
      setClassStatus('active');
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleBreak = async () => { try { await supabase.from('class_sessions').update({ status: 'on_break', last_updated: new Date().toISOString() }).eq('lounge_id', currentCorridor.id); setClassStatus('on_break'); } catch {} };
  const handleResume = async () => { try { await supabase.from('class_sessions').update({ status: 'active', last_updated: new Date().toISOString() }).eq('lounge_id', currentCorridor.id); setClassStatus('active'); } catch {} };
  const handleDeleteCorridor = async (id: string) => { try { await supabase.from('active_lounges').delete().eq('id', id); await fetchCorridors(); } catch {} };

  const handleExit = async () => {
    try {
      if (isHost && currentCorridor) { if (window.confirm('End this corridor for everyone?')) await supabase.from('active_lounges').delete().eq('id', currentCorridor.id); }
      setView('lobby'); setCurrentCorridor(null); isHostRef.current = false; setIsHost(false);
      setGeneratedCode(''); setQuestions([]); setSharedFiles([]); setCurrentBookmark(0); setClassStatus('not_started');
      await fetchCorridors();
    } catch (e) { console.error(e); }
  };

  const handleShareWhatsApp = () => {
    const c = generatedCode || currentCorridor?.entry_code;
    window.open(`https://wa.me/?text=${encodeURIComponent(`Join "${currentCorridor?.lounge_name}" on EduCorridor LMS!\n\nEntry Code: *${c}*\n\nJoin here (no app needed):\n${window.location.origin}?code=${c}`)}`, '_blank');
  };
  const handleCopyLink = () => { navigator.clipboard.writeText(`${window.location.origin}?code=${generatedCode || currentCorridor?.entry_code}`).then(() => alert('Link copied!')); };

  // ─── Progress ────────────────────────────────────────────────────────────
  const buildProgressData = () => {
    const registry = new Map<string, string>();
    questions.forEach(q => { if (q.peer_id && q.user_name) registry.set(q.peer_id, q.user_name); });
    pollResponseDetails.forEach(r => registry.set(r.peerId, r.name));
    quizSubmissions.forEach(s => registry.set(s.peerId, s.studentName));
    return Array.from(registry.entries()).map(([peerId, name]) => ({
      peerId, name,
      questionsAsked: questions.filter(q => q.peer_id === peerId).length,
      pollAnswered: pollResponseDetails.find(r => r.peerId === peerId),
      shortQuizScore: quizSubmissions.find(s => s.peerId === peerId && s.mcScore !== undefined)?.mcScore,
      homeworkDone: quizSubmissions.some(s => s.peerId === peerId && activeQuiz?.type === 'long'),
      exitDone: exitResponses.find(r => r.studentName === name),
      connected: connectedStudents.includes(peerId),
    }));
  };

  // ─── Reminders ───────────────────────────────────────────────────────────
  const buildReminder = (quiz: Quiz, days: number) => {
    const code = generatedCode || currentCorridor?.entry_code;
    const url = `${window.location.origin}?code=${code}`;
    if (days === 3) return `Hi! 📚 Reminder: Please complete your homework assignment "${quiz.title}" (${quiz.subject}) if you haven't yet.\n\nJoin your class corridor:\n${url} (Code: ${code})`;
    return `🔁 Review time! It's been a week since we covered "${quiz.title}". Revisit your notes and homework. Can you explain the key ideas without looking?\n\nJoin for questions: ${url} (Code: ${code})`;
  };

  const code = generatedCode || currentCorridor?.entry_code;
  const progressData = buildProgressData();

  // ═══════════════════════════════════════════════════════════════════════════
  // LOBBY
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === 'lobby') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'inherit' }}>
        {/* Hero */}
        <div style={{ background: `linear-gradient(135deg, ${C.headerBg} 0%, ${C.slate2} 60%, #1a1f3a 100%)`, padding: '52px 20px 44px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <div style={{ width: '42px', height: '42px', background: C.primary, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>🎓</div>
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '800', color: '#fff', letterSpacing: '-0.5px' }}>EduCorridor</h1>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: '600' }}>Learning Management System</p>
            </div>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 auto', maxWidth: '400px' }}>Students join via WhatsApp link — no app install needed</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '28px', flexWrap: 'wrap' }}>
            <button onClick={() => setShowHostModal(true)} style={{ padding: '13px 32px', background: C.primary, color: '#fff', borderRadius: '10px', cursor: 'pointer', border: 'none', fontSize: '15px', fontWeight: '700', boxShadow: `0 4px 20px rgba(99,102,241,0.4)` }}>
              🏫 Host a Corridor
            </button>
            <button onClick={() => { setCurrentCorridor(null); setInputCode(''); setShowJoinModal(true); }} style={{ padding: '13px 32px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
              🚪 Join Corridor
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ background: C.primary, padding: '10px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', flexWrap: 'wrap' }}>
            {[['🔴 Live', 'Real-time P2P'], ['📲 WhatsApp', 'No App Install'], ['🧠 AI-Gated', '80% Poll Gate'], ['🏆 Gamified', 'Live Leaderboard']].map(([icon, label]) => (
              <div key={label} style={{ color: '#fff', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: '700' }}>{icon}</p>
                <p style={{ margin: 0, fontSize: '11px', opacity: 0.75 }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Active Corridors */}
        <div style={{ maxWidth: '640px', margin: '32px auto', padding: '0 16px' }}>
          <h3 style={{ color: C.text, marginBottom: '12px', fontWeight: '700', fontSize: '16px' }}>Active Corridors</h3>
          {corridors.length === 0
            ? <div style={{ ...card(), textAlign: 'center', padding: '28px', color: C.muted }}>No active corridors — host one to get started.</div>
            : corridors.map((l: any) => (
              <div key={l.id} style={{ ...card({ marginBottom: '10px' }), display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '700' }}>{l.lounge_name}</h4>
                    {l.host_id === myId && <span style={{ ...pill(C.indigo10, C.primary), border: `1px solid ${C.indigo20}` }}>MY CORRIDOR</span>}
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: C.muted }}>Host: {l.host_name} · Code: <strong>{l.entry_code}</strong></p>
                </div>
                <div style={{ display: 'flex', gap: '7px' }}>
                  {l.host_id === myId
                    ? <>
                        <button onClick={() => { setCurrentCorridor(l); setGeneratedCode(l.entry_code); isHostRef.current = true; setIsHost(true); setView('room'); }} style={hdrBtn(C.emerald)}>Rejoin</button>
                        <button onClick={() => { if (window.confirm('End this corridor?')) handleDeleteCorridor(l.id); }} style={hdrBtn(C.red)}>End</button>
                      </>
                    : <button onClick={() => { setCurrentCorridor(l); setInputCode(''); setShowJoinModal(true); }} style={hdrBtn(C.primary)}>Join</button>}
                </div>
              </div>
            ))}
        </div>

        {showHostModal && <Modal onClose={() => setShowHostModal(false)} title="🏫 Create New Corridor">
          <input placeholder="Corridor Name (e.g. Physics — Class 10A)" value={newCorridorName} onChange={e => setNewCorridorName(e.target.value)} style={iStyle} />
          <input placeholder="Your Name (Host)" value={newHostName} onChange={e => setNewHostName(e.target.value)} style={{ ...iStyle, marginBottom: '16px' }} />
          <button onClick={handleCreateCorridor} style={bStyle(C.primary)}>🚀 Create Corridor</button>
          <button onClick={() => setShowHostModal(false)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', width: '100%', fontSize: '14px' }}>Cancel</button>
        </Modal>}

        {showJoinModal && <Modal onClose={() => setShowJoinModal(false)} title="🚪 Join Corridor">
          <p style={{ color: C.muted, fontSize: '13px', margin: '0 0 14px', background: C.bg, padding: '9px', borderRadius: '7px' }}>Have your learning material ready — the host will sync your position.</p>
          <input placeholder="Your Name" value={guestName} onChange={e => setGuestName(e.target.value)} style={iStyle} />
          <input placeholder="Entry Code" value={inputCode} onChange={e => setInputCode(e.target.value)} style={{ ...iStyle, fontSize: '22px', textAlign: 'center', letterSpacing: '6px', marginBottom: '16px', fontWeight: '700' }} />
          <button onClick={handleJoinCorridor} style={bStyle(C.primary)}>🚪 Enter Corridor</button>
          <button onClick={() => setShowJoinModal(false)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', width: '100%', fontSize: '14px' }}>Cancel</button>
        </Modal>}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'inherit', background: C.bg }}>

      {/* ── Header ── */}
      <header style={{ background: C.headerBg, color: '#fff', padding: '7px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: '6px', borderBottom: `2px solid ${C.primary}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '28px', height: '28px', background: C.primary, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>🎓</div>
            <div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: '700', lineHeight: 1.1 }}>{currentCorridor?.lounge_name}</p>
              <p style={{ margin: 0, fontSize: '10px', color: '#94a3b8', lineHeight: 1.1 }}>Code: <strong style={{ color: '#c7d2fe' }}>{code}</strong></p>
            </div>
          </div>
          {isHost && <span style={{ ...pill(C.primary, '#fff'), fontSize: '10px' }}>HOST</span>}
          <span style={{ fontSize: '11px', color: connectionStatus === 'Live (P2P)' ? '#34d399' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: connectionStatus === 'Live (P2P)' ? '#34d399' : '#64748b', display: 'inline-block' }} />
            {connectionStatus}
          </span>
          {isHost && classStatus === 'active' && (
            <span style={{ fontSize: '11px', color: showRefreshReminder ? '#fbbf24' : '#64748b' }}>
              {showRefreshReminder ? '⏰ 35 min!' : `⏱ ${formatTime(classElapsed)}`}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
          {isHost && <>
            <button onClick={handleShareWhatsApp} style={hdrBtn(C.whatsapp)}>📲 WhatsApp</button>
            <button onClick={handleCopyLink} style={hdrBtn('#334155')}>🔗 Link</button>
            <button onClick={() => openQuizCreator('short')} style={hdrBtn(C.amber)}>⚡ Quiz</button>
            <button onClick={() => openQuizCreator('long')} style={hdrBtn(C.purple)}>📚 HW</button>
            {classStatus === 'active' && <button onClick={handleSendExitTicket} style={hdrBtn(C.rose)}>🎟 Exit Ticket</button>}
            <button onClick={() => setShowProgress(true)} style={hdrBtn(C.teal)}>📊 Progress</button>
            {classStatus === 'not_started' && <button onClick={handleStartClass} style={hdrBtn(C.emerald)}>▶ Start Class</button>}
            {classStatus === 'active' && <button onClick={handleBreak} style={hdrBtn('#78716c')}>☕ Break</button>}
            {classStatus === 'on_break' && <button onClick={handleResume} style={hdrBtn(C.primary)}>▶ Resume</button>}
          </>}
          <button onClick={() => setShowLeaderboard(true)} style={{ ...hdrBtn(C.gold), display: 'flex', alignItems: 'center', gap: '3px' }}>🏆 {leaderboard.length > 0 ? leaderboard[0].points : 0}pt</button>
          <button onClick={handleExit} style={hdrBtn(C.red)}>Exit</button>
        </div>
      </header>

      {/* 35-min banner */}
      {isHost && showRefreshReminder && (
        <div style={{ background: `linear-gradient(90deg, ${C.amber}, #f59e0b)`, color: '#fff', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, fontSize: '13px' }}>
          <span><strong>⏰ 35 minutes —</strong> Time for a quick Short Quiz to refresh understanding!</span>
          <div style={{ display: 'flex', gap: '7px' }}>
            <button onClick={() => openQuizCreator('short')} style={{ background: '#fff', color: C.amber, border: 'none', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}>Launch Quiz</button>
            <button onClick={() => setShowRefreshReminder(false)} style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Dismiss</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left Panel ── */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* AV Strip */}
          <div style={{ background: C.slate2, padding: '8px 12px', display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0, borderBottom: `1px solid rgba(255,255,255,0.07)` }}>
            {isHost ? (
              <>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '140px', height: '88px', borderRadius: '8px', background: '#334155', objectFit: 'cover', display: camActive ? 'block' : 'none', border: `2px solid ${C.primary}` }} />
                  {!camActive && <div style={{ width: '140px', height: '88px', borderRadius: '8px', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid #475569` }}><span style={{ fontSize: '28px' }}>🎙️</span></div>}
                  <div style={{ position: 'absolute', bottom: '4px', left: '4px', display: 'flex', gap: '3px' }}>
                    <button onClick={toggleMic} style={{ background: micActive ? C.emerald : C.red, border: 'none', borderRadius: '4px', padding: '2px 5px', cursor: 'pointer', fontSize: '11px' }}>{micActive ? '🎙️' : '🔇'}</button>
                    <button onClick={toggleCam} style={{ background: camActive ? C.emerald : C.red, border: 'none', borderRadius: '4px', padding: '2px 5px', cursor: 'pointer', fontSize: '11px' }}>{camActive ? '📹' : '📷'}</button>
                  </div>
                  <span style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', fontWeight: '600' }}>You</span>
                </div>
                <div style={{ color: '#cbd5e1', fontSize: '12px' }}>
                  <p style={{ margin: '0 0 4px', color: '#f1f5f9', fontWeight: '700', fontSize: '13px' }}>Students connected: <span style={{ color: '#34d399' }}>{connectedStudents.length}</span></p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                    {connectedStudents.length === 0
                      ? <span style={{ color: '#475569', fontSize: '12px' }}>Waiting for students...</span>
                      : connectedStudents.map((id, i) => <span key={id} style={{ background: '#1e293b', border: `1px solid ${C.primary}`, color: '#c7d2fe', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>S{i + 1}</span>)}
                  </div>
                  {mediaError && <p style={{ color: '#fbbf24', margin: '4px 0 0', fontSize: '11px' }}>⚠ {mediaError}</p>}
                </div>
              </>
            ) : (
              <>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <video ref={hostVideoRef} autoPlay playsInline style={{ width: '170px', height: '100px', borderRadius: '8px', background: '#334155', objectFit: 'cover', display: hostStream ? 'block' : 'none', border: `2px solid ${C.teal}` }} />
                  {!hostStream && <div style={{ width: '170px', height: '100px', borderRadius: '8px', background: '#1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', border: '2px solid #334155' }}><span style={{ fontSize: '22px' }}>📡</span><span style={{ color: '#64748b', fontSize: '11px' }}>{connectionStatus}</span></div>}
                  <span style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', fontWeight: '600' }}>{currentCorridor?.host_name}</span>
                </div>
                <div>
                  <button onClick={toggleMic} style={{ background: micActive ? C.emerald : C.red, border: 'none', borderRadius: '7px', padding: '7px 14px', cursor: 'pointer', fontSize: '13px', color: '#fff', fontWeight: '700' }}>{micActive ? '🎙️ Mic On' : '🔇 Muted'}</button>
                  <p style={{ margin: '5px 0 0', fontSize: '11px', color: connectionStatus === 'Live (P2P)' ? '#34d399' : '#64748b' }}>{connectionStatus === 'Live (P2P)' ? '✓ Connected to host' : connectionStatus}</p>
                  {leaderboard.length > 0 && (() => { const me = leaderboard.find(e => e.peerId === myId); return me ? <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#fbbf24' }}>🏆 {me.points} pts · #{leaderboard.findIndex(e => e.peerId === myId) + 1}</p> : null; })()}
                  {mediaError && <p style={{ color: '#fbbf24', margin: '4px 0 0', fontSize: '11px' }}>⚠ {mediaError}</p>}
                </div>
              </>
            )}
          </div>

          {/* Scrollable */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {/* Bookmark card */}
            <div style={{ background: `linear-gradient(135deg, ${C.headerBg} 0%, ${C.slate2} 100%)`, borderRadius: '14px', padding: '16px 18px', border: `1px solid rgba(99,102,241,0.3)` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', letterSpacing: '2.5px', color: '#818cf8', fontWeight: '700', textTransform: 'uppercase' }}>Bookmark</span>
                <span style={{ fontSize: '38px', fontWeight: '800', color: '#fff', lineHeight: 1 }}>#{currentBookmark}</span>
              </div>
              {currentPosition
                ? <p style={{ margin: 0, fontSize: '17px', fontWeight: '600', color: '#e2e8f0' }}>{currentPosition.label}</p>
                : <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>{isHost ? 'Set the first Bookmark below to begin the class.' : 'Waiting for host to set the first Bookmark...'}</p>}
            </div>

            {/* Host controls */}
            {isHost && <>
              <div style={card()}>
                <p style={{ margin: '0 0 8px', fontWeight: '700', fontSize: '13px', color: C.text }}>{currentBookmark === 0 ? '📍 Set First Bookmark' : `📍 Set Bookmark #${currentBookmark + 1}`}</p>
                <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
                  <select value={nextType} onChange={e => setNextType(e.target.value as BookmarkPosition['type'])} style={{ padding: '8px', borderRadius: '7px', border: `1.5px solid ${C.border}`, fontSize: '13px', cursor: 'pointer', flexShrink: 0, background: '#f8fafc' }}>
                    <option value="video">▶ Video</option><option value="page">📖 Page</option><option value="chapter">📌 Chapter</option><option value="custom">📍 Custom</option>
                  </select>
                  <input value={nextValue} onChange={e => setNextValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (currentBookmark === 0 ? nextValue.trim() && advanceBookmark() : canAdvance && advanceBookmark())}
                    placeholder={TYPE_HINTS[nextType]} style={{ flex: 1, padding: '8px 11px', borderRadius: '7px', border: `1.5px solid ${C.border}`, fontSize: '13px', background: '#f8fafc' }} />
                </div>
              </div>

              {currentBookmark === 0
                ? <button onClick={() => nextValue.trim() && advanceBookmark()} disabled={!nextValue.trim()}
                    style={{ width: '100%', padding: '11px', background: nextValue.trim() ? C.primary : '#cbd5e1', color: '#fff', border: 'none', borderRadius: '9px', cursor: nextValue.trim() ? 'pointer' : 'not-allowed', fontWeight: '700', fontSize: '14px', transition: 'all 0.15s' }}>
                    Set Bookmark #1 & Sync Students →
                  </button>
                : (
                  <div style={card()}>
                    <p style={{ margin: '0 0 10px', fontWeight: '700', fontSize: '13px', color: C.text }}>Gate Check — Before Next Bookmark</p>

                    {/* Step 1 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '8px', background: unansweredCount === 0 ? '#f0fdf4' : '#fff7ed', borderRadius: '8px', border: `1px solid ${unansweredCount === 0 ? '#bbf7d0' : '#fed7aa'}` }}>
                      <span>{unansweredCount === 0 ? '✅' : '🔴'}</span>
                      <span style={{ fontWeight: '600', fontSize: '13px', flex: 1 }}>Step 1 — All questions answered</span>
                      {unansweredCount > 0 && <span style={{ ...pill('#fef3c7', C.amber), fontSize: '12px' }}>{unansweredCount} left</span>}
                    </div>

                    {/* Step 2 */}
                    <div style={{ marginBottom: '10px', background: '#fafafa', borderRadius: '8px', padding: '9px', border: `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '7px' }}>
                        <span>{pollComplete && (pollScore ?? 0) >= 80 ? '✅' : pollComplete ? '⚠️' : '⬜'}</span>
                        <span style={{ fontWeight: '600', fontSize: '13px' }}>Step 2 — Understanding poll ≥ 80%</span>
                      </div>
                      {!pollActive && !pollComplete && (
                        <button onClick={handleStartPoll} disabled={!canRunPoll} style={{ padding: '6px 14px', background: canRunPoll ? C.primary : '#e2e8f0', color: canRunPoll ? '#fff' : C.muted, border: 'none', borderRadius: '7px', cursor: canRunPoll ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: '600' }}>🗳 Run Poll</button>
                      )}
                      {pollActive && (
                        <div>
                          <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: '600', color: C.muted }}>Live · {totalPollResponses} responses</p>
                          <div style={{ display: 'flex', gap: '7px', marginBottom: '6px' }}>
                            <div style={{ flex: 1, background: '#d1fae5', borderRadius: '6px', padding: '6px', textAlign: 'center' }}><strong style={{ color: '#065f46' }}>✓ {pollResponses.yes}</strong></div>
                            <div style={{ flex: 1, background: '#fee2e2', borderRadius: '6px', padding: '6px', textAlign: 'center' }}><strong style={{ color: '#991b1b' }}>✗ {pollResponses.no}</strong></div>
                          </div>
                          {totalPollResponses > 0 && <div style={{ background: C.border, borderRadius: '4px', height: '6px', marginBottom: '7px' }}><div style={{ background: C.emerald, height: '100%', borderRadius: '4px', width: `${Math.round((pollResponses.yes / totalPollResponses) * 100)}%`, transition: 'width 0.4s' }} /></div>}
                          <button onClick={handleClosePoll} style={{ padding: '5px 12px', background: C.headerBg, color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Close Poll</button>
                        </div>
                      )}
                      {pollComplete && pollScore !== null && (
                        <div style={{ background: pollScore >= 80 ? '#f0fdf4' : '#fffbeb', borderRadius: '7px', padding: '8px 11px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{pollScore >= 80 ? '✅' : '⚠️'}</span>
                          <div style={{ flex: 1 }}>
                            <strong style={{ color: pollScore >= 80 ? '#065f46' : '#92400e', fontSize: '14px' }}>{pollScore}% understood</strong>
                            <p style={{ margin: '1px 0 0', fontSize: '11px', color: C.muted }}>{pollScore >= 80 ? 'Class is ready to advance!' : 'Consider re-teaching this section.'}</p>
                          </div>
                          {pollScore < 80 && <button onClick={handleStartPoll} style={{ padding: '4px 9px', background: C.primary, color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>Re-run</button>}
                        </div>
                      )}
                    </div>

                    <button onClick={advanceBookmark} disabled={!canAdvance}
                      style={{ width: '100%', padding: '10px', background: canAdvance ? C.emerald : '#e2e8f0', color: canAdvance ? '#fff' : C.muted, border: 'none', borderRadius: '8px', cursor: canAdvance ? 'pointer' : 'not-allowed', fontWeight: '700', fontSize: '13px' }}>
                      {canAdvance ? `✓ Advance to Bookmark #${currentBookmark + 1}` : '🔒 Next Bookmark (complete steps above)'}
                    </button>
                  </div>
                )}

              {bookmarkHistory.length > 0 && (
                <div style={card()}>
                  <p style={{ margin: '0 0 7px', fontWeight: '700', fontSize: '11px', color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Class History</p>
                  {bookmarkHistory.map((b, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: i < bookmarkHistory.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <span style={{ ...pill(i === 0 ? C.primary : '#f1f5f9', i === 0 ? '#fff' : C.muted), fontSize: '11px' }}>#{b.num}</span>
                      <span style={{ fontSize: '12px', color: C.text }}>{b.pos.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </>}

            {/* Student: Poll */}
            {!isHost && pollActive && (
              <div style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDk})`, borderRadius: '14px', padding: '18px', color: '#fff', textAlign: 'center', boxShadow: `0 8px 30px rgba(99,102,241,0.35)` }}>
                <p style={{ margin: '0 0 3px', fontSize: '11px', letterSpacing: '2px', opacity: 0.8, fontWeight: '600' }}>UNDERSTANDING CHECK</p>
                <p style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: '700' }}>Do you understand this section?</p>
                {studentPollAnswer === null
                  ? <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                      <button onClick={() => handlePollResponse(true)} style={{ flex: 1, maxWidth: '150px', padding: '11px', background: C.emerald, color: '#fff', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: '700', fontSize: '14px', boxShadow: '0 4px 12px rgba(5,150,105,0.4)' }}>✓ Got it! (+2 pts)</button>
                      <button onClick={() => handlePollResponse(false)} style={{ flex: 1, maxWidth: '150px', padding: '11px', background: C.red, color: '#fff', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>✗ Not yet</button>
                    </div>
                  : <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '10px' }}><p style={{ margin: 0, fontWeight: '600' }}>{studentPollAnswer ? '✓ Response sent — Got it!' : '✓ Response sent — Not yet.'}</p></div>}
              </div>
            )}

            {/* Student: Exit Ticket */}
            {!isHost && showExitTicket && (
              <div style={{ background: `linear-gradient(135deg, ${C.rose}, #be123c)`, borderRadius: '14px', padding: '20px', color: '#fff', boxShadow: `0 8px 30px rgba(225,29,72,0.35)` }}>
                <p style={{ margin: '0 0 3px', fontSize: '11px', letterSpacing: '2px', opacity: 0.8, fontWeight: '600' }}>🎟 EXIT TICKET</p>
                <p style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '700' }}>Quick reflection before you leave</p>
                {!exitSubmitted ? <>
                  <div style={{ marginBottom: '11px' }}>
                    <label style={{ fontSize: '12px', opacity: 0.85, display: 'block', marginBottom: '5px', fontWeight: '600' }}>In one sentence, what was the main idea today?</label>
                    <textarea value={exitAnswer.mainIdea} onChange={e => setExitAnswer(p => ({ ...p, mainIdea: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: '7px', border: 'none', fontSize: '13px', resize: 'none', height: '56px', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '13px' }}>
                    <label style={{ fontSize: '12px', opacity: 0.85, display: 'block', marginBottom: '5px', fontWeight: '600' }}>What is still unclear to you?</label>
                    <textarea value={exitAnswer.unclear} onChange={e => setExitAnswer(p => ({ ...p, unclear: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: '7px', border: 'none', fontSize: '13px', resize: 'none', height: '56px', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', opacity: 0.85, display: 'block', marginBottom: '7px', fontWeight: '600' }}>Rate today's class:</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} onClick={() => setExitAnswer(p => ({ ...p, rating: n }))} style={{ flex: 1, padding: '9px', background: exitAnswer.rating >= n ? '#fff' : 'rgba(255,255,255,0.18)', color: exitAnswer.rating >= n ? C.rose : '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: '700', fontSize: '18px' }}>★</button>
                      ))}
                    </div>
                  </div>
                  <button onClick={handleSubmitExitTicket} style={{ width: '100%', padding: '11px', background: '#fff', color: C.rose, border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>Submit (+2 pts)</button>
                </> : <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '9px', padding: '14px', textAlign: 'center' }}><p style={{ margin: 0, fontWeight: '700' }}>✓ Submitted! Thank you.</p></div>}
              </div>
            )}

            {/* Q&A */}
            <div style={card()}>
              <p style={{ margin: '0 0 8px', fontWeight: '700', fontSize: '13px', color: C.text }}>💬 Ask a Question <span style={{ fontWeight: '400', color: C.muted, fontSize: '12px' }}>· Bookmark #{currentBookmark} · +3 pts</span></p>
              <textarea value={questionInput} onChange={e => setQuestionInput(e.target.value)} placeholder="Type your question here..." style={{ width: '100%', height: '58px', padding: '8px 10px', borderRadius: '8px', border: `1.5px solid ${C.border}`, resize: 'none', boxSizing: 'border-box', fontSize: '13px', marginBottom: '7px', background: '#f8fafc' }} />
              <div style={{ display: 'flex', gap: '7px' }}>
                <button onClick={handleSendQuestion} style={{ flex: 1, padding: '9px', background: C.amber, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}>❓ Ask Question</button>
                <button onClick={handleShareFile} style={{ flex: 1, padding: '9px', background: C.teal, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}>📤 Share Resource</button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Sidebar: Questions ── */}
        <div style={{ width: '275px', flexShrink: 0, background: C.card, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: C.text }}>❓ Questions</h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 11px' }}>
            {currentBmQs.length > 0 && <>
              <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: '700', color: C.primary, letterSpacing: '1px', textTransform: 'uppercase' }}>Bookmark #{currentBookmark} · {unansweredCount} unanswered</p>
              {currentBmQs.map((q, i) => (
                <div key={i} style={{ padding: '9px', background: q.answered ? '#f0fdf4' : '#fffbeb', borderRadius: '9px', marginBottom: '7px', borderLeft: `3px solid ${q.answered ? C.emerald : C.amber}` }}>
                  <p style={{ margin: '0 0 2px', fontSize: '10px', fontWeight: '700', color: C.muted, textTransform: 'uppercase' }}>{q.user_name}</p>
                  <p style={{ margin: '0 0 6px', fontSize: '13px', color: C.text }}>{q.question_text}</p>
                  {isHost && !q.answered && <button onClick={() => q.id && handleAnswerQuestion(q.id)} style={{ padding: '3px 9px', background: C.emerald, color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>✓ Mark Answered</button>}
                  {q.answered && <span style={{ color: C.emerald, fontSize: '11px', fontWeight: '600' }}>✓ Answered</span>}
                </div>
              ))}
            </>}
            {currentBmQs.length === 0 && <p style={{ color: '#cbd5e1', fontSize: '12px', textAlign: 'center', margin: '18px 0' }}>No questions for BM#{currentBookmark}</p>}
            {sharedFiles.length > 0 && <>
              <p style={{ margin: '10px 0 5px', fontSize: '11px', fontWeight: '700', color: C.teal, letterSpacing: '1px', textTransform: 'uppercase' }}>Shared Resources</p>
              {sharedFiles.map((f, i) => (
                <div key={i} style={{ padding: '7px 9px', background: '#f0fdfa', borderRadius: '8px', marginBottom: '5px', border: `1px solid #99f6e4` }}>
                  <a href={f.file_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: C.teal, fontSize: '12px', fontWeight: '600' }}>📄 {f.file_name}</a>
                  <br /><small style={{ color: C.muted }}>by {f.from_name}</small>
                </div>
              ))}
            </>}
            {pastQs.length > 0 && <>
              <p style={{ margin: '10px 0 5px', fontSize: '11px', fontWeight: '700', color: '#cbd5e1', letterSpacing: '1px', textTransform: 'uppercase' }}>Earlier ({pastQs.length})</p>
              {pastQs.map((q, i) => (
                <div key={i} style={{ padding: '7px', background: '#f8fafc', borderRadius: '7px', marginBottom: '4px', borderLeft: `2px solid ${C.border}`, opacity: 0.7 }}>
                  <p style={{ margin: '0 0 1px', fontSize: '10px', color: C.muted, fontWeight: '600' }}>BM#{q.bookmark_number} · {q.user_name}</p>
                  <p style={{ margin: 0, fontSize: '11px', color: C.text }}>{q.question_text}</p>
                </div>
              ))}
            </>}
          </div>
        </div>
      </div>

      {/* ═══════════ MODALS ═══════════ */}

      {/* Quiz Creator */}
      {showQuizCreator && (
        <Overlay>
          <div style={{ background: C.card, borderRadius: '16px', width: '700px', maxWidth: '96vw', padding: '24px', margin: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: '10px', letterSpacing: '2px', color: quizCreatorType === 'short' ? C.amber : C.purple, fontWeight: '700', textTransform: 'uppercase' }}>{quizCreatorType === 'short' ? 'Short Quiz' : 'Homework'}</p>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.text }}>{quizCreatorType === 'short' ? '⚡ Refresher Quiz' : '📚 Homework Assignment'}</h2>
              </div>
              <button onClick={() => setShowQuizCreator(false)} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: C.muted, fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ background: quizCreatorType === 'short' ? '#fffbeb' : '#f5f3ff', borderRadius: '9px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: quizCreatorType === 'short' ? '#92400e' : '#5b21b6', borderLeft: `3px solid ${quizCreatorType === 'short' ? C.amber : C.purple}` }}>
              {quizCreatorType === 'short' ? '⚡ MC questions auto-graded. +10 pts per correct answer. Set a timer.' : '📚 Deep conceptual homework. STEM: use \\alpha, ^2, _2, \\sqrt, \\pm etc. for formulas. +5 pts for submitting.'}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: '160px' }}>
                <label style={lblStyle}>Quiz Title</label>
                <input value={quizTitle} onChange={e => setQuizTitle(e.target.value)} placeholder="e.g. Newton's Laws Refresher" style={{ ...iStyle, marginBottom: 0 }} />
              </div>
              {quizCreatorType === 'long' && (
                <div style={{ flex: 1, minWidth: '130px' }}>
                  <label style={lblStyle}>Subject</label>
                  <select value={quizSubject} onChange={e => { setQuizSubject(e.target.value); if (STEM_SUBJECTS.includes(e.target.value)) setDraftQuestions(prev => prev.map(q => ({ ...q, requiresDiagram: true }))); }}
                    style={{ ...iStyle, marginBottom: 0, cursor: 'pointer' }}>
                    <option value="general">General</option><option value="physics">Physics</option><option value="chemistry">Chemistry</option>
                    <option value="biology">Biology</option><option value="maths">Mathematics</option><option value="geometry">Geometry</option>
                    <option value="trigonometry">Trigonometry</option><option value="engineering">Engineering</option>
                  </select>
                </div>
              )}
              {quizCreatorType === 'short' && (
                <div style={{ flex: 1, minWidth: '110px' }}>
                  <label style={lblStyle}>Time Limit</label>
                  <select value={quizTimeLimit} onChange={e => setQuizTimeLimit(Number(e.target.value))} style={{ ...iStyle, marginBottom: 0, cursor: 'pointer' }}>
                    <option value={3}>3 min</option><option value={5}>5 min</option><option value={10}>10 min</option><option value={15}>15 min</option>
                  </select>
                </div>
              )}
            </div>
            {isStemSubject && <div style={{ background: '#faf5ff', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', color: C.purple, border: `1px solid #e9d5ff` }}>📐 STEM detected — include Diagram + Label or Derive/Prove questions.</div>}
            <div style={{ marginBottom: '12px' }}>
              <p style={{ margin: '0 0 8px', fontWeight: '700', fontSize: '13px', color: C.text }}>Questions ({draftQuestions.length})</p>
              {draftQuestions.map((q, qi) => (
                <div key={q.id} style={{ background: C.bg, borderRadius: '10px', padding: '12px', marginBottom: '10px', border: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', gap: '7px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <span style={{ ...pill(C.primary, '#fff'), fontSize: '11px' }}>Q{qi + 1}</span>
                    <select value={q.type} onChange={e => updateDraftQ(q.id, { type: e.target.value as QuizQuestion['type'] })} style={{ padding: '5px 7px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '12px', cursor: 'pointer', background: '#fff' }}>
                      {Object.entries(Q_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: C.muted, marginLeft: 'auto', cursor: 'pointer' }}>
                      <input type="checkbox" checked={q.requiresDiagram} onChange={e => updateDraftQ(q.id, { requiresDiagram: e.target.checked })} /> Diagram
                    </label>
                    {draftQuestions.length > 1 && <button onClick={() => removeDraftQ(q.id)} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>✕</button>}
                  </div>
                  <textarea value={q.text} onChange={e => updateDraftQ(q.id, { text: e.target.value })}
                    placeholder={q.type === 'mc' ? 'Enter question...' : q.type === 'derive' ? 'e.g. Derive the expression for centripetal acceleration...' : q.type === 'diagram' ? 'e.g. Draw and label the human heart...' : 'e.g. Explain why... / A student claims...'}
                    style={{ width: '100%', padding: '7px 9px', borderRadius: '7px', border: `1.5px solid ${C.border}`, fontSize: '13px', resize: 'vertical', minHeight: '54px', boxSizing: 'border-box', marginBottom: q.type === 'mc' ? '8px' : '0', background: '#fff' }} />
                  {q.text && parseMath(q.text) !== q.text && <p style={{ margin: '3px 0 7px', fontSize: '12px', color: C.purple, background: '#f5f3ff', padding: '4px 8px', borderRadius: '5px' }}>Preview: {parseMath(q.text)}</p>}
                  {q.type === 'mc' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      {(['A', 'B', 'C', 'D'] as const).map((letter, idx) => (
                        <div key={letter} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span onClick={() => updateDraftQ(q.id, { correctOption: letter })} style={{ background: q.correctOption === letter ? C.emerald : C.bg, color: q.correctOption === letter ? '#fff' : C.muted, borderRadius: '5px', padding: '2px 7px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', flexShrink: 0, border: `1px solid ${q.correctOption === letter ? C.emerald : C.border}` }}>{letter}</span>
                          <input value={q.options[idx]} onChange={e => updateDraftOpt(q.id, idx, e.target.value)} placeholder={`Option ${letter}`} style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '12px', background: '#fff' }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <button onClick={addDraftQ} style={{ width: '100%', padding: '9px', background: C.bg, border: `1.5px dashed ${C.border}`, borderRadius: '9px', cursor: 'pointer', fontSize: '13px', color: C.muted, fontWeight: '600' }}>+ Add Question</button>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleLaunchQuiz} style={{ flex: 1, padding: '12px', background: quizCreatorType === 'short' ? C.amber : C.purple, color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>
                {quizCreatorType === 'short' ? '⚡ Launch Short Quiz' : '📚 Send as Homework'}
              </button>
              <button onClick={() => setShowQuizCreator(false)} style={{ padding: '12px 20px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', cursor: 'pointer', fontSize: '13px', color: C.text, fontWeight: '600' }}>Cancel</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Student Quiz Modal */}
      {showQuizModal && activeQuiz && !isHost && (
        <Overlay>
          <div style={{ background: C.card, borderRadius: '16px', width: '620px', maxWidth: '96vw', padding: '24px', margin: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: '10px', letterSpacing: '2px', color: activeQuiz.type === 'short' ? C.amber : C.purple, fontWeight: '700', textTransform: 'uppercase' }}>{activeQuiz.type === 'short' ? '⚡ Short Quiz' : '📚 Homework'}</p>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.text }}>{activeQuiz.title}</h2>
              </div>
              {activeQuiz.type === 'short' && quizTimeLeft !== null && (
                <div style={{ background: quizTimeLeft < 60 ? C.red : C.headerBg, color: '#fff', padding: '8px 14px', borderRadius: '10px', textAlign: 'center', flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: '10px', letterSpacing: '1px', opacity: 0.8 }}>TIME LEFT</p>
                  <p style={{ margin: 0, fontSize: '22px', fontWeight: '800', fontFamily: 'monospace' }}>{formatTime(quizTimeLeft)}</p>
                </div>
              )}
            </div>
            {activeQuiz.type === 'long' && <div style={{ background: '#f5f3ff', borderRadius: '8px', padding: '8px 12px', marginBottom: '14px', fontSize: '12px', color: C.purple, border: `1px solid #e9d5ff` }}>Show your full reasoning. For diagrams: draw → photo → upload to imgur.com → paste URL here.</div>}
            <div style={{ marginBottom: '16px', maxHeight: '55vh', overflowY: 'auto' }}>
              {activeQuiz.questions.map((q, i) => (
                <div key={q.id} style={{ background: C.bg, borderRadius: '10px', padding: '13px', marginBottom: '10px', border: `1px solid ${C.border}` }}>
                  <p style={{ margin: '0 0 10px', fontWeight: '700', fontSize: '14px', color: C.text }}>Q{i + 1}. {parseMath(q.text)}</p>
                  {q.type === 'mc' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {(['A', 'B', 'C', 'D'] as const).map((letter, idx) => (
                        <label key={letter} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px 11px', borderRadius: '8px', background: studentAnswers[q.id] === letter ? '#eef2ff' : '#fff', border: `1.5px solid ${studentAnswers[q.id] === letter ? C.primary : C.border}`, transition: 'all 0.1s' }}>
                          <input type="radio" name={`q-${q.id}`} value={letter} checked={studentAnswers[q.id] === letter} onChange={() => setStudentAnswers(prev => ({ ...prev, [q.id]: letter }))} disabled={studentQuizSubmitted} />
                          <span style={{ fontSize: '13px', color: C.text }}><strong>{letter}.</strong> {parseMath(q.options[idx])}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {(q.type === 'short' || q.type === 'long' || q.type === 'derive') && (
                    <textarea value={studentAnswers[q.id] || ''} onChange={e => setStudentAnswers(prev => ({ ...prev, [q.id]: e.target.value }))} disabled={studentQuizSubmitted}
                      placeholder={q.type === 'derive' ? 'Show all working. State assumptions. Derive step by step...' : 'Write your detailed answer with full reasoning...'}
                      style={{ width: '100%', padding: '8px', borderRadius: '7px', border: `1.5px solid ${C.border}`, resize: 'vertical', minHeight: q.type === 'long' || q.type === 'derive' ? '110px' : '65px', fontSize: '13px', boxSizing: 'border-box', background: '#fff' }} />
                  )}
                  {q.type === 'diagram' && <>
                    <textarea value={studentAnswers[q.id] || ''} onChange={e => setStudentAnswers(prev => ({ ...prev, [q.id]: e.target.value }))} disabled={studentQuizSubmitted} placeholder="Describe your diagram — labels, annotations, key features..." style={{ width: '100%', padding: '8px', borderRadius: '7px', border: `1.5px solid ${C.border}`, resize: 'vertical', minHeight: '70px', fontSize: '13px', boxSizing: 'border-box', marginBottom: '8px', background: '#fff' }} />
                    <input value={studentDiagramUrls[q.id] || ''} onChange={e => setStudentDiagramUrls(prev => ({ ...prev, [q.id]: e.target.value }))} disabled={studentQuizSubmitted} placeholder="📐 Paste diagram image URL (imgur.com, etc.)" style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: `1.5px solid ${C.purple}`, fontSize: '12px', boxSizing: 'border-box', color: C.purple, background: '#faf5ff' }} />
                  </>}
                  {q.requiresDiagram && q.type !== 'diagram' && (
                    <input value={studentDiagramUrls[q.id] || ''} onChange={e => setStudentDiagramUrls(prev => ({ ...prev, [q.id]: e.target.value }))} disabled={studentQuizSubmitted} placeholder="📐 Diagram URL (optional but recommended)" style={{ width: '100%', padding: '7px 10px', borderRadius: '7px', border: `1.5px dashed ${C.purple}`, fontSize: '12px', boxSizing: 'border-box', color: C.purple, marginTop: '8px', background: '#faf5ff' }} />
                  )}
                </div>
              ))}
            </div>
            {!studentQuizSubmitted
              ? <button onClick={() => handleStudentSubmitQuiz(false)} style={{ width: '100%', padding: '12px', background: activeQuiz.type === 'short' ? C.amber : C.purple, color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>
                  {activeQuiz.type === 'short' ? '⚡ Submit Quiz' : '📚 Submit Homework (+5 pts)'}
                </button>
              : <div style={{ background: '#f0fdf4', borderRadius: '9px', padding: '12px', textAlign: 'center', border: `1px solid #bbf7d0` }}><p style={{ margin: 0, color: C.emerald, fontWeight: '700', fontSize: '15px' }}>✓ Submitted! Points awarded.</p></div>}
          </div>
        </Overlay>
      )}

      {/* Host Quiz Results */}
      {showQuizResults && activeQuiz && isHost && (
        <Overlay>
          <div style={{ background: C.card, borderRadius: '16px', width: '720px', maxWidth: '96vw', padding: '24px', margin: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: '10px', letterSpacing: '2px', color: activeQuiz.type === 'short' ? C.amber : C.purple, fontWeight: '700', textTransform: 'uppercase' }}>{activeQuiz.type === 'short' ? '⚡ Short Quiz — Results' : '📚 Homework — Results'}</p>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.text }}>{activeQuiz.title}</h2>
              </div>
              {activeQuiz.type === 'short' && quizTimeLeft !== null && (
                <div style={{ background: quizTimeLeft < 60 ? C.red : C.headerBg, color: '#fff', padding: '8px 14px', borderRadius: '10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '10px', letterSpacing: '1px', opacity: 0.8 }}>TIME LEFT</p>
                  <p style={{ margin: 0, fontSize: '22px', fontWeight: '800', fontFamily: 'monospace' }}>{formatTime(quizTimeLeft)}</p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <div style={{ flex: 1, background: C.bg, borderRadius: '9px', padding: '10px', textAlign: 'center', border: `1px solid ${C.border}` }}>
                <p style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: C.text }}>{quizSubmissions.length}</p>
                <p style={{ margin: 0, fontSize: '11px', color: C.muted, fontWeight: '600' }}>Submitted</p>
              </div>
              {activeQuiz.questions.some(q => q.type === 'mc') && quizSubmissions.length > 0 && (
                <div style={{ flex: 1, background: '#f0fdf4', borderRadius: '9px', padding: '10px', textAlign: 'center', border: `1px solid #bbf7d0` }}>
                  <p style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: C.emerald }}>{Math.round(quizSubmissions.reduce((s, sub) => s + (sub.mcScore ?? 0), 0) / quizSubmissions.length)}%</p>
                  <p style={{ margin: 0, fontSize: '11px', color: C.muted, fontWeight: '600' }}>Avg MC Score</p>
                </div>
              )}
              <div style={{ flex: 1, background: '#fffbeb', borderRadius: '9px', padding: '10px', textAlign: 'center', border: `1px solid #fde68a` }}>
                <p style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: C.amber }}>{connectedStudents.length}</p>
                <p style={{ margin: 0, fontSize: '11px', color: C.muted, fontWeight: '600' }}>Connected</p>
              </div>
            </div>
            <div style={{ maxHeight: '340px', overflowY: 'auto', marginBottom: '14px' }}>
              {quizSubmissions.length === 0
                ? <div style={{ textAlign: 'center', padding: '24px', color: C.muted }}><p style={{ margin: 0, fontSize: '14px' }}>⏳ Waiting for submissions...</p></div>
                : quizSubmissions.map((sub, i) => (
                  <div key={i} style={{ background: C.bg, borderRadius: '10px', padding: '12px', marginBottom: '8px', border: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <strong style={{ color: C.text }}>{sub.studentName}</strong>
                      {sub.mcScore !== undefined && <span style={{ ...pill(sub.mcScore >= 80 ? '#d1fae5' : sub.mcScore >= 60 ? '#fef9c3' : '#fee2e2', sub.mcScore >= 80 ? '#065f46' : sub.mcScore >= 60 ? '#92400e' : '#991b1b') }}>MC: {sub.mcScore}%</span>}
                    </div>
                    {activeQuiz.questions.map((q, qi) => (
                      <div key={q.id} style={{ marginBottom: '6px', paddingBottom: '6px', borderBottom: qi < activeQuiz.questions.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        <p style={{ margin: '0 0 2px', fontSize: '11px', color: C.muted, fontWeight: '600' }}>Q{qi + 1}: {parseMath(q.text).substring(0, 60)}{q.text.length > 60 ? '…' : ''}</p>
                        {q.type === 'mc' && <p style={{ margin: 0, fontSize: '12px', color: sub.answers[q.id] === q.correctOption ? C.emerald : C.red, fontWeight: '600' }}>{sub.answers[q.id] === q.correctOption ? '✓' : '✗'} {sub.answers[q.id] || 'N/A'}{sub.answers[q.id] !== q.correctOption && <span style={{ color: C.muted, fontWeight: '400' }}> (✓{q.correctOption})</span>}</p>}
                        {q.type !== 'mc' && <p style={{ margin: 0, fontSize: '12px', color: C.text, background: '#fff', padding: '5px 8px', borderRadius: '5px', border: `1px solid ${C.border}` }}>{sub.answers[q.id] || <em style={{ color: '#cbd5e1' }}>No answer</em>}</p>}
                        {sub.diagramUrls[q.id] && <a href={sub.diagramUrls[q.id]} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: C.purple, display: 'block', marginTop: '3px', fontWeight: '600' }}>📐 View Diagram →</a>}
                      </div>
                    ))}
                  </div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '9px' }}>
              <button onClick={handleEndQuiz} style={{ flex: 1, padding: '11px', background: C.red, color: '#fff', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>End Quiz</button>
              {activeQuiz.type === 'long' && <button onClick={() => setShowReminder(true)} style={{ flex: 1, padding: '11px', background: C.teal, color: '#fff', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>📅 Reminders</button>}
              <button onClick={() => setShowQuizResults(false)} style={{ padding: '11px 18px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '9px', cursor: 'pointer', fontSize: '13px', color: C.text, fontWeight: '600' }}>Close</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Exit Ticket Summary */}
      {showExitSummary && isHost && (
        <Overlay>
          <div style={{ background: C.card, borderRadius: '16px', width: '600px', maxWidth: '96vw', padding: '24px', margin: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.text }}>🎟 Exit Ticket Results</h2>
              <button onClick={handleCloseExitTicket} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: C.muted, fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <div style={{ flex: 1, background: '#fff1f2', borderRadius: '9px', padding: '10px', textAlign: 'center', border: `1px solid #fecdd3` }}>
                <p style={{ margin: 0, fontSize: '26px', fontWeight: '800', color: C.rose }}>{exitResponses.length}</p>
                <p style={{ margin: 0, fontSize: '11px', color: C.muted, fontWeight: '600' }}>Responses</p>
              </div>
              {avgRating && <div style={{ flex: 1, background: '#fffbeb', borderRadius: '9px', padding: '10px', textAlign: 'center', border: `1px solid #fde68a` }}>
                <p style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: C.gold }}>{'★'.repeat(Math.round(Number(avgRating)))} {avgRating}</p>
                <p style={{ margin: 0, fontSize: '11px', color: C.muted, fontWeight: '600' }}>Avg Rating</p>
              </div>}
            </div>
            {exitResponses.length === 0
              ? <div style={{ textAlign: 'center', padding: '24px', color: C.muted }}><p style={{ margin: 0 }}>⏳ Waiting for student responses...</p></div>
              : <>
                <div style={{ marginBottom: '14px' }}>
                  <p style={{ margin: '0 0 8px', fontWeight: '700', fontSize: '12px', color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>💡 Main Ideas (what they retained)</p>
                  {exitResponses.filter(r => r.mainIdea).map((r, i) => (
                    <div key={i} style={{ background: '#f0fdf4', borderRadius: '8px', padding: '9px 12px', marginBottom: '5px', border: `1px solid #bbf7d0` }}>
                      <p style={{ margin: '0 0 3px', fontSize: '11px', color: C.emerald, fontWeight: '700' }}>{r.studentName} {'★'.repeat(r.rating)}</p>
                      <p style={{ margin: 0, fontSize: '13px', color: C.text }}>{r.mainIdea}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{ margin: '0 0 8px', fontWeight: '700', fontSize: '12px', color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>❓ Still Unclear (plan your next class from this)</p>
                  {exitResponses.filter(r => r.unclear).map((r, i) => (
                    <div key={i} style={{ background: '#fff1f2', borderRadius: '8px', padding: '9px 12px', marginBottom: '5px', border: `1px solid #fecdd3` }}>
                      <p style={{ margin: '0 0 3px', fontSize: '11px', color: C.red, fontWeight: '700' }}>{r.studentName}</p>
                      <p style={{ margin: 0, fontSize: '13px', color: C.text }}>{r.unclear}</p>
                    </div>
                  ))}
                </div>
              </>}
          </div>
        </Overlay>
      )}

      {/* Leaderboard */}
      {showLeaderboard && (
        <Overlay>
          <div style={{ background: C.card, borderRadius: '16px', width: '480px', maxWidth: '96vw', padding: '24px', margin: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.text }}>🏆 Class Leaderboard</h2>
              <button onClick={() => setShowLeaderboard(false)} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: C.muted, fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ background: '#fffbeb', borderRadius: '9px', padding: '9px 13px', marginBottom: '14px', fontSize: '12px', color: '#92400e', border: `1px solid #fde68a` }}>
              Poll +2 · Question +3 · MC Correct +10 · Homework +5 · Exit Ticket +2
            </div>
            {leaderboard.length === 0
              ? <div style={{ textAlign: 'center', padding: '28px', color: C.muted }}>No points earned yet — participate to appear here!</div>
              : leaderboard.map((e, i) => {
                  const medals = ['🥇', '🥈', '🥉'];
                  const isMe = e.peerId === myId;
                  const rankBg = i === 0 ? '#fffbeb' : i === 1 ? '#f8fafc' : '#fff';
                  return (
                    <div key={e.peerId} style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '11px 14px', background: isMe ? '#eef2ff' : rankBg, borderRadius: '10px', marginBottom: '6px', border: `1.5px solid ${isMe ? C.primary : C.border}`, transition: 'all 0.1s' }}>
                      <span style={{ fontSize: '22px', flexShrink: 0, width: '28px', textAlign: 'center' }}>{medals[i] ?? <span style={{ fontSize: '14px', color: C.muted, fontWeight: '700' }}>{i + 1}</span>}</span>
                      <span style={{ flex: 1, fontWeight: isMe ? '700' : '500', fontSize: '14px', color: C.text }}>{e.name}{isMe && <span style={{ color: C.primary, fontSize: '12px' }}> (you)</span>}</span>
                      <span style={{ fontWeight: '800', fontSize: '17px', color: C.gold }}>{e.points} <span style={{ fontSize: '11px', fontWeight: '600', color: C.muted }}> pts</span></span>
                    </div>
                  );
                })}
          </div>
        </Overlay>
      )}

      {/* Progress Tracking */}
      {showProgress && isHost && (
        <Overlay>
          <div style={{ background: C.card, borderRadius: '16px', width: '720px', maxWidth: '96vw', padding: '24px', margin: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.text }}>📊 Student Progress — This Class</h2>
              <button onClick={() => setShowProgress(false)} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: C.muted, fontSize: '16px' }}>✕</button>
            </div>
            {progressData.length === 0
              ? <div style={{ textAlign: 'center', padding: '28px', color: C.muted }}>No student activity recorded yet.</div>
              : <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: C.bg, borderRadius: '8px' }}>
                        {['Name', 'Connected', 'Questions', 'Poll', 'Quiz Score', 'Homework', 'Exit Ticket', 'Points'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {progressData.map((s, i) => {
                        const lb = leaderboard.find(e => e.peerId === s.peerId);
                        return (
                          <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ ...tdStyle, fontWeight: '600', color: C.text }}>{s.name}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>{s.connected ? '✅' : '⬛'}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>{s.questionsAsked > 0 ? `${s.questionsAsked} ❓` : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>{s.pollAnswered ? <span style={{ color: s.pollAnswered.understood ? C.emerald : C.red, fontWeight: '600' }}>{s.pollAnswered.understood ? '✓ Got it' : '✗ Not yet'}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>{s.shortQuizScore !== undefined ? <span style={{ ...pill(s.shortQuizScore >= 80 ? '#d1fae5' : '#fff7ed', s.shortQuizScore >= 80 ? C.emerald : C.amber) }}>{s.shortQuizScore}%</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>{s.homeworkDone ? '✅' : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>{s.exitDone ? <span style={{ color: C.rose }}>{'★'.repeat(s.exitDone.rating)}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '700', color: C.gold }}>{lb?.points ?? 0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>}
          </div>
        </Overlay>
      )}

      {/* Spaced Repetition Reminders */}
      {showReminder && reminderQuiz && isHost && (
        <Overlay>
          <div style={{ background: C.card, borderRadius: '16px', width: '580px', maxWidth: '96vw', padding: '24px', margin: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.text }}>📅 Spaced Repetition Reminders</h2>
              <button onClick={() => setShowReminder(false)} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: C.muted, fontSize: '16px' }}>✕</button>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: C.muted }}>Send these messages on Day 3 and Day 7 after the homework to reinforce long-term retention.</p>
            {[3, 7].map(days => (
              <div key={days} style={{ background: '#f0fdf4', borderRadius: '12px', padding: '14px', marginBottom: '14px', border: `1px solid #bbf7d0` }}>
                <p style={{ margin: '0 0 8px', fontWeight: '700', fontSize: '13px', color: '#065f46' }}>📬 Day {days} — {days === 3 ? 'Completion Reminder' : 'Spaced Review'}</p>
                <p style={{ margin: '0 0 11px', fontSize: '12px', background: '#fff', padding: '10px', borderRadius: '8px', border: `1px solid #d1fae5`, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: C.text }}>{buildReminder(reminderQuiz, days)}</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => navigator.clipboard.writeText(buildReminder(reminderQuiz, days)).then(() => alert('Copied!'))} style={{ flex: 1, padding: '8px', background: C.emerald, color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>📋 Copy</button>
                  <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(buildReminder(reminderQuiz, days))}`, '_blank')} style={{ flex: 1, padding: '8px', background: C.whatsapp, color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>📲 Open WhatsApp</button>
                </div>
              </div>
            ))}
          </div>
        </Overlay>
      )}
    </div>
  );
}
