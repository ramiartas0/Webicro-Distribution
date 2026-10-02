import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Rocket,
  CheckCircle2,
  Clock,
  GitCommit,
  Sparkles,
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
  Info,
  Save,
  Compass,
  Trash2
} from 'lucide-react';
import { GooglePlayIcon, AppStoreConnectIcon, ProjectAppIcon } from './components/icons';

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
  details?: string;
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
    version?: string;
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
  releasing?: boolean;
  currentStageId?: number;
  totalStages?: number;
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
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('webicro_theme');
      if (saved !== null) {
        return saved === 'dark';
      }
    } catch {
      // localStorage erisim hatasinda varsayilana don
    }
    return false; // Varsayilan olarak Light Mode
  });
  
  // Proje Listesi ve Aktif Proje
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [activeProjectPath, setActiveProjectPath] = useState<string>('');
  const [isSyncingStores, setIsSyncingStores] = useState<boolean>(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState<boolean>(false);
  const [newProjectPath, setNewProjectPath] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [isAddingProject, setIsAddingProject] = useState<boolean>(false);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [showScanModal, setShowScanModal] = useState<boolean>(false);
  const [scanPathInput, setScanPathInput] = useState<string>('');

  // Modallar
  const [showStoreTestModal, setShowStoreTestModal] = useState<boolean>(false);
  const [showWikiModal, setShowWikiModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  // API Bağlantı Formları (Kendi API'ne Bağlan)
  const [activeStoreTab, setActiveStoreTab] = useState<'google' | 'apple'>('google');
  const [googleJsonInput, setGoogleJsonInput] = useState<string>('');
  const [googlePathInput, setGooglePathInput] = useState<string>('');
  const [appleKeyIdInput, setAppleKeyIdInput] = useState<string>('');
  const [appleIssuerIdInput, setAppleIssuerIdInput] = useState<string>('');
  const [applePrivateKeyInput, setApplePrivateKeyInput] = useState<string>('');
  const [isSavingGoogle, setIsSavingGoogle] = useState<boolean>(false);
  const [isSavingApple, setIsSavingApple] = useState<boolean>(false);
  const [saveGlobal, setSaveGlobal] = useState<boolean>(false);

  // Proje Detayları (Fallback ve uydurma veriler kaldırıldı)
  const [projectName, setProjectName] = useState<string>('');
  const [projectPackage, setProjectPackage] = useState<string>('');
  const [gitBranch, setGitBranch] = useState<string>('');
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [currentBuildNumber, setCurrentBuildNumber] = useState<number>(0);
  const [bumpType, setBumpType] = useState<'patch' | 'minor' | 'major' | 'custom'>('minor');
  const [customVersion, setCustomVersion] = useState<string>('');
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [hasPubspec, setHasPubspec] = useState<boolean>(false);
  const [isGitClean, setIsGitClean] = useState<boolean>(true);
  const [activeComparison, setActiveComparison] = useState<StoreComparison | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState<boolean>(false);

  // Proje geçişlerinde verilerin karışmasını engelleyen senkron referanslar
  const activePathRef = useRef<string>('');
  const requestSeqRef = useRef<number>(0);

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

  // AI Sürüm Notları (Varsayılan olarak boş başlar, AI veya manuel doldurulur)
  const [releaseNotesTR, setReleaseNotesTR] = useState<string>('');
  const [releaseNotesEN, setReleaseNotesEN] = useState<string>('');
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [copiedLang, setCopiedLang] = useState<'tr' | 'en' | null>(null);

  // Canlı Boru Hattı Durumu
  const [isReleasing, setIsReleasing] = useState<boolean>(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [releaseCompleted, setReleaseCompleted] = useState<boolean>(false);
  const [activePipelineProject, setActivePipelineProject] = useState<string>('');

  // Geçmiş ve Denetim Kayıtları
  const [historyReleases, setHistoryReleases] = useState<ReleaseHistoryItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // 6 Sıralı Kurumsal Dağıtım Aşaması (Sequential Pipeline)
  const initialStages: PipelineStep[] = [
    { id: 1, name: 'Hazırlık ve Git Analizi', status: 'pending' },
    { id: 2, name: 'Sürümleme ve Sürüm Notları', status: 'pending' },
    { id: 3, name: 'Statik Kod Analizi ve Testler', status: 'pending' },
    { id: 4, name: 'Android Paketi Derleme (AAB)', status: 'pending' },
    { id: 5, name: 'iOS Paketi Derleme (IPA)', status: 'pending' },
    { id: 6, name: 'Mağaza Dağıtımı ve İnceleme', status: 'pending' },
  ];

  const [steps, setSteps] = useState<PipelineStep[]>(initialStages);

  // Otomatik aşağı kaydırma
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Tema Değişimi
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      try {
        localStorage.setItem('webicro_theme', 'dark');
      } catch {
        // ignore
      }
    } else {
      document.documentElement.classList.remove('dark');
      try {
        localStorage.setItem('webicro_theme', 'light');
      } catch {
        // ignore
      }
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

  // KALICI KİMLİK BİLGİLERİNİ YÜKLE
  const loadStoreCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/stores/credentials');
      if (res.ok) {
        const data = await res.json() as {
          googlePlay?: {
            configured: boolean;
            serviceAccountEmail?: string;
            projectId?: string;
            keyPath?: string;
            verified: boolean;
          };
          appStore?: {
            configured: boolean;
            keyId?: string;
            issuerId?: string;
            hasPrivateKey: boolean;
            verified: boolean;
          };
        };

        if (data.googlePlay?.configured) {
          setGooglePlayInfo((prev) => ({
            ...prev,
            connected: data.googlePlay?.verified || Boolean(data.googlePlay?.serviceAccountEmail),
            serviceAccount: data.googlePlay?.serviceAccountEmail || prev.serviceAccount,
            projectId: data.googlePlay?.projectId,
            keyPath: data.googlePlay?.keyPath,
          }));
          if (data.googlePlay.keyPath && !googlePathInput) {
            setGooglePathInput(data.googlePlay.keyPath);
          }
        }

        if (data.appStore?.configured) {
          setAppStoreInfo((prev) => ({
            ...prev,
            connected: data.appStore?.verified || Boolean(data.appStore?.keyId),
            keyId: data.appStore?.keyId || prev.keyId,
            issuerId: data.appStore?.issuerId || prev.issuerId,
          }));
          if (data.appStore.keyId && !appleKeyIdInput) {
            setAppleKeyIdInput(data.appStore.keyId);
          }
          if (data.appStore.issuerId && !appleIssuerIdInput) {
            setAppleIssuerIdInput(data.appStore.issuerId);
          }
        }
      }
    } catch (err) {
      console.error('Kimlik bilgileri yüklenemedi:', err);
    }
  }, [googlePathInput, appleKeyIdInput, appleIssuerIdInput]);

  // 1. PROJELERİ VE AKTİF PROJE DETAYLARINI ÇEK
  const loadProjectsAndActive = useCallback(async () => {
    try {
      const pRes = await fetch('/api/projects');
      if (pRes.ok) {
        const pData = await pRes.json() as { activePath: string; projects: ProjectEntry[] };
        const fetchedProjects = pData.projects || [];
        setProjects(fetchedProjects);
        
        const currentActive = pData.activePath || fetchedProjects[0]?.path || '';
        setActiveProjectPath(currentActive);
        activePathRef.current = currentActive;

        // İlk projenin temel bilgilerini anında göster
        const initialProj = fetchedProjects.find(p => p.path === currentActive);
        if (initialProj) {
          setProjectName(initialProj.name);
          setProjectPackage(initialProj.package || '');
          setCurrentVersion(initialProj.version || '');
          setCurrentBuildNumber(initialProj.buildNumber || 0);
          setActiveComparison(initialProj.stores || null);
        }

        if (currentActive) {
          await fetchProjectDetails(currentActive);
        }
      }
      await loadStoreCredentials();
    } catch (err) {
      console.error('Projeler yüklenemedi:', err);
    }
  }, [loadStoreCredentials]);

  const fetchProjectDetails = async (targetPath?: string) => {
    const pathToFetch = targetPath || activePathRef.current || activeProjectPath;
    if (!pathToFetch) return;

    const thisSeq = ++requestSeqRef.current;
    setIsLoadingProject(true);

    try {
      const res = await fetch(`/api/project?path=${encodeURIComponent(pathToFetch)}`);
      if (!res.ok) return;
      if (thisSeq !== requestSeqRef.current) return; // Kullanıcı bu sırada başka projeye tıkladıysa eski yanıtı at

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
        setProjectName(data.project.name || '');
        setProjectPackage(data.project.package || '');
        setCurrentVersion(data.project.currentVersion || '');
        setCurrentBuildNumber(data.project.currentBuildNumber || 0);
        setGitBranch(data.project.branch || '');
        setIsGitClean(data.project.isClean ?? true);
        setHasPubspec(data.project.hasPubspec ?? false);
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
    } finally {
      if (thisSeq === requestSeqRef.current) {
        setIsLoadingProject(false);
      }
    }
  };

  // KALICI PİPELİNE DURUMUNU YÜKLE (Sayfa yenilendiğinde veya projeye dönüldüğünde)
  const loadPipelineStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/release/status');
      if (res.ok) {
        const data = await res.json() as {
          active?: boolean;
          pipeline?: {
            projectPath: string;
            projectName: string;
            isReleasing: boolean;
            completed: boolean;
            failed: boolean;
            currentStageId: number;
            totalStages: number;
            stages: PipelineStep[];
            logs: string[];
          } | null;
          status?: {
            projectPath: string;
            projectName: string;
            isReleasing: boolean;
            completed: boolean;
            failed: boolean;
            currentStageId: number;
            totalStages: number;
            stages: PipelineStep[];
            logs: string[];
          } | null;
        };
        const st = data.pipeline || data.status;
        if (st) {
          setIsReleasing(st.isReleasing);
          setReleaseCompleted(st.completed);
          setActivePipelineProject(st.projectPath);
          setActiveStepIndex(st.currentStageId);
          if (st.stages && st.stages.length > 0) {
            setSteps(st.stages);
          }
          if (st.logs && st.logs.length > 0) {
            setLogs(st.logs);
          }
        }
      }
    } catch (err) {
      console.error('Pipeline durumu yüklenemedi:', err);
    }
  }, []);

  // CANLI SSE DİNLEYİCİSİ (Boru Hattı Senkronizasyonu & Sayfa Yenilense Bile Canlı Kalır)
  useEffect(() => {
    void loadProjectsAndActive();
    void loadPipelineStatus();

    const eventSource = new EventSource('/api/release/events');

    eventSource.onmessage = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data as string) as {
          type: 'sync' | 'pipeline_init' | 'pipeline_update' | 'pipeline_completed' | 'pipeline_failed';
          pipeline?: {
            projectPath: string;
            projectName: string;
            isReleasing: boolean;
            completed: boolean;
            failed: boolean;
            currentStageId: number;
            totalStages: number;
            stages: PipelineStep[];
            logs: string[];
          };
          projectPath?: string;
          projectName?: string;
          stages?: PipelineStep[];
          logs?: string[];
        };

        if (payload.type === 'sync' && payload.pipeline) {
          const p = payload.pipeline;
          setIsReleasing(p.isReleasing);
          setReleaseCompleted(p.completed);
          setActivePipelineProject(p.projectPath);
          setActiveStepIndex(p.currentStageId);
          if (p.stages && p.stages.length > 0) setSteps(p.stages);
          if (p.logs && p.logs.length > 0) setLogs(p.logs);

          setProjects((prev) =>
            prev.map((item) =>
              item.path === p.projectPath
                ? { ...item, releasing: p.isReleasing, currentStageId: p.currentStageId, totalStages: p.totalStages }
                : item
            )
          );
        } else if (payload.type === 'pipeline_init') {
          setIsReleasing(true);
          setReleaseCompleted(false);
          if (payload.projectPath) setActivePipelineProject(payload.projectPath);
          if (payload.stages) setSteps(payload.stages);
          if (payload.logs) setLogs(payload.logs);
          setActiveStepIndex(1);

          setProjects((prev) =>
            prev.map((item) =>
              item.path === payload.projectPath
                ? { ...item, releasing: true, currentStageId: 1, totalStages: 6 }
                : item
            )
          );
        } else if (payload.type === 'pipeline_update' && payload.pipeline) {
          const p = payload.pipeline;
          setIsReleasing(p.isReleasing);
          setReleaseCompleted(p.completed);
          setActivePipelineProject(p.projectPath);
          setActiveStepIndex(p.currentStageId);
          if (p.stages && p.stages.length > 0) setSteps(p.stages);
          if (p.logs && p.logs.length > 0) setLogs(p.logs);

          setProjects((prev) =>
            prev.map((item) =>
              item.path === p.projectPath
                ? { ...item, releasing: p.isReleasing, currentStageId: p.currentStageId, totalStages: p.totalStages }
                : item
            )
          );
        } else if (payload.type === 'pipeline_completed' && payload.pipeline) {
          const p = payload.pipeline;
          setIsReleasing(false);
          setReleaseCompleted(true);
          setActiveStepIndex(6);
          if (p.stages && p.stages.length > 0) setSteps(p.stages);
          if (p.logs && p.logs.length > 0) setLogs(p.logs);

          setProjects((prev) =>
            prev.map((item) =>
              item.path === p.projectPath
                ? { ...item, releasing: false, currentStageId: 6, totalStages: 6 }
                : item
            )
          );

          // Dağıtım bittiğinde mağaza sürümlerini ve proje detaylarını anında senkronize et
          void handleSyncStores();
          void fetchProjectDetails();
        } else if (payload.type === 'pipeline_failed' && payload.pipeline) {
          const p = payload.pipeline;
          setIsReleasing(false);
          setReleaseCompleted(false);
          if (p.stages && p.stages.length > 0) setSteps(p.stages);
          if (p.logs && p.logs.length > 0) setLogs(p.logs);

          setProjects((prev) =>
            prev.map((item) =>
              item.path === p.projectPath
                ? { ...item, releasing: false }
                : item
            )
          );
        }
      } catch (err) {
        console.error('SSE mesaj işleme hatası:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [loadProjectsAndActive, loadPipelineStatus]);

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

  // PROJE DEĞİŞTİR (Sıralamayı bozmadan, anında ve karışıklık olmadan geçiş yap)
  const handleSwitchProject = async (targetPath: string) => {
    if (targetPath === activeProjectPath) return;

    // 1. Aktif yolu hemen güncelle
    setActiveProjectPath(targetPath);
    activePathRef.current = targetPath;

    // 2. Anında Optimistic Update: Hedef projenin verilerini sidebar listesinden anında ekrana yansıt
    const targetProj = projects.find(p => p.path === targetPath);
    if (targetProj) {
      setProjectName(targetProj.name);
      setProjectPackage(targetProj.package || '');
      setCurrentVersion(targetProj.version || '');
      setCurrentBuildNumber(targetProj.buildNumber || 0);
      setActiveComparison(targetProj.stores || null);
    }

    // 3. Eski projenin commit'lerini ve sürüm notlarını anında sıfırla (veriler ASLA karışmasın)
    setCommits([]);
    setReleaseNotesTR('');
    setReleaseNotesEN('');

    // 4. Arka plandan taze detayları ve kimlik bilgilerini çek
    await fetchProjectDetails(targetPath);
    await loadStoreCredentials();
  };

  // TÜM FLUTTER PROJELERİNİ OTOMATİK KEŞFET VEYA BELİRTİLEN DİZİNİ TARA
  const handleAutoDiscover = async (customPath?: string) => {
    setIsDiscovering(true);
    try {
      const res = await fetch('/api/projects/auto-discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanPath: customPath || undefined }),
      });
      if (res.ok) {
        setShowScanModal(false);
        setScanPathInput('');
        await loadProjectsAndActive();
      }
    } catch (err) {
      console.error('Proje tarama hatası:', err);
    } finally {
      setIsDiscovering(false);
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

  // PROJEYİ LİSTEDEN KALDIR
  const handleRemoveProject = async (e: React.MouseEvent, projectPath: string, projectName: string) => {
    e.stopPropagation();
    if (!window.confirm(`"${projectName}" projesini listeden kaldırmak istediğinize emin misiniz?`)) {
      return;
    }
    try {
      const res = await fetch('/api/projects/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath }),
      });
      if (res.ok) {
        const data = await res.json() as { projects: ProjectEntry[]; activePath: string };
        setProjects(data.projects || []);
        if (data.activePath) {
          setActiveProjectPath(data.activePath);
        }
        await fetchProjectDetails();
      }
    } catch (err) {
      console.error('Proje kaldırma hatası:', err);
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

  // KENDİ GOOGLE PLAY APISINI BAĞLA VE KALICI KAYDET
  const handleSaveGooglePlay = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingGoogle(true);
    setGoogleTestResult({ testing: true, tested: false, success: false });
    try {
      const res = await fetch('/api/stores/save-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceAccountJson: googleJsonInput.trim() || undefined,
          keyPath: googlePathInput.trim() || undefined,
          saveGlobal,
        }),
      });
      const data = await res.json() as {
        success?: boolean;
        message?: string;
        error?: string;
        serviceAccount?: string;
        projectId?: string;
      };

      if (res.ok && data.success) {
        setGoogleTestResult({
          testing: false,
          tested: true,
          success: true,
          message: data.message || 'Google Play API anahtarı başarıyla kaydedildi ve doğrulandı.',
        });
        setGooglePlayInfo((prev) => ({
          ...prev,
          connected: true,
          serviceAccount: data.serviceAccount || prev.serviceAccount,
          projectId: data.projectId,
        }));
        await loadProjectsAndActive();
      } else {
        setGoogleTestResult({
          testing: false,
          tested: true,
          success: false,
          error: data.error || 'Google Play API kaydetme ve test başarısız oldu.',
        });
      }
    } catch (err) {
      setGoogleTestResult({
        testing: false,
        tested: true,
        success: false,
        error: `Sunucu bağlantı hatası: ${String(err)}`,
      });
    } finally {
      setIsSavingGoogle(false);
    }
  };

  // KENDİ APPLE APP STORE APISINI BAĞLA VE KALICI KAYDET
  const handleSaveAppleStore = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingApple(true);
    setAppleTestResult({ testing: true, tested: false, success: false });
    try {
      const res = await fetch('/api/stores/save-apple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: appleKeyIdInput.trim(),
          issuerId: appleIssuerIdInput.trim(),
          privateKey: applePrivateKeyInput.trim() || undefined,
          saveGlobal,
        }),
      });
      const data = await res.json() as {
        success?: boolean;
        message?: string;
        error?: string;
        keyId?: string;
        issuerId?: string;
        details?: string;
      };

      if (res.ok && data.success) {
        setAppleTestResult({
          testing: false,
          tested: true,
          success: true,
          message: data.details || data.message || 'Apple App Store Connect API anahtarı başarıyla kaydedildi.',
        });
        setAppStoreInfo((prev) => ({
          ...prev,
          connected: true,
          keyId: data.keyId || prev.keyId,
          issuerId: data.issuerId || prev.issuerId,
        }));
        await loadProjectsAndActive();
      } else {
        setAppleTestResult({
          testing: false,
          tested: true,
          success: false,
          error: data.error || 'Apple API kaydetme ve doğrulama başarısız oldu.',
        });
      }
    } catch (err) {
      setAppleTestResult({
        testing: false,
        tested: true,
        success: false,
        error: `Sunucu bağlantı hatası: ${String(err)}`,
      });
    } finally {
      setIsSavingApple(false);
    }
  };

  // AI SÜRÜM NOTLARI ÜRETİMİ
  const handleGenerateAI = async () => {
    setIsGeneratingAI(true);
    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commits, version: nextVersion, projectPath: activeProjectPath }),
      });
      if (response.ok) {
        const data = await response.json() as {
          notesTr?: string;
          notesEn?: string;
          notes?: { tr?: { full: string[] }; en?: { full: string[] } };
        };
        if (data.notesTr) {
          setReleaseNotesTR(data.notesTr);
        } else if (data.notes?.tr?.full) {
          setReleaseNotesTR(data.notes.tr.full.map((item: string) => `• ${item}`).join('\n'));
        }

        if (data.notesEn) {
          setReleaseNotesEN(data.notesEn);
        } else if (data.notes?.en?.full) {
          setReleaseNotesEN(data.notes.en.full.map((item: string) => `• ${item}`).join('\n'));
        }
      } else {
        const errText = await response.text();
        console.error('AI notları üretilemedi (HTTP hata):', response.status, errText);
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
    if (!releaseNotesTR.trim() || !releaseNotesEN.trim()) {
      alert('Dağıtımı başlatmak için Türkçe ve İngilizce sürüm notları zorunludur. Lütfen önce "Commitlerden Üret" butonuna tıklayarak AI ile notları oluşturun.');
      return;
    }

    setIsReleasing(true);
    setReleaseCompleted(false);
    setActiveStepIndex(1);
    setActivePipelineProject(activeProjectPath);
    setSteps(initialStages.map((s, idx) => (idx === 0 ? { ...s, status: 'running' } : { ...s, status: 'pending' })));
    setLogs([
      `[${new Date().toLocaleTimeString()}] Sürüm dağıtım orkestrasyonu başlatıldı...`,
      `[${new Date().toLocaleTimeString()}] Hedef Sürüm: ${nextVersion}+${nextBuildNumber}`,
      `[${new Date().toLocaleTimeString()}] Proje: ${projectName} (${activeProjectPath})`,
    ]);

    // Sidebar'daki aktif projeyi anında "dağıtılıyor" yap (Optimistic Update)
    setProjects((prev) =>
      prev.map((item) =>
        item.path === activeProjectPath
          ? { ...item, releasing: true, currentStageId: 1, totalStages: 6 }
          : item
      )
    );

    try {
      const response = await fetch('/api/release/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: activeProjectPath,
          projectName,
          version: nextVersion,
          buildNumber: nextBuildNumber,
          bump: bumpType === 'custom' ? undefined : bumpType,
          manualVersion: bumpType === 'custom' ? customVersion : undefined,
          dryRun: isDryRun,
          skipAndroid: !targetAndroid,
          skipIos: !targetIos,
          googleTrack,
          rollout: rolloutPercentage,
          notesTr: releaseNotesTR,
          notesEn: releaseNotesEN,
        }),
      });

      if (!response.ok) {
        const errData = await response.json() as { error?: string };
        const errMsg = errData.error || 'Dağıtım başlatılamadı';
        setIsReleasing(false);
        setLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] HATA: ${errMsg}`,
        ]);
      }
    } catch (err) {
      setIsReleasing(false);
      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Sunucu bağlantı hatası: ${err instanceof Error ? err.message : String(err)}`,
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

          {/* EYLEMLER: PROJELERİ TARA & MAĞAZALARI TARA & MANUEL EKLE */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => void handleAutoDiscover()}
              disabled={isDiscovering}
              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-secondary text-secondary-foreground text-[11px] font-medium hover:bg-secondary/80 transition-all border border-border cursor-pointer disabled:opacity-60"
              title="Sistemdeki ve çalışma dizinindeki tüm Flutter projelerini otomatik tara"
            >
              <Compass className={`w-3 h-3 ${isDiscovering ? 'animate-spin text-primary' : 'text-primary'}`} />
              <span className="truncate">{isDiscovering ? 'Aranıyor...' : 'Projeleri Tara'}</span>
            </button>

            <button
              onClick={() => void handleSyncStores()}
              disabled={isSyncingStores}
              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-secondary text-secondary-foreground text-[11px] font-medium hover:bg-secondary/80 transition-all border border-border cursor-pointer disabled:opacity-60"
              title="Google Play ve App Store API'lerini sorgula ve sürümleri karşılaştır"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncingStores ? 'animate-spin text-primary' : ''}`} />
              <span className="truncate">{isSyncingStores ? 'Taranıyor...' : 'Mağazalar'}</span>
            </button>

            <button
              onClick={() => setShowScanModal(true)}
              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 transition-all shadow-sm cursor-pointer"
              title="Özel Klasör Tara veya Proje Ekle"
            >
              <FolderPlus className="w-3 h-3" />
              <span>Dizin Tara</span>
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
            const isReleasingThis = Boolean(p.releasing || (activePipelineProject === p.path && isReleasing));
            const currentStage = p.currentStageId || (activePipelineProject === p.path ? activeStepIndex : 1) || 1;
            const totalStageCount = p.totalStages || 6;
            const comp = p.stores;
            return (
              <div
                key={p.id}
                onClick={() => void handleSwitchProject(p.path)}
                className={`group relative p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer overflow-hidden ${
                  isReleasingThis
                    ? 'border-primary ring-2 ring-primary/40 bg-card shadow-md animate-pulse'
                    : isSelected
                    ? 'border-primary/80 bg-card ring-1 ring-primary/25 shadow-sm'
                    : 'border-sidebar-border/80 bg-sidebar/50 hover:bg-sidebar-accent/60 hover:border-sidebar-border shadow-xs'
                }`}
              >
                {/* AKTİF VEYA DAĞITILAN PROJE SOL VURGU ÇİZGİSİ */}
                {isReleasingThis ? (
                  <div className="absolute left-0 top-2 bottom-2 w-1.5 bg-primary rounded-r-full animate-pulse" />
                ) : isSelected ? (
                  <div className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-primary rounded-r-full" />
                ) : null}

                {/* PROJE BAŞLIĞI VE İKONU */}
                <div className="flex items-center gap-2.5 mb-2.5">
                  <ProjectAppIcon path={p.path} name={p.name} className="w-8 h-8 rounded-lg shadow-xs shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div className="font-semibold text-xs text-foreground tracking-tight truncate" title={p.name}>
                        {p.name}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => void handleRemoveProject(e, p.path, p.name)}
                        title="Projeyi Listeden Kaldır"
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-md shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="text-[10px] font-mono text-muted-foreground/80 truncate" title={p.package}>
                      {p.package || 'com.example.app'}
                    </div>
                  </div>
                </div>

                {/* YEREL SÜRÜM & MAĞAZA DURUM ROZETİ */}
                <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-muted/40 border border-border/40 text-[11px] mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Yerel</span>
                    <span className="font-mono font-semibold text-foreground text-xs">
                      v{p.version || '1.0.0'}
                      <span className="text-[10px] font-normal text-muted-foreground ml-1">#{p.buildNumber || 1}</span>
                    </span>
                  </div>
                  {isReleasingThis ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shrink-0 bg-primary/15 text-primary border border-primary/30 animate-pulse">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      <span>Dağıtılıyor ({currentStage}/{totalStageCount})</span>
                    </span>
                  ) : (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 shrink-0 ${
                      comp?.comparisonStatus === 'UPDATE_READY'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : comp?.comparisonStatus === 'UP_TO_DATE'
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                        : comp?.comparisonStatus === 'NEW_APP'
                        ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                        : 'bg-muted text-muted-foreground border border-border/60'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        comp?.comparisonStatus === 'UPDATE_READY'
                          ? 'bg-emerald-500'
                          : comp?.comparisonStatus === 'UP_TO_DATE'
                          ? 'bg-blue-500'
                          : comp?.comparisonStatus === 'NEW_APP'
                          ? 'bg-purple-500'
                          : 'bg-muted-foreground'
                      }`} />
                      {comp?.badge || 'Bekliyor'}
                    </span>
                  )}
                </div>

                {/* CANLI MAĞAZA KARŞILAŞTIRMA DETAYLARI (2 KOLONLU MİKRO GRID) */}
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  {/* GOOGLE PLAY */}
                  <div className="p-1.5 rounded-lg bg-background/50 border border-border/40 flex flex-col justify-between">
                    <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground mb-0.5">
                      <GooglePlayIcon className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">Google Play</span>
                    </div>
                    <div className="font-mono text-[11px] font-medium truncate">
                      {comp?.googlePlay?.status === 'live' ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          {comp.googlePlay.version
                            ? (comp.googlePlay.version.startsWith('v') ? comp.googlePlay.version : `v${comp.googlePlay.version}`)
                            : comp.googlePlay.versionCode
                              ? `#${comp.googlePlay.versionCode}`
                              : 'Yayında'}
                        </span>
                      ) : comp?.googlePlay?.status === 'not_found' ? (
                        <span className="text-muted-foreground/70 text-[10px]">Kayıtlı Değil</span>
                      ) : comp?.googlePlay?.status === 'auth_error' ? (
                        <span className="text-amber-500 text-[10px]">Yetki Gerekli</span>
                      ) : (
                        <span className="text-muted-foreground/60 text-[10px]">-</span>
                      )}
                    </div>
                  </div>

                  {/* APPLE APP STORE */}
                  <div className="p-1.5 rounded-lg bg-background/50 border border-border/40 flex flex-col justify-between">
                    <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground mb-0.5">
                      <AppStoreConnectIcon className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">App Store</span>
                    </div>
                    <div className="font-mono text-[11px] font-medium truncate">
                      {comp?.appStore?.status === 'live' ? (
                        <span className="text-sky-600 dark:text-sky-400 font-semibold">
                          {comp.appStore.version
                            ? (comp.appStore.version.startsWith('v') ? comp.appStore.version : `v${comp.appStore.version}`)
                            : comp.appStore.buildNumber
                              ? `#${comp.appStore.buildNumber}`
                              : 'Yayında'}
                        </span>
                      ) : comp?.appStore?.status === 'not_found' ? (
                        <span className="text-muted-foreground/70 text-[10px]">Kayıtlı Değil</span>
                      ) : (
                        <span className="text-muted-foreground/60 text-[10px]">-</span>
                      )}
                    </div>
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
              <span>Mağaza API & Bağlantı Yönetimi</span>
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
          <div className="flex items-center gap-3">
            <ProjectAppIcon path={activeProjectPath} name={projectName || 'Proje'} className="w-10 h-10 rounded-xl shadow-sm border border-border" />
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold tracking-tight text-foreground">{projectName || 'Proje Seçilmedi'}</h2>
                {projectPackage && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border">
                    {projectPackage}
                  </span>
                )}
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
                {activeProjectPath ? (
                  <>{activeProjectPath} • branch: <span className="text-emerald-500">{gitBranch || 'main'}</span></>
                ) : (
                  <span className="text-muted-foreground/60">Aktif proje dizini seçilmedi</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowStoreTestModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-secondary transition-all cursor-pointer"
            >
              <Key className="w-3.5 h-3.5 text-primary" />
              <span>API Kimliklerini Yapılandır</span>
            </button>

            <button
              onClick={() => void handleSyncStores()}
              disabled={isSyncingStores}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-secondary transition-all cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingStores ? 'animate-spin text-primary' : ''}`} />
              <span>{isSyncingStores ? 'Taranıyor...' : 'Mağaza Senkronizasyonu'}</span>
            </button>
          </div>
        </header>

        <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
          {/* ===================== CANLI STORE KARŞILAŞTIRMA MATRİSİ ===================== */}
          <section className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <span className="flex items-center gap-1.5">
                    <GooglePlayIcon className="w-4 h-4 shrink-0" />
                    <AppStoreConnectIcon className="w-4 h-4 shrink-0" />
                  </span>
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
                  <span className="font-mono text-emerald-500">{gitBranch || 'main'}</span>
                </div>
                <div className="pt-1">
                  <div className="text-2xl font-extrabold font-mono text-foreground">
                    {currentVersion ? (currentVersion.startsWith('v') ? currentVersion : `v${currentVersion}`) : '-'}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">
                    Build Numarası: #{currentBuildNumber || 1}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                  {commits.length > 0 ? (
                    <>Son Commit: <span className="font-mono text-foreground font-semibold">{commits[0]?.hash.substring(0, 7)}</span> ({commits.length} commit incelendi)</>
                  ) : isLoadingProject ? (
                    <span className="text-muted-foreground/80 italic">Commit geçmişi analiz ediliyor...</span>
                  ) : (
                    <span className="text-muted-foreground/60">İncelenen commit bulunamadı</span>
                  )}
                </div>
              </div>

              {/* 2. GOOGLE PLAY CONSOLE */}
              <div className="p-4 rounded-lg border border-border bg-background/50 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <GooglePlayIcon className="w-4 h-4" /> Google Play Console
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    googlePlayInfo.connected ? 'text-emerald-500 bg-emerald-500/10' : 'text-muted-foreground bg-secondary'
                  }`}>
                    {googlePlayInfo.connected ? 'API Bağlı' : 'Bağlı Değil'}
                  </span>
                </div>
                <div className="pt-1">
                  <div className="text-2xl font-extrabold font-mono text-foreground flex items-baseline gap-2">
                    {activeComparison?.googlePlay?.status === 'live' ? (
                      activeComparison.googlePlay.version ? (
                        <span>{activeComparison.googlePlay.version.startsWith('v') ? activeComparison.googlePlay.version : `v${activeComparison.googlePlay.version}`}</span>
                      ) : activeComparison.googlePlay.versionCode ? (
                        <span>#{activeComparison.googlePlay.versionCode}</span>
                      ) : (
                        <span>Yayında</span>
                      )
                    ) : activeComparison?.googlePlay?.status === 'not_found' ? (
                      <span className="text-muted-foreground text-lg">Kayıtlı Değil</span>
                    ) : activeComparison?.googlePlay?.status === 'auth_error' ? (
                      <span className="text-rose-500 text-lg">Yetki Gerekli</span>
                    ) : googlePlayInfo.connected ? (
                      <span className="text-emerald-500 text-lg">Bağlantı Hazır</span>
                    ) : (
                      <span className="text-muted-foreground text-lg">Yapılandırılmadı</span>
                    )}
                    {activeComparison?.googlePlay?.versionCode ? (
                      <span className="text-xs font-normal text-muted-foreground font-mono">
                        (Build #{activeComparison.googlePlay.versionCode})
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground truncate" title={googlePlayInfo.serviceAccount}>
                    Hesap: {googlePlayInfo.serviceAccount ? googlePlayInfo.serviceAccount.split('@')[0] : 'play-store-deployer'}
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
                    <AppStoreConnectIcon className="w-4 h-4 shrink-0" /> App Store Connect
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    appStoreInfo.connected ? 'text-sky-400 bg-sky-500/10' : 'text-muted-foreground bg-secondary'
                  }`}>
                    {appStoreInfo.connected ? 'API Bağlı' : 'Yapılandırılmadı'}
                  </span>
                </div>
                <div className="pt-1">
                  <div className="text-2xl font-extrabold font-mono text-foreground flex items-baseline gap-2">
                    {activeComparison?.appStore?.status === 'live' ? (
                      activeComparison.appStore.version ? (
                        <span>{activeComparison.appStore.version.startsWith('v') ? activeComparison.appStore.version : `v${activeComparison.appStore.version}`}</span>
                      ) : activeComparison.appStore.buildNumber ? (
                        <span>#{activeComparison.appStore.buildNumber}</span>
                      ) : (
                        <span>Yayında</span>
                      )
                    ) : activeComparison?.appStore?.status === 'not_found' ? (
                      <span className="text-muted-foreground text-lg">Kayıtlı Değil</span>
                    ) : appStoreInfo.connected ? (
                      <span className="text-sky-400 text-lg">Bağlantı Hazır</span>
                    ) : (
                      <span className="text-muted-foreground text-lg">Yapılandırılmadı</span>
                    )}
                    {activeComparison?.appStore?.buildNumber ? (
                      <span className="text-xs font-normal text-muted-foreground font-mono">
                        (Build #{activeComparison.appStore.buildNumber})
                      </span>
                    ) : null}
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
                  <span className="flex items-center gap-1.5">
                    <GooglePlayIcon className="w-4 h-4 shrink-0" />
                    <AppStoreConnectIcon className="w-4 h-4 shrink-0" />
                  </span>
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
                        <GooglePlayIcon className="w-4 h-4 shrink-0" />
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
                        <AppStoreConnectIcon className="w-4 h-4 shrink-0" />
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
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer disabled:opacity-50 ${
                      (!releaseNotesTR.trim() || !releaseNotesEN.trim()) && commits.length > 0
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm hover:opacity-90 ring-2 ring-primary/30'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-border'
                    }`}
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isGeneratingAI ? 'animate-spin' : ''}`} />
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
                        disabled={!releaseNotesTR.trim()}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {copiedLang === 'tr' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>Kopyala</span>
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      value={releaseNotesTR}
                      onChange={(e) => setReleaseNotesTR(e.target.value)}
                      placeholder="Sürüm notu henüz oluşturulmadı. 'Commitlerden Üret' butonuna tıklayarak AI ile oluşturun veya buraya manuel girin..."
                      className="w-full text-xs p-3 rounded-lg border border-border bg-background text-foreground font-sans focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed placeholder:text-muted-foreground/60"
                    />
                  </div>

                  {/* İNGİLİZCE NOTLAR */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">İngilizce (Global Store)</span>
                      <button
                        onClick={() => handleCopyNotes('en')}
                        disabled={!releaseNotesEN.trim()}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {copiedLang === 'en' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>Kopyala</span>
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      value={releaseNotesEN}
                      onChange={(e) => setReleaseNotesEN(e.target.value)}
                      placeholder="Release notes not generated yet. Click 'Generate from Commits' to create with AI or enter manually..."
                      className="w-full text-xs p-3 rounded-lg border border-border bg-background text-foreground font-sans focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed placeholder:text-muted-foreground/60"
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
                    6 kurumsal aşamalı sıralı dağıtım zincirini yürütür.
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

                {/* SÜRÜM NOTU GÜVENLİK KİLİDİ UYARISI */}
                {(!releaseNotesTR.trim() || !releaseNotesEN.trim()) && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                    <div className="space-y-0.5">
                      <span className="font-semibold block">Dağıtım Güvenlik Kilidi Aktif</span>
                      <span className="text-[11px] leading-relaxed block text-muted-foreground">
                        Dağıtımın başlayabilmesi için hem Türkçe hem İngilizce sürüm notları zorunludur. Lütfen soldaki &quot;Commitlerden Üret&quot; butonuna tıklayarak AI ile notları oluşturun.
                      </span>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => void handleStartRelease()}
                  disabled={isReleasing || !releaseNotesTR.trim() || !releaseNotesEN.trim()}
                  className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-bold text-sm shadow transition-all cursor-pointer ${
                    !releaseNotesTR.trim() || !releaseNotesEN.trim()
                      ? 'bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-60'
                      : 'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed'
                  }`}
                  title={!releaseNotesTR.trim() || !releaseNotesEN.trim() ? 'Dağıtımı başlatmak için sürüm notları gereklidir' : 'Sürüm Dağıtımını Başlat'}
                >
                  <Rocket className={`w-4 h-4 ${isReleasing ? 'animate-bounce' : ''}`} />
                  <span>
                    {isReleasing
                      ? 'Dağıtım Yürütülüyor...'
                      : !releaseNotesTR.trim() || !releaseNotesEN.trim()
                      ? 'Sürüm Notları Gerekli (AI ile Üretin)'
                      : 'Sürüm Dağıtımını Başlat'}
                  </span>
                </button>

                {releaseCompleted && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs text-center font-medium flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Sürüm {nextVersion} başarıyla dağıtıldı!</span>
                  </div>
                )}
              </div>

              {/* 6 AŞAMALI SIRALI BORU HATTI STEPPER */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    Dağıtım Boru Hattı (6 Aşama)
                  </h4>
                  <span className="text-xs font-mono font-semibold text-primary">
                    {activeStepIndex}/6
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
                        <div className="truncate">
                          <span className="truncate block font-medium">{step.name}</span>
                          {step.details && (
                            <span className="text-[10px] text-muted-foreground/80 block truncate">
                              {step.details}
                            </span>
                          )}
                        </div>
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

      {/* ===================== MODAL: DİZİN / KLASÖR TARA (AUTO-DISCOVER) ===================== */}
      {showScanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-sm flex items-center gap-2 text-foreground">
                <Compass className="w-4 h-4 text-primary" />
                Ortamdaki Flutter Projelerini Tara ve İçe Aktar
              </h3>
              <button
                onClick={() => setShowScanModal(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-muted-foreground leading-relaxed">
                Webicro Distribution, belirttiğiniz dizin veya genel geliştirici klasörlerinizdeki tüm Flutter (<code>pubspec.yaml</code> içeren) uygulamalarını otomatik olarak tespit eder, paket kimliklerini çıkartır ve mağaza durumlarıyla eşleştirir.
              </p>

              {/* HIZLI OTOMATİK TARAMA */}
              <div className="p-3.5 rounded-lg bg-secondary/50 border border-border space-y-2">
                <div className="font-semibold text-foreground flex items-center justify-between">
                  <span>1. Genel Çalışma Alanını Otomatik Tara</span>
                  <span className="text-[10px] text-muted-foreground font-mono">Desktop, Workspace, Projects</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Ev dizininizdeki standart proje klasörlerini ve mevcut deponun kardeş dizinlerini derinlemesine tarar.
                </p>
                <button
                  type="button"
                  onClick={() => void handleAutoDiscover()}
                  disabled={isDiscovering}
                  className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow hover:opacity-90 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Compass className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
                  <span>{isDiscovering ? 'Sistem Taranıyor...' : 'Tüm Standart Dizinleri Otomatik Tara'}</span>
                </button>
              </div>

              {/* ÖZEL BİR KLASÖR YOLU GİREREK TARAMA */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (scanPathInput.trim()) {
                    void handleAutoDiscover(scanPathInput.trim());
                  }
                }}
                className="p-3.5 rounded-lg border border-border bg-background space-y-2.5"
              >
                <div className="font-semibold text-foreground">
                  2. Özel Bir Klasör Dizinini Tara
                </div>
                <div>
                  <input
                    type="text"
                    value={scanPathInput}
                    onChange={(e) => setScanPathInput(e.target.value)}
                    placeholder="örneğin: /Users/adiniz/Desktop/Projelerim veya C:\Projeler"
                    className="w-full text-xs font-mono px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-[10px] text-muted-foreground mt-1 block">
                    Bu klasörün altındaki tüm alt dizinler taranır ve bulunan tüm Flutter projeleri listeye eklenir.
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={isDiscovering || !scanPathInput.trim()}
                  className="w-full py-2 rounded-lg bg-secondary text-secondary-foreground font-semibold text-xs border border-border hover:bg-secondary/80 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin text-primary' : ''}`} />
                  <span>{isDiscovering ? 'Dizin Taranıyor...' : 'Bu Klasörü Tara ve Projeleri Getir'}</span>
                </button>
              </form>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  setShowScanModal(false);
                  setShowAddProjectModal(true);
                }}
                className="text-xs text-primary hover:underline cursor-pointer"
              >
                + Tek bir projeyi doğrudan dosya yoluyla ekle
              </button>
              <button
                type="button"
                onClick={() => setShowScanModal(false)}
                className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-secondary cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: KENDİ APİ'NE BAĞLAN & MAĞAZA DOĞRULAMA ===================== */}
      {showStoreTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-3xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2 text-foreground">
                  <Key className="w-5 h-5 text-primary" />
                  Kendi API Kimliklerini Bağla & Doğrula
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Bu projeye ({projectName}) veya tüm projelerinize kendi Google Play ve App Store API anahtarlarınızı bağlayın.
                </p>
              </div>
              <button
                onClick={() => setShowStoreTestModal(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SEKMELER: GOOGLE PLAY / APPLE APP STORE */}
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <button
                onClick={() => setActiveStoreTab('google')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                  activeStoreTab === 'google'
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                    : 'bg-background text-muted-foreground border-transparent hover:bg-secondary'
                }`}
              >
                <GooglePlayIcon className="w-4 h-4 shrink-0" />
                <span>Google Play Console API</span>
                {googlePlayInfo.connected && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
              </button>

              <button
                onClick={() => setActiveStoreTab('apple')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                  activeStoreTab === 'apple'
                    ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                    : 'bg-background text-muted-foreground border-transparent hover:bg-secondary'
                }`}
              >
                <AppStoreConnectIcon className="w-4 h-4 shrink-0" />
                <span>Apple App Store Connect API</span>
                {appStoreInfo.connected && <span className="w-2 h-2 rounded-full bg-sky-400"></span>}
              </button>
            </div>

            {/* TAB 1: GOOGLE PLAY API BAĞLANTI FORMU */}
            {activeStoreTab === 'google' && (
              <form onSubmit={(e) => void handleSaveGooglePlay(e)} className="space-y-4">
                <div className="p-3 rounded-lg bg-background border border-border flex items-center justify-between text-xs">
                  <div>
                    <span className="text-muted-foreground">Aktif Kayıtlı Hesap:</span>{' '}
                    <span className="font-mono font-semibold text-foreground">
                      {googlePlayInfo.serviceAccount}
                    </span>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    googlePlayInfo.connected
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}>
                    {googlePlayInfo.connected ? 'Bağlantı Hazır' : 'Bekliyor'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Google Cloud Service Account JSON İçeriği:</span>
                    <span className="text-[10px] font-normal text-muted-foreground">JSON dosyasını açıp içeriğini yapıştırın</span>
                  </label>
                  <textarea
                    rows={6}
                    value={googleJsonInput}
                    onChange={(e) => setGoogleJsonInput(e.target.value)}
                    placeholder='{"type": "service_account", "project_id": "...", "private_key_id": "...", "private_key": "-----BEGIN PRIVATE KEY...", "client_email": "play-store-deployer@..."}'
                    className="w-full text-xs font-mono p-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Veya Doğrudan JSON Dosya Yolu:</span>
                    <span className="text-[10px] font-normal text-muted-foreground">örneğin: ~/.secrets/google-play-key.json</span>
                  </label>
                  <input
                    type="text"
                    value={googlePathInput}
                    onChange={(e) => setGooglePathInput(e.target.value)}
                    placeholder="/Users/.../.secrets/google-play-key.json"
                    className="w-full text-xs font-mono px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {googleTestResult.tested && (
                  <div className={`p-3 rounded-lg text-xs border ${
                    googleTestResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                  }`}>
                    {googleTestResult.success ? (
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>{googleTestResult.message || 'Google Play Service Account başarıyla bağlandı ve kaydedildi!'}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <X className="w-3.5 h-3.5 shrink-0" />
                        <span>{googleTestResult.error || 'Doğrulama başarısız oldu.'}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveGlobal}
                      onChange={(e) => setSaveGlobal(e.target.checked)}
                      className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                    />
                    <span>Tüm projeler için genel (global) anahtar olarak kaydet</span>
                  </label>

                  <button
                    type="submit"
                    disabled={isSavingGoogle || (!googleJsonInput.trim() && !googlePathInput.trim())}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow hover:opacity-90 cursor-pointer disabled:opacity-50"
                  >
                    <Save className={`w-3.5 h-3.5 ${isSavingGoogle ? 'animate-spin' : ''}`} />
                    <span>{isSavingGoogle ? 'Kaydediliyor & Test Ediliyor...' : 'Kaydet ve Bağlantıyı Doğrula'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: APPLE APP STORE CONNECT API FORMU */}
            {activeStoreTab === 'apple' && (
              <form onSubmit={(e) => void handleSaveAppleStore(e)} className="space-y-4">
                <div className="p-3 rounded-lg bg-background border border-border flex items-center justify-between text-xs">
                  <div>
                    <span className="text-muted-foreground">Aktif Key ID:</span>{' '}
                    <span className="font-mono font-semibold text-foreground">
                      {appStoreInfo.keyId}
                    </span>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    appStoreInfo.connected
                      ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}>
                    {appStoreInfo.connected ? 'Bağlantı Hazır' : 'Yapılandırılmadı'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground block">
                      App Store Key ID*:
                    </label>
                    <input
                      type="text"
                      required
                      value={appleKeyIdInput}
                      onChange={(e) => setAppleKeyIdInput(e.target.value)}
                      placeholder="örneğin: 2X9R427ADR"
                      className="w-full text-xs font-mono px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground block">
                      App Store Issuer ID (UUID)*:
                    </label>
                    <input
                      type="text"
                      required
                      value={appleIssuerIdInput}
                      onChange={(e) => setAppleIssuerIdInput(e.target.value)}
                      placeholder="57246542-96fe-1a63-e053-0824d011072a"
                      className="w-full text-xs font-mono px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>AuthKey .p8 Özel Anahtar İçeriği:</span>
                    <span className="text-[10px] font-normal text-muted-foreground">-----BEGIN PRIVATE KEY----- bloğunu yapıştırın</span>
                  </label>
                  <textarea
                    rows={5}
                    value={applePrivateKeyInput}
                    onChange={(e) => setApplePrivateKeyInput(e.target.value)}
                    placeholder="-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...\n-----END PRIVATE KEY-----"
                    className="w-full text-xs font-mono p-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
                  />
                </div>

                {appleTestResult.tested && (
                  <div className={`p-3 rounded-lg text-xs border ${
                    appleTestResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                  }`}>
                    {appleTestResult.success ? (
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>{appleTestResult.message || 'Apple App Store Connect API başarıyla bağlandı ve kaydedildi!'}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <X className="w-3.5 h-3.5 shrink-0" />
                        <span>{appleTestResult.error || 'Doğrulama başarısız oldu.'}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveGlobal}
                      onChange={(e) => setSaveGlobal(e.target.checked)}
                      className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                    />
                    <span>Tüm projeler için genel (global) anahtar olarak kaydet</span>
                  </label>

                  <button
                    type="submit"
                    disabled={isSavingApple || !appleKeyIdInput.trim() || !appleIssuerIdInput.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow hover:opacity-90 cursor-pointer disabled:opacity-50"
                  >
                    <Save className={`w-3.5 h-3.5 ${isSavingApple ? 'animate-spin' : ''}`} />
                    <span>{isSavingApple ? 'Kaydediliyor & Test Ediliyor...' : 'Kaydet ve Bağlantıyı Doğrula'}</span>
                  </button>
                </div>
              </form>
            )}
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
                  <GooglePlayIcon className="w-4 h-4 shrink-0" />
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
                    İndirilen JSON anahtarını kopyalayıp <strong>"API Kimliklerini Yapılandır"</strong> penceresindeki alana yapıştırın ve <strong>"Kaydet ve Bağlantıyı Doğrula"</strong> butonuna basın.
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
                  <AppStoreConnectIcon className="w-4 h-4 shrink-0" />
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
                    <code>.p8</code> uzantılı özel anahtar dosyasını indirin ve metin olarak açıp <strong>"API Kimliklerini Yapılandır"</strong> penceresindeki alana yapıştırın.
                  </li>
                  <li>
                    <strong>"Kaydet ve Bağlantıyı Doğrula"</strong> butonuna basarak kalıcı olarak hesabınıza bağlayın.
                  </li>
                </ol>
              </div>

              {/* TEST YÖNTEMLERİ */}
              <div className="p-4 rounded-xl border border-border bg-background space-y-2">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  3. Bağlantılar Nasıl Test Edilir?
                </h4>
                <p>
                  Üst menüdeki veya sol alttaki <strong>"API Kimliklerini Yapılandır"</strong> butonuna tıklayarak açılan pencereden her iki mağazanın canlı API el sıkışmasını tek tıkla test edebilir, istediğiniz zaman yeni anahtarlar tanımlayabilirsiniz. Kaydedilen anahtarlar proje dizininde kalıcı olarak saklanır ve sayfa yenilense dahi korunur.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
