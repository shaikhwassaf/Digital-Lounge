import { useEffect, useState, useRef } from 'react';
import { supabase } from './lib/supabaseClient';

// ─── Light Cool Color Palette ───────────────────────────────────────────────
const C = {
  headerBg:  '#1e40af',          // royal blue header
  headerBdr: '#3b82f6',          // blue accent line
  primary:   '#2563eb',          // bright blue
  primaryDk: '#1d4ed8',
  teal:      '#0891b2',          // sky blue
  amber:     '#d97706',
  purple:    '#7c3aed',
  emerald:   '#059669',
  red:       '#dc2626',
  rose:      '#e11d48',
  gold:      '#b45309',
  whatsapp:  '#25D366',
  bg:        '#f0f7ff',          // light sky-tinted background
  card:      '#ffffff',
  border:    '#bfdbfe',          // light blue border
  text:      '#1e293b',
  muted:     '#64748b',
  avBg:      '#1e3a8a',          // AV strip deep blue
  heroBg:    'linear-gradient(135deg, #eff6ff 0%, #dbeafe 55%, #e0f2fe 100%)',
  featureBar:'#3b82f6',
  b10:       'rgba(37,99,235,0.08)',
  b20:       'rgba(37,99,235,0.16)',
};

// ─── Interfaces ─────────────────────────────────────────────────────────────
interface Question { id?: string; user_name: string; question_text: string; bookmark_number: number; answered: boolean; peer_id?: string; }
interface FileShare { file_name: string; file_url: string; from_name: string; }
interface BookmarkPosition { type: 'video' | 'page' | 'chapter' | 'custom'; value: string; label: string; youtubeUrl?: string; youtubeSeconds?: number; }
interface QuizQuestion { id: number; type: 'mc' | 'short' | 'long' | 'diagram' | 'derive'; text: string; options: [string, string, string, string]; correctOption: 'A' | 'B' | 'C' | 'D'; requiresDiagram: boolean; }
interface Quiz { id: string; type: 'short' | 'long'; title: string; subject: string; questions: QuizQuestion[]; timeLimit: number; bookmarkRef: number; createdAt: string; }
interface QuizSubmission { studentName: string; peerId: string; answers: Record<number, string>; diagramUrls: Record<number, string>; submittedAt: string; mcScore?: number; }
interface ExitTicketResponse { studentName: string; peerId: string; mainIdea: string; unclear: string; rating: number; }
interface LeaderboardEntry { peerId: string; name: string; points: number; }

// ─── Constants ───────────────────────────────────────────────────────────────
const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
const TYPE_ICONS: Record<string, string> = { video: '▶', page: '📖', chapter: '📌', custom: '📍' };
const TYPE_HINTS: Record<string, string> = { video: 'e.g. 12:34', page: 'e.g. 45', chapter: 'e.g. Chapter 3', custom: 'e.g. Slide 7' };
const TYPE_LABELS: Record<string, string> = { video: 'Video', page: 'Page', chapter: 'Chapter', custom: 'Position' };
const STEM_SUBJECTS = ['physics', 'chemistry', 'biology', 'maths', 'geometry', 'trigonometry', 'engineering'];
const Q_TYPE_LABELS: Record<string, string> = { mc: 'Multiple Choice', short: 'Short Answer', long: 'Long Answer', diagram: 'Diagram + Label', derive: 'Derive / Prove' };

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
const makeId = () => crypto.randomUUID();
const blankQ = (id: number, stem: boolean): QuizQuestion => ({ id, type: 'mc', text: '', options: ['', '', '', ''], correctOption: 'A', requiresDiagram: stem });

// ─── Formula Parser ──────────────────────────────────────────────────────────
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

// ─── Shared UI helpers ───────────────────────────────────────────────────────
function Overlay({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,58,138,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, overflowY: 'auto', padding: '16px', boxSizing: 'border-box', backdropFilter: 'blur(3px)', WebkitOverflowScrolling: 'touch' as any }}>{children}</div>;
}
function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(30,58,138,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(3px)', padding: '16px', boxSizing: 'border-box' }}>
      <div style={{ background: C.card, padding: '24px', borderRadius: '16px', width: '370px', maxWidth: '100%', boxShadow: '0 20px 60px rgba(30,64,175,0.2)', border: `1px solid ${C.border}` }}>
        <h3 style={{ marginTop: 0, color: C.text, fontWeight: '800' }}>{title}</h3>{children}
      </div>
    </div>
  );
}

const iStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', marginBottom: '10px', boxSizing: 'border-box', borderRadius: '8px', border: `1.5px solid ${C.border}`, fontSize: '14px', background: '#f8fbff', color: C.text };
const bStyle = (bg: string, color = '#fff'): React.CSSProperties => ({ width: '100%', padding: '11px', background: bg, color, borderRadius: '9px', cursor: 'pointer', border: 'none', fontWeight: '700', marginBottom: '10px', fontSize: '14px' });
const lblStyle: React.CSSProperties = { fontSize: '12px', fontWeight: '600', color: C.muted, display: 'block', marginBottom: '4px', letterSpacing: '0.3px' };
const thStyle: React.CSSProperties = { padding: '9px 11px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: C.muted };
const tdStyle: React.CSSProperties = { padding: '9px 11px', fontSize: '13px' };
const card = (extra?: React.CSSProperties): React.CSSProperties => ({ background: C.card, borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 4px rgba(37,99,235,0.08)', border: `1px solid ${C.border}`, ...extra });
const hBtn = (bg: string, color = '#fff'): React.CSSProperties => ({ background: bg, color, border: 'none', padding: '5px 11px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' as const });
const pill = (bg: string, color: string): React.CSSProperties => ({ background: bg, color, borderRadius: '20px', padding: '2px 9px', fontSize: '11px', fontWeight: '700' });

// ─── YouTube helpers ──────────────────────────────────────────────────────────
function extractYouTubeId(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('?')[0];
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v') || '';
  } catch {}
  return '';
}
function extractYouTubeStart(url: string): number {
  try {
    const u = new URL(url);
    const t = u.searchParams.get('t') || '';
    const m = t.match(/^(\d+h)?(\d+m)?(\d+s?)?$/);
    if (m) {
      const h = parseInt(m[1] || '0') || 0;
      const min = parseInt(m[2] || '0') || 0;
      const s = parseInt((m[3] || '0').replace('s','')) || 0;
      return h * 3600 + min * 60 + s;
    }
    return parseInt(t) || 0;
  } catch {}
  return 0;
}
function secondsToTimestamp(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
}
function isYouTubeUrl(url: string): boolean { return url.includes('youtube.com') || url.includes('youtu.be'); }

function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      const id = extractYouTubeId(url);
      return `https://www.youtube.com/embed/${id}?autoplay=0`;
    }
    if (u.hostname.includes('docs.google.com')) return url.replace('/edit', '/preview').replace('/pub', '/preview');
  } catch {}
  return url;
}

// ─── YouTube IFrame API loader (singleton) ────────────────────────────────────
let ytApiReady = false;
let ytApiCallbacks: (() => void)[] = [];
function loadYouTubeApi(cb: () => void) {
  if (ytApiReady) { cb(); return; }
  ytApiCallbacks.push(cb);
  if (document.getElementById('yt-api-script')) return;
  const s = document.createElement('script');
  s.id = 'yt-api-script';
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
  (window as any).onYouTubeIframeAPIReady = () => {
    ytApiReady = true;
    ytApiCallbacks.forEach(fn => fn());
    ytApiCallbacks = [];
  };
}

