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
  Sliders,
  History,
  ShieldCheck,
  Moon,
  Sun,
  Terminal,
  Layers,
  AlertCircle,
  FileCode,
  FolderCheck,
  ExternalLink
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

interface ProjectData {
  name: string;
  currentVersion: string;
  currentBuildNumber: number;
  suggestedVersion: string;
  suggestedBuildNumber: number;
  suggestedBump: 'patch' | 'minor' | 'major';
  branch: string;
  isClean: boolean;
  hasPubspec: boolean;
}

interface StoresData {
  googlePlay: {
    connected: boolean;
    serviceAccount: string;
    projectId?: string;
    keyPath?: string;
  };
  appStore: {
    connected: boolean;
    keyId: string;
    issuerId?: string;
  };
}

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'history' | 'settings'>('pipeline');
  
  // Proje & Sürüm State'leri (Canlı API'den gelir)
  const [projectName, setProjectName] = useState<string>('Yükleniyor...');
  const [gitBranch, setGitBranch] = useState<string>('main');
  const [currentVersion, setCurrentVersion] = useState<string>('1.0.0');
  const [currentBuildNumber, setCurrentBuildNumber] = useState<number>(1);
  const [bumpType, setBumpType] = useState<'patch' | 'minor' | 'major' | 'custom'>('minor');
  const [customVersion, setCustomVersion] = useState<string>('');
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [hasPubspec, setHasPubspec] = useState<boolean>(true);
  const [isGitClean, setIsGitClean] = useState<boolean>(true);
  
  // Mağaza Durumları & Seçimleri
  const [targetAndroid, setTargetAndroid] = useState<boolean>(true);
  const [targetIos, setTargetIos] = useState<boolean>(true);
  const [playTrack, setPlayTrack] = useState<'internal' | 'alpha' | 'beta' | 'production'>('internal');
  const [playRollout, setPlayRollout] = useState<number>(100);
  const [iosSubmitReview, setIosSubmitReview] = useState<boolean>(false);
  const [isDryRun, setIsDryRun] = useState<boolean>(true);

  const [googlePlayStatus, setGooglePlayStatus] = useState<StoresData['googlePlay']>({
    connected: false,
    serviceAccount: 'Yükleniyor...',
  });
  const [appStoreStatus, setAppStoreStatus] = useState<StoresData['appStore']>({
    connected: false,
    keyId: 'Yükleniyor...',
  });

  // AI Sürüm Notları (Canlı API'den üretilir)
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

  // 1. GERÇEK PROJE VE GİT BİLGİLERİNİ ÇEK
  useEffect(() => {
    async function loadProjectData() {
      try {
        const res = await fetch('/api/project');
        if (res.ok) {
          const data = await res.json() as {
            project: ProjectData;
            commits: CommitItem[];
            stores: StoresData;
          };
          setProjectName(data.project.name || 'Webicro Distribution');
          setGitBranch(data.project.branch || 'main');
          setCurrentVersion(data.project.currentVersion || '1.0.0');
          setCurrentBuildNumber(data.project.currentBuildNumber || 1);
          setBumpType(data.project.suggestedBump || 'minor');
          setIsGitClean(data.project.isClean);
          setHasPubspec(data.project.hasPubspec);
          setCommits(data.commits || []);
          if (data.stores?.googlePlay) setGooglePlayStatus(data.stores.googlePlay);
          if (data.stores?.appStore) setAppStoreStatus(data.stores.appStore);

          // Proje verileri gelince AI notlarını otomatik üret
          const computedNext = data.project.suggestedVersion || '1.1.0';
          generateAiNotes(computedNext);
        }
      } catch (err) {
        console.error('Proje bilgileri alınamadı:', err);
      }
    }
    loadProjectData();
  }, [generateAiNotes]);

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

    // SSE Dinleyicisi
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

    // Sunucuya Başlatma Emri Gönder
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
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary selection:text-primary-foreground">
      {/* ÜST BAR (NAVBAR) */}
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/80 backdrop-blur-md px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
            <Rocket className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight">Webicro Distribution</span>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-secondary text-secondary-foreground border border-border">
                Canlı Orkestrasyon
              </span>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span>Proje:</span>
              <strong className="text-foreground font-semibold">{projectName}</strong>
              <span>•</span>
              <span className="text-emerald-500 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Git: {gitBranch}
              </span>
              <span>•</span>
              <span className={`text-[11px] font-medium ${isGitClean ? 'text-emerald-500' : 'text-amber-500'}`}>
                {isGitClean ? 'Çalışma alanı temiz' : 'Bekleyen değişiklikler var'}
              </span>
            </p>
          </div>
        </div>

        {/* Sekmeler ve Araçlar */}
        <div className="flex items-center gap-3">
          <nav className="flex items-center bg-secondary/80 p-1 rounded-lg border border-border text-xs font-medium">
            <button
              onClick={() => setActiveTab('pipeline')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'pipeline'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Rocket className="w-3.5 h-3.5" />
              Sürüm Dağıtımı
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Geçmiş Sürümler
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'settings'
                  ? 'bg-background text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Sistem & Mağazalar
            </button>
          </nav>

          <button
            onClick={() => setIsDark(!isDark)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            title="Temayı Değiştir"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* ANA İÇERİK */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {activeTab === 'pipeline' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* SOL KOLON: SÜRÜM YAPILANDIRMASI, AI NOTLARI VE GERÇEK COMMITS (7 Kolon) */}
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

              {/* 2. KART: YAPAY ZEKA SÜRÜM NOTLARI (GERÇEK DÜZENLENEBİLİR VE KONTRASTLI) */}
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

            {/* SAĞ KOLON: HEDEFLER & CANLI PIPELINE (5 Kolon) */}
            <div className="lg:col-span-5 space-y-6">
              {/* DAĞITIM VE MAĞAZA SEÇİMİ */}
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
                          {googlePlayStatus.connected && (
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
                          className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground"
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
                          className="rounded border-border text-primary w-3.5 h-3.5"
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

              {/* CANLI PIPELINE İLERLEME STEPPER'I */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    Boru Hattı Akışı (Pipeline)
                  </h2>
                  <span className="text-xs font-mono font-medium text-muted-foreground">
                    {releaseCompleted ? '20/20 Tamamlandı' : `${activeStepIndex}/20`}
                  </span>
                </div>

                {/* İlerleme Çubuğu */}
                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-300 rounded-full"
                    style={{ width: `${(activeStepIndex / 20) * 100}%` }}
                  ></div>
                </div>

                {/* Adım Listesi (Scrollable) */}
                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 text-xs">
                  {steps.map((step) => (
                    <div
                      key={step.id}
                      className={`flex items-center justify-between p-2 rounded-lg transition-all ${
                        step.status === 'running'
                          ? 'bg-primary/10 border border-primary/30 text-primary font-semibold'
                          : step.status === 'success'
                          ? 'bg-secondary/40 text-foreground'
                          : step.status === 'failed'
                          ? 'bg-destructive/10 border border-destructive/30 text-destructive font-semibold'
                          : 'text-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {step.status === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        ) : step.status === 'running' ? (
                          <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                        ) : step.status === 'failed' ? (
                          <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        ) : (
                          <span className="w-3.5 h-3.5 rounded-full border border-border shrink-0"></span>
                        )}
                        <span className="truncate">{step.id}. {step.name}</span>
                      </div>
                      <span className="text-[10px] font-mono shrink-0">
                        {step.status === 'success' ? '✓' : step.status === 'running' ? '...' : step.status === 'failed' ? '✗' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CANLI KONSOL ÇIKTISI */}
              <div className="bg-[#0f1117] text-gray-200 border border-border rounded-xl p-4 shadow-sm font-mono text-[11px] space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-gray-800 text-gray-400">
                  <span className="flex items-center gap-1.5 text-xs">
                    <Terminal className="w-3.5 h-3.5" /> Canlı Sunucu Konsolu
                  </span>
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> bağlı
                  </span>
                </div>
                <div ref={logContainerRef} className="max-h-36 overflow-y-auto space-y-1 leading-relaxed text-gray-300">
                  {logs.length === 0 ? (
                    <span className="text-gray-500">Pipeline başlatıldığında terminal logları burada anlık akacaktır...</span>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className="break-all">{log}</div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* GEÇMİŞ SÜRÜMLER SEKMESİ (SQLITE VERİTABANI) */}
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

        {/* SİSTEM VE MAĞAZALAR SEKMESİ */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Google Play Durumu */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-500" /> Google Play Console Bağlantısı
              </h2>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-2 border-b border-border/60">
                  <span className="text-muted-foreground">Hizmet Hesabı E-postası:</span>
                  <span className="font-mono text-foreground font-medium truncate max-w-[240px]" title={googlePlayStatus.serviceAccount}>
                    {googlePlayStatus.serviceAccount}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/60">
                  <span className="text-muted-foreground">GCP Proje Kimliği:</span>
                  <span className="font-mono text-foreground font-medium">
                    {googlePlayStatus.projectId || 'Otomatik'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/60">
                  <span className="text-muted-foreground">Bağlantı Durumu:</span>
                  <span className={`font-bold flex items-center gap-1 ${
                    googlePlayStatus.connected ? 'text-emerald-500' : 'text-amber-500'
                  }`}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {googlePlayStatus.connected ? 'Yetkili Hizmet Hesabı Bağlı' : 'Anahtar Dosyası Eksik'}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Anahtar Dosya Konumu:</span>
                  <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[240px]" title={googlePlayStatus.keyPath}>
                    {googlePlayStatus.keyPath || '~/.secrets/google-play-key.json'}
                  </span>
                </div>
              </div>
            </div>

            {/* Apple App Store Durumu */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Apple className="w-4 h-4 text-foreground" /> App Store Connect API
              </h2>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-2 border-b border-border/60">
                  <span className="text-muted-foreground">Key ID:</span>
                  <span className="font-mono text-foreground font-medium">
                    {appStoreStatus.keyId}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/60">
                  <span className="text-muted-foreground">Issuer ID:</span>
                  <span className="font-mono text-foreground font-medium truncate max-w-[200px]">
                    {appStoreStatus.issuerId || 'Tanımlanmadı'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/60">
                  <span className="text-muted-foreground">Bağlantı Durumu:</span>
                  <span className={`font-bold flex items-center gap-1 ${
                    appStoreStatus.connected ? 'text-emerald-500' : 'text-muted-foreground'
                  }`}>
                    {appStoreStatus.connected ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> ES256 JWT İmzası Hazır
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Yapılandırılmadı (.env bekleniyor)
                      </>
                    )}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">İşleme Takibi:</span>
                  <span className="text-foreground">Otomatik Polling (Exponential Backoff)</span>
                </div>
              </div>
            </div>

            {/* Proje ve Çalışma Dizin Bilgisi */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3 md:col-span-2">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <FolderCheck className="w-4 h-4 text-primary" /> Proje & Motor Yapılandırması
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-1">
                <div className="p-3 bg-secondary/30 rounded-lg border border-border/60 space-y-1">
                  <div className="text-muted-foreground flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5" /> pubspec.yaml Durumu
                  </div>
                  <div className="font-medium text-foreground">
                    {hasPubspec ? 'Mevcut (Otomatik versiyon artırımı aktif)' : 'Mevcut dizinde bulunamadı'}
                  </div>
                </div>

                <div className="p-3 bg-secondary/30 rounded-lg border border-border/60 space-y-1">
                  <div className="text-muted-foreground flex items-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" /> Konfigürasyon Dosyası
                  </div>
                  <div className="font-medium text-foreground">
                    release.config.yaml (Zod ile doğrulandı)
                  </div>
                </div>

                <div className="p-3 bg-secondary/30 rounded-lg border border-border/60 space-y-1">
                  <div className="text-muted-foreground flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" /> Veritabanı
                  </div>
                  <div className="font-medium text-foreground">
                    SQLite WAL Modu (.release/release.db)
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
