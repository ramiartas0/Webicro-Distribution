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
  BookOpen,
  ChevronRight,
  FolderPlus,
  Play,
  Key,
  Code2,
  X,
  Info
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

export interface StoreComparison {
  googlePlay: {
    status: 'live' | 'not_found' | 'auth_error' | 'not_configured';
    versionCode?: number;
    track?: string;
    message?: string;
  };
  appStore: {
    status: 'live' | 'not_found' | 'auth_error' | 'not_configured';
    version?: string;
    buildNumber?: string;
    message?: string;
  };
  comparisonStatus: 'UPDATE_READY' | 'UP_TO_DATE' | 'NEW_APP' | 'UNKNOWN';
  badge: string;
  summary: string;
}

export interface ProjectEntry {
  id: string;
  name: string;
  path: string;
  hasPubspec: boolean;
  package?: string;
  version?: string;
  buildNumber?: number;
  stores?: StoreComparison;
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
  
  // Proje Listesi ve Aktif Proje
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [activeProjectPath, setActiveProjectPath] = useState<string>('');
  const [isSyncingStores, setIsSyncingStores] = useState<boolean>(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState<boolean>(false);
  const [newProjectPath, setNewProjectPath] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [isAddingProject, setIsAddingProject] = useState<boolean>(false);

  // Modallar
  const [showStoreTestModal, setShowStoreTestModal] = useState<boolean>(false);
  const [showWikiModal, setShowWikiModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  // Proje Detayları
  const [projectName, setProjectName] = useState<string>('Webicro Distribution');
  const [projectPackage, setProjectPackage] = useState<string>('com.webicro.app');
  const [gitBranch, setGitBranch] = useState<string>('main');
  const [currentVersion, setCurrentVersion] = useState<string>('1.0.0');
  const [currentBuildNumber, setCurrentBuildNumber] = useState<number>(1);
  const [bumpType, setBumpType] = useState<'patch' | 'minor' | 'major' | 'custom'>('minor');
  const [customVersion, setCustomVersion] = useState<string>('');
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [hasPubspec, setHasPubspec] = useState<boolean>(false);
  const [isGitClean, setIsGitClean] = useState<boolean>(true);
  const [activeComparison, setActiveComparison] = useState<StoreComparison | null>(null);

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
    issuerId: string;
  }>({
    connected: false,
    keyId: 'Yapılandırılmadı',
    issuerId: 'Yapılandırılmadı',
  });

  // Test Sonuçları
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

  // Dağıtım Form Seçenekleri
  const [targetAndroid, setTargetAndroid] = useState<boolean>(true);
  const [targetIos, setTargetIos] = useState<boolean>(true);
  const [googleTrack, setGoogleTrack] = useState<'internal' | 'alpha' | 'beta' | 'production'>('internal');
  const [rolloutPercentage, setRolloutPercentage] = useState<number>(100);
  const [isDryRun, setIsDryRun] = useState<boolean>(false);

  // AI Sürüm Notları
  const [releaseNotesTR, setReleaseNotesTR] = useState<string>('• Hata düzeltmeleri ve kararlılık iyileştirmeleri yapıldı.');
  const [releaseNotesEN, setReleaseNotesEN] = useState<string>('• Bug fixes and stability improvements.');
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [copiedLang, setCopiedLang] = useState<'tr' | 'en' | null>(null);

  // Canlı Boru Hattı Durumu
  const [isReleasing, setIsReleasing] = useState<boolean>(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [releaseCompleted, setReleaseCompleted] = useState<boolean>(false);

  // Geçmiş ve Denetim Kayıtları
  const [historyReleases, setHistoryReleases] = useState<ReleaseHistoryItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // 20 Adımlık Boru Hattı
  const initialSteps: PipelineStep[] = [
    { id: 1, name: 'Ortam ve Konfigürasyon Doğrulama', status: 'pending' },
    { id: 2, name: 'Veritabanı ve Migration Başlatma', status: 'pending' },
    { id: 3, name: 'Sürüm ID Üretimi (REL-XXX)', status: 'pending' },
    { id: 4, name: 'Git Çalışma Ağacı ve Tag Analizi', status: 'pending' },
    { id: 5, name: 'SemVer ve Build Çözümleme', status: 'pending' },
    { id: 6, name: 'Sürüm Dağıtım Planı Oluşturma', status: 'pending' },
    { id: 7, name: 'CHANGELOG.md Markdown Üretimi', status: 'pending' },
    { id: 8, name: 'AI Sürüm Notları Oluşturma (Gemini/OpenAI)', status: 'pending' },
    { id: 9, name: 'Mağaza Karakter ve Güvenlik Validasyonu', status: 'pending' },
    { id: 10, name: 'pubspec.yaml Versiyon Güncelleme', status: 'pending' },
    { id: 11, name: 'Flutter Doctor ve Statik Kod Analizi', status: 'pending' },
    { id: 12, name: 'Birim ve Entegrasyon Testleri (flutter test)', status: 'pending' },
    { id: 13, name: 'Android Release AAB Derleme', status: 'pending' },
    { id: 14, name: 'Android Artifact SHA-256 Hashing', status: 'pending' },
    { id: 15, name: 'iOS Release IPA Derleme (macOS)', status: 'pending' },
    { id: 16, name: 'iOS Artifact SHA-256 Hashing', status: 'pending' },
    { id: 17, name: 'Google Play Console Developer API Yükleme', status: 'pending' },
    { id: 18, name: 'Apple App Store Connect API Yükleme', status: 'pending' },
    { id: 19, name: 'Onay ve İnceleme Gönderimi', status: 'pending' },
    { id: 20, name: 'Denetim Günlüğü ve Dağıtım Tamamlama', status: 'pending' },
  ];

  const [steps, setSteps] = useState<PipelineStep[]>(initialSteps);

  // Otomatik aşağı kaydırma
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Tema Değişimi
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Sürüm Hesaplama
  const calculateNextVersion = useCallback(() => {
    if (bumpType === 'custom' && customVersion) return customVersion;
    const parts = currentVersion.split('.').map((p) => parseInt(p, 10) || 0);
    const major = parts[0] ?? 1;
    const minor = parts[1] ?? 0;
    const patch = parts[2] ?? 0;

    if (bumpType === 'major') return `${major + 1}.0.0`;
    if (bumpType === 'minor') return `${major}.${minor + 1}.0`;
    return `${major}.${minor}.${patch + 1}`;
  }, [bumpType, customVersion, currentVersion]);

  const nextVersion = calculateNextVersion();
  const nextBuildNumber = currentBuildNumber + 1;

  // 1. PROJELERİ VE AKTİF PROJE DETAYLARINI ÇEK
  const loadProjectsAndActive = useCallback(async () => {
    try {
      const pRes = await fetch('/api/projects');
      if (pRes.ok) {
        const pData = await pRes.json() as { activePath: string; projects: ProjectEntry[] };
        setProjects(pData.projects || []);
        setActiveProjectPath(pData.activePath);
      }
      await fetchProjectDetails();
    } catch (err) {
      console.error('Projeler yüklenemedi:', err);
    }
  }, []);

  const fetchProjectDetails = async () => {
    try {
      const res = await fetch('/api/project');
      if (!res.ok) return;
      const data = await res.json() as {
        project?: {
          name: string;
          package?: string;
          currentVersion: string;
          currentBuildNumber: number;
          suggestedVersion: string;
          branch: string;
          isClean: boolean;
          hasPubspec: boolean;
        };
        commits?: CommitItem[];
        comparison?: StoreComparison;
        stores?: {
          googlePlay: {
            connected: boolean;
            serviceAccount: string;
            projectId?: string;
            keyPath?: string;
          };
          appStore: {
            connected: boolean;
            keyId: string;
            issuerId: string;
          };
        };
      };

      if (data.project) {
        setProjectName(data.project.name);
        setProjectPackage(data.project.package || 'com.webicro.app');
        setCurrentVersion(data.project.currentVersion);
        setCurrentBuildNumber(data.project.currentBuildNumber);
        setGitBranch(data.project.branch);
        setIsGitClean(data.project.isClean);
        setHasPubspec(data.project.hasPubspec);
      }

      if (data.commits) {
        setCommits(data.commits);
      }

      if (data.comparison) {
        setActiveComparison(data.comparison);
      }

      if (data.stores) {
        setGooglePlayInfo(data.stores.googlePlay);
        setAppStoreInfo(data.stores.appStore);
      }
    } catch (err) {
      console.error('Proje detayı alınamadı:', err);
    }
  };

  useEffect(() => {
    void loadProjectsAndActive();
  }, [loadProjectsAndActive]);

  // CANLI MAĞAZA SENKRONİZASYONU
  const handleSyncStores = async () => {
    setIsSyncingStores(true);
    try {
      const res = await fetch('/api/projects/sync-stores', { method: 'POST' });
      if (res.ok) {
        const data = await res.json() as { projects?: ProjectEntry[] };
        if (data.projects) {
          setProjects(data.projects);
        }
        await fetchProjectDetails();
      }
    } catch (err) {
      console.error('Mağaza senkronizasyonu hatası:', err);
    } finally {
      setIsSyncingStores(false);
    }
  };

  // PROJE DEĞİŞTİR
  const handleSwitchProject = async (targetPath: string) => {
    if (targetPath === activeProjectPath) return;
    try {
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
    }
  };

  // YENİ PROJE EKLE
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

  // GEÇMİŞ SÜRÜMLERİ YÜKLE
  const loadHistory = async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json() as { releases?: ReleaseHistoryItem[]; auditLogs?: AuditLogItem[] };
        setHistoryReleases(data.releases || []);
        setAuditLogs(data.auditLogs || []);
      }
    } catch (err) {
      console.error('Geçmiş yüklenemedi:', err);
    }
  };

  // GOOGLE PLAY TESTİ
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

  // APPLE APP STORE TESTİ
  const handleTestAppleStore = async () => {
    setAppleTestResult({ testing: true, tested: false, success: false });
    try {
      const res = await fetch('/api/stores/test-apple', { method: 'POST' });
      const data = await res.json() as {
        success: boolean;
        message?: string;
        error?: string;
        stage?: string;
        keyId?: string;
        issuerId?: string;
        appCount?: number;
        sampleApps?: Array<{ name: string; bundleId: string }>;
        missingFields?: string[];
        tip?: string;
      };
      setAppleTestResult({
        testing: false,
        tested: true,
        success: data.success,
        message: data.message,
        error: data.error,
        details: data as unknown as Record<string, unknown>,
      });
      if (data.keyId) {
        setAppStoreInfo((prev) => ({
          ...prev,
          connected: data.success,
          keyId: data.keyId || prev.keyId,
          issuerId: data.issuerId || prev.issuerId,
        }));
      }
    } catch (err) {
      setAppleTestResult({
        testing: false,
        tested: true,
        success: false,
        error: `Sunucu bağlantı hatası: ${String(err)}`,
      });
    }
  };

  // AI SÜRÜM NOTLARI ÜRETİMİ
  const handleGenerateAI = async () => {
    setIsGeneratingAI(true);
    try {
      const response = await fetch('/api/ai/release-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commits, version: nextVersion }),
      });
      if (response.ok) {
        const data = await response.json() as { notes?: { tr?: { full: string[] }; en?: { full: string[] } } };
        if (data.notes?.tr?.full) {
          setReleaseNotesTR(data.notes.tr.full.map((item: string) => `• ${item}`).join('\n'));
        }
        if (data.notes?.en?.full) {
          setReleaseNotesEN(data.notes.en.full.map((item: string) => `• ${item}`).join('\n'));
        }
      }
    } catch (err) {
      console.error('AI notları üretilemedi:', err);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleCopyNotes = (lang: 'tr' | 'en') => {
    const text = lang === 'tr' ? releaseNotesTR : releaseNotesEN;
    void navigator.clipboard.writeText(text);
    setCopiedLang(lang);
    setTimeout(() => setCopiedLang(null), 2000);
  };

  // DAĞITIMI BAŞLAT (ORCHESTRATOR)
  const handleStartRelease = async () => {
    if (isReleasing) return;

    setIsReleasing(true);
    setReleaseCompleted(false);
    setActiveStepIndex(0);
    setSteps(initialSteps);
    setLogs([
      `[${new Date().toLocaleTimeString()}] 🚀 Sürüm dağıtım orkestrasyonu başlatıldı...`,
      `[${new Date().toLocaleTimeString()}] 📦 Hedef Sürüm: ${nextVersion}+${nextBuildNumber}`,
      `[${new Date().toLocaleTimeString()}] 📂 Proje: ${projectName} (${activeProjectPath})`,
    ]);

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
          void handleSyncStores();
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
      {/* ===================== SOL SIDEBAR (STORE KARŞILAŞTIRMALI PROJELER) ===================== */}
      <aside className="w-80 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col shrink-0 select-none h-screen">
        {/* LOGO & MARKA */}
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow">
                <Rocket className="w-4 h-4" />
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-tight">Webicro Distribution</h1>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Store Karşılaştırma İstasyonu
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

          {/* EYLEMLER: MAĞAZA SENKRONİZE ET & PROJE EKLE */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleSyncStores()}
              disabled={isSyncingStores}
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-all border border-border cursor-pointer disabled:opacity-60"
              title="Google Play ve App Store API'lerini sorgula ve sürümleri karşılaştır"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingStores ? 'animate-spin text-primary' : ''}`} />
              <span>{isSyncingStores ? 'Taranıyor...' : 'Mağazaları Tara'}</span>
            </button>

            <button
              onClick={() => setShowAddProjectModal(true)}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all shadow-sm cursor-pointer"
              title="Sistemden Yeni Proje Dizini Ekle"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Ekle</span>
            </button>
          </div>
        </div>

        {/* PROJELER LİSTESİ BAŞLIĞI */}
        <div className="px-3 pt-3 pb-1 flex items-center justify-between text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-primary" />
            Projeler ({projects.length})
          </span>
          <span className="text-[10px] lowercase text-emerald-500 font-mono">store live</span>
        </div>

        {/* PROJE KARTLARI (STORE KARŞILAŞTIRMALI) */}
        <div className="flex-1 p-2 space-y-2 overflow-y-auto">
          {projects.map((p) => {
            const isSelected = p.path === activeProjectPath;
            const comp = p.stores;
            return (
              <div
                key={p.id}
                onClick={() => void handleSwitchProject(p.path)}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-sidebar-accent border-primary ring-1 ring-primary/20 shadow-sm'
                    : 'border-sidebar-border bg-sidebar hover:bg-sidebar-accent/50 hover:border-sidebar-border/80'
                }`}
              >
                {/* PROJE ADI & KARŞILAŞTIRMA ROZETİ */}
                <div className="flex items-start justify-between gap-1 mb-1">
                  <div className="font-semibold text-xs text-foreground truncate max-w-[160px]" title={p.name}>
                    {p.name}
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                    comp?.comparisonStatus === 'UPDATE_READY'
                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                      : comp?.comparisonStatus === 'UP_TO_DATE'
                      ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                      : comp?.comparisonStatus === 'NEW_APP'
                      ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                      : 'bg-muted text-muted-foreground border border-border'
                  }`}>
                    {comp?.badge || '⚪ Bekliyor'}
                  </span>
                </div>

                {/* PAKET / BUNDLE ID */}
                <div className="text-[10px] font-mono text-muted-foreground truncate mb-2" title={p.package}>
                  {p.package || 'com.example.app'}
                </div>

                {/* YEREL KOD DURUMU */}
                <div className="flex items-center justify-between text-[11px] pb-1.5 border-b border-border/40">
                  <span className="text-muted-foreground">Yerel Sürüm:</span>
                  <span className="font-mono font-bold text-foreground">
                    v{p.version || '1.0.0'} <span className="text-[10px] text-muted-foreground">#{p.buildNumber || 1}</span>
                  </span>
                </div>

                {/* CANLI MAĞAZA KARŞILAŞTIRMA DETAYLARI */}
                <div className="pt-1.5 space-y-1 text-[10px]">
                  {/* GOOGLE PLAY */}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Smartphone className="w-2.5 h-2.5 text-emerald-500" /> Play Console:
                    </span>
                    <span className="font-mono font-medium">
                      {comp?.googlePlay?.status === 'live' ? (
                        <span className="text-emerald-500 font-semibold">v{comp.googlePlay.versionCode}</span>
                      ) : comp?.googlePlay?.status === 'not_found' ? (
                        <span className="text-muted-foreground">Kayıtlı Değil</span>
                      ) : comp?.googlePlay?.status === 'auth_error' ? (
                        <span className="text-rose-500">Yetki Hatası</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </span>
                  </div>

                  {/* APPLE APP STORE */}
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Apple className="w-2.5 h-2.5 text-sky-400" /> App Store:
                    </span>
                    <span className="font-mono font-medium">
                      {comp?.appStore?.status === 'live' ? (
                        <span className="text-sky-400 font-semibold">v{comp.appStore.buildNumber}</span>
                      ) : comp?.appStore?.status === 'not_found' ? (
                        <span className="text-muted-foreground">Kayıtlı Değil</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ALT KISIM: SİSTEM DOĞRULAMA & WIKI & GEÇMİŞ */}
        <div className="p-3 border-t border-sidebar-border bg-sidebar-accent/20 space-y-1">
          <button
            onClick={() => setShowStoreTestModal(true)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-all cursor-pointer border border-transparent hover:border-border"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              <span>Sistem & Mağaza Doğrulama</span>
            </div>
            <ChevronRight className="w-3 h-3 opacity-60" />
          </button>

          <button
            onClick={() => {
              void loadHistory();
              setShowHistoryModal(true);
            }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-all cursor-pointer border border-transparent hover:border-border"
          >
            <div className="flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-primary" />
              <span>Geçmiş Sürümler & Denetim</span>
            </div>
            <ChevronRight className="w-3 h-3 opacity-60" />
          </button>

          <button
            onClick={() => setShowWikiModal(true)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-all cursor-pointer border border-transparent hover:border-border"
          >
            <div className="flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-primary" />
              <span>Entegrasyon Wiki & Rehber</span>
            </div>
            <ChevronRight className="w-3 h-3 opacity-60" />
          </button>
        </div>
      </aside>

      {/* ===================== SAĞ PANEL (AKTİF PROJE YÖNETİMİ & DAĞITIM BORU HATTI) ===================== */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* ÜST BAŞLIK & PROJE ÖZETİ */}
        <header className="px-6 py-4 border-b border-border bg-card/60 backdrop-blur sticky top-0 z-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold tracking-tight text-foreground">{projectName}</h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border">
                {projectPackage}
              </span>
              {hasPubspec && (
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  Flutter
                </span>
              )}
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                isGitClean
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
              }`}>
                {isGitClean ? 'Git Temiz' : 'Değişiklikler Var'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate max-w-xl">
              {activeProjectPath} • branch: <span className="text-emerald-500">{gitBranch}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleSyncStores()}
              disabled={isSyncingStores}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-secondary transition-all cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingStores ? 'animate-spin text-primary' : ''}`} />
              <span>{isSyncingStores ? 'Mağazalar Taranıyor...' : 'Mağaza Senkronizasyonu'}</span>
            </button>
          </div>
        </header>

        <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
          {/* ===================== CANLI STORE KARŞILAŞTIRMA MATRİSİ ===================== */}
          <section className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-primary" />
                  Canlı Mağaza Karşılaştırma Matrisi (Store vs Local)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Yerel kod tabanındaki sürüm ile Google Play ve Apple App Store sürümlerinin anlık karşılaştırması.
                </p>
              </div>

              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                activeComparison?.comparisonStatus === 'UPDATE_READY'
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : activeComparison?.comparisonStatus === 'UP_TO_DATE'
                  ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                  : activeComparison?.comparisonStatus === 'NEW_APP'
                  ? 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                  : 'bg-muted text-muted-foreground border-border'
              }`}>
                {activeComparison?.badge || 'Durum Belirleniyor'}
              </span>
            </div>

            {/* 3 SÜTUNLU KARŞILAŞTIRMA KARTLARI */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1. YEREL KOD TABANI */}
              <div className="p-4 rounded-lg border border-border bg-background/50 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-primary" /> Yerel Kod (Local)
                  </span>
                  <span className="font-mono text-emerald-500">{gitBranch}</span>
                </div>
                <div className="pt-1">
                  <div className="text-2xl font-extrabold font-mono text-foreground">
                    {currentVersion}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">
                    Build Numarası: #{currentBuildNumber}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                  Son Commit: <span className="font-mono text-foreground font-semibold">{commits[0]?.hash.substring(0, 7) || 'yok'}</span> ({commits.length} commit incelendi)
                </div>
              </div>

              {/* 2. GOOGLE PLAY CONSOLE */}
              <div className="p-4 rounded-lg border border-border bg-background/50 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-emerald-500" /> Google Play Console
                  </span>
                  <span className="text-[10px] text-emerald-500 font-semibold">Production</span>
                </div>
                <div className="pt-1">
                  <div className="text-2xl font-extrabold font-mono text-foreground">
                    {activeComparison?.googlePlay?.status === 'live' ? (
                      `v${activeComparison.googlePlay.versionCode}`
                    ) : activeComparison?.googlePlay?.status === 'not_found' ? (
                      <span className="text-muted-foreground text-lg">Kayıtlı Değil</span>
                    ) : activeComparison?.googlePlay?.status === 'auth_error' ? (
                      <span className="text-rose-500 text-lg">Yetki Gerekli</span>
                    ) : (
                      <span className="text-muted-foreground text-lg">Yapılandırılmadı</span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground truncate" title={googlePlayInfo.serviceAccount}>
                    Hesap: {googlePlayInfo.serviceAccount.split('@')[0]}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50 truncate">
                  {activeComparison?.googlePlay?.message || 'Durum: Kontrol edildi'}
                </div>
              </div>

              {/* 3. APPLE APP STORE CONNECT */}
              <div className="p-4 rounded-lg border border-border bg-background/50 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Apple className="w-3.5 h-3.5 text-sky-400" /> App Store Connect
                  </span>
                  <span className="text-[10px] text-sky-400 font-semibold">TestFlight / Review</span>
                </div>
                <div className="pt-1">
                  <div className="text-2xl font-extrabold font-mono text-foreground">
                    {activeComparison?.appStore?.status === 'live' ? (
                      `v${activeComparison.appStore.buildNumber}`
                    ) : activeComparison?.appStore?.status === 'not_found' ? (
                      <span className="text-muted-foreground text-lg">Kayıtlı Değil</span>
                    ) : (
                      <span className="text-muted-foreground text-lg">Yapılandırılmadı</span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">
                    Key ID: {appStoreInfo.keyId || 'Yapılandırılmadı'}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50 truncate">
                  {activeComparison?.appStore?.message || 'Durum: Kontrol edildi'}
                </div>
              </div>
            </div>

            {/* KARŞILAŞTIRMA ÖZET KARARI */}
            <div className="p-3 rounded-lg bg-secondary/50 border border-border text-xs flex items-center gap-2.5 text-secondary-foreground">
              <Info className="w-4 h-4 text-primary shrink-0" />
              <span>
                <strong>Karşılaştırma Analizi:</strong> {activeComparison?.summary || 'Mağaza ve yerel sürüm durumu analiz ediliyor.'}
              </span>
            </div>
          </section>

          {/* ===================== SÜRÜM DAĞITIM MERKEZİ & FORMU ===================== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* SOL 2 SÜTUN: AYARLAR & AI NOTLARI */}
            <div className="lg:col-span-2 space-y-6">
              {/* SÜRÜM STRATEJİSİ */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <GitCommit className="w-4 h-4 text-primary" />
                  Sürüm Artırma Stratejisi
                </h4>

                <div className="grid grid-cols-4 gap-2">
                  {(['patch', 'minor', 'major', 'custom'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setBumpType(type)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer border ${
                        bumpType === type
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-background text-muted-foreground border-border hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      {type === 'custom' ? 'Özel Sürüm' : type}
                    </button>
                  ))}
                </div>

                {bumpType === 'custom' && (
                  <div className="pt-1">
                    <label className="text-xs text-muted-foreground block mb-1">
                      Özel Hedef Versiyon:
                    </label>
                    <input
                      type="text"
                      value={customVersion}
                      onChange={(e) => setCustomVersion(e.target.value)}
                      placeholder="örneğin: 2.6.0"
                      className="w-full text-xs font-mono px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border text-xs">
                  <div>
                    <span className="text-muted-foreground">Mevcut:</span>{' '}
                    <span className="font-mono font-bold">{currentVersion}+{currentBuildNumber}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">Hedeflenecek Yeni Sürüm:</span>{' '}
                    <span className="font-mono font-bold text-emerald-500">{nextVersion}+{nextBuildNumber}</span>
                  </div>
                </div>
              </div>

              {/* HEDEF MAĞAZALAR & ROLLOUT */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-primary" />
                  Hedef Dağıtım Kanalları
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* GOOGLE PLAY AYARLARI */}
                  <div className="p-3.5 rounded-lg border border-border bg-background/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={targetAndroid}
                          onChange={(e) => setTargetAndroid(e.target.checked)}
                          className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                        />
                        <span>Google Play Dağıtımı</span>
                      </label>
                      <span className="text-[10px] text-emerald-500 font-mono">AAB</span>
                    </div>

                    {targetAndroid && (
                      <div className="space-y-2 pt-1 border-t border-border/60">
                        <div>
                          <label className="text-[11px] text-muted-foreground block mb-1">
                            Yayın Kanalı (Track):
                          </label>
                          <select
                            value={googleTrack}
                            onChange={(e) => setGoogleTrack(e.target.value as 'internal' | 'alpha' | 'beta' | 'production')}
                            className="w-full text-xs px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="internal">Dahili Test (Internal - En Hızlı)</option>
                            <option value="alpha">Kapalı Test (Alpha)</option>
                            <option value="beta">Açık Test (Beta)</option>
                            <option value="production">Canlı Yayın (Production)</option>
                          </select>
                        </div>

                        {googleTrack === 'production' && (
                          <div>
                            <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                              <span>Kademeli Dağıtım (Rollout):</span>
                              <span className="font-mono font-bold text-foreground">%{rolloutPercentage}</span>
                            </div>
                            <input
                              type="range"
                              min="5"
                              max="100"
                              step="5"
                              value={rolloutPercentage}
                              onChange={(e) => setRolloutPercentage(parseInt(e.target.value, 10))}
                              className="w-full accent-primary cursor-pointer"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* APPLE APP STORE AYARLARI */}
                  <div className="p-3.5 rounded-lg border border-border bg-background/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={targetIos}
                          onChange={(e) => setTargetIos(e.target.checked)}
                          className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                        />
                        <span>Apple App Store Dağıtımı</span>
                      </label>
                      <span className="text-[10px] text-sky-400 font-mono">IPA</span>
                    </div>

                    {targetIos && (
                      <div className="space-y-2 pt-1 border-t border-border/60 text-xs text-muted-foreground">
                        <p className="text-[11px] leading-relaxed">
                          Yüklenen IPA doğrudan TestFlight derlemelerine eklenir ve hazır olduğunda incelemeye gönderilir.
                        </p>
                        <div className="text-[10px] font-mono text-muted-foreground bg-secondary/50 p-2 rounded border border-border">
                          Auth: ES256 JWT • Key: {appStoreInfo.keyId || 'Yok'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* DRY-RUN MODU */}
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isDryRun}
                      onChange={(e) => setIsDryRun(e.target.checked)}
                      className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Simülasyon Modu (Dry-Run — Gerçek derleme ve mağaza yüklemesi yapmaz)</span>
                  </label>
                  <span className="text-[10px] font-mono uppercase bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded">
                    Test
                  </span>
                </div>
              </div>

              {/* AI SÜRÜM NOTLARI */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Çift Dilli AI Sürüm Notları
                  </h4>
                  <button
                    onClick={() => void handleGenerateAI()}
                    disabled={isGeneratingAI || commits.length === 0}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-all border border-border cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isGeneratingAI ? 'animate-spin text-primary' : ''}`} />
                    <span>{isGeneratingAI ? 'Yapay Zeka Yazıyor...' : 'Commitlerden Üret'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* TÜRKÇE NOTLAR */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Türkçe (Google Play / App Store TR)</span>
                      <button
                        onClick={() => handleCopyNotes('tr')}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {copiedLang === 'tr' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>Kopyala</span>
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      value={releaseNotesTR}
                      onChange={(e) => setReleaseNotesTR(e.target.value)}
                      className="w-full text-xs p-3 rounded-lg border border-border bg-background text-foreground font-sans focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
                    />
                  </div>

                  {/* İNGİLİZCE NOTLAR */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">İngilizce (Global Store)</span>
                      <button
                        onClick={() => handleCopyNotes('en')}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {copiedLang === 'en' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>Kopyala</span>
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      value={releaseNotesEN}
                      onChange={(e) => setReleaseNotesEN(e.target.value)}
                      className="w-full text-xs p-3 rounded-lg border border-border bg-background text-foreground font-sans focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SAĞ 1 SÜTUN: BORU HATTI & BAŞLATMA AKSİYONU */}
            <div className="space-y-6">
              {/* DAĞITIMI BAŞLAT KARTI */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <div>
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <Play className="w-4 h-4 text-primary" />
                    Dağıtımı Başlat
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    20 adımlık tam otomatik orkestrasyon zincirini yürütür.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hedef Proje:</span>
                    <span className="font-semibold text-foreground truncate max-w-[130px]">{projectName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hedef Sürüm:</span>
                    <span className="font-mono font-bold text-emerald-500">{nextVersion}+{nextBuildNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Kanal:</span>
                    <span className="font-semibold uppercase text-xs">{googleTrack}</span>
                  </div>
                </div>

                <button
                  onClick={() => void handleStartRelease()}
                  disabled={isReleasing}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-primary text-primary-foreground font-bold text-sm shadow hover:opacity-90 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Rocket className={`w-4 h-4 ${isReleasing ? 'animate-bounce' : ''}`} />
                  <span>{isReleasing ? 'Dağıtım Yürütülüyor...' : 'Sürüm Dağıtımını Başlat'}</span>
                </button>

                {releaseCompleted && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs text-center font-medium">
                    🎉 Sürüm {nextVersion} başarıyla dağıtıldı!
                  </div>
                )}
              </div>

              {/* 20 ADIMLIK İNTERAKTİF BORU HATTI STEPPER */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    Dağıtım Boru Hattı (20 Adım)
                  </h4>
                  <span className="text-xs font-mono font-semibold text-primary">
                    {activeStepIndex}/20
                  </span>
                </div>

                <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
                  {steps.map((step) => (
                    <div
                      key={step.id}
                      className={`flex items-center justify-between p-2 rounded-md text-xs border transition-all ${
                        step.status === 'running'
                          ? 'bg-primary/10 border-primary text-primary font-semibold'
                          : step.status === 'success'
                          ? 'bg-emerald-500/5 border-emerald-500/20 text-muted-foreground'
                          : step.status === 'failed'
                          ? 'bg-rose-500/10 border-rose-500 text-rose-500 font-semibold'
                          : 'bg-background border-border text-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono text-[10px] w-4 text-muted-foreground">
                          {step.id}
                        </span>
                        <span className="truncate">{step.name}</span>
                      </div>

                      <div className="shrink-0 pl-1">
                        {step.status === 'running' && (
                          <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
                        )}
                        {step.status === 'success' && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                        {step.status === 'failed' && (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                        )}
                        {step.status === 'pending' && (
                          <Clock className="w-3.5 h-3.5 text-muted-foreground/40" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ===================== CANLI KONSOL & LOG AKIŞI ===================== */}
          <section className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                Canlı Konsol & Terminal Çıktısı
              </h4>
              <span className="text-[10px] font-mono text-muted-foreground">
                {logs.length} satır log
              </span>
            </div>

            <div className="p-4 rounded-lg bg-zinc-950 text-zinc-100 font-mono text-xs h-64 overflow-y-auto space-y-1 border border-zinc-800 selection:bg-zinc-800">
              {logs.length === 0 ? (
                <div className="text-zinc-500 flex items-center justify-center h-full">
                  Dağıtım başlatıldığında canlı orkestrasyon adımları ve işlem logları burada akacaktır.
                </div>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className="leading-relaxed whitespace-pre-wrap break-all">
                    {log}
                  </div>
                ))
              )}
              <div ref={terminalEndRef} />
            </div>
          </section>
        </div>
      </main>

      {/* ===================== MODAL: YENİ PROJE EKLE ===================== */}
      {showAddProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-sm flex items-center gap-2 text-foreground">
                <FolderPlus className="w-4 h-4 text-primary" />
                Yeni Proje Dizini Ekle
              </h3>
              <button
                onClick={() => setShowAddProjectModal(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleAddNewProject(e)} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Proje Adı (İsteğe bağlı):
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="örneğin: Kurye Havuzu"
                  className="w-full text-xs px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Proje Mutlak Dosya Yolu (Path)*:
                </label>
                <input
                  type="text"
                  required
                  value={newProjectPath}
                  onChange={(e) => setNewProjectPath(e.target.value)}
                  placeholder="örneğin: /Users/.../my_flutter_app"
                  className="w-full text-xs font-mono px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddProjectModal(false)}
                  className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-secondary cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isAddingProject || !newProjectPath.trim()}
                  className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                >
                  {isAddingProject ? 'Ekleniyor...' : 'Projeyi Doğrula ve Ekle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL: SİSTEM & MAĞAZA TESTLERİ ===================== */}
      {showStoreTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-3xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base flex items-center gap-2 text-foreground">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Sistem & Mağaza Canlı Doğrulama Paneli
              </h3>
              <button
                onClick={() => setShowStoreTestModal(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* GOOGLE PLAY TEST KARTI */}
              <div className="p-4 rounded-xl border border-border bg-background/50 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-500" />
                    Google Play Console
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    googlePlayInfo.connected
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}>
                    {googlePlayInfo.connected ? 'Bağlantı Hazır' : 'Bekliyor'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground font-mono">
                  <div className="truncate">Hesap: {googlePlayInfo.serviceAccount}</div>
                  <div className="truncate">Key Path: {googlePlayInfo.keyPath || '~/.secrets/google-play-key.json'}</div>
                </div>

                <button
                  onClick={() => void handleTestGooglePlay()}
                  disabled={googleTestResult.testing}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-secondary text-secondary-foreground font-semibold text-xs border border-border hover:bg-secondary/80 transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${googleTestResult.testing ? 'animate-spin text-primary' : ''}`} />
                  <span>{googleTestResult.testing ? 'Doğrulanıyor...' : 'Google Play Bağlantısını Test Et'}</span>
                </button>

                {googleTestResult.tested && (
                  <div className={`p-3 rounded-lg text-xs border ${
                    googleTestResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                  }`}>
                    {googleTestResult.success ? (
                      <div>✓ {googleTestResult.message || 'Service Account ve OAuth yetkisi doğrulandı.'}</div>
                    ) : (
                      <div>✕ {googleTestResult.error || 'Doğrulama başarısız.'}</div>
                    )}
                  </div>
                )}
              </div>

              {/* APPLE APP STORE TEST KARTI */}
              <div className="p-4 rounded-xl border border-border bg-background/50 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm flex items-center gap-2">
                    <Apple className="w-4 h-4 text-sky-400" />
                    Apple App Store Connect
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    appStoreInfo.connected
                      ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}>
                    {appStoreInfo.connected ? 'Bağlantı Hazır' : 'Yapılandırılmadı'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground font-mono">
                  <div>Key ID: {appStoreInfo.keyId}</div>
                  <div>Issuer ID: {appStoreInfo.issuerId}</div>
                </div>

                <button
                  onClick={() => void handleTestAppleStore()}
                  disabled={appleTestResult.testing}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-secondary text-secondary-foreground font-semibold text-xs border border-border hover:bg-secondary/80 transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${appleTestResult.testing ? 'animate-spin text-primary' : ''}`} />
                  <span>{appleTestResult.testing ? 'Test Ediliyor...' : 'App Store Bağlantısını Test Et'}</span>
                </button>

                {appleTestResult.tested && (
                  <div className={`p-3 rounded-lg text-xs border ${
                    appleTestResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                  }`}>
                    {appleTestResult.success ? (
                      <div>✓ {appleTestResult.message || 'JWT Token üretildi ve Apple API doğrulandı.'}</div>
                    ) : (
                      <div>✕ {appleTestResult.error || 'Doğrulama başarısız.'}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: GEÇMİŞ SÜRÜMLER & DENETİM ===================== */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-3xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base flex items-center gap-2 text-foreground">
                <History className="w-5 h-5 text-primary" />
                Sürüm Dağıtım Geçmişi & SQLite Denetim Günlüğü
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Son Dağıtımlar ({historyReleases.length})
                </h4>
                {historyReleases.length === 0 ? (
                  <div className="p-4 rounded-lg bg-background border border-border text-xs text-muted-foreground text-center">
                    Henüz veritabanına kayıtlı bir sürüm bulunmuyor.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historyReleases.map((rel) => (
                      <div key={rel.id} className="p-3 rounded-lg border border-border bg-background flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold font-mono text-foreground">
                            {rel.version} <span className="text-muted-foreground font-normal">#{rel.buildNumber}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">{rel.releaseId} • {rel.createdAt}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          {rel.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Denetim Günlükleri (Audit Logs - {auditLogs.length})
                </h4>
                {auditLogs.length === 0 ? (
                  <div className="p-4 rounded-lg bg-background border border-border text-xs text-muted-foreground text-center">
                    Kayıtlı denetim günlüğü yok.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="p-2 rounded border border-border bg-background text-[11px] flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-foreground">{log.action}</span>
                          <span className="text-muted-foreground ml-2">aktör: {log.actor}</span>
                        </div>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          log.result === 'SUCCESS' ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10'
                        }`}>
                          {log.result}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: WİKİ & ENTEGRASYON REHBERİ ===================== */}
      {showWikiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-4xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base flex items-center gap-2 text-foreground">
                <BookOpen className="w-5 h-5 text-primary" />
                Webicro Distribution — Mağaza Entegrasyon Wiki & Rehber
              </h3>
              <button
                onClick={() => setShowWikiModal(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-6 text-xs text-muted-foreground leading-relaxed">
              {/* GOOGLE PLAY REHBERİ */}
              <div className="p-4 rounded-xl border border-border bg-background space-y-3">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-500" />
                  1. Google Play Console Entegrasyonu İçin Gerekenler
                </h4>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>
                    <strong>Google Cloud Console</strong> üzerinde projenizi açın ve <code>Google Play Android Developer API</code> servisini etkinleştirin.
                  </li>
                  <li>
                    <strong>IAM ve Yönetim &gt; Hizmet Hesapları</strong> bölümünden yeni bir Service Account oluşturun (örneğin: <code>play-store-deployer</code>).
                  </li>
                  <li>
                    Hizmet hesabının <strong>Anahtarlar (Keys)</strong> sekmesinden <code>JSON</code> formatında yeni bir anahtar indirin.
                  </li>
                  <li>
                    İndirilen JSON anahtarını <code>~/.secrets/google-play-key.json</code> yoluna yerleştirin veya <code>.env</code> dosyanızda <code>GOOGLE_PLAY_SERVICE_ACCOUNT</code> değişkenine dosya yolunu verin.
                  </li>
                  <li>
                    <strong>Google Play Console &gt; Kullanıcılar ve İzinler</strong> sekmesinden bu Service Account e-posta adresini davet edin ve aşağıdaki izinleri verin:
                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                      <li>"Sürümleri üretim kanalında yayınlama, sürümleri hariç tutma"</li>
                      <li>"Dahili test sürümlerini yönetme"</li>
                    </ul>
                  </li>
                </ol>
              </div>

              {/* APPLE APP STORE REHBERİ */}
              <div className="p-4 rounded-xl border border-border bg-background space-y-3">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Apple className="w-4 h-4 text-sky-400" />
                  2. Apple App Store Connect Entegrasyonu İçin Gerekenler
                </h4>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>
                    <strong>App Store Connect &gt; Kullanıcılar ve Erişim &gt; Entegrasyonlar</strong> sekmesine gidin.
                  </li>
                  <li>
                    <code>App Store Connect API</code> anahtarı oluşturun (Yetki düzeyi: <code>App Manager</code> veya <code>Admin</code>).
                  </li>
                  <li>
                    Oluşturulan anahtarın <strong>Key ID</strong>'sini ve sayfanın üstündeki <strong>Issuer ID</strong> değerini kopyalayın.
                  </li>
                  <li>
                    <code>.p8</code> uzantılı özel anahtar dosyasını indirin (bu dosya yalnızca bir kez indirilebilir!).
                  </li>
                  <li>
                    Projenizin kök dizinindeki <code>.env</code> dosyasına bu bilgileri ekleyin:
                  </li>
                </ol>

                <div className="p-3 rounded bg-zinc-950 text-zinc-100 font-mono text-[11px] border border-zinc-800">
                  APPSTORE_KEY_ID=ABCD1234EF<br/>
                  APPSTORE_ISSUER_ID=12345678-1234-1234-1234-123456789abc<br/>
                  APPSTORE_PRIVATE_KEY_PATH=/Users/kullanici/.secrets/AuthKey_ABCD1234EF.p8
                </div>
              </div>

              {/* TEST YÖNTEMLERİ */}
              <div className="p-4 rounded-xl border border-border bg-background space-y-2">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  3. Bağlantılar Nasıl Test Edilir?
                </h4>
                <p>
                  Sol menüdeki <strong>"Sistem & Mağaza Doğrulama"</strong> butonuna tıklayarak açılan pencereden her iki mağazanın canlı API el sıkışmasını tek tıkla test edebilirsiniz. Doğrulayıcı; anahtar dosyalarının geçerliliğini, JWT token üretimini ve mağaza izinlerini gerçek zamanlı olarak denetler.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