// ─── Responsive Hook ─────────────────────────────────────────────────────────
function useWindowWidth() {
  const [w, setW] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1280);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return w;
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [isHost, setIsHost] = useState(false);
  const isHostRef = useRef(false);
  const [currentClass, setCurrentClass] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [mobileTab, setMobileTab] = useState<'main' | 'questions'>('main');
  const winWidth = useWindowWidth();
  const isMobile = winWidth < 768;

  // Bookmark
  const [currentBookmark, setCurrentBookmark] = useState(0);
  const [currentPosition, setCurrentPosition] = useState<BookmarkPosition | null>(null);
  const [bookmarkHistory, setBookmarkHistory] = useState<Array<{ num: number; pos: BookmarkPosition }>>([]);
  const [nextType, setNextType] = useState<BookmarkPosition['type']>('video');
  const [nextValue, setNextValue] = useState('');

  // Q&A
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [sharedFiles, setSharedFiles] = useState<FileShare[]>([]);
  const [sessionStatus, setSessionStatus] = useState<'not_started' | 'active' | 'on_break' | 'ended'>('not_started');
  const [contentUrl, setContentUrl] = useState<string | null>(null);
  const [showContentInput, setShowContentInput] = useState(false);
  const [contentInput, setContentInput] = useState('');
  const studentAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  // YouTube sync
  const [ytVideoId, setYtVideoId] = useState<string | null>(null);
  const [ytPlayerReady, setYtPlayerReady] = useState(false);
  const [ytPlaying, setYtPlaying] = useState(false);
  const [ytCurrentTime, setYtCurrentTime] = useState(0);
  const hostYtPlayer = useRef<any>(null);
  const studentYtPlayer = useRef<any>(null);
  const ytHostDivId = 'yt-host-player';
  const ytStudentDivId = 'yt-student-player';
  const ytThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bookmark YouTube attachment
  const [nextYoutubeUrl, setNextYoutubeUrl] = useState('');

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

  // Progress / Reminder / Leaderboard
  const [showProgress, setShowProgress] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [reminderQuiz, setReminderQuiz] = useState<Quiz | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const leaderboardRef = useRef<LeaderboardEntry[]>([]);
  useEffect(() => { leaderboardRef.current = leaderboard; }, [leaderboard]);
  useEffect(() => { if (isHost && view === 'room' && leaderboard.length > 0) sendSignal('leaderboard-update', { entries: leaderboard }); }, [leaderboard]);

  // Session timer
  const [sessionElapsed, setSessionElapsed] = useState(0);
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
  const [newClassName, setNewClassName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');

  const [myId] = useState(() => {
    const stored = localStorage.getItem('eds_session_id');
    const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
    const id = stored && isUuid(stored) ? stored : crypto.randomUUID();
    localStorage.setItem('eds_session_id', id);
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

  // ─── Leaderboard helper ──────────────────────────────────────────────────
  const awardPoints = (peerId: string, name: string, pts: number) => {
    setLeaderboard(prev => {
      const exists = prev.find(e => e.peerId === peerId);
      const updated = exists
        ? prev.map(e => e.peerId === peerId ? { ...e, points: e.points + pts } : e)
        : [...prev, { peerId, name, points: pts }];
      return updated.sort((a, b) => b.points - a.points);
    });
  };

  // ─── Effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const code = p.get('code');
    if (code) { setInputCode(code); setCurrentClass(null); setShowJoinModal(true); window.history.replaceState({}, '', window.location.pathname); }
  }, []);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { if (hostVideoRef.current && hostStream) hostVideoRef.current.srcObject = hostStream; }, [hostStream]);
  useEffect(() => { fetchClasses(); }, []);

  useEffect(() => {
    if (sessionStatus !== 'active' || !isHost) return;
    const t = setInterval(() => {
      setSessionElapsed(prev => { const n = prev + 1; if (n > 0 && n % (35 * 60) === 0) setShowRefreshReminder(true); return n; });
    }, 1000);
    return () => clearInterval(t);
  }, [sessionStatus, isHost]);

  useEffect(() => {
    if (quizTimeLeft === null || quizTimeLeft <= 0) {
      if (quizTimeLeft === 0 && !isHost && !studentQuizSubmitted && activeQuiz?.type === 'short') handleStudentSubmitQuiz(true);
      return;
    }
    const t = setTimeout(() => setQuizTimeLeft(p => (p ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [quizTimeLeft]);

  useEffect(() => { if (view === 'room' && currentClass) { setupRoom(); return () => cleanupRoom(); } }, [view, currentClass]);

  useEffect(() => {
    if (view !== 'room') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [view]);

  useEffect(() => {
    if (!isHost && guestName) localStorage.setItem('eds_guest_name', guestName);
  }, [guestName, isHost]);

  useEffect(() => {
    const saved = localStorage.getItem('eds_guest_name');
    if (saved && !guestName) setGuestName(saved);
  }, []);

  // ─── YouTube sync — host player ───────────────────────────────────────────
  useEffect(() => {
    if (!ytVideoId || !isHost) return;
    loadYouTubeApi(() => {
      if (hostYtPlayer.current) {
        hostYtPlayer.current.loadVideoById({ videoId: ytVideoId, startSeconds: ytCurrentTime });
        return;
      }
      hostYtPlayer.current = new (window as any).YT.Player(ytHostDivId, {
        height: '100%', width: '100%',
        videoId: ytVideoId,
        playerVars: { start: Math.floor(ytCurrentTime), rel: 0, modestbranding: 1, enablejsapi: 1 },
        events: {
          onReady: () => setYtPlayerReady(true),
          onStateChange: (e: any) => {
            const YT = (window as any).YT.PlayerState;
            const playing = e.data === YT.PLAYING;
            const paused = e.data === YT.PAUSED;
            if (!playing && !paused) return;
            const ct = hostYtPlayer.current?.getCurrentTime() ?? 0;
            setYtPlaying(playing);
            setYtCurrentTime(ct);
            sendSignal('yt-sync', { playing, currentTime: ct });
          },
        },
      });
    });
  }, [ytVideoId, isHost]);

  // throttled seek broadcast when host scrubs
  useEffect(() => {
    if (!isHost || !ytPlayerReady) return;
    const id = setInterval(() => {
      const p = hostYtPlayer.current;
      if (!p) return;
      const ct = p.getCurrentTime() ?? 0;
      const state = p.getPlayerState();
      const playing = state === 1;
      setYtCurrentTime(ct);
      if (ytThrottleRef.current) return;
      ytThrottleRef.current = setTimeout(() => { ytThrottleRef.current = null; }, 2000);
      sendSignal('yt-sync', { playing, currentTime: ct });
    }, 2000);
    return () => clearInterval(id);
  }, [isHost, ytPlayerReady]);

  // ─── YouTube sync — student player ───────────────────────────────────────
  useEffect(() => {
    if (!ytVideoId || isHost) return;
    loadYouTubeApi(() => {
      if (studentYtPlayer.current) {
        studentYtPlayer.current.loadVideoById({ videoId: ytVideoId, startSeconds: ytCurrentTime });
        return;
      }
      studentYtPlayer.current = new (window as any).YT.Player(ytStudentDivId, {
        height: '100%', width: '100%',
        videoId: ytVideoId,
        playerVars: { start: Math.floor(ytCurrentTime), rel: 0, modestbranding: 1, enablejsapi: 1, controls: 0, disablekb: 1 },
        events: { onReady: () => setYtPlayerReady(true) },
      });
    });
  }, [ytVideoId, isHost]);

  // clear player refs on room leave
  useEffect(() => {
    if (view !== 'room') {
      hostYtPlayer.current?.destroy(); hostYtPlayer.current = null;
      studentYtPlayer.current?.destroy(); studentYtPlayer.current = null;
      setYtVideoId(null); setYtPlayerReady(false); setYtPlaying(false);
    }
  }, [view]);

  // ─── WebRTC / Room ───────────────────────────────────────────────────────
  const sendSignal = (event: string, payload: any) => signalingChannel.current?.send({ type: 'broadcast', event, payload });

  const createConnectionForStudent = async (studentId: string) => {
    if (peerConnections.current.has(studentId)) return;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.current.set(studentId, pc);
    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current!));
    pc.ontrack = (e) => {
      const stream = e.streams?.[0];
      if (!stream) return;
      let audio = studentAudioRefs.current.get(studentId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        studentAudioRefs.current.set(studentId, audio);
      }
      audio.srcObject = stream;
    };
    pc.onicecandidate = (e) => { if (e.candidate) sendSignal('ice-candidate', { from: myId, target: studentId, candidate: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnectedStudents(prev => [...new Set([...prev, studentId])]);
        setConnectionStatus('Live (P2P)');
        if (currentPosition) sendSignal('bookmark-sync', { bookmark: currentBookmark, position: currentPosition, to: studentId });
        if (leaderboardRef.current.length > 0) sendSignal('leaderboard-update', { entries: leaderboardRef.current });
      } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        setConnectedStudents(prev => prev.filter(id => id !== studentId));
        const audio = studentAudioRefs.current.get(studentId);
        if (audio) { audio.srcObject = null; studentAudioRefs.current.delete(studentId); }
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
    const dbc = supabase.channel(`lounge-db-${currentClass.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'questions' }, (p) => {
        setQuestions(prev => prev.some(q => q.id === p.new.id) ? prev : [p.new as Question, ...prev]);
        if (isHostRef.current && p.new.peer_id && p.new.user_name) awardPoints(p.new.peer_id, p.new.user_name, 3);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'file_shares', filter: `lounge_id=eq.${currentClass.id}` }, (p) => {
        const f: FileShare = { file_name: p.new.file_name, file_url: p.new.file_url, from_name: p.new.from_name };
        setSharedFiles(prev => prev.some(x => x.file_url === f.file_url && x.from_name === f.from_name) ? prev : [f, ...prev]);
      })
      .subscribe();
    dbChannel.current = dbc;

    const sc = supabase.channel(`signals-${currentClass.id}`, { config: { broadcast: { self: false } } });
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
    sc.on('broadcast', { event: 'session-status' }, ({ payload }: any) => { if (isHostRef.current) return; setSessionStatus(payload.status); });
    sc.on('broadcast', { event: 'content-share' }, ({ payload }: any) => { if (isHostRef.current) return; setContentUrl(payload.url); });
    sc.on('broadcast', { event: 'content-clear' }, () => { if (isHostRef.current) return; setContentUrl(null); });
    sc.on('broadcast', { event: 'yt-load' }, ({ payload }: any) => {
      if (isHostRef.current) return;
      setYtVideoId(payload.videoId);
      setYtPlaying(false);
      setYtCurrentTime(payload.startSeconds ?? 0);
    });
    sc.on('broadcast', { event: 'yt-sync' }, ({ payload }: any) => {
      if (isHostRef.current) return;
      const p = studentYtPlayer.current;
      if (!p) return;
      if (Math.abs(p.getCurrentTime() - payload.currentTime) > 1.5) p.seekTo(payload.currentTime, true);
      if (payload.playing && p.getPlayerState() !== 1) p.playVideo();
      if (!payload.playing && p.getPlayerState() === 1) p.pauseVideo();
      setYtPlaying(payload.playing);
    });
    sc.on('broadcast', { event: 'yt-seek' }, ({ payload }: any) => {
      if (isHostRef.current) return;
      studentYtPlayer.current?.seekTo(payload.seconds, true);
      setYtCurrentTime(payload.seconds);
    });
    sc.on('broadcast', { event: 'yt-clear' }, () => { if (isHostRef.current) return; setYtVideoId(null); setYtPlaying(false); });
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
    studentAudioRefs.current.forEach(a => { a.srcObject = null; }); studentAudioRefs.current.clear();
    if (dbChannel.current) { supabase.removeChannel(dbChannel.current); dbChannel.current = null; }
    if (signalingChannel.current) { supabase.removeChannel(signalingChannel.current); signalingChannel.current = null; }
    setHostStream(null); setConnectedStudents([]); setMicActive(false); setCamActive(false);
    setConnectionStatus('Offline'); setMediaError(''); setCurrentPosition(null); setBookmarkHistory([]);
    setPollActive(false); setPollComplete(false); setPollScore(null); setStudentPollAnswer(null);
    setPollResponses({ yes: 0, no: 0 }); setPollResponseDetails([]);
    setActiveQuiz(null); setShowQuizModal(false); setShowQuizResults(false); setQuizSubmissions([]); setQuizTimeLeft(null);
    setSessionElapsed(0); setShowRefreshReminder(false);
    setLeaderboard([]); setShowLeaderboard(false);
    setExitResponses([]); setShowExitSummary(false); setShowExitTicket(false);
    setShowProgress(false); setShowReminder(false);
    setContentUrl(null); setShowContentInput(false);
    setYtVideoId(null); setYtPlayerReady(false); setYtPlaying(false); setYtCurrentTime(0);
    setNextYoutubeUrl('');
  };

  const toggleMic = () => { localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setMicActive(p => !p); };
  const toggleCam = () => { localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setCamActive(p => !p); };
  const fetchClasses = async () => { try { const { data } = await supabase.from('active_lounges').select('*'); if (data) setClasses(data); } catch (e) { console.error(e); } };

  // ─── Bookmark / Poll ─────────────────────────────────────────────────────
  const advanceBookmark = async () => {
    const nextNum = currentBookmark + 1;
    const ytUrl = nextYoutubeUrl.trim();
    const ytId = ytUrl ? extractYouTubeId(ytUrl) : null;
    const ytStart = ytUrl ? extractYouTubeStart(ytUrl) : 0;
    const valueLabel = nextValue.trim() || (ytUrl ? secondsToTimestamp(ytStart) : '');
    const pos: BookmarkPosition = {
      type: nextType,
      value: valueLabel,
      label: `${TYPE_ICONS[nextType]} ${TYPE_LABELS[nextType]}${valueLabel ? ': ' + valueLabel : ''}`,
      youtubeUrl: ytUrl || undefined,
      youtubeSeconds: ytId ? ytStart : undefined,
    };
    try { await supabase.from('bookmarks').insert([{ lounge_id: currentClass.id, bookmark_number: nextNum, timestamp: Date.now(), created_at: new Date().toISOString() }]); } catch {}
    sendSignal('bookmark-sync', { bookmark: nextNum, position: pos });
    if (ytId) sendSignal('yt-load', { videoId: ytId, startSeconds: ytStart });
    setCurrentBookmark(nextNum); setCurrentPosition(pos);
    setBookmarkHistory(prev => [{ num: nextNum, pos }, ...prev]);
    setNextValue(''); setNextYoutubeUrl('');
    if (ytId) { setYtVideoId(ytId); setYtCurrentTime(ytStart); setYtPlaying(false); }
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

  // ─── Quiz ─────────────────────────────────────────────────────────────────
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
        const { data } = await supabase.from('quizzes').insert([{ lounge_id: currentClass.id, type: quiz.type, title: quiz.title, subject: quiz.subject, questions: quiz.questions, time_limit: quiz.timeLimit, bookmark_ref: quiz.bookmarkRef }]).select();
        if (data?.[0]?.id) quiz.id = data[0].id;
      } catch (e) { console.warn('Quiz DB:', (e as any)?.message); }
    }
    setActiveQuiz(quiz); setQuizSubmissions([]); setShowQuizCreator(false); setShowQuizResults(true);
    sendSignal('quiz-launch', { quiz });
    if (quizCreatorType === 'short') setQuizTimeLeft(quizTimeLimit * 60);
    if (quizCreatorType === 'long') { setReminderQuiz(quiz); setShowReminder(false); }
  };

  const handleStudentSubmitQuiz = (auto = false) => {
    if (studentQuizSubmitted) return;
    setStudentQuizSubmitted(true); setQuizTimeLeft(null);
    sendSignal('quiz-submit', { quizId: activeQuiz?.id, quizType: activeQuiz?.type, quiz: activeQuiz, studentName: guestName || 'Student', peerId: myId, answers: studentAnswers, diagramUrls: studentDiagramUrls });
    if (!auto) setShowQuizModal(false);
  };

  const handleEndQuiz = () => {
    sendSignal('quiz-end', {}); setShowQuizResults(false); setActiveQuiz(null); setQuizTimeLeft(null);
    if (reminderQuiz) setShowReminder(true);
  };

  // ─── Exit Ticket ──────────────────────────────────────────────────────────
  const handleSendExitTicket = () => { setExitResponses([]); setShowExitSummary(true); sendSignal('exit-ticket-start', {}); };
  const handleSubmitExitTicket = () => {
    if (!exitAnswer.rating) return alert('Please give a star rating.');
    setExitSubmitted(true);
    sendSignal('exit-ticket-submit', { studentName: guestName || 'Student', peerId: myId, mainIdea: exitAnswer.mainIdea, unclear: exitAnswer.unclear, rating: exitAnswer.rating });
  };
  const handleCloseExitTicket = () => { sendSignal('exit-ticket-end', {}); setShowExitSummary(false); };

  // ─── Class CRUD ───────────────────────────────────────────────────────────
  const handleCreateClass = async () => {
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const { data, error } = await supabase.from('active_lounges').insert([{ lounge_name: newClassName, host_name: newHostName, host_id: myId, entry_code: code }]).select();
      if (error) throw error;
      if (data) { setGeneratedCode(code); setCurrentClass(data[0]); isHostRef.current = true; setIsHost(true); setView('room'); setShowHostModal(false); }
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleJoinClass = async () => {
    try {
      if (!guestName.trim()) return alert('Please enter your name.');
      if (!inputCode.trim()) return alert('Please enter the entry code.');
      let cls = currentClass;
      if (cls) { if (inputCode.trim() !== cls.entry_code.toString()) return alert('Wrong entry code.'); }
      else {
        const { data, error } = await supabase.from('active_lounges').select('*').eq('entry_code', inputCode.trim()).single();
        if (error || !data) return alert('No class found with that entry code.');
        cls = data;
      }
      isHostRef.current = false; setIsHost(false); setCurrentClass(cls); setView('room'); setShowJoinModal(false);
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleSendQuestion = async () => {
    if (!questionInput.trim()) return alert('Question cannot be empty');
    try {
      const q: Question = { user_name: isHost ? newHostName : (guestName || 'Student'), question_text: questionInput, bookmark_number: currentBookmark, answered: false };
      const { data, error } = await supabase.from('questions').insert([{ ...q, lounge_id: currentClass.id, peer_id: myId }]).select();
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
      await supabase.from('file_shares').insert([{ lounge_id: currentClass.id, from_peer_id: myId, from_name: f.from_name, to_peer_id: null, file_name: name, file_url: url, created_at: new Date().toISOString() }]);
      setSharedFiles(prev => [f, ...prev]);
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleStartSession = async () => {
    try {
      await supabase.from('class_sessions').insert([{ lounge_id: currentClass.id, status: 'active', current_bookmark: 0, started_at: new Date().toISOString(), last_updated: new Date().toISOString() }]);
      setSessionStatus('active');
      sendSignal('session-status', { status: 'active' });
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleShareContent = (url: string) => {
    const embedUrl = toEmbedUrl(url);
    setContentUrl(embedUrl);
    sendSignal('content-share', { url: embedUrl });
  };
  const handleClearContent = () => { setContentUrl(null); sendSignal('content-clear', {}); };

  const handleBreak = async () => { try { await supabase.from('class_sessions').update({ status: 'on_break', last_updated: new Date().toISOString() }).eq('lounge_id', currentClass.id); setSessionStatus('on_break'); sendSignal('session-status', { status: 'on_break' }); } catch {} };
  const handleResume = async () => { try { await supabase.from('class_sessions').update({ status: 'active', last_updated: new Date().toISOString() }).eq('lounge_id', currentClass.id); setSessionStatus('active'); sendSignal('session-status', { status: 'active' }); } catch {} };
  const handleDeleteClass = async (id: string) => { try { await supabase.from('active_lounges').delete().eq('id', id); await fetchClasses(); } catch {} };

  const handleExit = async () => {
    try {
      if (isHost && currentClass) { if (window.confirm('End this class for everyone?')) await supabase.from('active_lounges').delete().eq('id', currentClass.id); }
      setView('lobby'); setCurrentClass(null); isHostRef.current = false; setIsHost(false);
      setGeneratedCode(''); setQuestions([]); setSharedFiles([]); setCurrentBookmark(0); setSessionStatus('not_started');
      await fetchClasses();
    } catch (e) { console.error(e); }
  };

  const handleShareWhatsApp = () => {
    const c = generatedCode || currentClass?.entry_code;
    window.open(`https://wa.me/?text=${encodeURIComponent(`Join "${currentClass?.lounge_name}" on Ed Solutions!\n\nEntry Code: *${c}*\n\nJoin here (no app needed):\n${window.location.origin}?code=${c}`)}`, '_blank');
  };
  const handleCopyLink = () => { navigator.clipboard.writeText(`${window.location.origin}?code=${generatedCode || currentClass?.entry_code}`).then(() => alert('Link copied!')); };

  // ─── Progress data ────────────────────────────────────────────────────────
  const buildProgressData = () => {
    const reg = new Map<string, string>();
    questions.forEach(q => { if (q.peer_id && q.user_name) reg.set(q.peer_id, q.user_name); });
    pollResponseDetails.forEach(r => reg.set(r.peerId, r.name));
    quizSubmissions.forEach(s => reg.set(s.peerId, s.studentName));
    return Array.from(reg.entries()).map(([peerId, name]) => ({
      peerId, name,
      questionsAsked: questions.filter(q => q.peer_id === peerId).length,
      pollAnswered: pollResponseDetails.find(r => r.peerId === peerId),
      shortQuizScore: quizSubmissions.find(s => s.peerId === peerId && s.mcScore !== undefined)?.mcScore,
      homeworkDone: quizSubmissions.some(s => s.peerId === peerId && activeQuiz?.type === 'long'),
      exitDone: exitResponses.find(r => r.studentName === name),
      connected: connectedStudents.includes(peerId),
    }));
  };

  const buildReminder = (quiz: Quiz, days: number) => {
    const c = generatedCode || currentClass?.entry_code;
    const url = `${window.location.origin}?code=${c}`;
    if (days === 3) return `Hi! 📚 Reminder: Please complete your homework "${quiz.title}" (${quiz.subject}) if you haven't yet.\n\nJoin your class: ${url} (Code: ${c})`;
    return `🔁 Review time! It's been a week since we covered "${quiz.title}". Revisit your notes — can you explain the key ideas without looking?\n\nJoin for questions: ${url} (Code: ${c})`;
  };

  const entryCode = generatedCode || currentClass?.entry_code;
  const progressData = buildProgressData();

  // ═══════════════════════════════════════════════════════════════════════════
  // LOBBY
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === 'lobby') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg }}>

        {/* Hero */}
        <div style={{ background: C.heroBg, padding: isMobile ? '32px 16px 28px' : '56px 20px 44px', textAlign: 'center', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <div style={{ width: isMobile ? '40px' : '48px', height: isMobile ? '40px' : '48px', background: C.primary, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? '20px' : '24px', boxShadow: `0 4px 14px rgba(37,99,235,0.3)` }}>🎓</div>
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ margin: 0, fontSize: isMobile ? '22px' : '28px', fontWeight: '800', color: C.headerBg, letterSpacing: '-0.5px' }}>Ed Solutions</h1>
              <p style={{ margin: 0, fontSize: '11px', color: C.primary, letterSpacing: '2px', textTransform: 'uppercase', fontWeight: '600' }}>Learning Management System</p>
            </div>
          </div>
          <p style={{ color: C.muted, fontSize: '13px', margin: '0 auto 22px', maxWidth: '400px' }}>Students join via WhatsApp — no app install needed</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', padding: '0 8px' }}>
            <button onClick={() => setShowHostModal(true)} style={{ flex: isMobile ? '1 1 auto' : '0 0 auto', minWidth: isMobile ? 0 : undefined, padding: '13px 28px', background: C.primary, color: '#fff', borderRadius: '10px', cursor: 'pointer', border: 'none', fontSize: '15px', fontWeight: '700', boxShadow: `0 4px 18px rgba(37,99,235,0.3)` }}>
              🏫 Host a Class
            </button>
            <button onClick={() => { setCurrentClass(null); setInputCode(''); setShowJoinModal(true); }} style={{ flex: isMobile ? '1 1 auto' : '0 0 auto', minWidth: isMobile ? 0 : undefined, padding: '13px 28px', background: '#fff', color: C.primary, border: `2px solid ${C.primary}`, borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
              🚪 Join Class
            </button>
          </div>
        </div>

        {/* Feature bar */}
        <div style={{ background: C.featureBar, padding: '10px 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: isMobile ? '18px' : '40px', flexWrap: 'wrap' }}>
            {[['🔴 Live', 'Real-time P2P'], ['📲 WhatsApp', 'No App Install'], ['🧠 Gated', '80% Poll Gate'], ['🏆 Gamified', 'Live Leaderboard']].map(([icon, label]) => (
              <div key={label} style={{ color: '#fff', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: isMobile ? '12px' : '13px', fontWeight: '700' }}>{icon}</p>
                <p style={{ margin: 0, fontSize: '10px', opacity: 0.8 }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Active Classes */}
        <div style={{ maxWidth: '660px', margin: '32px auto', padding: '0 16px' }}>
          <h3 style={{ color: C.text, marginBottom: '14px', fontWeight: '700', fontSize: '16px' }}>Active Classes</h3>
          {classes.length === 0
            ? <div style={{ ...card(), textAlign: 'center', padding: '32px', color: C.muted }}>No active classes — host one to get started.</div>
            : classes.map((l: any) => (
              <div key={l.id} style={{ ...card({ marginBottom: '10px' }), display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: C.text }}>{l.lounge_name}</h4>
                    {l.host_id === myId && <span style={{ ...pill(C.b10, C.primary), border: `1px solid ${C.border}` }}>MY CLASS</span>}
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: C.muted }}>Host: {l.host_name} · Code: <strong style={{ color: C.primary }}>{l.entry_code}</strong></p>
                </div>
                <div style={{ display: 'flex', gap: '7px' }}>
                  {l.host_id === myId
                    ? <>
                        <button onClick={() => { setCurrentClass(l); setGeneratedCode(l.entry_code); isHostRef.current = true; setIsHost(true); setView('room'); }} style={hBtn(C.emerald)}>Rejoin</button>
                        <button onClick={() => { if (window.confirm('End this class?')) handleDeleteClass(l.id); }} style={hBtn(C.red)}>End</button>
                      </>
                    : <button onClick={() => { setCurrentClass(l); setInputCode(''); setShowJoinModal(true); }} style={hBtn(C.primary)}>Join</button>}
                </div>
              </div>
            ))}
        </div>

        {showHostModal && <Modal onClose={() => setShowHostModal(false)} title="🏫 Create New Class">
          <input placeholder="Class Name (e.g. Physics — Grade 10)" value={newClassName} onChange={e => setNewClassName(e.target.value)} style={iStyle} />
          <input placeholder="Your Name (Host)" value={newHostName} onChange={e => setNewHostName(e.target.value)} style={{ ...iStyle, marginBottom: '16px' }} />
          <button onClick={handleCreateClass} style={bStyle(C.primary)}>🚀 Create Class</button>
          <button onClick={() => setShowHostModal(false)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', width: '100%', fontSize: '14px' }}>Cancel</button>
        </Modal>}

        {showJoinModal && <Modal onClose={() => setShowJoinModal(false)} title="🚪 Join Class">
          <p style={{ color: C.muted, fontSize: '13px', margin: '0 0 14px', background: C.bg, padding: '9px 11px', borderRadius: '8px', border: `1px solid ${C.border}` }}>Have your learning material ready — the host will sync your position.</p>
          <input placeholder="Your Name" value={guestName} onChange={e => setGuestName(e.target.value)} style={iStyle} />
          <input placeholder="Entry Code" value={inputCode} onChange={e => setInputCode(e.target.value)} style={{ ...iStyle, fontSize: '22px', textAlign: 'center', letterSpacing: '6px', marginBottom: '16px', fontWeight: '700' }} />
          <button onClick={handleJoinClass} style={bStyle(C.primary)}>🚪 Enter Class</button>
          <button onClick={() => setShowJoinModal(false)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', width: '100%', fontSize: '14px' }}>Cancel</button>
        </Modal>}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg, overflow: 'hidden' }}>

      {/* Header */}
      <header style={{ background: C.headerBg, color: '#fff', padding: isMobile ? '5px 10px' : '7px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: isMobile ? '4px' : '6px', borderBottom: `3px solid ${C.headerBdr}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ width: '30px', height: '30px', background: 'rgba(255,255,255,0.15)', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🎓</div>
            <div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: '700', lineHeight: 1.15 }}>{currentClass?.lounge_name}</p>
              <p style={{ margin: 0, fontSize: '10px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.15 }}>Code: <strong style={{ color: '#bfdbfe' }}>{entryCode}</strong></p>
            </div>
          </div>
          {isHost && <span style={{ ...pill('rgba(255,255,255,0.2)', '#fff'), fontSize: '10px' }}>HOST</span>}
          <span style={{ fontSize: '11px', color: connectionStatus === 'Live (P2P)' ? '#86efac' : 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: connectionStatus === 'Live (P2P)' ? '#86efac' : 'rgba(255,255,255,0.3)', display: 'inline-block' }} />
            {connectionStatus}
          </span>
          {isHost && sessionStatus === 'active' && (
            <span style={{ fontSize: '11px', color: showRefreshReminder ? '#fcd34d' : 'rgba(255,255,255,0.5)' }}>
              {showRefreshReminder ? '⏰ 35 min!' : `⏱ ${fmt(sessionElapsed)}`}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
          {isHost && <>
            <button onClick={handleShareWhatsApp} style={hBtn(C.whatsapp)}>📲 WhatsApp</button>
            <button onClick={handleCopyLink} style={hBtn('rgba(255,255,255,0.15)')}>🔗 Link</button>
            <button onClick={() => openQuizCreator('short')} style={hBtn(C.amber)}>⚡ Quiz</button>
            <button onClick={() => openQuizCreator('long')} style={hBtn(C.purple)}>📚 HW</button>
            {sessionStatus === 'active' && <button onClick={handleSendExitTicket} style={hBtn(C.rose)}>🎟 Exit Ticket</button>}
            <button onClick={() => setShowProgress(true)} style={hBtn(C.teal)}>📊 Progress</button>
            {sessionStatus === 'not_started' && <button onClick={handleStartSession} style={hBtn(C.emerald)}>▶ Start Session</button>}
            {sessionStatus === 'active' && <button onClick={handleBreak} style={hBtn('rgba(255,255,255,0.18)')}>☕ Break</button>}
            {sessionStatus === 'on_break' && <button onClick={handleResume} style={hBtn('rgba(255,255,255,0.18)')}>▶ Resume</button>}
            <button onClick={() => setShowContentInput(true)} style={hBtn('#0e7490')}>🖥 Share Screen</button>
          </>}
          <button onClick={() => setShowLeaderboard(true)} style={hBtn('#92400e')}>🏆 {leaderboard.length > 0 ? leaderboard[0].points : 0}pt</button>
          <button onClick={handleExit} style={hBtn(C.red)}>Exit</button>
        </div>
      </header>

      {/* Session status banner — students only */}
      {!isHost && sessionStatus === 'on_break' && (
        <div style={{ background: '#92400e', color: '#fff', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexShrink: 0, fontSize: '13px', fontWeight: '600' }}>
          ☕ <span>The class is on a break — your teacher will resume shortly.</span>
        </div>
      )}
      {!isHost && sessionStatus === 'active' && (
        <div style={{ background: C.emerald, color: '#fff', padding: '5px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexShrink: 0, fontSize: '12px', fontWeight: '600' }}>
          🟢 Session in progress
        </div>
      )}
      {!isHost && sessionStatus === 'not_started' && (
        <div style={{ background: C.headerBg, color: 'rgba(255,255,255,0.7)', padding: '5px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexShrink: 0, fontSize: '12px' }}>
          ⏳ Waiting for host to start the session…
        </div>
      )}

      {/* 35-min banner */}
      {isHost && showRefreshReminder && (
        <div style={{ background: C.amber, color: '#fff', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, fontSize: '13px' }}>
          <span><strong>⏰ 35 minutes —</strong> Time for a Short Quiz refresher!</span>
          <div style={{ display: 'flex', gap: '7px' }}>
            <button onClick={() => openQuizCreator('short')} style={{ background: '#fff', color: C.amber, border: 'none', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}>Launch Quiz</button>
            <button onClick={() => setShowRefreshReminder(false)} style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Dismiss</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: isMobile ? 'auto' : 'hidden', paddingBottom: isMobile ? '56px' : 0 }}>

        {/* Left — hidden on mobile when Questions tab active */}
        <div style={{ flex: isMobile ? 'none' : 2, display: isMobile && mobileTab === 'questions' ? 'none' : 'flex', flexDirection: 'column', overflow: isMobile ? 'visible' : 'hidden', minWidth: 0 }}>

          {/* AV Strip */}
          <div style={{ background: C.avBg, padding: '8px 12px', display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0, borderBottom: `1px solid rgba(191,219,254,0.15)` }}>
            {isHost ? (
              <>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '140px', height: '88px', borderRadius: '8px', background: '#1e3a8a', objectFit: 'cover', display: camActive ? 'block' : 'none', border: '2px solid #3b82f6' }} />
                  {!camActive && <div style={{ width: '140px', height: '88px', borderRadius: '8px', background: '#1e3a8a', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(59,130,246,0.4)' }}><span style={{ fontSize: '28px' }}>🎙️</span></div>}
                  <div style={{ position: 'absolute', bottom: '4px', left: '4px', display: 'flex', gap: '3px' }}>
                    <button onClick={toggleMic} style={{ background: micActive ? C.emerald : C.red, border: 'none', borderRadius: '4px', padding: '2px 5px', cursor: 'pointer', fontSize: '11px' }}>{micActive ? '🎙️' : '🔇'}</button>
                    <button onClick={toggleCam} style={{ background: camActive ? C.emerald : C.red, border: 'none', borderRadius: '4px', padding: '2px 5px', cursor: 'pointer', fontSize: '11px' }}>{camActive ? '📹' : '📷'}</button>
                  </div>
                  <span style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', fontWeight: '600' }}>You</span>
                </div>
                <div style={{ color: '#bfdbfe', fontSize: '12px' }}>
                  <p style={{ margin: '0 0 4px', color: '#fff', fontWeight: '700', fontSize: '13px' }}>Students: <span style={{ color: '#86efac' }}>{connectedStudents.length}</span></p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                    {connectedStudents.length === 0
                      ? <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px' }}>Waiting for students to join...</span>
                      : connectedStudents.map((id, i) => <span key={id} style={{ background: 'rgba(59,130,246,0.25)', border: '1px solid #3b82f6', color: '#bfdbfe', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>S{i + 1}</span>)}
                  </div>
                  {mediaError && <p style={{ color: '#fcd34d', margin: '4px 0 0', fontSize: '11px' }}>⚠ {mediaError}</p>}
                </div>
              </>
            ) : (
              <>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <video ref={hostVideoRef} autoPlay playsInline style={{ width: isMobile ? '120px' : '170px', height: isMobile ? '75px' : '100px', borderRadius: '8px', background: '#1e3a8a', objectFit: 'cover', display: hostStream ? 'block' : 'none', border: '2px solid #0891b2' }} />
                  {!hostStream && <div style={{ width: isMobile ? '120px' : '170px', height: isMobile ? '75px' : '100px', borderRadius: '8px', background: '#1e3a8a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px', border: '2px solid rgba(8,145,178,0.4)' }}><span style={{ fontSize: '22px' }}>📡</span><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{connectionStatus}</span></div>}
                  <span style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', fontWeight: '600' }}>{currentClass?.host_name}</span>
                </div>
                <div>
                  <button onClick={toggleMic} style={{ background: micActive ? C.emerald : C.red, border: 'none', borderRadius: '7px', padding: '7px 14px', cursor: 'pointer', fontSize: '13px', color: '#fff', fontWeight: '700' }}>{micActive ? '🎙️ Mic On' : '🔇 Muted'}</button>
                  <p style={{ margin: '5px 0 0', fontSize: '11px', color: connectionStatus === 'Live (P2P)' ? '#86efac' : 'rgba(255,255,255,0.4)' }}>{connectionStatus === 'Live (P2P)' ? '✓ Connected to host' : connectionStatus}</p>
                  {leaderboard.length > 0 && (() => { const me = leaderboard.find(e => e.peerId === myId); return me ? <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#fcd34d' }}>🏆 {me.points} pts · #{leaderboard.findIndex(e => e.peerId === myId) + 1}</p> : null; })()}
                  {mediaError && <p style={{ color: '#fcd34d', margin: '4px 0 0', fontSize: '11px' }}>⚠ {mediaError}</p>}
                </div>
              </>
            )}
          </div>

          {/* Scrollable */}
          <div style={{ flex: isMobile ? 'none' : 1, overflowY: isMobile ? 'visible' : 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {/* ── Synchronized YouTube Player ── */}
            {ytVideoId && (
              <div style={{ borderRadius: '12px', overflow: 'hidden', border: `2px solid #dc2626`, background: '#000', boxShadow: '0 4px 20px rgba(220,38,38,0.22)' }}>
                <div style={{ background: '#dc2626', color: '#fff', padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700' }}>▶ YouTube — Synchronized</span>
                    {isHost && <span style={{ ...pill('#fff', '#dc2626') }}>{ytPlaying ? '▶ Playing' : '⏸ Paused'} · {secondsToTimestamp(Math.floor(ytCurrentTime))}</span>}
                    {!isHost && <span style={{ ...pill('rgba(255,255,255,0.2)', '#fff') }}>🔒 Controlled by teacher</span>}
                  </div>
                  {isHost && (
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button onClick={() => { const p = hostYtPlayer.current; if (!p) return; const ct = p.getCurrentTime(); p.seekTo(Math.max(0, ct - 10), true); sendSignal('yt-seek', { seconds: Math.max(0, ct - 10) }); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: '5px', padding: '2px 7px', cursor: 'pointer', fontSize: '11px' }}>−10s</button>
                      <button onClick={() => { const p = hostYtPlayer.current; if (!p) return; const ct = p.getCurrentTime(); p.seekTo(ct + 10, true); sendSignal('yt-seek', { seconds: ct + 10 }); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: '5px', padding: '2px 7px', cursor: 'pointer', fontSize: '11px' }}>+10s</button>
                      <button onClick={() => { setYtVideoId(null); hostYtPlayer.current?.destroy(); hostYtPlayer.current = null; setYtPlayerReady(false); sendSignal('yt-clear', {}); }} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: '5px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>✕ Stop</button>
                    </div>
                  )}
                </div>
                <div style={{ position: 'relative', width: '100%', paddingBottom: isMobile ? '56.25%' : '45%', background: '#000' }}>
                  <div id={isHost ? ytHostDivId : ytStudentDivId} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
                  {/* student overlay prevents manual interaction */}
                  {!isHost && <div style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'default' }} />}
                </div>
                {!isHost && !ytPlayerReady && (
                  <div style={{ textAlign: 'center', padding: '10px', color: '#fff', fontSize: '12px', opacity: 0.7 }}>Loading player…</div>
                )}
              </div>
            )}

            {/* Shared content panel (non-YouTube) */}
            {contentUrl && !ytVideoId && (
              <div style={{ borderRadius: '12px', overflow: 'hidden', border: `2px solid #0e7490`, background: '#fff', boxShadow: '0 4px 18px rgba(14,116,144,0.18)' }}>
                <div style={{ background: '#0e7490', color: '#fff', padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700' }}>🖥 Shared Content</span>
                  {isHost && <button onClick={handleClearContent} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: '5px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>✕ Stop Sharing</button>}
                </div>
                <iframe
                  src={contentUrl}
                  title="Shared Content"
                  style={{ width: '100%', height: isMobile ? '220px' : '340px', border: 'none', display: 'block' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
                />
              </div>
            )}
            {isHost && !contentUrl && !ytVideoId && (
              <div onClick={() => setShowContentInput(true)} style={{ ...card(), border: `1.5px dashed #0e7490`, cursor: 'pointer', textAlign: 'center', padding: '12px', color: '#0e7490' }}>
                <span style={{ fontSize: '20px' }}>🖥</span>
                <p style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: '600' }}>Share YouTube, Google Docs, or any website with students</p>
              </div>
            )}

            {/* Bookmark card */}
            <div style={{ background: `linear-gradient(135deg, ${C.headerBg} 0%, ${C.primary} 100%)`, borderRadius: '14px', padding: '16px 18px', boxShadow: `0 4px 18px rgba(37,99,235,0.22)` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', letterSpacing: '2.5px', color: '#bfdbfe', fontWeight: '700', textTransform: 'uppercase' }}>Bookmark</span>
                <span style={{ fontSize: '38px', fontWeight: '800', color: '#fff', lineHeight: 1 }}>#{currentBookmark}</span>
              </div>
              {currentPosition
                ? <p style={{ margin: 0, fontSize: '17px', fontWeight: '600', color: '#e0f2fe' }}>{currentPosition.label}</p>
                : <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>{isHost ? 'Set the first Bookmark below to begin the session.' : 'Waiting for host to set the first Bookmark...'}</p>}
            </div>

            {/* Host controls */}
            {isHost && <>
              <div style={card()}>
                <p style={{ margin: '0 0 8px', fontWeight: '700', fontSize: '13px', color: C.text }}>{currentBookmark === 0 ? '📍 Set First Bookmark' : `📍 Set Bookmark #${currentBookmark + 1}`}</p>
                <div style={{ display: 'flex', gap: '7px', alignItems: 'center', marginBottom: '7px' }}>
                  <select value={nextType} onChange={e => setNextType(e.target.value as BookmarkPosition['type'])} style={{ padding: '8px', borderRadius: '7px', border: `1.5px solid ${C.border}`, fontSize: '13px', cursor: 'pointer', flexShrink: 0, background: '#f8fbff' }}>
                    <option value="video">▶ Video</option><option value="page">📖 Page</option><option value="chapter">📌 Chapter</option><option value="custom">📍 Custom</option>
                  </select>
                  <input value={nextValue} onChange={e => setNextValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (currentBookmark === 0 ? (nextValue.trim() || nextYoutubeUrl.trim()) && advanceBookmark() : canAdvance && advanceBookmark())}
                    placeholder={TYPE_HINTS[nextType]} style={{ flex: 1, padding: '8px 11px', borderRadius: '7px', border: `1.5px solid ${C.border}`, fontSize: '13px', background: '#f8fbff' }} />
                </div>
                <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
                  <span style={{ fontSize: '18px', flexShrink: 0 }}>▶</span>
                  <input
                    value={nextYoutubeUrl}
                    onChange={e => setNextYoutubeUrl(e.target.value)}
                    placeholder="YouTube URL (optional) — syncs all students to this timestamp"
                    style={{ flex: 1, padding: '8px 11px', borderRadius: '7px', border: `1.5px solid ${nextYoutubeUrl && !extractYouTubeId(nextYoutubeUrl) ? C.red : (nextYoutubeUrl ? '#16a34a' : C.border)}`, fontSize: '12px', background: '#f8fbff', color: C.text }}
                  />
                  {nextYoutubeUrl && extractYouTubeId(nextYoutubeUrl) && (
                    <span style={{ ...pill('#dcfce7', '#15803d'), flexShrink: 0 }}>✓ YouTube</span>
                  )}
                </div>
                {nextYoutubeUrl && extractYouTubeId(nextYoutubeUrl) && (
                  <p style={{ margin: '5px 0 0', fontSize: '11px', color: '#15803d' }}>
                    Starts at {secondsToTimestamp(extractYouTubeStart(nextYoutubeUrl))} · Students will see a synchronized player — teacher controls play/pause/seek
                  </p>
                )}
              </div>

              {currentBookmark === 0
                ? <button onClick={() => (nextValue.trim() || nextYoutubeUrl.trim()) && advanceBookmark()} disabled={!nextValue.trim() && !nextYoutubeUrl.trim()}
                    style={{ width: '100%', padding: '11px', background: (nextValue.trim() || nextYoutubeUrl.trim()) ? C.primary : '#cbd5e1', color: '#fff', border: 'none', borderRadius: '9px', cursor: (nextValue.trim() || nextYoutubeUrl.trim()) ? 'pointer' : 'not-allowed', fontWeight: '700', fontSize: '14px' }}>
                    Set Bookmark #1 & Sync Students →
                  </button>
                : <div style={card()}>
                    <p style={{ margin: '0 0 10px', fontWeight: '700', fontSize: '13px', color: C.text }}>Gate Check — Before Next Bookmark</p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '9px', padding: '8px 10px', background: unansweredCount === 0 ? '#f0fdf4' : '#fefce8', borderRadius: '8px', border: `1px solid ${unansweredCount === 0 ? '#bbf7d0' : '#fde68a'}` }}>
                      <span>{unansweredCount === 0 ? '✅' : '🟡'}</span>
                      <span style={{ fontWeight: '600', fontSize: '13px', flex: 1, color: C.text }}>Step 1 — All questions answered</span>
                      {unansweredCount > 0 && <span style={{ ...pill('#fef9c3', C.amber) }}>{unansweredCount} left</span>}
                    </div>

                    <div style={{ background: C.bg, borderRadius: '9px', padding: '10px', border: `1px solid ${C.border}`, marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
                        <span>{pollComplete && (pollScore ?? 0) >= 80 ? '✅' : pollComplete ? '⚠️' : '⬜'}</span>
                        <span style={{ fontWeight: '600', fontSize: '13px', color: C.text }}>Step 2 — Understanding poll ≥ 80%</span>
                      </div>
                      {!pollActive && !pollComplete && (
                        <button onClick={handleStartPoll} disabled={!canRunPoll} style={{ padding: '6px 16px', background: canRunPoll ? C.primary : '#e2e8f0', color: canRunPoll ? '#fff' : C.muted, border: 'none', borderRadius: '7px', cursor: canRunPoll ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: '600' }}>🗳 Run Poll</button>
                      )}
                      {pollActive && (
                        <div>
                          <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: '600', color: C.muted }}>Live · {totalPollResponses} responses</p>
                          <div style={{ display: 'flex', gap: '7px', marginBottom: '7px' }}>
                            <div style={{ flex: 1, background: '#dcfce7', borderRadius: '7px', padding: '7px', textAlign: 'center' }}><strong style={{ color: '#15803d' }}>✓ {pollResponses.yes}</strong></div>
                            <div style={{ flex: 1, background: '#fee2e2', borderRadius: '7px', padding: '7px', textAlign: 'center' }}><strong style={{ color: '#b91c1c' }}>✗ {pollResponses.no}</strong></div>
                          </div>
                          {totalPollResponses > 0 && <div style={{ background: C.border, borderRadius: '4px', height: '6px', marginBottom: '8px' }}><div style={{ background: C.emerald, height: '100%', borderRadius: '4px', width: `${Math.round((pollResponses.yes / totalPollResponses) * 100)}%`, transition: 'width 0.4s' }} /></div>}
                          <button onClick={handleClosePoll} style={{ padding: '5px 12px', background: C.headerBg, color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Close Poll</button>
                        </div>
                      )}
                      {pollComplete && pollScore !== null && (
                        <div style={{ background: pollScore >= 80 ? '#f0fdf4' : '#fffbeb', borderRadius: '8px', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '8px', border: `1px solid ${pollScore >= 80 ? '#bbf7d0' : '#fde68a'}` }}>
                          <span style={{ fontSize: '18px' }}>{pollScore >= 80 ? '✅' : '⚠️'}</span>
                          <div style={{ flex: 1 }}>
                            <strong style={{ color: pollScore >= 80 ? '#15803d' : '#92400e', fontSize: '15px' }}>{pollScore}% understood</strong>
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
                  </div>}

              {bookmarkHistory.length > 0 && (
                <div style={card()}>
                  <p style={{ margin: '0 0 8px', fontWeight: '700', fontSize: '11px', color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Session History</p>
                  {bookmarkHistory.map((b, i) => (
                    <div key={i} style={{ padding: '5px 0', borderBottom: i < bookmarkHistory.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ ...pill(i === 0 ? C.primary : C.bg, i === 0 ? '#fff' : C.muted), fontSize: '11px', border: i !== 0 ? `1px solid ${C.border}` : 'none', flexShrink: 0 }}>#{b.num}</span>
                        <span style={{ fontSize: '12px', color: C.text }}>{b.pos.label}</span>
                        {b.pos.youtubeUrl && (
                          <a href={b.pos.youtubeUrl} target="_blank" rel="noreferrer" style={{ ...pill('#fee2e2', '#dc2626'), fontSize: '10px', textDecoration: 'none', flexShrink: 0 }}>▶ YT</a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>}

            {/* Student: Poll */}
            {!isHost && pollActive && (
              <div style={{ background: `linear-gradient(135deg, ${C.headerBg}, ${C.primary})`, borderRadius: '14px', padding: isMobile ? '20px 16px' : '18px', color: '#fff', textAlign: 'center', boxShadow: `0 6px 24px rgba(37,99,235,0.3)` }}>
                <p style={{ margin: '0 0 3px', fontSize: '11px', letterSpacing: '2px', opacity: 0.75, fontWeight: '600' }}>UNDERSTANDING CHECK</p>
                <p style={{ margin: '0 0 16px', fontSize: isMobile ? '18px' : '16px', fontWeight: '700' }}>Do you understand this section?</p>
                {studentPollAnswer === null
                  ? <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                      <button onClick={() => handlePollResponse(true)} style={{ flex: 1, padding: isMobile ? '16px 11px' : '11px', background: C.emerald, color: '#fff', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: '700', fontSize: isMobile ? '15px' : '14px' }}>✓ Got it! (+2 pts)</button>
                      <button onClick={() => handlePollResponse(false)} style={{ flex: 1, padding: isMobile ? '16px 11px' : '11px', background: C.red, color: '#fff', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: '700', fontSize: isMobile ? '15px' : '14px' }}>✗ Not yet</button>
                    </div>
                  : <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '9px', padding: '11px' }}><p style={{ margin: 0, fontWeight: '600' }}>{studentPollAnswer ? '✓ Response sent — Got it!' : '✓ Response sent — Not yet.'}</p></div>}
              </div>
            )}

            {/* Student: Exit Ticket */}
            {!isHost && showExitTicket && (
              <div style={{ background: `linear-gradient(135deg, ${C.rose}, #be123c)`, borderRadius: '14px', padding: '20px', color: '#fff', boxShadow: `0 6px 24px rgba(225,29,72,0.3)` }}>
                <p style={{ margin: '0 0 3px', fontSize: '11px', letterSpacing: '2px', opacity: 0.75, fontWeight: '600' }}>🎟 EXIT TICKET</p>
                <p style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '700' }}>Quick reflection before you leave</p>
                {!exitSubmitted ? <>
                  <div style={{ marginBottom: '11px' }}>
                    <label style={{ fontSize: '12px', opacity: 0.85, display: 'block', marginBottom: '5px', fontWeight: '600' }}>In one sentence — what was the main idea today?</label>
                    <textarea value={exitAnswer.mainIdea} onChange={e => setExitAnswer(p => ({ ...p, mainIdea: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: '7px', border: 'none', fontSize: '13px', resize: 'none', height: '56px', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '13px' }}>
                    <label style={{ fontSize: '12px', opacity: 0.85, display: 'block', marginBottom: '5px', fontWeight: '600' }}>What is still unclear to you?</label>
                    <textarea value={exitAnswer.unclear} onChange={e => setExitAnswer(p => ({ ...p, unclear: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: '7px', border: 'none', fontSize: '13px', resize: 'none', height: '56px', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', opacity: 0.85, display: 'block', marginBottom: '7px', fontWeight: '600' }}>Rate today's session:</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} onClick={() => setExitAnswer(p => ({ ...p, rating: n }))} style={{ flex: 1, padding: '9px', background: exitAnswer.rating >= n ? '#fff' : 'rgba(255,255,255,0.18)', color: exitAnswer.rating >= n ? C.rose : '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: '700', fontSize: '18px' }}>★</button>
                      ))}
                    </div>
                  </div>
                  <button onClick={handleSubmitExitTicket} style={{ width: '100%', padding: '11px', background: '#fff', color: C.rose, border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>Submit (+2 pts)</button>
                </> : <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: '9px', padding: '14px', textAlign: 'center' }}><p style={{ margin: 0, fontWeight: '700' }}>✓ Submitted! Thank you.</p></div>}
              </div>
            )}

            {/* Q&A */}
            <div style={card()}>
              <p style={{ margin: '0 0 8px', fontWeight: '700', fontSize: '13px', color: C.text }}>💬 Ask a Question <span style={{ fontWeight: '400', color: C.muted, fontSize: '12px' }}>· Bookmark #{currentBookmark} · +3 pts</span></p>
              <textarea value={questionInput} onChange={e => setQuestionInput(e.target.value)} placeholder="Type your question here..." style={{ width: '100%', height: '58px', padding: '8px 10px', borderRadius: '8px', border: `1.5px solid ${C.border}`, resize: 'none', boxSizing: 'border-box', fontSize: '13px', marginBottom: '7px', background: '#f8fbff' }} />
              <div style={{ display: 'flex', gap: '7px' }}>
                <button onClick={handleSendQuestion} style={{ flex: 1, padding: '9px', background: C.amber, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}>❓ Ask Question</button>
                <button onClick={handleShareFile} style={{ flex: 1, padding: '9px', background: C.teal, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}>📤 Share Resource</button>
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar — full-width tab on mobile */}
        <div style={{ width: isMobile ? '100%' : '275px', flexShrink: 0, background: C.card, borderLeft: isMobile ? 'none' : `1px solid ${C.border}`, borderTop: isMobile ? `1px solid ${C.border}` : 'none', display: isMobile && mobileTab !== 'questions' ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: isMobile ? '100%' : 0 }}>
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
            {currentBmQs.length === 0 && <p style={{ color: C.border, fontSize: '12px', textAlign: 'center', margin: '18px 0' }}>No questions for BM#{currentBookmark}</p>}
            {sharedFiles.length > 0 && <>
              <p style={{ margin: '10px 0 5px', fontSize: '11px', fontWeight: '700', color: C.teal, letterSpacing: '1px', textTransform: 'uppercase' }}>Shared Resources</p>
              {sharedFiles.map((f, i) => (
                <div key={i} style={{ padding: '7px 9px', background: '#f0fdfa', borderRadius: '8px', marginBottom: '5px', border: '1px solid #99f6e4' }}>
                  <a href={f.file_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: C.teal, fontSize: '12px', fontWeight: '600' }}>📄 {f.file_name}</a>
                  <br /><small style={{ color: C.muted }}>by {f.from_name}</small>
                </div>
              ))}
            </>}
            {pastQs.length > 0 && <>
              <p style={{ margin: '10px 0 5px', fontSize: '11px', fontWeight: '700', color: C.border, letterSpacing: '1px', textTransform: 'uppercase' }}>Earlier ({pastQs.length})</p>
              {pastQs.map((q, i) => (
                <div key={i} style={{ padding: '7px', background: C.bg, borderRadius: '7px', marginBottom: '4px', borderLeft: `2px solid ${C.border}`, opacity: 0.75 }}>
                  <p style={{ margin: '0 0 1px', fontSize: '10px', color: C.muted, fontWeight: '600' }}>BM#{q.bookmark_number} · {q.user_name}</p>
                  <p style={{ margin: 0, fontSize: '11px', color: C.text }}>{q.question_text}</p>
                </div>
              ))}
            </>}
          </div>
        </div>
      </div>

      {/* ═══ Mobile Bottom Tab Bar ═══ */}
      {isMobile && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '56px', background: C.headerBg, borderTop: `2px solid ${C.headerBdr}`, display: 'flex', zIndex: 200 }}>
          <button
            onClick={() => setMobileTab('main')}
            style={{ flex: 1, background: mobileTab === 'main' ? 'rgba(255,255,255,0.18)' : 'transparent', border: 'none', color: mobileTab === 'main' ? '#fff' : 'rgba(255,255,255,0.55)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', fontSize: '10px', fontWeight: '700', letterSpacing: '0.5px' }}>
            <span style={{ fontSize: '20px', lineHeight: 1 }}>📚</span>Class
          </button>
          <button
            onClick={() => setMobileTab('questions')}
            style={{ flex: 1, background: mobileTab === 'questions' ? 'rgba(255,255,255,0.18)' : 'transparent', border: 'none', color: mobileTab === 'questions' ? '#fff' : 'rgba(255,255,255,0.55)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', fontSize: '10px', fontWeight: '700', letterSpacing: '0.5px', position: 'relative' }}>
            <span style={{ fontSize: '20px', lineHeight: 1 }}>❓</span>
            Questions
            {unansweredCount > 0 && <span style={{ position: 'absolute', top: '6px', right: 'calc(50% - 22px)', background: C.amber, color: '#fff', borderRadius: '10px', fontSize: '9px', fontWeight: '800', padding: '1px 5px', lineHeight: '14px' }}>{unansweredCount}</span>}
          </button>
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {showContentInput && isHost && (
        <Overlay>
          <div style={{ background: C.card, borderRadius: '16px', width: '520px', maxWidth: '96vw', padding: '24px', margin: 'auto', boxShadow: '0 20px 70px rgba(14,116,144,0.2)', border: `1px solid #0e7490` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.text }}>🖥 Share Content with Students</h2>
              <button onClick={() => setShowContentInput(false)} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: C.muted, fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ background: '#f0fdfa', borderRadius: '9px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#0e7490', border: '1px solid #99f6e4' }}>
              <strong>Supported:</strong> YouTube videos (auto-converted to embed), Google Docs/Slides, Google Drive previews, any website that allows embedding.
              <br /><strong>Not supported:</strong> Netflix, Spotify, and sites that block embedding — students will get a "Open in tab" link instead.
            </div>
            <label style={lblStyle}>URL to share</label>
            <input
              value={contentInput}
              onChange={e => setContentInput(e.target.value)}
              placeholder="https://youtube.com/watch?v=... or https://docs.google.com/..."
              style={{ ...iStyle, marginBottom: '16px' }}
              onKeyDown={e => { if (e.key === 'Enter' && contentInput.trim()) { handleShareContent(contentInput.trim()); setContentInput(''); setShowContentInput(false); } }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { if (contentInput.trim()) { handleShareContent(contentInput.trim()); setContentInput(''); setShowContentInput(false); } }}
                disabled={!contentInput.trim()}
                style={{ flex: 1, padding: '12px', background: contentInput.trim() ? '#0e7490' : '#e2e8f0', color: contentInput.trim() ? '#fff' : C.muted, border: 'none', borderRadius: '10px', cursor: contentInput.trim() ? 'pointer' : 'not-allowed', fontWeight: '700', fontSize: '14px' }}>
                🖥 Share with Class
              </button>
              <button onClick={() => setShowContentInput(false)} style={{ padding: '12px 20px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', cursor: 'pointer', fontSize: '13px', color: C.text, fontWeight: '600' }}>Cancel</button>
            </div>
          </div>
        </Overlay>
      )}

      {showQuizCreator && (
        <Overlay>
          <div style={{ background: C.card, borderRadius: '16px', width: '700px', maxWidth: '96vw', padding: '24px', margin: 'auto', boxShadow: '0 20px 70px rgba(30,64,175,0.2)', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: '10px', letterSpacing: '2px', color: quizCreatorType === 'short' ? C.amber : C.purple, fontWeight: '700', textTransform: 'uppercase' }}>{quizCreatorType === 'short' ? 'Short Quiz' : 'Homework'}</p>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.text }}>{quizCreatorType === 'short' ? '⚡ Refresher Quiz' : '📚 Homework Assignment'}</h2>
              </div>
              <button onClick={() => setShowQuizCreator(false)} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: C.muted, fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ background: quizCreatorType === 'short' ? '#fffbeb' : '#f5f3ff', borderRadius: '9px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: quizCreatorType === 'short' ? '#92400e' : '#5b21b6', borderLeft: `3px solid ${quizCreatorType === 'short' ? C.amber : C.purple}` }}>
              {quizCreatorType === 'short' ? '⚡ MC questions auto-graded. +10 pts per correct. Set a timer.' : '📚 Deep homework. STEM: use \\alpha, ^2, _2, \\sqrt etc. for formulas. +5 pts for submitting.'}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: '160px' }}>
                <label style={lblStyle}>Quiz Title</label>
                <input value={quizTitle} onChange={e => setQuizTitle(e.target.value)} placeholder="e.g. Newton's Laws Refresher" style={{ ...iStyle, marginBottom: 0 }} />
              </div>
              {quizCreatorType === 'long' && (
                <div style={{ flex: 1, minWidth: '130px' }}>
                  <label style={lblStyle}>Subject</label>
                  <select value={quizSubject} onChange={e => { setQuizSubject(e.target.value); if (STEM_SUBJECTS.includes(e.target.value)) setDraftQuestions(prev => prev.map(q => ({ ...q, requiresDiagram: true }))); }} style={{ ...iStyle, marginBottom: 0, cursor: 'pointer' }}>
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
            {isStemSubject && <div style={{ background: '#faf5ff', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', color: C.purple, border: '1px solid #e9d5ff' }}>📐 STEM subject — include Diagram + Label or Derive/Prove questions.</div>}
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
                    placeholder={q.type === 'mc' ? 'Enter question...' : q.type === 'derive' ? 'e.g. Derive the expression for centripetal acceleration...' : q.type === 'diagram' ? 'e.g. Draw and label the human heart...' : 'e.g. Explain why...'}
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

      {showQuizModal && activeQuiz && !isHost && (
        <Overlay>
          <div style={{ background: C.card, borderRadius: '16px', width: '620px', maxWidth: '96vw', padding: '24px', margin: 'auto', boxShadow: '0 20px 70px rgba(30,64,175,0.2)', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: '10px', letterSpacing: '2px', color: activeQuiz.type === 'short' ? C.amber : C.purple, fontWeight: '700', textTransform: 'uppercase' }}>{activeQuiz.type === 'short' ? '⚡ Short Quiz' : '📚 Homework'}</p>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.text }}>{activeQuiz.title}</h2>
              </div>
              {activeQuiz.type === 'short' && quizTimeLeft !== null && (
                <div style={{ background: quizTimeLeft < 60 ? C.red : C.headerBg, color: '#fff', padding: '8px 14px', borderRadius: '10px', textAlign: 'center', flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: '10px', opacity: 0.75, letterSpacing: '1px' }}>TIME LEFT</p>
                  <p style={{ margin: 0, fontSize: '22px', fontWeight: '800', fontFamily: 'monospace' }}>{fmt(quizTimeLeft)}</p>
                </div>
              )}
            </div>
            {activeQuiz.type === 'long' && <div style={{ background: '#f5f3ff', borderRadius: '8px', padding: '8px 12px', marginBottom: '14px', fontSize: '12px', color: C.purple, border: '1px solid #e9d5ff' }}>Show your full reasoning. For diagrams: draw → photo → upload to imgur.com → paste URL.</div>}
            <div style={{ marginBottom: '16px', maxHeight: '55vh', overflowY: 'auto' }}>
              {activeQuiz.questions.map((q, i) => (
                <div key={q.id} style={{ background: C.bg, borderRadius: '10px', padding: '13px', marginBottom: '10px', border: `1px solid ${C.border}` }}>
                  <p style={{ margin: '0 0 10px', fontWeight: '700', fontSize: '14px', color: C.text }}>Q{i + 1}. {parseMath(q.text)}</p>
                  {q.type === 'mc' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {(['A', 'B', 'C', 'D'] as const).map((letter, idx) => (
                        <label key={letter} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px 11px', borderRadius: '8px', background: studentAnswers[q.id] === letter ? '#eff6ff' : '#fff', border: `1.5px solid ${studentAnswers[q.id] === letter ? C.primary : C.border}` }}>
                          <input type="radio" name={`q-${q.id}`} value={letter} checked={studentAnswers[q.id] === letter} onChange={() => setStudentAnswers(prev => ({ ...prev, [q.id]: letter }))} disabled={studentQuizSubmitted} />
                          <span style={{ fontSize: '13px', color: C.text }}><strong>{letter}.</strong> {parseMath(q.options[idx])}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {(q.type === 'short' || q.type === 'long' || q.type === 'derive') && (
                    <textarea value={studentAnswers[q.id] || ''} onChange={e => setStudentAnswers(prev => ({ ...prev, [q.id]: e.target.value }))} disabled={studentQuizSubmitted}
                      placeholder={q.type === 'derive' ? 'Show all working. State assumptions. Derive step by step...' : 'Write your full answer with reasoning...'}
                      style={{ width: '100%', padding: '8px', borderRadius: '7px', border: `1.5px solid ${C.border}`, resize: 'vertical', minHeight: q.type !== 'short' ? '110px' : '65px', fontSize: '13px', boxSizing: 'border-box', background: '#fff' }} />
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
              : <div style={{ background: '#f0fdf4', borderRadius: '9px', padding: '12px', textAlign: 'center', border: '1px solid #bbf7d0' }}><p style={{ margin: 0, color: C.emerald, fontWeight: '700' }}>✓ Submitted! Points awarded.</p></div>}
          </div>
        </Overlay>
      )}

      {showQuizResults && activeQuiz && isHost && (
        <Overlay>
          <div style={{ background: C.card, borderRadius: '16px', width: '720px', maxWidth: '96vw', padding: '24px', margin: 'auto', boxShadow: '0 20px 70px rgba(30,64,175,0.2)', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: '10px', letterSpacing: '2px', color: activeQuiz.type === 'short' ? C.amber : C.purple, fontWeight: '700', textTransform: 'uppercase' }}>{activeQuiz.type === 'short' ? '⚡ Short Quiz — Results' : '📚 Homework — Results'}</p>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.text }}>{activeQuiz.title}</h2>
              </div>
              {activeQuiz.type === 'short' && quizTimeLeft !== null && (
                <div style={{ background: quizTimeLeft < 60 ? C.red : C.headerBg, color: '#fff', padding: '8px 14px', borderRadius: '10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '10px', opacity: 0.75 }}>TIME LEFT</p>
                  <p style={{ margin: 0, fontSize: '22px', fontWeight: '800', fontFamily: 'monospace' }}>{fmt(quizTimeLeft)}</p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <div style={{ flex: 1, background: C.bg, borderRadius: '9px', padding: '10px', textAlign: 'center', border: `1px solid ${C.border}` }}>
                <p style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: C.text }}>{quizSubmissions.length}</p>
                <p style={{ margin: 0, fontSize: '11px', color: C.muted, fontWeight: '600' }}>Submitted</p>
              </div>
              {activeQuiz.questions.some(q => q.type === 'mc') && quizSubmissions.length > 0 && (
                <div style={{ flex: 1, background: '#f0fdf4', borderRadius: '9px', padding: '10px', textAlign: 'center', border: '1px solid #bbf7d0' }}>
                  <p style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: C.emerald }}>{Math.round(quizSubmissions.reduce((s, sub) => s + (sub.mcScore ?? 0), 0) / quizSubmissions.length)}%</p>
                  <p style={{ margin: 0, fontSize: '11px', color: C.muted, fontWeight: '600' }}>Avg MC Score</p>
                </div>
              )}
              <div style={{ flex: 1, background: '#fffbeb', borderRadius: '9px', padding: '10px', textAlign: 'center', border: '1px solid #fde68a' }}>
                <p style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: C.amber }}>{connectedStudents.length}</p>
                <p style={{ margin: 0, fontSize: '11px', color: C.muted, fontWeight: '600' }}>Connected</p>
              </div>
            </div>
            <div style={{ maxHeight: '340px', overflowY: 'auto', marginBottom: '14px' }}>
              {quizSubmissions.length === 0
                ? <div style={{ textAlign: 'center', padding: '24px', color: C.muted }}>⏳ Waiting for submissions...</div>
                : quizSubmissions.map((sub, i) => (
                  <div key={i} style={{ background: C.bg, borderRadius: '10px', padding: '12px', marginBottom: '8px', border: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <strong style={{ color: C.text }}>{sub.studentName}</strong>
                      {sub.mcScore !== undefined && <span style={{ ...pill(sub.mcScore >= 80 ? '#dcfce7' : sub.mcScore >= 60 ? '#fef9c3' : '#fee2e2', sub.mcScore >= 80 ? '#15803d' : sub.mcScore >= 60 ? '#92400e' : '#b91c1c') }}>MC: {sub.mcScore}%</span>}
                    </div>
                    {activeQuiz.questions.map((q, qi) => (
                      <div key={q.id} style={{ marginBottom: '5px', paddingBottom: '5px', borderBottom: qi < activeQuiz.questions.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        <p style={{ margin: '0 0 2px', fontSize: '11px', color: C.muted, fontWeight: '600' }}>Q{qi + 1}: {parseMath(q.text).substring(0, 60)}{q.text.length > 60 ? '…' : ''}</p>
                        {q.type === 'mc' && <p style={{ margin: 0, fontSize: '12px', color: sub.answers[q.id] === q.correctOption ? C.emerald : C.red, fontWeight: '600' }}>{sub.answers[q.id] === q.correctOption ? '✓' : '✗'} {sub.answers[q.id] || 'N/A'}{sub.answers[q.id] !== q.correctOption && <span style={{ color: C.muted, fontWeight: '400' }}> (✓{q.correctOption})</span>}</p>}
                        {q.type !== 'mc' && <p style={{ margin: 0, fontSize: '12px', color: C.text, background: '#fff', padding: '5px 8px', borderRadius: '5px', border: `1px solid ${C.border}` }}>{sub.answers[q.id] || <em style={{ color: C.border }}>No answer</em>}</p>}
                        {sub.diagramUrls[q.id] && <a href={sub.diagramUrls[q.id]} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: C.purple, display: 'block', marginTop: '3px', fontWeight: '600' }}>📐 View Diagram →</a>}
                      </div>
                    ))}
                  </div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '9px' }}>
              <button onClick={handleEndQuiz} style={{ flex: 1, padding: '11px', background: C.red, color: '#fff', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: '700' }}>End Quiz</button>
              {activeQuiz.type === 'long' && <button onClick={() => setShowReminder(true)} style={{ flex: 1, padding: '11px', background: C.teal, color: '#fff', border: 'none', borderRadius: '9px', cursor: 'pointer', fontWeight: '700' }}>📅 Reminders</button>}
              <button onClick={() => setShowQuizResults(false)} style={{ padding: '11px 18px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '9px', cursor: 'pointer', fontSize: '13px', color: C.text, fontWeight: '600' }}>Close</button>
            </div>
          </div>
        </Overlay>
      )}

      {showExitSummary && isHost && (
        <Overlay>
          <div style={{ background: C.card, borderRadius: '16px', width: '600px', maxWidth: '96vw', padding: '24px', margin: 'auto', boxShadow: '0 20px 70px rgba(30,64,175,0.2)', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.text }}>🎟 Exit Ticket Results</h2>
              <button onClick={handleCloseExitTicket} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: C.muted, fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <div style={{ flex: 1, background: '#fff1f2', borderRadius: '9px', padding: '10px', textAlign: 'center', border: '1px solid #fecdd3' }}>
                <p style={{ margin: 0, fontSize: '26px', fontWeight: '800', color: C.rose }}>{exitResponses.length}</p>
                <p style={{ margin: 0, fontSize: '11px', color: C.muted, fontWeight: '600' }}>Responses</p>
              </div>
              {avgRating && <div style={{ flex: 1, background: '#fffbeb', borderRadius: '9px', padding: '10px', textAlign: 'center', border: '1px solid #fde68a' }}>
                <p style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: C.gold }}>{'★'.repeat(Math.round(Number(avgRating)))} {avgRating}</p>
                <p style={{ margin: 0, fontSize: '11px', color: C.muted, fontWeight: '600' }}>Avg Rating</p>
              </div>}
            </div>
            {exitResponses.length === 0
              ? <div style={{ textAlign: 'center', padding: '24px', color: C.muted }}>⏳ Waiting for student responses...</div>
              : <>
                <div style={{ marginBottom: '14px' }}>
                  <p style={{ margin: '0 0 8px', fontWeight: '700', fontSize: '12px', color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>💡 Main Ideas (what they retained)</p>
                  {exitResponses.filter(r => r.mainIdea).map((r, i) => (
                    <div key={i} style={{ background: '#f0fdf4', borderRadius: '8px', padding: '9px 12px', marginBottom: '5px', border: '1px solid #bbf7d0' }}>
                      <p style={{ margin: '0 0 3px', fontSize: '11px', color: C.emerald, fontWeight: '700' }}>{r.studentName} {'★'.repeat(r.rating)}</p>
                      <p style={{ margin: 0, fontSize: '13px', color: C.text }}>{r.mainIdea}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{ margin: '0 0 8px', fontWeight: '700', fontSize: '12px', color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase' }}>❓ Still Unclear (plan your next session from this)</p>
                  {exitResponses.filter(r => r.unclear).map((r, i) => (
                    <div key={i} style={{ background: '#fff1f2', borderRadius: '8px', padding: '9px 12px', marginBottom: '5px', border: '1px solid #fecdd3' }}>
                      <p style={{ margin: '0 0 3px', fontSize: '11px', color: C.red, fontWeight: '700' }}>{r.studentName}</p>
                      <p style={{ margin: 0, fontSize: '13px', color: C.text }}>{r.unclear}</p>
                    </div>
                  ))}
                </div>
              </>}
          </div>
        </Overlay>
      )}

      {showLeaderboard && (
        <Overlay>
          <div style={{ background: C.card, borderRadius: '16px', width: '480px', maxWidth: '96vw', padding: '24px', margin: 'auto', boxShadow: '0 20px 70px rgba(30,64,175,0.2)', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.text }}>🏆 Session Leaderboard</h2>
              <button onClick={() => setShowLeaderboard(false)} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: C.muted, fontSize: '16px' }}>✕</button>
            </div>
            <div style={{ background: '#fffbeb', borderRadius: '9px', padding: '9px 13px', marginBottom: '14px', fontSize: '12px', color: '#92400e', border: '1px solid #fde68a' }}>
              Poll +2 · Question +3 · MC Correct +10 · Homework +5 · Exit Ticket +2
            </div>
            {leaderboard.length === 0
              ? <div style={{ textAlign: 'center', padding: '28px', color: C.muted }}>No points earned yet — participate to appear here!</div>
              : leaderboard.map((e, i) => {
                  const medals = ['🥇', '🥈', '🥉'];
                  const isMe = e.peerId === myId;
                  return (
                    <div key={e.peerId} style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '11px 14px', background: isMe ? '#eff6ff' : i === 0 ? '#fffbeb' : C.card, borderRadius: '10px', marginBottom: '6px', border: `1.5px solid ${isMe ? C.primary : C.border}` }}>
                      <span style={{ fontSize: '22px', flexShrink: 0, width: '28px', textAlign: 'center' }}>{medals[i] ?? <span style={{ fontSize: '14px', color: C.muted, fontWeight: '700' }}>{i + 1}</span>}</span>
                      <span style={{ flex: 1, fontWeight: isMe ? '700' : '500', fontSize: '14px', color: C.text }}>{e.name}{isMe && <span style={{ color: C.primary, fontSize: '12px' }}> (you)</span>}</span>
                      <span style={{ fontWeight: '800', fontSize: '17px', color: C.gold }}>{e.points} <span style={{ fontSize: '11px', fontWeight: '500', color: C.muted }}>pts</span></span>
                    </div>
                  );
                })}
          </div>
        </Overlay>
      )}

      {showProgress && isHost && (
        <Overlay>
          <div style={{ background: C.card, borderRadius: '16px', width: '720px', maxWidth: '96vw', padding: '24px', margin: 'auto', boxShadow: '0 20px 70px rgba(30,64,175,0.2)', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.text }}>📊 Student Progress — This Session</h2>
              <button onClick={() => setShowProgress(false)} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: C.muted, fontSize: '16px' }}>✕</button>
            </div>
            {progressData.length === 0
              ? <div style={{ textAlign: 'center', padding: '28px', color: C.muted }}>No student activity recorded yet.</div>
              : <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead><tr style={{ background: C.bg }}>
                      {['Name', 'Connected', 'Questions', 'Poll', 'Quiz Score', 'Homework', 'Exit Ticket', 'Points'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {progressData.map((s, i) => {
                        const lb = leaderboard.find(e => e.peerId === s.peerId);
                        return (
                          <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ ...tdStyle, fontWeight: '600', color: C.text }}>{s.name}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>{s.connected ? '✅' : '⬛'}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>{s.questionsAsked > 0 ? `${s.questionsAsked} ❓` : <span style={{ color: C.border }}>—</span>}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>{s.pollAnswered ? <span style={{ color: s.pollAnswered.understood ? C.emerald : C.red, fontWeight: '600' }}>{s.pollAnswered.understood ? '✓ Got it' : '✗ Not yet'}</span> : <span style={{ color: C.border }}>—</span>}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>{s.shortQuizScore !== undefined ? <span style={{ ...pill(s.shortQuizScore >= 80 ? '#dcfce7' : '#fef9c3', s.shortQuizScore >= 80 ? C.emerald : C.amber) }}>{s.shortQuizScore}%</span> : <span style={{ color: C.border }}>—</span>}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>{s.homeworkDone ? '✅' : <span style={{ color: C.border }}>—</span>}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>{s.exitDone ? <span style={{ color: C.rose }}>{'★'.repeat(s.exitDone.rating)}</span> : <span style={{ color: C.border }}>—</span>}</td>
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

      {showReminder && reminderQuiz && isHost && (
        <Overlay>
          <div style={{ background: C.card, borderRadius: '16px', width: '580px', maxWidth: '96vw', padding: '24px', margin: 'auto', boxShadow: '0 20px 70px rgba(30,64,175,0.2)', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: C.text }}>📅 Spaced Repetition Reminders</h2>
              <button onClick={() => setShowReminder(false)} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: C.muted, fontSize: '16px' }}>✕</button>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: C.muted }}>Send these messages on Day 3 and Day 7 to reinforce long-term retention.</p>
            {[3, 7].map(days => (
              <div key={days} style={{ background: '#f0fdf4', borderRadius: '12px', padding: '14px', marginBottom: '14px', border: '1px solid #bbf7d0' }}>
                <p style={{ margin: '0 0 8px', fontWeight: '700', fontSize: '13px', color: '#15803d' }}>📬 Day {days} — {days === 3 ? 'Completion Reminder' : 'Spaced Review'}</p>
                <p style={{ margin: '0 0 11px', fontSize: '12px', background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #dcfce7', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: C.text }}>{buildReminder(reminderQuiz, days)}</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => navigator.clipboard.writeText(buildReminder(reminderQuiz, days)).then(() => alert('Copied!'))} style={{ flex: 1, padding: '8px', background: C.emerald, color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>📋 Copy</button>
                  <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(buildReminder(reminderQuiz, days))}`, '_blank')} style={{ flex: 1, padding: '8px', background: C.whatsapp, color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>📲 WhatsApp</button>
                </div>
              </div>
            ))}
          </div>
        </Overlay>
      )}
    </div>
  );
}
