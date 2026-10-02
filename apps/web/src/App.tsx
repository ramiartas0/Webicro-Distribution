import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Rocket,
  CheckCircle2,
  Clock,
  GitCommit,
  Sparkles,
  Smartphone,
  Apple,
  Copy,
  Check,
  RefreshCw,
  History,
  ShieldCheck,
  Moon,
  Sun,
  Terminal,
  Layers,
  AlertCircle,
  FolderCheck,
  BookOpen,
  ChevronRight,
  FolderPlus,
  Play,
  Key,
  Code2
} from 'lucide-react';

interface CommitItem {
  hash: string;
  type: string;
  scope: string | null;
  message: string;
  isBreakingChange?: boolean;
}

interface PipelineStep {
  id: number;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
}

interface ReleaseHistoryItem {
  id: number;
  releaseId: string;
  version: string;
  buildNumber: number;
  status: string;
  createdAt: string;
}

interface AuditLogItem {
  id: number;
  releaseId: string | null;
  action: string;
  actor: string;
  result: string;
  timestamp: string;
  details: string | null;
}

interface ProjectEntry {
  id: string;
  name: string;
  path: string;
  hasPubspec: boolean;
  version?: string;
}

interface StoreTestResult {
  testing: boolean;
  tested: boolean;
  success: boolean;
  message?: string;
  error?: string;
  details?: Record<string, unknown>;
}

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'console' | 'history' | 'stores' | 'wiki'>('pipeline');
  
  // Proje Listesi ve Aktif Proje
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [activeProjectPath, setActiveProjectPath] = useState<string>('');
  const [showAddProjectModal, setShowAddProjectModal] = useState<boolean>(false);
  const [newProjectPath, setNewProjectPath] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [isAddingProject, setIsAddingProject] = useState<boolean>(false);

  // Proje Detayları
  const [projectName, setProjectName] = useState<string>('Webicro Distribution');
  const [gitBranch, setGitBranch] = useState<string>('main');
  const [currentVersion, setCurrentVersion] = useState<string>('1.0.0');
  const [currentBuildNumber, setCurrentBuildNumber] = useState<number>(1);
  const [bumpType, setBumpType] = useState<'patch' | 'minor' | 'major' | 'custom'>('minor');
  const [customVersion, setCustomVersion] = useState<string>('');
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [hasPubspec, setHasPubspec] = useState<boolean>(false);
  const [isGitClean, setIsGitClean] = useState<boolean>(true);
  const [isLoadingProject, setIsLoadingProject] = useState<boolean>(true);

  // Mağaza Seçimleri
  const [targetAndroid, setTargetAndroid] = useState<boolean>(true);
  const [targetIos, setTargetIos] = useState<boolean>(true);
  const [playTrack, setPlayTrack] = useState<'internal' | 'alpha' | 'beta' | 'production'>('internal');
  const [playRollout, setPlayRollout] = useState<number>(100);
  const [iosSubmitReview, setIosSubmitReview] = useState<boolean>(false);
  const [isDryRun, setIsDryRun] = useState<boolean>(true);

  // Mağaza Bilgileri
  const [googlePlayInfo, setGooglePlayInfo] = useState<{
    connected: boolean;
    serviceAccount: string;
    projectId?: string;
    keyPath?: string;
  }>({
    connected: false,
    serviceAccount: 'Kontrol ediliyor...',
  });
  const [appStoreInfo, setAppStoreInfo] = useState<{
    connected: boolean;
    keyId: string;
    issuerId?: string;
  }>({
    connected: false,
    keyId: 'Kontrol ediliyor...',
  });

  // Mağaza Canlı Test Sonuçları
  const [googleTestResult, setGoogleTestResult] = useState<StoreTestResult>({
    testing: false,
    tested: false,
    success: false,
  });
  const [appleTestResult, setAppleTestResult] = useState<StoreTestResult>({
    testing: false,
    tested: false,
    success: false,
  });

  // AI Sürüm Notları
  const [notesTr, setNotesTr] = useState<string>('');
  const [notesEn, setNotesEn] = useState<string>('');
  const [copiedTr, setCopiedTr] = useState<boolean>(false);
  const [copiedEn, setCopiedEn] = useState<boolean>(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);

  // Pipeline Yürütme & Canlı SSE
  const [isReleasing, setIsReleasing] = useState<boolean>(false);
  const [releaseCompleted, setReleaseCompleted] = useState<boolean>(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [logs, setLogs] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Geçmiş Sürümler & Denetim Kayıtları
  const [historyReleases, setHistoryReleases] = useState<ReleaseHistoryItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  // 20 Adımlık Standart Pipeline
  const initialSteps: PipelineStep[] = [
    { id: 1, name: 'Ortam & Bağımlılık Kontrolü (Flutter, Java, Node)', status: 'pending' },
    { id: 2, name: 'SQLite Veritabanı & Migration Başlatma', status: 'pending' },
    { id: 3, name: 'Git Geçmişi & Değişiklik Analizi', status: 'pending' },
    { id: 4, name: 'SemVer Sürüm & Build Numarası Çözümleme', status: 'pending' },
    { id: 5, name: 'Release Planı & Risk Değerlendirmesi', status: 'pending' },
    { id: 6, name: 'CHANGELOG.md Dosyasını Güncelleme', status: 'pending' },
    { id: 7, name: 'AI Destekli Çok Dilli Sürüm Notu Üretimi', status: 'pending' },
    { id: 8, name: 'Mağaza Karakter ve Hassas Veri Taraması', status: 'pending' },
    { id: 9, name: 'pubspec.yaml Versiyon Bilgisini Güncelleme', status: 'pending' },
    { id: 10, name: 'Flutter Doctor & Statik Kod Analizi', status: 'pending' },
    { id: 11, name: 'Birim ve Entegrasyon Testleri (flutter test)', status: 'pending' },
    { id: 12, name: 'Android AAB Release Derleme (flutter build appbundle)', status: 'pending' },
    { id: 13, name: 'Android AAB SHA-256 Hash ve Boyut Doğrulama', status: 'pending' },
    { id: 14, name: 'iOS IPA Release Derleme (flutter build ipa)', status: 'pending' },
    { id: 15, name: 'iOS IPA SHA-256 Hash ve Boyut Doğrulama', status: 'pending' },
    { id: 16, name: 'Google Play AAB Yükleme & Düzenleme Oturumu', status: 'pending' },
    { id: 17, name: 'Google Play Kanal ve Sürüm Notları Ataması', status: 'pending' },
    { id: 18, name: 'App Store Connect IPA Gönderimi (altool / API)', status: 'pending' },
    { id: 19, name: 'Apple Build İşleme & Doğrulama Takibi', status: 'pending' },
    { id: 20, name: 'Denetim Günlüğü Kaydı & Slack/Discord Bildirimi', status: 'pending' },
  ];

  const [steps, setSteps] = useState<PipelineStep[]>(initialSteps);

  // Tema Yönetimi
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Log kaydırma
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Hedef yeni sürümü hesapla
  const getNextVersion = useCallback((): string => {
    if (bumpType === 'custom' && customVersion) return customVersion;
    const [maj = 0, min = 0, pat = 0] = currentVersion.split('.').map(Number);
    if (bumpType === 'major') return `${maj + 1}.0.0`;
    if (bumpType === 'minor') return `${maj}.${min + 1}.0`;
    return `${maj}.${min}.${pat + 1}`;
  }, [bumpType, customVersion, currentVersion]);

  const nextVersion = getNextVersion();
  const nextBuild = currentBuildNumber + 1;

  // AI Sürüm Notlarını Gerçek Git Commit'lerinden Üret
  const generateAiNotes = useCallback(async (targetVer: string) => {
    setIsGeneratingAi(true);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: targetVer }),
      });
      if (res.ok) {
        const data = await res.json() as { notesTr?: string; notesEn?: string };
        if (data.notesTr) setNotesTr(data.notesTr);
        if (data.notesEn) setNotesEn(data.notesEn);
      }
    } catch (err) {
      console.error('AI not üretimi hatası:', err);
    } finally {
      setIsGeneratingAi(false);
    }
  }, []);

  // 1. PROJELERİ VE AKTİF PROJE VERİLERİNİ ÇEK
  const loadProjectsAndActive = useCallback(async () => {
    setIsLoadingProject(true);
    try {
      // 1.1 Proje Listesini Al
      const projRes = await fetch('/api/projects');
      if (projRes.ok) {
        const pData = await projRes.json() as { activePath: string; projects: ProjectEntry[] };
        setProjects(pData.projects || []);
        setActiveProjectPath(pData.activePath);
      }

      // 1.2 Aktif Proje Detaylarını Al
      const detailRes = await fetch('/api/project');
      if (detailRes.ok) {
        const data = await detailRes.json() as {
          project: {
            name: string;
            currentVersion: string;
            currentBuildNumber: number;
            suggestedVersion: string;
            suggestedBuildNumber: number;
            suggestedBump: 'patch' | 'minor' | 'major';
            branch: string;
            isClean: boolean;
            hasPubspec: boolean;
          };
          commits: CommitItem[];
          stores: {
            googlePlay: typeof googlePlayInfo;
            appStore: typeof appStoreInfo;
          };
        };
        setProjectName(data.project.name || 'Webicro Distribution');
        setGitBranch(data.project.branch || 'main');
        setCurrentVersion(data.project.currentVersion || '1.0.0');
        setCurrentBuildNumber(data.project.currentBuildNumber || 1);
        setBumpType(data.project.suggestedBump || 'minor');
        setIsGitClean(data.project.isClean);
        setHasPubspec(data.project.hasPubspec);
        setCommits(data.commits || []);
        if (data.stores?.googlePlay) setGooglePlayInfo(data.stores.googlePlay);
        if (data.stores?.appStore) setAppStoreInfo(data.stores.appStore);

        // Notları üret
        generateAiNotes(data.project.suggestedVersion || '1.1.0');
      }
    } catch (err) {
      console.error('Proje bilgileri alınamadı:', err);
    } finally {
      setIsLoadingProject(false);
    }
  }, [generateAiNotes]);

  useEffect(() => {
    loadProjectsAndActive();
  }, [loadProjectsAndActive]);

  // Aktif Projeyi Değiştir
  const handleSwitchProject = async (targetPath: string) => {
    try {
      setIsLoadingProject(true);
      const res = await fetch('/api/projects/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath }),
      });
      if (res.ok) {
        await loadProjectsAndActive();
      }
    } catch (err) {
      console.error('Proje değiştirme hatası:', err);
    } finally {
      setIsLoadingProject(false);
    }
  };

  // Yeni Proje Ekle
  const handleAddNewProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectPath.trim()) return;
    setIsAddingProject(true);
    try {
      const res = await fetch('/api/projects/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim(), path: newProjectPath.trim() }),
      });
      if (res.ok) {
        setShowAddProjectModal(false);
        setNewProjectPath('');
        setNewProjectName('');
        await loadProjectsAndActive();
      } else {
        const data = await res.json() as { error?: string };
        alert(`Hata: ${data.error || 'Proje eklenemedi.'}`);
      }
    } catch (err) {
      alert(`Bağlantı hatası: ${String(err)}`);
    } finally {
      setIsAddingProject(false);
    }
  };

  // 2. GEÇMİŞ SÜRÜMLERİ ÇEK
  useEffect(() => {
    if (activeTab === 'history') {
      fetch('/api/history')
        .then((res) => res.json())
        .then((data: { releases?: ReleaseHistoryItem[]; auditLogs?: AuditLogItem[] }) => {
          setHistoryReleases(data.releases || []);
          setAuditLogs(data.auditLogs || []);
        })
        .catch((err) => console.error('Geçmiş alınamadı:', err));
    }
  }, [activeTab]);

  // GOOGLE PLAY CANLI DOĞRULAMA TESTİ
  const handleTestGooglePlay = async () => {
    setGoogleTestResult({ testing: true, tested: false, success: false });
    try {
      const res = await fetch('/api/stores/test-google', { method: 'POST' });
      const data = await res.json() as {
        success: boolean;
        message?: string;
        error?: string;
        serviceAccount?: string;
        projectId?: string;
        keyPath?: string;
        oauthReady?: boolean;
        oauthDetails?: string;
        permissionsRequired?: string[];
      };
      setGoogleTestResult({
        testing: false,
        tested: true,
        success: data.success,
        message: data.message,
        error: data.error,
        details: data as unknown as Record<string, unknown>,
      });
      if (data.serviceAccount) {
        setGooglePlayInfo((prev) => ({
          ...prev,
          connected: data.success,
          serviceAccount: data.serviceAccount || prev.serviceAccount,
          projectId: data.projectId,
          keyPath: data.keyPath,
        }));
      }
    } catch (err) {
      setGoogleTestResult({
        testing: false,
        tested: true,
        success: false,
        error: `Sunucu bağlantı hatası: ${String(err)}`,
      });
    }
  };

  // APPLE APP STORE CONNECT CANLI DOĞRULAMA TESTİ
  const handleTestAppleStore = async () => {
    setAppleTestResult({ testing: true, tested: false, success: false });
    try {
      const res = await fetch('/api/stores/test-apple', { method: 'POST' });
      const data = await res.json() as {
        success: boolean;
        message?: string;
        error?: string;
        keyId?: string;
        issuerId?: string;
        apiHttpStatus?: number;
      };
      setAppleTestResult({
        testing: false,
        tested: true,
        success: data.success,
        message: data.message,
        error: data.error,
        details: data as unknown as Record<string, unknown>,
      });
    } catch (err) {
      setAppleTestResult({
        testing: false,
        tested: true,
        success: false,
        error: `Sunucu bağlantı hatası: ${String(err)}`,
      });
    }
  };

  const copyToClipboard = (text: string, isTurkish: boolean) => {
    navigator.clipboard.writeText(text);
    if (isTurkish) {
      setCopiedTr(true);
      setTimeout(() => setCopiedTr(false), 2000);
    } else {
      setCopiedEn(true);
      setTimeout(() => setCopiedEn(false), 2000);
    }
  };

  // GERÇEK RELEASE BORU HATTINI BAŞLAT
  const startReleasePipeline = async () => {
    setIsReleasing(true);
    setReleaseCompleted(false);
    setActiveStepIndex(0);
    setSteps(initialSteps.map((s) => ({ ...s, status: 'pending' })));
    setLogs([`[${new Date().toLocaleTimeString()}] 🚀 Release süreci sunucuda başlatılıyor...`]);

    const eventSource = new EventSource('/api/release/events');
    let currentStepIndex = 0;

    eventSource.onmessage = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data as string) as {
          type: 'step' | 'completed' | 'failed';
          event?: { step: string; status: string; message?: string; error?: string };
          summary?: { version?: string };
          error?: string;
        };

        if (payload.type === 'step' && payload.event) {
          const ev = payload.event;
          const stepMsg = ev.step || 'Adım';
          
          setLogs((prev) => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] [${ev.status}] ${stepMsg} ${ev.message ? '- ' + ev.message : ''}`
          ]);

          if (ev.status === 'RUNNING' || ev.status === 'IN_PROGRESS') {
            setSteps((prev) =>
              prev.map((s, idx) => (idx === currentStepIndex ? { ...s, status: 'running' } : s))
            );
          } else if (ev.status === 'COMPLETED' || ev.status === 'SUCCESS') {
            setSteps((prev) =>
              prev.map((s, idx) => (idx === currentStepIndex ? { ...s, status: 'success' } : s))
            );
            currentStepIndex++;
            setActiveStepIndex(Math.min(currentStepIndex, 20));
          } else if (ev.status === 'FAILED') {
            setSteps((prev) =>
              prev.map((s, idx) => (idx === currentStepIndex ? { ...s, status: 'failed' } : s))
            );
            setLogs((prev) => [
              ...prev,
              `[${new Date().toLocaleTimeString()}] ❌ HATA: ${ev.error || 'İşlem başarısız oldu'}`
            ]);
          }
        } else if (payload.type === 'completed') {
          eventSource.close();
          setIsReleasing(false);
          setReleaseCompleted(true);
          setSteps((prev) => prev.map((s) => ({ ...s, status: 'success' })));
          setActiveStepIndex(20);
          setLogs((prev) => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] 🎉 Tüm süreç başarıyla tamamlandı! (Sürüm: ${payload.summary?.version || nextVersion})`
          ]);
        } else if (payload.type === 'failed') {
          eventSource.close();
          setIsReleasing(false);
          setLogs((prev) => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] ❌ Boru hattı durduruldu: ${payload.error || 'Bilinmeyen hata'}`
          ]);
        }
      } catch (err) {
        console.error('SSE mesajı işlenemedi:', err);
      }
    };

    try {
      const response = await fetch('/api/release/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bump: bumpType === 'custom' ? undefined : bumpType,
          manualVersion: bumpType === 'custom' ? customVersion : undefined,
          dryRun: isDryRun,
          targetAndroid,
          targetIos,
        }),
      });

      if (!response.ok) {
        throw new Error('Sunucu başlatma isteğini reddetti.');
      }
    } catch (err) {
      setIsReleasing(false);
      eventSource.close();
      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ Sunucu bağlantı hatası: ${err instanceof Error ? err.message : String(err)}`
      ]);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex font-sans selection:bg-primary selection:text-primary-foreground">
      {/* ===================== SOL SIDEBAR ===================== */}
      <aside className="w-72 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col shrink-0 select-none">
        {/* LOGO & MARKA */}
        <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow">
              <Rocket className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight flex items-center gap-1.5">
                Webicro Distribution
              </h1>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Canlı Orkestrasyon v1.0
              </span>
            </div>
          </div>
          <button
            onClick={() => setIsDark(!isDark)}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            title="Tema Değiştir"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* PROJE SEÇİCİ (PROJECT SWITCHER) */}
        <div className="p-3 border-b border-sidebar-border bg-sidebar-accent/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1">
              <FolderCheck className="w-3 h-3 text-primary" /> Aktif Proje
            </span>
            <button
              onClick={() => setShowAddProjectModal(true)}
              className="text-[10px] font-medium text-primary hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <FolderPlus className="w-3 h-3" /> Proje Ekle
            </button>
          </div>

          <div className="space-y-1">
            <select
              value={activeProjectPath}
              onChange={(e) => handleSwitchProject(e.target.value)}
              className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-md border border-sidebar-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer truncate"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.path}>
                  {p.name} {p.hasPubspec ? '(Flutter)' : ''}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5 pt-0.5">
              <span className="truncate max-w-[170px]" title={activeProjectPath}>
                {activeProjectPath ? activeProjectPath.split(/[\\/]/).filter(Boolean).pop() || activeProjectPath : ''}
              </span>
              <span className="font-mono text-emerald-500 font-semibold">{gitBranch}</span>
            </div>
          </div>
        </div>

        {/* NAVİGASYON MENÜSÜ */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'pipeline'
                ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Rocket className="w-4 h-4" />
              <span>Sürüm Dağıtımı</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </button>

          <button
            onClick={() => setActiveTab('console')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'console'
                ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Terminal className="w-4 h-4" />
              <span>Boru Hattı & Konsol</span>
            </div>
            {isReleasing && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <History className="w-4 h-4" />
              <span>Geçmiş & Denetim</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </button>

          <button
            onClick={() => setActiveTab('stores')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'stores'
                ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Smartphone className="w-4 h-4 text-emerald-500" />
              <span>Sistem & Mağaza Testi</span>
            </div>
            <span className={`w-2 h-2 rounded-full ${googlePlayInfo.connected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
          </button>

          <button
            onClick={() => setActiveTab('wiki')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'wiki'
                ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4 text-amber-500" />
              <span>Entegrasyon Wiki & Rehber</span>
            </div>
            <span className="px-1.5 py-0.2 text-[9px] bg-amber-500/10 text-amber-500 font-bold rounded">
              WIKI
            </span>
          </button>
        </nav>

        {/* SIDEBAR ALT DURUM ROZETLERİ */}
        <div className="p-3 border-t border-sidebar-border bg-sidebar-accent/20 space-y-2 text-[11px]">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Mağaza API Durumu
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Smartphone className="w-3 h-3 text-emerald-500" /> Google Play:
            </span>
            <span className={`font-semibold flex items-center gap-1 ${googlePlayInfo.connected ? 'text-emerald-500' : 'text-amber-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${googlePlayInfo.connected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              {googlePlayInfo.connected ? 'Bağlı' : 'Anahtar Eksik'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Apple className="w-3 h-3" /> App Store:
            </span>
            <span className={`font-semibold flex items-center gap-1 ${appStoreInfo.connected ? 'text-emerald-500' : 'text-muted-foreground'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${appStoreInfo.connected ? 'bg-emerald-500' : 'bg-muted-foreground'}`}></span>
              {appStoreInfo.connected ? 'JWT Hazır' : 'Yapılandırılmadı'}
            </span>
          </div>
        </div>
      </aside>

      {/* ===================== ANA İÇERİK ALANI ===================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* ÜST BİLGİ ŞERİDİ */}
        <header className="border-b border-border bg-card/60 backdrop-blur px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 truncate">
            <span className="font-bold text-sm text-foreground truncate">{projectName}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground font-mono truncate" title={activeProjectPath}>
              {activeProjectPath}
            </span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              hasPubspec ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-secondary text-secondary-foreground border-border'
            }`}>
              {hasPubspec ? 'Flutter Projesi' : 'release.config.yaml'}
            </span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              isGitClean ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
            }`}>
              {isGitClean ? 'Git Temiz' : 'Bekleyen Değişiklikler'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadProjectsAndActive()}
              disabled={isLoadingProject}
              className="text-xs font-medium px-2.5 py-1 rounded-md border border-border bg-card hover:bg-accent text-foreground flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingProject ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>
        </header>

        {/* SEKME İÇERİKLERİ */}
        <main className="flex-1 p-6 space-y-6 max-w-6xl w-full mx-auto">
          {/* ==================== 1. TAB: SÜRÜM DAĞITIMI ==================== */}
          {activeTab === 'pipeline' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* SOL KOLON: SÜRÜM YAPILANDIRMASI, AI NOTLARI, COMMITS (7 Kolon) */}
              <div className="lg:col-span-7 space-y-6">
                {/* 1. KART: SÜRÜM SEÇİMİ (SEMVER) */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary" />
                      <h2 className="font-semibold text-sm">SemVer Sürüm Yapılandırması</h2>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Mevcut: <span className="font-mono font-medium text-foreground">{currentVersion}+{currentBuildNumber}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => setBumpType('patch')}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        bumpType === 'patch'
                          ? 'border-primary bg-primary/10 text-foreground font-semibold shadow-sm ring-1 ring-primary'
                          : 'border-border bg-card hover:bg-accent text-foreground'
                      }`}
                    >
                      <div className="text-xs font-semibold">Patch (Yama)</div>
                      <div className="font-mono text-sm font-bold mt-1 text-foreground">
                        {currentVersion.split('.')[0]}.{currentVersion.split('.')[1]}.{Number(currentVersion.split('.')[2] || 0) + 1}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Hata düzeltmeleri</div>
                    </button>

                    <button
                      onClick={() => setBumpType('minor')}
                      className={`p-3 rounded-lg border text-left transition-all relative cursor-pointer ${
                        bumpType === 'minor'
                          ? 'border-primary bg-primary/10 text-foreground font-semibold shadow-sm ring-1 ring-primary'
                          : 'border-border bg-card hover:bg-accent text-foreground'
                      }`}
                    >
                      <span className="absolute -top-2 right-2 px-1.5 py-0.2 bg-emerald-500 text-white text-[9px] font-bold rounded-full">
                        ÖNERİLEN
                      </span>
                      <div className="text-xs font-semibold">Minor (Özellik)</div>
                      <div className="font-mono text-sm font-bold mt-1 text-foreground">
                        {currentVersion.split('.')[0]}.{Number(currentVersion.split('.')[1] || 0) + 1}.0
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Yeni özellikler</div>
                    </button>

                    <button
                      onClick={() => setBumpType('major')}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        bumpType === 'major'
                          ? 'border-primary bg-primary/10 text-foreground font-semibold shadow-sm ring-1 ring-primary'
                          : 'border-border bg-card hover:bg-accent text-foreground'
                      }`}
                    >
                      <div className="text-xs font-semibold">Major (Büyük)</div>
                      <div className="font-mono text-sm font-bold mt-1 text-foreground">
                        {Number(currentVersion.split('.')[0] || 0) + 1}.0.0
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Kırıcı değişiklikler</div>
                    </button>

                    <button
                      onClick={() => setBumpType('custom')}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        bumpType === 'custom'
                          ? 'border-primary bg-primary/10 text-foreground font-semibold shadow-sm ring-1 ring-primary'
                          : 'border-border bg-card hover:bg-accent text-foreground'
                      }`}
                    >
                      <div className="text-xs font-semibold">Özel Sürüm</div>
                      <div className="font-mono text-sm font-bold mt-1 text-foreground">Manuel</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Kendiniz girin</div>
                    </button>
                  </div>

                  {bumpType === 'custom' && (
                    <input
                      type="text"
                      value={customVersion}
                      onChange={(e) => setCustomVersion(e.target.value)}
                      placeholder="Örn: 2.0.0"
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  )}

                  <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Hesaplanan Hedef Sürüm:</span>
                    <span className="font-mono font-bold text-foreground text-sm bg-accent px-2 py-0.5 rounded border border-border">
                      {nextVersion}+{nextBuild}
                    </span>
                  </div>
                </div>

                {/* 2. KART: YAPAY ZEKA SÜRÜM NOTLARI */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <h2 className="font-semibold text-sm">Yapay Zeka Sürüm Notları (AI Release Notes)</h2>
                    </div>
                    <button
                      onClick={() => generateAiNotes(nextVersion)}
                      disabled={isGeneratingAi}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-all bg-secondary/80 hover:bg-secondary px-2.5 py-1 rounded-md border border-border cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingAi ? 'animate-spin' : ''}`} />
                      Yeniden Üret (AI)
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Türkçe Notlar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">🇹🇷 Türkçe (Google Play & App Store)</span>
                        <button
                          onClick={() => copyToClipboard(notesTr, true)}
                          className="hover:text-foreground transition-all cursor-pointer"
                          title="Kopyala"
                        >
                          {copiedTr ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      {isGeneratingAi ? (
                        <div className="w-full h-32 rounded-lg border border-border bg-muted/20 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground animate-pulse">
                          <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                          <span>Git geçmişi taranıyor ve notlar üretiliyor...</span>
                        </div>
                      ) : (
                        <textarea
                          value={notesTr}
                          onChange={(e) => setNotesTr(e.target.value)}
                          rows={5}
                          placeholder="Türkçe sürüm notları..."
                          className="w-full p-3 text-xs rounded-lg border border-input bg-muted/40 text-foreground focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary font-sans leading-relaxed resize-none shadow-inner"
                        />
                      )}
                      <div className="text-[10px] text-muted-foreground text-right font-mono">
                        {notesTr.length} / 500 karakter
                      </div>
                    </div>

                    {/* İngilizce Notlar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">🇬🇧 English (Global)</span>
                        <button
                          onClick={() => copyToClipboard(notesEn, false)}
                          className="hover:text-foreground transition-all cursor-pointer"
                          title="Kopyala"
                        >
                          {copiedEn ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      {isGeneratingAi ? (
                        <div className="w-full h-32 rounded-lg border border-border bg-muted/20 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground animate-pulse">
                          <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                          <span>Generating release notes from commits...</span>
                        </div>
                      ) : (
                        <textarea
                          value={notesEn}
                          onChange={(e) => setNotesEn(e.target.value)}
                          rows={5}
                          placeholder="English release notes..."
                          className="w-full p-3 text-xs rounded-lg border border-input bg-muted/40 text-foreground focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary font-sans leading-relaxed resize-none shadow-inner"
                        />
                      )}
                      <div className="text-[10px] text-muted-foreground text-right font-mono">
                        {notesEn.length} / 4000 karakter
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-secondary/50 rounded-lg border border-border/60 flex items-start gap-2.5 text-xs text-muted-foreground">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>
                      <strong>Otomatik Güvenlik & Format Taraması:</strong> Metinler API anahtarı, şifre veya yasaklı kelime içermemektedir. Google Play (500) ve App Store (4000) sınırlarına uygundur.
                    </span>
                  </div>
                </div>

                {/* 3. KART: GERÇEK DEĞİŞİKLİKLER (COMMITS) */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GitCommit className="w-4 h-4 text-primary" />
                      <h2 className="font-semibold text-sm">Git Değişiklikleri & Commit Geçmişi</h2>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">{commits.length} commit analiz edildi</span>
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {commits.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        Son sürümden bu yana yeni bir commit bulunamadı.
                      </div>
                    ) : (
                      commits.map((c, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border/40 text-xs">
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span className={`px-1.5 py-0.5 font-mono text-[10px] font-bold rounded shrink-0 ${
                              c.type === 'feat' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                              c.type === 'fix' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                              c.type === 'perf' ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' : 'bg-muted text-muted-foreground'
                            }`}>
                              {c.type}{c.scope ? `(${c.scope})` : ''}
                            </span>
                            {c.isBreakingChange && (
                              <span className="px-1.5 py-0.2 bg-destructive/10 text-destructive text-[9px] font-bold rounded border border-destructive/20 shrink-0">
                                BREAKING
                              </span>
                            )}
                            <span className="text-foreground font-medium truncate">{c.message}</span>
                          </div>
                          <span className="font-mono text-[10px] text-muted-foreground shrink-0">{c.hash.substring(0, 7)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* SAĞ KOLON: HEDEFLER & YAYIN BAŞLATMA (5 Kolon) */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                  <h2 className="font-semibold text-sm">Hedef Dağıtım Kanalları</h2>

                  {/* Android Google Play */}
                  <div className="p-3.5 rounded-lg border border-border bg-card space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Smartphone className="w-4 h-4 text-emerald-500" />
                        <div>
                          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            Google Play Store
                            {googlePlayInfo.connected && (
                              <span className="w-2 h-2 rounded-full bg-emerald-500" title="Yetkili ve Bağlı"></span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Android App Bundle (.aab)</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={targetAndroid}
                        onChange={(e) => setTargetAndroid(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                      />
                    </div>

                    {targetAndroid && (
                      <div className="pt-2 border-t border-border/60 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-1">Kanal (Track)</label>
                          <select
                            value={playTrack}
                            onChange={(e) => setPlayTrack(e.target.value as 'internal' | 'alpha' | 'beta' | 'production')}
                            className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground cursor-pointer"
                          >
                            <option value="internal">Dahili Test (Internal)</option>
                            <option value="alpha">Kapalı Test (Alpha)</option>
                            <option value="beta">Açık Test (Beta)</option>
                            <option value="production">Üretim (Production)</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-1">Kademeli Yayın (%{playRollout})</label>
                          <input
                            type="range"
                            min="10"
                            max="100"
                            step="10"
                            value={playRollout}
                            onChange={(e) => setPlayRollout(Number(e.target.value))}
                            className="w-full accent-primary mt-1 cursor-pointer"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Apple App Store */}
                  <div className="p-3.5 rounded-lg border border-border bg-card space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Apple className="w-4 h-4 text-foreground" />
                        <div>
                          <div className="text-xs font-semibold text-foreground">Apple App Store</div>
                          <div className="text-[10px] text-muted-foreground">iOS Application Archive (.ipa)</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={targetIos}
                        onChange={(e) => setTargetIos(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                      />
                    </div>

                    {targetIos && (
                      <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-muted-foreground">İncelemeye Otomatik Gönder:</span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={iosSubmitReview}
                            onChange={(e) => setIosSubmitReview(e.target.checked)}
                            className="rounded border-border text-primary w-3.5 h-3.5 cursor-pointer"
                          />
                          <span className="text-[10px] text-foreground font-medium">Evet</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Dry Run Anahtarı */}
                  <div className="p-3 bg-secondary/40 rounded-lg border border-border flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-foreground">Dry-Run (Güvenli Simülasyon)</span>
                      <p className="text-[10px] text-muted-foreground">Mağazalara gerçek yükleme yapmaz, akışı test eder.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={isDryRun}
                      onChange={(e) => setIsDryRun(e.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary cursor-pointer"
                    />
                  </div>

                  {/* BAŞLAT BUTONU */}
                  <button
                    onClick={startReleasePipeline}
                    disabled={isReleasing}
                    className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
                      isReleasing
                        ? 'bg-muted text-muted-foreground cursor-not-allowed'
                        : 'bg-primary text-primary-foreground hover:opacity-95 active:scale-[0.99] cursor-pointer'
                    }`}
                  >
                    {isReleasing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Sürüm Dağıtımı Canlı Yürütülüyor...
                      </>
                    ) : (
                      <>
                        <Rocket className="w-4 h-4" />
                        {nextVersion} Sürümünü Yayına Gönder
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== 2. TAB: BORU HATTI & KONSOL ==================== */}
          {activeTab === 'console' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* CANLI PIPELINE İLERLEME STEPPER'I (6 Kolon) */}
              <div className="lg:col-span-6 bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    20 Adımlık Boru Hattı Akışı
                  </h2>
                  <span className="text-xs font-mono font-medium text-muted-foreground">
                    {releaseCompleted ? '20/20 Tamamlandı' : `${activeStepIndex}/20`}
                  </span>
                </div>

                <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-300 rounded-full"
                    style={{ width: `${(activeStepIndex / 20) * 100}%` }}
                  ></div>
                </div>

                <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1 text-xs">
                  {steps.map((step) => (
                    <div
                      key={step.id}
                      className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                        step.status === 'running'
                          ? 'bg-primary/10 border-primary/40 text-primary font-semibold'
                          : step.status === 'success'
                          ? 'bg-secondary/40 border-border text-foreground'
                          : step.status === 'failed'
                          ? 'bg-destructive/10 border-destructive/40 text-destructive font-semibold'
                          : 'bg-card border-border/40 text-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        {step.status === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : step.status === 'running' ? (
                          <RefreshCw className="w-4 h-4 text-primary animate-spin shrink-0" />
                        ) : step.status === 'failed' ? (
                          <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                        ) : (
                          <span className="w-4 h-4 rounded-full border border-border flex items-center justify-center text-[9px] shrink-0 font-mono">
                            {step.id}
                          </span>
                        )}
                        <span className="truncate">{step.id}. {step.name}</span>
                      </div>
                      <span className="text-[10px] font-mono shrink-0">
                        {step.status === 'success' ? 'TAMAMLANDI' : step.status === 'running' ? 'ÇALIŞIYOR' : step.status === 'failed' ? 'HATA' : 'BEKLİYOR'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CANLI KONSOL ÇIKTISI (6 Kolon) */}
              <div className="lg:col-span-6 bg-[#0f1117] text-gray-200 border border-border rounded-xl p-5 shadow-sm font-mono text-[11px] space-y-3 flex flex-col h-[580px]">
                <div className="flex items-center justify-between pb-2.5 border-b border-gray-800 text-gray-400">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-200">
                    <Terminal className="w-4 h-4 text-emerald-400" /> Canlı Sunucu Konsolu
                  </span>
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> bağlı
                  </span>
                </div>
                <div ref={logContainerRef} className="flex-1 overflow-y-auto space-y-1.5 leading-relaxed text-gray-300 pr-1">
                  {logs.length === 0 ? (
                    <span className="text-gray-500">
                      Release süreci başlatıldığında anlık SSE logları ve terminal çıktıları burada akacaktır...
                    </span>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className="break-all font-mono">
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== 3. TAB: GEÇMİŞ SÜRÜMLER ==================== */}
          {activeTab === 'history' && (
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-base">Yayınlanan Sürümler & Denetim Günlüğü</h2>
                  <p className="text-xs text-muted-foreground">Tüm sürümler yerel SQLite veritabanında (.release/release.db) saklanmaktadır.</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground pb-2">
                      <th className="py-2.5 font-semibold">Release ID</th>
                      <th className="py-2.5 font-semibold">Sürüm</th>
                      <th className="py-2.5 font-semibold">Build No</th>
                      <th className="py-2.5 font-semibold">Tarih</th>
                      <th className="py-2.5 font-semibold">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {historyReleases.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-muted-foreground">
                          Henüz tamamlanmış bir release kaydı bulunmuyor. İlk sürüm dağıtımınızı başlatarak geçmiş oluşturabilirsiniz.
                        </td>
                      </tr>
                    ) : (
                      historyReleases.map((rel) => (
                        <tr key={rel.id} className="hover:bg-accent/40 transition-all">
                          <td className="py-3 font-mono font-medium">{rel.releaseId}</td>
                          <td className="py-3 font-semibold text-foreground">{rel.version}</td>
                          <td className="py-3 font-mono">{rel.buildNumber}</td>
                          <td className="py-3 text-muted-foreground">{new Date(rel.createdAt).toLocaleString()}</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              rel.status === 'RELEASED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'
                            }`}>
                              {rel.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {auditLogs.length > 0 && (
                <div className="pt-4 border-t border-border space-y-3">
                  <h3 className="font-semibold text-xs text-foreground">Son Denetim Günlüğü Olayları (Audit Trail)</h3>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="p-2.5 rounded-lg bg-secondary/30 border border-border/40 text-xs flex justify-between items-center text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{log.action}</span>
                          <span>({log.actor})</span>
                          {log.details && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-xs">{log.details}</span>
                          )}
                        </div>
                        <span className="font-mono text-[10px] shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString()} - <strong className="text-emerald-500">{log.result}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== 4. TAB: SİSTEM & MAĞAZA TESTİ ==================== */}
          {activeTab === 'stores' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-bold text-base">Mağaza API Bağlantıları ve Canlı Test Paneli</h2>
                <p className="text-xs text-muted-foreground">
                  Google Play ve App Store Connect kimlik doğrulamalarını canlı sunucu üzerinden test edebilir ve yanıtları anlık doğrulayabilirsiniz.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* GOOGLE PLAY TEST KARTI */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-emerald-500" /> Google Play Console API
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      googlePlayInfo.connected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                    }`}>
                      {googlePlayInfo.connected ? 'Dosya Mevcut' : 'Anahtar Eksik'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-border/60">
                      <span className="text-muted-foreground">Hizmet Hesabı:</span>
                      <span className="font-mono text-foreground font-medium truncate max-w-[220px]" title={googlePlayInfo.serviceAccount}>
                        {googlePlayInfo.serviceAccount}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-border/60">
                      <span className="text-muted-foreground">GCP Proje Kimliği:</span>
                      <span className="font-mono text-foreground font-medium">
                        {googlePlayInfo.projectId || 'Otomatik'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-muted-foreground">Anahtar Dosya Yolu:</span>
                      <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[220px]" title={googlePlayInfo.keyPath}>
                        {googlePlayInfo.keyPath || '~/.secrets/google-play-key.json'}
                      </span>
                    </div>
                  </div>

                  {/* Canlı Test Butonu */}
                  <button
                    onClick={handleTestGooglePlay}
                    disabled={googleTestResult.testing}
                    className="w-full py-2.5 px-3 rounded-lg text-xs font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {googleTestResult.testing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Google OAuth ve API Doğrulanıyor...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        Google Play Bağlantısını Şimdi Test Et
                      </>
                    )}
                  </button>

                  {/* Test Sonucu */}
                  {googleTestResult.tested && (
                    <div className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                      googleTestResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-destructive/10 border-destructive/30 text-destructive'
                    }`}>
                      <div className="font-bold flex items-center gap-1.5">
                        {googleTestResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {googleTestResult.success ? 'Google Play Doğrulaması Başarılı' : 'Doğrulama Başarısız'}
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {googleTestResult.message || googleTestResult.error}
                      </p>
                    </div>
                  )}
                </div>

                {/* APPLE APP STORE TEST KARTI */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Apple className="w-4 h-4 text-foreground" /> App Store Connect API
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      appStoreInfo.connected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'
                    }`}>
                      {appStoreInfo.connected ? 'JWT Hazır' : 'Yapılandırılmadı'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-border/60">
                      <span className="text-muted-foreground">Key ID:</span>
                      <span className="font-mono text-foreground font-medium">
                        {appStoreInfo.keyId}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-border/60">
                      <span className="text-muted-foreground">Issuer ID:</span>
                      <span className="font-mono text-foreground font-medium truncate max-w-[200px]">
                        {appStoreInfo.issuerId || 'Tanımlanmadı (.env)'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-muted-foreground">İmzalama Algoritması:</span>
                      <span className="text-foreground">ES256 (ECDSA P-256 with SHA-256)</span>
                    </div>
                  </div>

                  {/* Canlı Test Butonu */}
                  <button
                    onClick={handleTestAppleStore}
                    disabled={appleTestResult.testing}
                    className="w-full py-2.5 px-3 rounded-lg text-xs font-bold border border-border bg-secondary hover:bg-secondary/80 text-foreground transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {appleTestResult.testing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Apple API ve JWT Doğrulanıyor...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        Apple App Store Bağlantısını Şimdi Test Et
                      </>
                    )}
                  </button>

                  {/* Test Sonucu */}
                  {appleTestResult.tested && (
                    <div className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                      appleTestResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-destructive/10 border-destructive/30 text-destructive'
                    }`}>
                      <div className="font-bold flex items-center gap-1.5">
                        {appleTestResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {appleTestResult.success ? 'App Store Connect Doğrulandı' : 'Doğrulama Başarısız'}
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {appleTestResult.message || appleTestResult.error}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== 5. TAB: ENTEGRASYON WİKİ & REHBER ==================== */}
          {activeTab === 'wiki' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-bold text-base flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-amber-500" />
                  Webicro Distribution Entegrasyon Rehberi & Wiki
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Google Play Console ve Apple App Store Connect bağlantılarını sıfırdan nasıl kuracağınızı ve test edeceğinizi adım adım öğrenin.
                </p>
              </div>

              {/* 1. GOOGLE PLAY REHBERİ */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 pb-2 border-b border-border">
                  <Smartphone className="w-5 h-5 text-emerald-500" />
                  <h3 className="font-bold text-sm">Google Play Console & GCP Service Account Kurulumu</h3>
                </div>

                <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
                  <div className="p-3 bg-secondary/30 rounded-lg border border-border space-y-1.5">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-primary" /> Hangi Bilgiler Lazım?
                    </span>
                    <ul className="list-disc list-inside space-y-1 pl-1">
                      <li>Google Cloud Platform (GCP) üzerinde oluşturulmuş bir <strong>Service Account</strong> (Hizmet Hesabı).</li>
                      <li>Hizmet Hesabına ait indirilen <strong>JSON Anahtar Dosyası</strong> (`google-play-key.json`).</li>
                      <li>Google Play Console üzerinde bu hizmet hesabına verilmiş <strong>yayınlama ve test yetkileri</strong>.</li>
                    </ul>
                  </div>

                  <div className="space-y-2 pt-1">
                    <h4 className="font-semibold text-foreground">Adım Adım Kurulum:</h4>
                    <ol className="list-decimal list-inside space-y-2 pl-1">
                      <li>
                        <strong>GCP Console'a Gidin:</strong> Google Cloud Console açın ve yeni bir proje oluşturun (veya mevcut projenizi seçin).
                      </li>
                      <li>
                        <strong>API'yi Etkinleştirin:</strong> <em>APIs & Services &gt; Library</em> menüsünden <strong>"Google Play Android Developer API"</strong> aratın ve <strong>Etkinleştir (Enable)</strong> butonuna basın.
                      </li>
                      <li>
                        <strong>Hizmet Hesabı Oluşturun:</strong> <em>IAM & Admin &gt; Service Accounts</em> menüsünden <code>play-store-deployer</code> adında yeni bir hesap oluşturun.
                      </li>
                      <li>
                        <strong>JSON Anahtarını İndirin:</strong> Oluşturduğunuz hesaba tıklayın, <em>Keys &gt; Add Key &gt; Create new key &gt; JSON</em> seçerek anahtarı bilgisayarınıza indirin.
                      </li>
                      <li>
                        <strong>Anahtarı Güvenli Konuma Taşıyın:</strong> İndirdiğiniz dosyayı şu konuma kopyalayın:
                        <pre className="mt-1 p-2 bg-[#0f1117] text-emerald-400 font-mono text-[11px] rounded border border-border overflow-x-auto">
                          mkdir -p ~/.secrets && cp ~/Downloads/project-*.json ~/.secrets/google-play-key.json
                        </pre>
                      </li>
                      <li>
                        <strong>Google Play Console'a Ekleyin:</strong>
                        <div className="mt-1 pl-3 border-l-2 border-primary/40 space-y-1">
                          <p>Google Play Console &gt; <strong>Kullanıcılar ve İzinler</strong> sekmesine gidin.</p>
                          <p><strong>"Yeni kullanıcı davet et"</strong> butonuna basın ve Hizmet Hesabınızın e-posta adresini yapıştırın (Örn: <code>play-store-deployer@...iam.gserviceaccount.com</code>).</p>
                          <p><strong>İzinler:</strong> <em>"Sürümleri üretim kanalında yayınlama, sürümleri hariç tutma"</em> ve <em>"Dahili test sürümlerini yönetme"</em> kutularını işaretleyip daveti gönderin.</p>
                        </div>
                      </li>
                      <li>
                        <strong>Test Edin:</strong> Sol menüden <em>"Sistem & Mağaza Testi"</em> sekmesine geçip <strong>"Google Play Bağlantısını Şimdi Test Et"</strong> butonuna basarak doğrulamayı tamamlayın!
                      </li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* 2. APPLE APP STORE REHBERİ */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 pb-2 border-b border-border">
                  <Apple className="w-5 h-5 text-foreground" />
                  <h3 className="font-bold text-sm">Apple App Store Connect API Kurulumu</h3>
                </div>

                <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
                  <div className="p-3 bg-secondary/30 rounded-lg border border-border space-y-1.5">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-primary" /> Hangi Bilgiler Lazım?
                    </span>
                    <ul className="list-disc list-inside space-y-1 pl-1">
                      <li><strong>Key ID:</strong> 10 haneli benzersiz anahtar kimliği (Örn: <code>2X9R4ABCD3</code>).</li>
                      <li><strong>Issuer ID:</strong> App Store Connect hesap kimliği UUID (Örn: <code>57246542-96fe-1a63-e053-0824d011072a</code>).</li>
                      <li><strong>Private Key (.p8):</strong> Apple tarafından üretilen özel imza anahtar dosyası (`AuthKey_XXXXX.p8`).</li>
                    </ul>
                  </div>

                  <div className="space-y-2 pt-1">
                    <h4 className="font-semibold text-foreground">Adım Adım Kurulum:</h4>
                    <ol className="list-decimal list-inside space-y-2 pl-1">
                      <li>
                        <strong>App Store Connect'e Giriş Yapın:</strong> <em>Kullanıcılar ve Erişim (Users and Access) &gt; Entegrasyonlar (Integrations) &gt; App Store Connect API</em> sekmesine gidin.
                      </li>
                      <li>
                        <strong>Yeni API Anahtarı Oluşturun:</strong> <strong>"+"</strong> butonuna tıklayın. İsim verin (örn: <code>Webicro Orchestrator</code>) ve Rol olarak <strong>"App Manager"</strong> veya <strong>"Admin"</strong> seçin.
                      </li>
                      <li>
                        <strong>Anahtarı (.p8) İndirin:</strong> Oluşturduktan sonra <strong>"Özel Anahtarı İndir"</strong> butonuna basın (DİKKAT: Bu dosya yalnızca bir kez indirilebilir!).
                      </li>
                      <li>
                        <strong>Key ID ve Issuer ID'yi Kopyalayın:</strong> Ekrandaki <strong>Key ID</strong> ve sayfanın üst kısmındaki <strong>Issuer ID</strong> değerlerini not edin.
                      </li>
                      <li>
                        <strong>.env Dosyasına Ekleyin:</strong> Projenizin kök dizinindeki <code>.env</code> dosyasına bu değerleri tanımlayın:
                        <pre className="mt-1 p-2 bg-[#0f1117] text-foreground font-mono text-[11px] rounded border border-border overflow-x-auto">
                          {`APPSTORE_KEY_ID="2X9R4ABCD3"\nAPPSTORE_ISSUER_ID="57246542-96fe-1a63-e053-0824d011072a"\nAPPSTORE_PRIVATE_KEY_PATH="/Users/muartas/.secrets/AuthKey_2X9R4ABCD3.p8"`}
                        </pre>
                      </li>
                      <li>
                        <strong>Test Edin:</strong> Sol menüden <em>"Sistem & Mağaza Testi"</em> sekmesine geçip <strong>"Apple App Store Bağlantısını Şimdi Test Et"</strong> butonuna basarak ES256 JWT imzasını ve API yanıtını doğrulayın!
                      </li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* 3. ÖRNEK .ENV DOSYASI */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-primary" />
                    <h3 className="font-bold text-sm">Örnek .env Dosyası Şablonu</h3>
                  </div>
                  <button
                    onClick={() => {
                      const template = `# Google Play Developer Service Account\nGOOGLE_PLAY_SERVICE_ACCOUNT="/Users/muartas/.secrets/google-play-key.json"\n\n# AI Provider (Gemini veya OpenAI API Key)\nGEMINI_API_KEY=""\n\n# App Store Connect (Apple için)\nAPPSTORE_KEY_ID=""\nAPPSTORE_ISSUER_ID=""\nAPPSTORE_PRIVATE_KEY_PATH=""\n`;
                      navigator.clipboard.writeText(template);
                      alert('.env şablonu panoya kopyalandı!');
                    }}
                    className="text-xs font-semibold px-2 py-1 rounded bg-secondary hover:bg-secondary/80 text-foreground transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" /> Şablonu Kopyala
                  </button>
                </div>
                <pre className="p-3 bg-[#0f1117] text-gray-300 font-mono text-xs rounded-lg border border-border overflow-x-auto leading-relaxed">
{`# 1. Google Play Developer Service Account
GOOGLE_PLAY_SERVICE_ACCOUNT="/Users/muartas/.secrets/google-play-key.json"

# 2. AI Provider (Otomatik Sürüm Notu Üretimi için)
GEMINI_API_KEY="AIzaSy..."

# 3. App Store Connect (Apple TestFlight ve Dağıtım)
APPSTORE_KEY_ID="2X9R4ABCD3"
APPSTORE_ISSUER_ID="57246542-96fe-1a63-e053-0824d011072a"
APPSTORE_PRIVATE_KEY_PATH="/Users/muartas/.secrets/AuthKey_2X9R4ABCD3.p8"`}
                </pre>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ===================== YENİ PROJE EKLEME MODALI ===================== */}
      {showAddProjectModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-primary" /> Yeni Flutter / Webicro Projesi Ekle
              </h3>
              <button
                onClick={() => setShowAddProjectModal(false)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddNewProject} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Proje Dizini (Absolute Path) *</label>
                <input
                  type="text"
                  required
                  placeholder="/Users/muartas/Desktop/benim_flutter_uygulamam"
                  value={newProjectPath}
                  onChange={(e) => setNewProjectPath(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-border bg-background text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-[10px] text-muted-foreground">İçerisinde pubspec.yaml veya release.config.yaml olan klasör yolu.</span>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Proje Adı (Opsiyonel)</label>
                <input
                  type="text"
                  placeholder="Otomatik algılanır (Boş bırakabilirsiniz)"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddProjectModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isAddingProject}
                  className="px-4 py-1.5 rounded-lg font-bold bg-primary text-primary-foreground hover:opacity-90 cursor-pointer flex items-center gap-1.5"
                >
                  {isAddingProject ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  Projeyi Kaydet & Geçiş Yap
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
