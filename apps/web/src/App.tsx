import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Trash2,
  Eye,
  EyeOff,
  Cpu,
  Bot,
  Wrench,
  Search,
  FileText,
  Zap,
  Languages,
} from 'lucide-react';
import { GooglePlayIcon, AppStoreConnectIcon, ProjectAppIcon } from './components/icons';
import { Tooltip } from './components/ui/tooltip.js';
import { useToast } from './context/ToastContext.js';
import { useTranslation } from './i18n/index.js';

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
  project?: string;
  version: string;
  buildNumber: number;
  status: string;
  createdAt: string;
}

export interface AIDiagnosisResult {
  category:
    | 'STORE_POLICY'
    | 'STORE_API'
    | 'APP_CODE'
    | 'NATIVE_BUILD'
    | 'SIGNING'
    | 'ENVIRONMENT'
    | 'UNKNOWN';
  categoryTitle: string;
  source:
    'google_play' | 'app_store' | 'flutter_code' | 'native_gradle' | 'environment' | 'unknown';
  sourceLabel: string;
  rootCause: string;
  explanation: string;
  solutionSteps: string[];
  autoFixAvailable: boolean;
  autoFixAction?:
    'REMOVE_PHOTO_PERMISSIONS' | 'FLUTTER_CLEAN_RETRY' | 'FIX_SIGNING_CONFIG' | 'NONE';
  autoFixDescription?: string;
}

export interface ProjectPipelineState {
  projectPath: string;
  projectName?: string;
  targetVersion?: string;
  isReleasing: boolean;
  completed: boolean;
  failed: boolean;
  error?: string;
  diagnosis?: AIDiagnosisResult;
  currentStageId: number;
  totalStages: number;
  stages: PipelineStep[];
  logs: string[];
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
    appName?: string;
    bundleId?: string;
    appId?: string;
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
  iosBundleId?: string;
  appStoreOverrideBundleId?: string;
  appStoreAppName?: string;
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

export type GoogleTrack = 'internal' | 'alpha' | 'beta' | 'production';

export function compareSemver(v1: string, v2: string): number {
  const p1 = v1
    .replace(/^v/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const p2 = v2
    .replace(/^v/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const num1 = p1[i] ?? 0;
    const num2 = p2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export function isValidGoogleTrack(val: unknown): val is GoogleTrack {
  return val === 'internal' || val === 'alpha' || val === 'beta' || val === 'production';
}

export function resolveGoogleTrack(
  storeTrack?: string,
  projectPath?: string,
  configuredTrack?: string,
): GoogleTrack {
  if (isValidGoogleTrack(storeTrack)) {
    return storeTrack;
  }

  if (projectPath) {
    try {
      const saved = localStorage.getItem(`webicro_track_${projectPath}`);
      if (isValidGoogleTrack(saved)) {
        return saved;
      }
    } catch {}
  }

  if (isValidGoogleTrack(configuredTrack)) {
    return configuredTrack;
  }

  return 'internal';
}

function getGoogleTrackLabel(
  track: 'internal' | 'alpha' | 'beta' | 'production',
  t?: (key: string) => string,
): string {
  switch (track) {
    case 'internal':
      return t ? t('pipeline.trackInternal') : 'Internal';
    case 'alpha':
      return t ? t('pipeline.trackAlpha') : 'Alpha';
    case 'beta':
      return t ? t('pipeline.trackBeta') : 'Beta';
    case 'production':
      return t ? t('pipeline.trackProduction') : 'Production';
    default:
      return track;
  }
}

export interface AIModelOption {
  id: string;
  name: string;
  recommended?: boolean;
}

export function getSessionToken(): string | null {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
      sessionStorage.setItem('webicro_session_token', urlToken);
      return urlToken;
    }
  } catch {}

  try {
    const windowToken = (window as unknown as { __SESSION_TOKEN__?: string }).__SESSION_TOKEN__;
    if (windowToken) {
      sessionStorage.setItem('webicro_session_token', windowToken);
      return windowToken;
    }
  } catch {}

  try {
    return sessionStorage.getItem('webicro_session_token');
  } catch {
    return null;
  }
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return window.fetch(input, { ...init, headers });
}

export default function App() {
  const { toast } = useToast();
  const { t, language, toggleLanguage } = useTranslation();
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('webicro_theme');
      if (saved !== null) {
        return saved === 'dark';
      }
    } catch {}
    return false;
  });

  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [activeProjectPath, setActiveProjectPath] = useState<string>('');
  const [isSyncingStores, setIsSyncingStores] = useState<boolean>(false);
  const [isSyncingStoreVersion, setIsSyncingStoreVersion] = useState<boolean>(false);
  const [syncStoreSuccessMsg, setSyncStoreSuccessMsg] = useState<string | null>(null);
  const [appleConnectApps, setAppleConnectApps] = useState<
    { id: string; name: string; bundleId: string; sku?: string }[]
  >([]);
  const [isLoadingAppleApps, setIsLoadingAppleApps] = useState<boolean>(false);
  const [showAddProjectModal, setShowAddProjectModal] = useState<boolean>(false);
  const [newProjectPath, setNewProjectPath] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [isAddingProject, setIsAddingProject] = useState<boolean>(false);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [showScanModal, setShowScanModal] = useState<boolean>(false);
  const [scanPathInput, setScanPathInput] = useState<string>('');

  const [showStoreTestModal, setShowStoreTestModal] = useState<boolean>(false);
  const [showWikiModal, setShowWikiModal] = useState<boolean>(false);

  const [activeStoreTab, setActiveStoreTab] = useState<'google' | 'apple' | 'ai'>('google');
  const [googleJsonInput, setGoogleJsonInput] = useState<string>('');
  const [googlePathInput, setGooglePathInput] = useState<string>('');
  const [appleKeyIdInput, setAppleKeyIdInput] = useState<string>('');
  const [appleIssuerIdInput, setAppleIssuerIdInput] = useState<string>('');
  const [applePrivateKeyInput, setApplePrivateKeyInput] = useState<string>('');
  const [isSavingGoogle, setIsSavingGoogle] = useState<boolean>(false);
  const [isSavingApple, setIsSavingApple] = useState<boolean>(false);
  const [saveGlobal, setSaveGlobal] = useState<boolean>(false);

  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai' | 'anthropic' | 'conventional'>(
    'gemini',
  );
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState<string>('');
  const [geminiModelInput, setGeminiModelInput] = useState<string>('gemini-3.1-flash-lite');
  const [openaiApiKeyInput, setOpenaiApiKeyInput] = useState<string>('');
  const [openaiModelInput, setOpenaiModelInput] = useState<string>('gpt-4o-mini');
  const [anthropicApiKeyInput, setAnthropicApiKeyInput] = useState<string>('');
  const [anthropicModelInput, setAnthropicModelInput] = useState<string>(
    'claude-3-5-sonnet-20241022',
  );
  const [geminiModelList, setGeminiModelList] = useState<AIModelOption[]>([
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', recommended: true },
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', recommended: true },
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  ]);
  const [openaiModelList, setOpenaiModelList] = useState<AIModelOption[]>([
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', recommended: true },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'o3-mini', name: 'o3-mini' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  ]);
  const [anthropicModelList, setAnthropicModelList] = useState<AIModelOption[]>([
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', recommended: true },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet' },
  ]);
  const [isLoadingAiModels, setIsLoadingAiModels] = useState<boolean>(false);
  const [aiConfiguredInfo, setAiConfiguredInfo] = useState<{
    geminiConfigured?: boolean;
    geminiMaskedKey?: string;
    openaiConfigured?: boolean;
    openaiMaskedKey?: string;
    anthropicConfigured?: boolean;
    anthropicMaskedKey?: string;
  }>({});
  const [isSavingAI, setIsSavingAI] = useState<boolean>(false);
  const [isTestingAI, setIsTestingAI] = useState<boolean>(false);
  const [aiTestResult, setAiTestResult] = useState<{ success: boolean; message: string } | null>(
    null,
  );
  const [showAiKey, setShowAiKey] = useState<boolean>(false);
  const [isDiagnosing, setIsDiagnosing] = useState<boolean>(false);
  const [isAutoFixing, setIsAutoFixing] = useState<boolean>(false);
  const [autoFixSuccessMsg, setAutoFixSuccessMsg] = useState<string | null>(null);

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
  const [uncommittedFiles, setUncommittedFiles] = useState<string[]>([]);
  const [activeComparison, setActiveComparison] = useState<StoreComparison | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState<boolean>(false);
  const [gitRemote, setGitRemote] = useState<{
    connected: boolean;
    remoteUrl: string | null;
    webUrl: string | null;
    ownerRepo: string | null;
    provider: 'github' | 'gitlab' | 'bitbucket' | 'other';
    lastTag: string | null;
  }>({
    connected: false,
    remoteUrl: null,
    webUrl: null,
    ownerRepo: null,
    provider: 'github',
    lastTag: null,
  });
  const [isGitPushing, setIsGitPushing] = useState<boolean>(false);
  const [gitPushSuccessMsg, setGitPushSuccessMsg] = useState<string | null>(null);
  const [autoGitSync, setAutoGitSync] = useState<boolean>(true);

  const activePathRef = useRef<string>('');
  const requestSeqRef = useRef<number>(0);

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
    keyId: '',
    issuerId: '',
  });

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

  type TargetPlatformMode = 'all' | 'android' | 'ios';
  const [platformMode, setPlatformMode] = useState<TargetPlatformMode>('android');
  const [targetAndroid, setTargetAndroid] = useState<boolean>(true);
  const [targetIos, setTargetIos] = useState<boolean>(false);
  const [gitNativeChanges, setGitNativeChanges] = useState<{
    androidChanged: boolean;
    iosChanged: boolean;
    androidFiles: string[];
    iosFiles: string[];
  } | null>(null);

  const applyPlatformMode = useCallback(
    (mode: TargetPlatformMode, targetPath?: string) => {
      setPlatformMode(mode);
      if (mode === 'android') {
        setTargetAndroid(true);
        setTargetIos(false);
      } else if (mode === 'ios') {
        setTargetAndroid(false);
        setTargetIos(true);
      } else {
        setTargetAndroid(true);
        setTargetIos(true);
      }
      const p = targetPath || activePathRef.current || activeProjectPath;
      if (p) {
        try {
          localStorage.setItem(`webicro_platform_mode_${p}`, mode);
        } catch {}
      }
    },
    [activeProjectPath],
  );

  const [googleTrack, setGoogleTrack] = useState<'internal' | 'alpha' | 'beta' | 'production'>(
    'internal',
  );

  const [releaseNotesTR, setReleaseNotesTR] = useState<string>('');
  const [releaseNotesEN, setReleaseNotesEN] = useState<string>('');
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [copiedLang, setCopiedLang] = useState<'tr' | 'en' | null>(null);
  const [isLogsCopied, setIsLogsCopied] = useState<boolean>(false);

  const initialStages: PipelineStep[] = useMemo(
    () => [
      { id: 1, name: t('pipeline.step1'), status: 'pending' },
      { id: 2, name: t('pipeline.step2'), status: 'pending' },
      { id: 3, name: t('pipeline.step3'), status: 'pending' },
      { id: 4, name: t('pipeline.step4'), status: 'pending' },
      { id: 5, name: t('pipeline.step5'), status: 'pending' },
      { id: 6, name: t('pipeline.step6'), status: 'pending' },
    ],
    [t],
  );

  const getStepLocalizedName = useCallback(
    (step: PipelineStep): string => {
      const stepKey = `pipeline.step${step.id}`;
      const translated = t(stepKey);
      return translated !== stepKey ? translated : step.name;
    },
    [t],
  );

  const [projectPipelines, setProjectPipelines] = useState<Record<string, ProjectPipelineState>>(
    {},
  );

  const currentPipeline = projectPipelines[activeProjectPath];
  const isCurrentProjectReleasing = Boolean(currentPipeline?.isReleasing);
  const currentSteps =
    currentPipeline?.stages && currentPipeline.stages.length > 0
      ? currentPipeline.stages
      : initialStages;
  const currentLogs =
    currentPipeline?.logs && currentPipeline.logs.length > 0 ? currentPipeline.logs : [];
  const currentActiveStep = currentPipeline?.currentStageId || 0;
  const isCurrentCompleted = Boolean(currentPipeline?.completed);
  const currentDistributedVersion = currentPipeline?.targetVersion || '';

  const [activeMainTab, setActiveMainTab] = useState<'dashboard' | 'history'>('dashboard');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'success' | 'failed'>(
    'all',
  );
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');

  const [historyReleases, setHistoryReleases] = useState<ReleaseHistoryItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  const getReleaseStatusBadge = useCallback(
    (status: string) => {
      switch (status) {
        case 'RELEASED':
          return {
            label: t('pipeline.released'),
            sublabel: t('pipeline.liveOnStore'),
            className: 'bg-secondary text-secondary-foreground border-border',
          };
        case 'FAILED':
          return {
            label: t('pipeline.failedLabel'),
            sublabel: t('pipeline.errorOccurred'),
            className: 'bg-destructive/10 text-destructive border-destructive/20',
          };
        case 'BUILDING':
          return {
            label: t('pipeline.buildingLabel'),
            sublabel: t('pipeline.packagingArtifacts'),
            className: 'bg-secondary text-secondary-foreground border-border',
          };
        case 'UPLOADING':
          return {
            label: t('pipeline.uploadingLabel'),
            sublabel: t('pipeline.apiSubmission'),
            className: 'bg-secondary text-secondary-foreground border-border',
          };
        case 'ARTIFACT_READY':
          return {
            label: t('pipeline.artifactReady'),
            sublabel: t('pipeline.signedAndHashed'),
            className: 'bg-secondary text-secondary-foreground border-border',
          };
        case 'SUBMITTED':
          return {
            label: t('pipeline.submittedLabel'),
            sublabel: t('pipeline.waitingReview'),
            className: 'bg-secondary text-secondary-foreground border-border',
          };
        default:
          return {
            label: t('pipeline.prepAnalysis'),
            sublabel: status,
            className: 'bg-secondary text-secondary-foreground border-border',
          };
      }
    },
    [t],
  );

  const getAuditActionInfo = useCallback(
    (action: string) => {
      switch (action) {
        case 'RELEASE_STARTED':
          return {
            title: t('history.actionReleaseStarted'),
            desc: t('history.actionReleaseStartedDesc'),
            color: 'text-foreground',
          };
        case 'RELEASE_COMPLETED':
          return {
            title: t('history.actionReleaseCompleted'),
            desc: t('history.actionReleaseCompletedDesc'),
            color: 'text-foreground',
          };
        case 'RELEASE_FAILED':
          return {
            title: t('history.actionReleaseFailed'),
            desc: t('history.actionReleaseFailedDesc'),
            color: 'text-destructive',
          };
        case 'STORE_SUBMITTED':
          return {
            title: t('history.actionStoreSubmitted'),
            desc: t('history.actionStoreSubmittedDesc'),
            color: 'text-foreground',
          };
        case 'ROLLBACK':
          return {
            title: t('history.actionRollback'),
            desc: t('history.actionRollbackDesc'),
            color: 'text-foreground',
          };
        default:
          return {
            title: action,
            desc: t('history.actionDefaultDesc'),
            color: 'text-foreground',
          };
      }
    },
    [t],
  );

  const getAuditResultBadge = useCallback(
    (result: string) => {
      switch (result) {
        case 'SUCCESS':
          return {
            label: t('history.resultSuccess'),
            className: 'text-foreground bg-secondary border-border',
          };
        case 'FAILURE':
          return {
            label: t('history.resultFailure'),
            className: 'text-destructive bg-destructive/10 border-destructive/20',
          };
        case 'SKIPPED':
          return {
            label: t('history.resultSkipped'),
            className: 'text-muted-foreground bg-muted border-border',
          };
        case 'WARNING':
          return {
            label: t('history.resultWarning'),
            className: 'text-foreground bg-secondary border-border',
          };
        default:
          return { label: result, className: 'text-muted-foreground bg-muted border-border' };
      }
    },
    [t],
  );

  const getResolvedReleaseInfo = useCallback(
    (rel: ReleaseHistoryItem) => {
      let ver = rel.version;
      let bNum = rel.buildNumber;
      let proj = rel.project;

      const relatedLog = auditLogs.find((l) => l.releaseId === rel.releaseId && l.details);
      if (relatedLog?.details) {
        try {
          const parsed = JSON.parse(relatedLog.details) as {
            version?: string;
            build?: number;
            project?: string;
          };
          if (parsed.version && ver === '1.0.0') {
            ver = parsed.version;
          }
          if (parsed.build && bNum === 1) {
            bNum = parsed.build;
          }
          if (parsed.project && proj === 'Piyyuu') {
            proj = parsed.project;
          }
        } catch {}
      }
      return { version: ver, buildNumber: bNum, project: proj };
    },
    [auditLogs],
  );

  const renderAuditDetails = useCallback(
    (rawDetails: string | null) => {
      if (!rawDetails) return null;
      try {
        const parsed = JSON.parse(rawDetails) as Record<string, unknown>;
        if (parsed.error && typeof parsed.error === 'string') {
          const err = parsed.error;
          let userFriendly = err;
          if (err.includes('photo and video permissions')) {
            userFriendly =
              language === 'tr'
                ? 'Google Play Politikası: Uygulama fotoğraf/video izinleri beyanı eksik. Google Play Console -> "Uygulama İçeriği" altından ilgili form doldurulmalı.'
                : 'Google Play Policy: Photo and video permissions declaration is missing. Please complete the form under Google Play Console -> App Content.';
          } else if (err.includes('edit has expired')) {
            userFriendly =
              language === 'tr'
                ? 'Google Play Oturum Hatası: Düzenleme oturumu zaman aşımına uğramış. Dağıtım yeniden başlatılmalıdır.'
                : 'Google Play Session Error: Edit session has expired. The release pipeline must be restarted.';
          } else if (err.includes('IPHONEOS_DEPLOYMENT_TARGET')) {
            userFriendly =
              language === 'tr'
                ? 'iOS Xcode Hatası: Pods projesinde minimum iOS sürüm hedefi uyumsuzluğu tespit edildi.'
                : 'iOS Xcode Error: Minimum iOS deployment target mismatch detected in Pods project.';
          } else if (err.includes('Hiçbir platform')) {
            userFriendly =
              language === 'tr'
                ? 'Platform Hatası: Hem Android hem iOS derlemesi atlanmış veya derlenemedi.'
                : 'Platform Error: Both Android and iOS builds were skipped or could not be built.';
          }
          return (
            <div className="mt-1.5 p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{language === 'tr' ? 'Hata Nedeni:' : 'Error Reason:'}</span>
              </div>
              <p className="text-[11px] leading-relaxed break-words">{userFriendly}</p>
            </div>
          );
        }

        if (parsed.version || parsed.googlePlayStatus || parsed.project) {
          return (
            <div className="mt-1.5 p-2 rounded-md bg-secondary/50 border border-border text-[11px] space-y-0.5 font-mono text-muted-foreground">
              {parsed.project ? (
                <div>
                  {language === 'tr' ? 'Proje:' : 'Project:'}{' '}
                  <strong className="text-foreground">{String(parsed.project)}</strong>
                </div>
              ) : null}
              {parsed.version ? (
                <div>
                  {language === 'tr' ? 'Sürüm:' : 'Version:'}{' '}
                  <strong className="text-foreground font-semibold">
                    v{String(parsed.version)} #{String(parsed.build || '')}
                  </strong>
                </div>
              ) : null}
              {parsed.googlePlayStatus ? (
                <div>
                  Google Play {language === 'tr' ? 'Durumu:' : 'Status:'}{' '}
                  <span className="text-foreground">{String(parsed.googlePlayStatus)}</span>
                </div>
              ) : null}
              {parsed.appStoreStatus ? (
                <div>
                  App Store {language === 'tr' ? 'Durumu:' : 'Status:'}{' '}
                  <span className="text-foreground">{String(parsed.appStoreStatus)}</span>
                </div>
              ) : null}
            </div>
          );
        }
      } catch {
        if (
          rawDetails.includes('Google Play API Hatası') ||
          rawDetails.includes('Hata') ||
          rawDetails.includes('Error')
        ) {
          return (
            <div className="mt-1.5 p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              <p className="text-[11px] leading-relaxed">{rawDetails}</p>
            </div>
          );
        }
      }
      return (
        <div className="mt-1 text-[10px] font-mono text-muted-foreground/70 truncate max-w-xl">
          {rawDetails}
        </div>
      );
    },
    [language],
  );

  const filteredReleases = useMemo(() => {
    return historyReleases.filter((rel) => {
      if (historyStatusFilter === 'success' && rel.status !== 'RELEASED') return false;
      if (historyStatusFilter === 'failed' && rel.status !== 'FAILED') return false;

      if (historySearchQuery.trim()) {
        const query = historySearchQuery.toLowerCase();
        const resolved = getResolvedReleaseInfo(rel);
        const matchVer = (resolved.version || '').toLowerCase().includes(query);
        const matchProj = (resolved.project || '').toLowerCase().includes(query);
        const matchId = (rel.releaseId || '').toLowerCase().includes(query);
        const matchBuild = String(resolved.buildNumber || '').includes(query);
        return matchVer || matchProj || matchId || matchBuild;
      }
      return true;
    });
  }, [historyReleases, historyStatusFilter, historySearchQuery, getResolvedReleaseInfo]);

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (historyStatusFilter === 'success' && log.result !== 'SUCCESS') return false;
      if (historyStatusFilter === 'failed' && log.result !== 'FAILURE') return false;

      if (historySearchQuery.trim()) {
        const query = historySearchQuery.toLowerCase();
        const matchAction = log.action.toLowerCase().includes(query);
        const matchActor = log.actor.toLowerCase().includes(query);
        const matchId = log.releaseId ? log.releaseId.toLowerCase().includes(query) : false;
        const matchDetails = log.details ? log.details.toLowerCase().includes(query) : false;
        return matchAction || matchActor || matchId || matchDetails;
      }
      return true;
    });
  }, [auditLogs, historyStatusFilter, historySearchQuery]);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentLogs]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      try {
        localStorage.setItem('webicro_theme', 'dark');
      } catch {}
    } else {
      document.documentElement.classList.remove('dark');
      try {
        localStorage.setItem('webicro_theme', 'light');
      } catch {}
    }
  }, [isDark]);

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

  const loadStoreCredentials = useCallback(async () => {
    try {
      const res = await authFetch('/api/stores/credentials');
      if (res.ok) {
        const data = (await res.json()) as {
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
          ai?: {
            provider?: 'gemini' | 'openai' | 'anthropic' | 'conventional';
            geminiConfigured?: boolean;
            geminiMaskedKey?: string;
            geminiModel?: string;
            openaiConfigured?: boolean;
            openaiMaskedKey?: string;
            openaiModel?: string;
            anthropicConfigured?: boolean;
            anthropicMaskedKey?: string;
            anthropicModel?: string;
            verified?: boolean;
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

        if (data.ai) {
          if (data.ai.provider) {
            setAiProvider(data.ai.provider);
          }
          if (data.ai.geminiModel)
            setGeminiModelInput(
              data.ai.geminiModel === 'gemini-1.5-flash' ? 'gemini-2.5-flash' : data.ai.geminiModel,
            );
          if (data.ai.openaiModel) setOpenaiModelInput(data.ai.openaiModel);
          if (data.ai.anthropicModel) setAnthropicModelInput(data.ai.anthropicModel);
          setAiConfiguredInfo({
            geminiConfigured: data.ai.geminiConfigured,
            geminiMaskedKey: data.ai.geminiMaskedKey,
            openaiConfigured: data.ai.openaiConfigured,
            openaiMaskedKey: data.ai.openaiMaskedKey,
            anthropicConfigured: data.ai.anthropicConfigured,
            anthropicMaskedKey: data.ai.anthropicMaskedKey,
          });
        }
      }
    } catch (err) {
      console.error('Kimlik bilgileri yüklenemedi:', err);
    }
  }, [googlePathInput, appleKeyIdInput, appleIssuerIdInput]);

  useEffect(() => {
    if (showStoreTestModal && activeStoreTab === 'ai' && aiProvider !== 'conventional') {
      void fetchAiModels(aiProvider);
    }
    if (appStoreInfo.connected && appleConnectApps.length === 0) {
      void fetchAppleApps();
    }
  }, [
    showStoreTestModal,
    activeStoreTab,
    aiProvider,
    appStoreInfo.connected,
    appleConnectApps.length,
  ]);

  const loadProjectsAndActive = useCallback(async () => {
    try {
      const pRes = await authFetch('/api/projects');
      if (pRes.ok) {
        const pData = (await pRes.json()) as { activePath: string; projects: ProjectEntry[] };
        const fetchedProjects = pData.projects || [];
        setProjects(fetchedProjects);

        const currentActive = pData.activePath || fetchedProjects[0]?.path || '';
        setActiveProjectPath(currentActive);
        activePathRef.current = currentActive;

        const initialProj = fetchedProjects.find((p) => p.path === currentActive);
        if (initialProj) {
          setProjectName(initialProj.name);
          setProjectPackage(initialProj.package || '');
          setCurrentVersion(initialProj.version || '');
          setCurrentBuildNumber(initialProj.buildNumber || 0);
          setActiveComparison(initialProj.stores || null);
          const initialTrack = resolveGoogleTrack(
            initialProj.stores?.googlePlay?.track,
            initialProj.path,
          );
          setGoogleTrack(initialTrack);
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
      const res = await authFetch(`/api/project?path=${encodeURIComponent(pathToFetch)}`);
      if (!res.ok) return;
      if (thisSeq !== requestSeqRef.current) return;

      const data = (await res.json()) as {
        project?: {
          name: string;
          package?: string;
          currentVersion: string;
          currentBuildNumber: number;
          suggestedVersion: string;
          branch: string;
          isClean: boolean;
          uncommittedFiles?: string[];
          hasPubspec: boolean;
          configuredTrack?: string;
        };
        git?: {
          isRepository: boolean;
          currentBranch: string;
          isClean: boolean;
          uncommittedFiles?: string[];
          lastTag: string | null;
          changedFilesCount: number;
          hasNativeChanges: boolean;
          nativeChanges?: {
            androidChanged: boolean;
            iosChanged: boolean;
            androidFiles: string[];
            iosFiles: string[];
          };
          connected?: boolean;
          remoteUrl?: string | null;
          webUrl?: string | null;
          ownerRepo?: string | null;
          provider?: 'github' | 'gitlab' | 'bitbucket' | 'other';
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
        setUncommittedFiles(data.project.uncommittedFiles || data.git?.uncommittedFiles || []);
        setHasPubspec(data.project.hasPubspec ?? false);
      }

      if (data.git) {
        setGitRemote({
          connected: Boolean(data.git.connected),
          remoteUrl: data.git.remoteUrl || null,
          webUrl: data.git.webUrl || null,
          ownerRepo: data.git.ownerRepo || null,
          provider: data.git.provider || 'github',
          lastTag: data.git.lastTag || null,
        });
      }

      if (data.git?.nativeChanges) {
        setGitNativeChanges(data.git.nativeChanges);
      } else {
        setGitNativeChanges(null);
      }

      try {
        const savedMode = localStorage.getItem(
          `webicro_platform_mode_${pathToFetch}`,
        ) as TargetPlatformMode;
        if (savedMode && (savedMode === 'all' || savedMode === 'android' || savedMode === 'ios')) {
          applyPlatformMode(savedMode, pathToFetch);
        } else {
          applyPlatformMode('android', pathToFetch);
        }
      } catch {
        applyPlatformMode('android', pathToFetch);
      }

      if (data.commits) {
        setCommits(data.commits);
      }

      if (data.comparison) {
        setActiveComparison(data.comparison);
        const resolvedTrack = resolveGoogleTrack(
          data.comparison.googlePlay?.track,
          pathToFetch,
          data.project?.configuredTrack,
        );
        setGoogleTrack(resolvedTrack);
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

  const loadPipelineStatus = useCallback(async () => {
    try {
      const res = await authFetch('/api/release/status');
      if (res.ok) {
        const data = (await res.json()) as {
          active?: boolean;
          projectPath?: string;
          pipeline?: ProjectPipelineState | null;
          allPipelines?: ProjectPipelineState[];
        };
        if (data.allPipelines && Array.isArray(data.allPipelines)) {
          const pipelines = data.allPipelines;
          setProjectPipelines((prev) => {
            const next = { ...prev };
            for (const pl of pipelines) {
              if (pl && pl.projectPath) {
                next[pl.projectPath] = pl;
              }
            }
            return next;
          });
        } else if (data.pipeline?.projectPath) {
          const pl = data.pipeline;
          setProjectPipelines((prev) => ({
            ...prev,
            [pl.projectPath]: pl,
          }));
        }
      }
    } catch (err) {
      console.error('Pipeline durumu yüklenemedi:', err);
    }
  }, []);

  useEffect(() => {
    void loadProjectsAndActive();
    const sessionToken = getSessionToken();
    const sseUrl = sessionToken
      ? `/api/release/events?token=${encodeURIComponent(sessionToken)}`
      : '/api/release/events';
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data as string) as {
          type:
            | 'sync'
            | 'pipeline_init'
            | 'pipeline_update'
            | 'pipeline_completed'
            | 'pipeline_failed'
            | 'pipeline_canceled';
          pipeline?: ProjectPipelineState;
          projectPath?: string;
          projectName?: string;
          stages?: PipelineStep[];
          logs?: string[];
        };

        if (payload.type === 'sync' && payload.pipeline) {
          const p = payload.pipeline;
          setProjectPipelines((prev) => ({
            ...prev,
            [p.projectPath]: p,
          }));

          setProjects((prev) =>
            prev.map((item) =>
              item.path === p.projectPath
                ? {
                    ...item,
                    releasing: p.isReleasing,
                    currentStageId: p.currentStageId,
                    totalStages: p.totalStages,
                  }
                : item,
            ),
          );
        } else if (payload.type === 'pipeline_init') {
          const pPath = payload.projectPath || '';
          if (pPath) {
            setProjectPipelines((prev) => ({
              ...prev,
              [pPath]: {
                projectPath: pPath,
                projectName: payload.projectName,
                isReleasing: true,
                completed: false,
                failed: false,
                currentStageId: 1,
                totalStages: 6,
                stages:
                  payload.stages && payload.stages.length > 0
                    ? payload.stages
                    : initialStages.map((s, idx) =>
                        idx === 0
                          ? { ...s, status: 'running' as const }
                          : { ...s, status: 'pending' as const },
                      ),
                logs: payload.logs || [],
              },
            }));

            setProjects((prev) =>
              prev.map((item) =>
                item.path === pPath
                  ? { ...item, releasing: true, currentStageId: 1, totalStages: 6 }
                  : item,
              ),
            );
          }
        } else if (payload.type === 'pipeline_update' && payload.pipeline) {
          const p = payload.pipeline;
          setProjectPipelines((prev) => ({
            ...prev,
            [p.projectPath]: p,
          }));

          setProjects((prev) =>
            prev.map((item) =>
              item.path === p.projectPath
                ? {
                    ...item,
                    releasing: p.isReleasing,
                    currentStageId: p.currentStageId,
                    totalStages: p.totalStages,
                  }
                : item,
            ),
          );
        } else if (payload.type === 'pipeline_completed' && payload.pipeline) {
          const p = payload.pipeline;
          setProjectPipelines((prev) => ({
            ...prev,
            [p.projectPath]: p,
          }));

          setProjects((prev) =>
            prev.map((item) =>
              item.path === p.projectPath
                ? { ...item, releasing: false, currentStageId: 6, totalStages: 6 }
                : item,
            ),
          );

          void handleSyncStores();
          void fetchProjectDetails();
        } else if (payload.type === 'pipeline_failed' && payload.pipeline) {
          const p = payload.pipeline;
          const diag = (payload as { diagnosis?: AIDiagnosisResult }).diagnosis || p.diagnosis;
          if (diag) {
            p.diagnosis = diag;
          }
          setProjectPipelines((prev) => ({
            ...prev,
            [p.projectPath]: p,
          }));

          setProjects((prev) =>
            prev.map((item) =>
              item.path === p.projectPath ? { ...item, releasing: false } : item,
            ),
          );

          if (!p.diagnosis && (p.error || (payload as { error?: string }).error)) {
            const errStr = p.error || (payload as { error?: string }).error || '';
            void fetchDiagnosisForPipeline(p.projectPath, errStr, p.logs);
          }
        } else if (payload.type === 'pipeline_canceled' && payload.projectPath) {
          const pPath = payload.projectPath;
          setProjectPipelines((prev) => {
            const next = { ...prev };
            delete next[pPath];
            return next;
          });

          setProjects((prev) =>
            prev.map((item) =>
              item.path === pPath ? { ...item, releasing: false, currentStageId: 0 } : item,
            ),
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

  const handleSyncStores = async () => {
    setIsSyncingStores(true);
    try {
      const res = await authFetch('/api/projects/sync-stores', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { projects?: ProjectEntry[] };
        if (data.projects) {
          setProjects(data.projects);
        }
        await fetchProjectDetails();
        toast.success(t('toast.storeSyncSuccess'));
      } else {
        toast.error(t('toast.storeSyncError'));
      }
    } catch (err) {
      console.error('Store sync error:', err);
      toast.error(t('toast.storeSyncError'));
    } finally {
      setIsSyncingStores(false);
    }
  };

  const handleSyncStoreVersion = async (
    source: 'smart' | 'google_play' | 'app_store' = 'smart',
  ) => {
    const target = activePathRef.current || activeProjectPath;
    if (!target) return;
    setIsSyncingStoreVersion(true);
    setSyncStoreSuccessMsg(null);
    try {
      const res = await authFetch('/api/project/sync-store-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: target, source }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          success: boolean;
          formatted?: string;
          version?: string;
          buildNumber?: number;
          message?: string;
          error?: string;
        };
        if (data.success && data.formatted) {
          const successMsg =
            data.message ||
            `pubspec.yaml ${language === 'tr' ? `başarıyla v${data.formatted} olarak eşitlendi.` : `successfully synced to v${data.formatted}.`}`;
          setSyncStoreSuccessMsg(successMsg);
          toast.success(successMsg, language === 'tr' ? 'Sürüm Eşitlendi' : 'Version Synced');
          await fetchProjectDetails(target);
          await handleSyncStores();
          setTimeout(() => setSyncStoreSuccessMsg(null), 6000);
        } else if (data.error) {
          toast.warning(data.error, language === 'tr' ? 'Eşitleme Uyarısı' : 'Sync Warning');
        }
      } else {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(
          errData.error || (language === 'tr' ? 'İşlem tamamlanamadı.' : 'Operation failed.'),
          language === 'tr' ? 'Eşitleme Hatası' : 'Sync Error',
        );
      }
    } catch (err) {
      console.error('Version sync error:', err);
      toast.error(
        language === 'tr'
          ? 'Sürüm eşitleme sırasında bir hata oluştu.'
          : 'Error occurred during version sync.',
      );
    } finally {
      setIsSyncingStoreVersion(false);
    }
  };

  const fetchAppleApps = async () => {
    setIsLoadingAppleApps(true);
    try {
      const res = await authFetch('/api/stores/apple-apps');
      if (res.ok) {
        const data = (await res.json()) as {
          success: boolean;
          apps?: { id: string; name: string; bundleId: string; sku?: string }[];
        };
        if (data.success && data.apps) {
          setAppleConnectApps(data.apps);
        }
      }
    } catch (err) {
      console.error('Apple uygulamaları listeleme hatası:', err);
    } finally {
      setIsLoadingAppleApps(false);
    }
  };

  const handleGitCommitPush = async () => {
    if (!activeProjectPath) return;
    setIsGitPushing(true);
    setGitPushSuccessMsg(null);
    try {
      const res = await authFetch('/api/project/git-commit-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: activeProjectPath,
          createTag: true,
          push: true,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: string;
        git?: {
          isClean: boolean;
          uncommittedFiles: string[];
          lastTag: string | null;
          currentBranch: string;
          remote: {
            connected?: boolean;
            remoteUrl?: string | null;
            webUrl?: string | null;
            ownerRepo?: string | null;
            provider?: 'github' | 'gitlab' | 'bitbucket' | 'other';
          } | null;
        };
      };
      if (data.success) {
        const msg = data.message || t('toast.gitSyncSuccess');
        setGitPushSuccessMsg(msg);
        toast.success(
          msg,
          language === 'tr' ? 'Git ve GitHub Senkronize Edildi' : 'Git & GitHub Synced',
        );
        if (data.git) {
          setIsGitClean(data.git.isClean);
          setUncommittedFiles(data.git.uncommittedFiles || []);
        }
        await fetchProjectDetails(activeProjectPath);
        setTimeout(() => setGitPushSuccessMsg(null), 6000);
      } else {
        toast.error(
          data.error || t('toast.gitSyncError'),
          language === 'tr' ? 'Git Hatası' : 'Git Error',
        );
      }
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : String(err),
        language === 'tr' ? 'Git Bağlantı Hatası' : 'Git Connection Error',
      );
    } finally {
      setIsGitPushing(false);
    }
  };

  const handleSwitchProject = async (targetPath: string) => {
    if (targetPath === activeProjectPath) return;

    setActiveProjectPath(targetPath);
    activePathRef.current = targetPath;

    const targetProj = projects.find((p) => p.path === targetPath);
    if (targetProj) {
      setProjectName(targetProj.name);
      setProjectPackage(targetProj.package || '');
      setCurrentVersion(targetProj.version || '');
      setCurrentBuildNumber(targetProj.buildNumber || 0);
      setActiveComparison(targetProj.stores || null);
      const autoTrack = resolveGoogleTrack(targetProj.stores?.googlePlay?.track, targetProj.path);
      setGoogleTrack(autoTrack);
    }

    setCommits([]);
    setReleaseNotesTR('');
    setReleaseNotesEN('');

    await fetchProjectDetails(targetPath);
    await loadStoreCredentials();
  };

  const handleAutoDiscover = async (customPath?: string) => {
    setIsDiscovering(true);
    try {
      const res = await authFetch('/api/projects/auto-discover', {
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
      console.error('Project scan error:', err);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleAddNewProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectPath.trim()) return;
    setIsAddingProject(true);
    try {
      const res = await authFetch('/api/projects/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim(), path: newProjectPath.trim() }),
      });
      if (res.ok) {
        setShowAddProjectModal(false);
        setNewProjectPath('');
        setNewProjectName('');
        await loadProjectsAndActive();
        toast.success(
          t('toast.projectAddSuccess'),
          language === 'tr' ? 'Proje Eklendi' : 'Project Added',
        );
      } else {
        const data = (await res.json()) as { error?: string };
        toast.error(
          data.error || (language === 'tr' ? 'Proje eklenemedi.' : 'Project could not be added.'),
          language === 'tr' ? 'Proje Eklenemedi' : 'Failed to Add Project',
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : String(err),
        language === 'tr' ? 'Bağlantı Hatası' : 'Connection Error',
      );
    } finally {
      setIsAddingProject(false);
    }
  };

  const handleRemoveProject = async (
    e: React.MouseEvent,
    projectPath: string,
    projectName: string,
  ) => {
    e.stopPropagation();
    if (
      !window.confirm(
        language === 'tr'
          ? `"${projectName}" projesini listeden kaldırmak istediğinize emin misiniz?`
          : `Are you sure you want to remove "${projectName}" from the project list?`,
      )
    ) {
      return;
    }
    try {
      const res = await authFetch('/api/projects/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath }),
      });
      if (res.ok) {
        const data = (await res.json()) as { projects: ProjectEntry[]; activePath: string };
        setProjects(data.projects || []);
        if (data.activePath) {
          setActiveProjectPath(data.activePath);
        }
        await fetchProjectDetails();
        toast.info(
          language === 'tr'
            ? `"${projectName}" projesi listeden kaldırıldı.`
            : `Project "${projectName}" removed from list.`,
          language === 'tr' ? 'Proje Kaldırıldı' : 'Project Removed',
        );
      }
    } catch (err) {
      console.error('Project remove error:', err);
      toast.error(t('toast.projectRemoveError'));
    }
  };

  const [historyFilter, setHistoryFilter] = useState<'current' | 'all'>('all');
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  const loadHistory = async (filter: 'current' | 'all' = historyFilter, targetPath?: string) => {
    setIsLoadingHistory(true);
    try {
      const pPath = filter === 'current' ? targetPath || activeProjectPath : '';
      const url = pPath ? `/api/history?projectPath=${encodeURIComponent(pPath)}` : '/api/history';
      const res = await authFetch(url);
      if (res.ok) {
        const data = (await res.json()) as {
          releases?: ReleaseHistoryItem[];
          auditLogs?: AuditLogItem[];
        };
        setHistoryReleases(data.releases || []);
        setAuditLogs(data.auditLogs || []);
      }
    } catch (err) {
      console.error('Geçmiş yüklenemedi:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSaveGooglePlay = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingGoogle(true);
    setGoogleTestResult({ testing: true, tested: false, success: false });
    try {
      const res = await authFetch('/api/stores/save-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceAccountJson: googleJsonInput.trim() || undefined,
          keyPath: googlePathInput.trim() || undefined,
          saveGlobal,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
        serviceAccount?: string;
        projectId?: string;
      };

      if (res.ok && data.success) {
        const successMsg = data.message || t('settings.googlePlaySuccess');
        setGoogleTestResult({
          testing: false,
          tested: true,
          success: true,
          message: successMsg,
        });
        toast.success(successMsg, 'Google Play API');
        setGooglePlayInfo((prev) => ({
          ...prev,
          connected: true,
          serviceAccount: data.serviceAccount || prev.serviceAccount,
          projectId: data.projectId,
        }));
        await loadProjectsAndActive();
      } else {
        const errorMsg = data.error || t('settings.verificationFailed');
        setGoogleTestResult({
          testing: false,
          tested: true,
          success: false,
          error: errorMsg,
        });
        toast.error(errorMsg, language === 'tr' ? 'Google Play Hatası' : 'Google Play Error');
      }
    } catch (err) {
      const errorMsg =
        language === 'tr'
          ? `Sunucu bağlantı hatası: ${String(err)}`
          : `Server connection error: ${String(err)}`;
      setGoogleTestResult({
        testing: false,
        tested: true,
        success: false,
        error: errorMsg,
      });
      toast.error(errorMsg, language === 'tr' ? 'Bağlantı Hatası' : 'Connection Error');
    } finally {
      setIsSavingGoogle(false);
    }
  };

  const handleSaveAppleStore = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingApple(true);
    setAppleTestResult({ testing: true, tested: false, success: false });
    try {
      const res = await authFetch('/api/stores/save-apple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: appleKeyIdInput.trim(),
          issuerId: appleIssuerIdInput.trim(),
          privateKey: applePrivateKeyInput.trim() || undefined,
          saveGlobal,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
        keyId?: string;
        issuerId?: string;
        details?: string;
      };

      if (res.ok && data.success) {
        const successMsg = data.details || data.message || t('settings.appStoreSuccess');
        setAppleTestResult({
          testing: false,
          tested: true,
          success: true,
          message: successMsg,
        });
        toast.success(successMsg, 'App Store Connect API');
        setAppStoreInfo((prev) => ({
          ...prev,
          connected: true,
          keyId: data.keyId || prev.keyId,
          issuerId: data.issuerId || prev.issuerId,
        }));
        await loadProjectsAndActive();
        void fetchAppleApps();
      } else {
        const errorMsg = data.error || t('settings.verificationFailed');
        setAppleTestResult({
          testing: false,
          tested: true,
          success: false,
          error: errorMsg,
        });
        toast.error(errorMsg, language === 'tr' ? 'App Store Hatası' : 'App Store Error');
      }
    } catch (err) {
      const errorMsg =
        language === 'tr'
          ? `Sunucu bağlantı hatası: ${String(err)}`
          : `Server connection error: ${String(err)}`;
      setAppleTestResult({
        testing: false,
        tested: true,
        success: false,
        error: errorMsg,
      });
      toast.error(errorMsg, language === 'tr' ? 'Bağlantı Hatası' : 'Connection Error');
    } finally {
      setIsSavingApple(false);
    }
  };

  const handleGenerateAI = async (
    selectedProvider?: 'gemini' | 'openai' | 'anthropic' | 'conventional',
  ) => {
    setIsGeneratingAI(true);
    const targetProvider = selectedProvider || aiProvider;
    const selectedModel =
      targetProvider === 'gemini'
        ? geminiModelInput
        : targetProvider === 'openai'
          ? openaiModelInput
          : anthropicModelInput;
    try {
      const response = await authFetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commits,
          version: nextVersion,
          projectPath: activeProjectPath,
          provider: targetProvider,
          model: selectedModel,
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as {
          provider?: string;
          notesTr?: string;
          notesEn?: string;
          notes?: { tr?: { full: string[] }; en?: { full: string[] } };
        };
        if (data.notesTr) {
          setReleaseNotesTR(data.notesTr);
        } else if (data.notes?.tr?.full) {
          setReleaseNotesTR(
            data.notes.tr.full
              .map((item: string) => (item.startsWith('•') ? item : `• ${item}`))
              .join('\n'),
          );
        }

        if (data.notesEn) {
          setReleaseNotesEN(data.notesEn);
        } else if (data.notes?.en?.full) {
          setReleaseNotesEN(
            data.notes.en.full
              .map((item: string) => (item.startsWith('•') ? item : `• ${item}`))
              .join('\n'),
          );
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

  const fetchAiModels = async (provider: 'gemini' | 'openai' | 'anthropic', customKey?: string) => {
    setIsLoadingAiModels(true);
    try {
      let key = customKey?.trim();
      if (!key) {
        if (provider === 'gemini') key = geminiApiKeyInput.trim();
        if (provider === 'openai') key = openaiApiKeyInput.trim();
        if (provider === 'anthropic') key = anthropicApiKeyInput.trim();
      }

      const res = await authFetch('/api/ai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: key || undefined }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          success?: boolean;
          provider?: string;
          defaultModel?: string;
          models?: AIModelOption[];
        };

        if (data.models && data.models.length > 0) {
          if (provider === 'gemini') {
            setGeminiModelList(data.models);
            if (
              !geminiModelInput ||
              geminiModelInput === 'gemini-1.5-flash' ||
              geminiModelInput === 'gemini-2.5-flash' ||
              !data.models.some((m) => m.id === geminiModelInput)
            ) {
              setGeminiModelInput(
                data.defaultModel || data.models[0]?.id || 'gemini-3.1-flash-lite',
              );
            }
          } else if (provider === 'openai') {
            setOpenaiModelList(data.models);
            if (!openaiModelInput || !data.models.some((m) => m.id === openaiModelInput)) {
              setOpenaiModelInput(data.defaultModel || data.models[0]?.id || 'gpt-4o-mini');
            }
          } else if (provider === 'anthropic') {
            setAnthropicModelList(data.models);
            if (!anthropicModelInput || !data.models.some((m) => m.id === anthropicModelInput)) {
              setAnthropicModelInput(
                data.defaultModel || data.models[0]?.id || 'claude-3-5-sonnet-20241022',
              );
            }
          }
        }
      }
    } catch (err) {
      console.error('Modeller getirilemedi:', err);
    } finally {
      setIsLoadingAiModels(false);
    }
  };

  const handleSaveAI = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAI(true);
    setAiTestResult(null);
    try {
      const res = await authFetch('/api/ai/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          geminiApiKey: geminiApiKeyInput || undefined,
          geminiModel: geminiModelInput,
          openaiApiKey: openaiApiKeyInput || undefined,
          openaiModel: openaiModelInput,
          anthropicApiKey: anthropicApiKeyInput || undefined,
          anthropicModel: anthropicModelInput,
          saveGlobal,
        }),
      });
      const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (res.ok && data.success) {
        const msg = data.message || t('toast.settingsSaved');
        setAiTestResult({ success: true, message: msg });
        toast.success(msg, 'AI');
        await loadStoreCredentials();
      } else {
        const err =
          data.error ||
          (language === 'tr' ? 'Ayarlar kaydedilemedi.' : 'Settings could not be saved.');
        setAiTestResult({ success: false, message: err });
        toast.error(err, 'AI');
      }
    } catch (err) {
      const errStr = err instanceof Error ? err.message : String(err);
      setAiTestResult({ success: false, message: errStr });
      toast.error(errStr, language === 'tr' ? 'AI Bağlantı Hatası' : 'AI Connection Error');
    } finally {
      setIsSavingAI(false);
    }
  };

  const handleTestAI = async () => {
    setIsTestingAI(true);
    setAiTestResult(null);
    try {
      let keyToTest = '';
      let modelToTest = '';
      if (aiProvider === 'gemini') {
        keyToTest = geminiApiKeyInput;
        modelToTest = geminiModelInput;
      } else if (aiProvider === 'openai') {
        keyToTest = openaiApiKeyInput;
        modelToTest = openaiModelInput;
      } else if (aiProvider === 'anthropic') {
        keyToTest = anthropicApiKeyInput;
        modelToTest = anthropicModelInput;
      }

      const res = await authFetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          apiKey: keyToTest,
          model: modelToTest,
        }),
      });
      const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (res.ok && data.success) {
        const msg =
          data.message ||
          (language === 'tr'
            ? 'Yapay zeka bağlantısı başarılı ve çalışıyor!'
            : 'AI connection test successful!');
        setAiTestResult({
          success: true,
          message: msg,
        });
        toast.success(msg, 'AI Test');
      } else {
        const err =
          data.error ||
          (language === 'tr' ? 'Bağlantı testi başarısız oldu.' : 'Connection test failed.');
        setAiTestResult({
          success: false,
          message: err,
        });
        toast.error(err, 'AI Test');
      }
    } catch (err) {
      const errStr = err instanceof Error ? err.message : String(err);
      setAiTestResult({
        success: false,
        message: errStr,
      });
      toast.error(errStr, language === 'tr' ? 'AI Test Hatası' : 'AI Test Error');
    } finally {
      setIsTestingAI(false);
    }
  };

  const handleCopyNotes = (lang: 'tr' | 'en') => {
    const text = lang === 'tr' ? releaseNotesTR : releaseNotesEN;
    void navigator.clipboard.writeText(text);
    setCopiedLang(lang);
    toast.success(
      `${lang === 'tr' ? 'Türkçe' : 'English'} ${language === 'tr' ? 'sürüm notları panoya kopyalandı.' : 'release notes copied to clipboard.'}`,
      language === 'tr' ? 'Kopyalandı' : 'Copied',
    );
    setTimeout(() => setCopiedLang(null), 2000);
  };

  const handleCopyLogs = () => {
    if (currentLogs.length === 0) return;
    const text = currentLogs.join('\n');
    void navigator.clipboard.writeText(text);
    setIsLogsCopied(true);
    toast.success(t('toast.logsCopied'), language === 'tr' ? 'Kopyalandı' : 'Copied');
    setTimeout(() => setIsLogsCopied(false), 2000);
  };

  const fetchDiagnosisForPipeline = useCallback(
    async (projectPath: string, errorText: string, logs?: string[]) => {
      setIsDiagnosing(true);
      try {
        const res = await authFetch('/api/ai/diagnose-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectPath,
            errorText,
            recentLogs: logs?.slice(-15) || [],
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { success?: boolean; diagnosis?: AIDiagnosisResult };
          if (data.diagnosis) {
            setProjectPipelines((prev) => {
              const current = prev[projectPath];
              if (!current) return prev;
              return {
                ...prev,
                [projectPath]: {
                  ...current,
                  diagnosis: data.diagnosis,
                },
              };
            });
          }
        }
      } catch (err) {
        console.error('AI diagnosis error:', err);
      } finally {
        setIsDiagnosing(false);
      }
    },
    [],
  );

  const handleAutoFix = async (action: string) => {
    if (!activeProjectPath) return;
    setIsAutoFixing(true);
    setAutoFixSuccessMsg(null);
    try {
      const res = await authFetch('/api/release/autofix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          projectPath: activeProjectPath,
        }),
      });
      const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (res.ok && data.success) {
        const msg = data.message || t('toast.autoFixSuccess');
        setAutoFixSuccessMsg(msg);
        toast.success(msg, language === 'tr' ? 'Otomatik Düzeltme' : 'Auto Fix');
        setTimeout(() => {
          setAutoFixSuccessMsg(t('toast.autoFixRestarting'));
          setTimeout(() => {
            void handleStartRelease();
          }, 800);
        }, 1200);
      } else {
        toast.error(
          data.error || t('toast.autoFixError'),
          language === 'tr' ? 'Onarım Hatası' : 'Fix Error',
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : String(err),
        language === 'tr' ? 'Onarım Bağlantı Hatası' : 'Fix Connection Error',
      );
    } finally {
      setIsAutoFixing(false);
    }
  };

  const handleStartRelease = async () => {
    if (isCurrentProjectReleasing) return;
    if (!releaseNotesTR.trim() || !releaseNotesEN.trim()) {
      toast.warning(
        t('toast.notesRequiredDesc'),
        language === 'tr' ? 'Sürüm Notları Zorunlu' : 'Release Notes Required',
      );
      return;
    }

    if (!targetAndroid && !targetIos) {
      toast.warning(
        t('toast.selectPlatformDesc'),
        language === 'tr' ? 'Platform Seçimi' : 'Platform Selection',
      );
      return;
    }

    const targetPath = activeProjectPath;
    if (!targetPath) return;

    toast.info(
      language === 'tr'
        ? `"${projectName}" için ${nextVersion}+${nextBuildNumber} sürüm dağıtımı başlatıldı.`
        : `Started release ${nextVersion}+${nextBuildNumber} for "${projectName}".`,
      language === 'tr' ? 'Dağıtım Başlatıldı' : 'Release Started',
    );

    const initialPipelineSteps = initialStages.map((s, idx) => {
      if (!targetAndroid && s.id === 4) {
        return { ...s, status: 'skipped' as const, details: t('alerts.androidBuildSkipped') };
      }
      if (!targetIos && s.id === 5) {
        return { ...s, status: 'skipped' as const, details: t('alerts.iosBuildSkipped') };
      }
      if (idx === 0) {
        return { ...s, status: 'running' as const };
      }
      return { ...s, status: 'pending' as const };
    });

    const platformLabel =
      targetAndroid && targetIos
        ? 'Android + iOS'
        : targetAndroid
          ? language === 'tr'
            ? 'Sadece Android (AAB)'
            : 'Android Only (AAB)'
          : language === 'tr'
            ? 'Sadece iOS (IPA)'
            : 'iOS Only (IPA)';
    const initialPipelineLogs = [
      `[${new Date().toLocaleTimeString()}] ${language === 'tr' ? 'Sürüm dağıtım orkestrasyonu başlatıldı...' : 'Release orchestration initiated...'}`,
      `[${new Date().toLocaleTimeString()}] ${language === 'tr' ? 'Hedef Sürüm' : 'Target Version'}: ${nextVersion}+${nextBuildNumber}`,
      `[${new Date().toLocaleTimeString()}] ${language === 'tr' ? 'Proje' : 'Project'}: ${projectName} (${targetPath})`,
      `[${new Date().toLocaleTimeString()}] ${language === 'tr' ? 'Dağıtım Modu' : 'Distribution Mode'}: ${platformLabel}`,
    ];

    setProjectPipelines((prev) => ({
      ...prev,
      [targetPath]: {
        projectPath: targetPath,
        projectName,
        targetVersion: nextVersion,
        isReleasing: true,
        completed: false,
        failed: false,
        currentStageId: 1,
        totalStages: 6,
        stages: initialPipelineSteps,
        logs: initialPipelineLogs,
      },
    }));

    setProjects((prev) =>
      prev.map((item) =>
        item.path === targetPath
          ? { ...item, releasing: true, currentStageId: 1, totalStages: 6 }
          : item,
      ),
    );

    try {
      const response = await authFetch('/api/release/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: targetPath,
          projectName,
          version: nextVersion,
          buildNumber: nextBuildNumber,
          bump: bumpType === 'custom' ? undefined : bumpType,
          manualVersion: bumpType === 'custom' ? customVersion : undefined,
          targetPlatform: platformMode,
          targetAndroid,
          targetIos,
          skipAndroid: !targetAndroid,
          skipIos: !targetIos,
          googleTrack,
          rollout: 100,
          notesTr: releaseNotesTR,
          notesEn: releaseNotesEN,
          skipGit: !autoGitSync,
          createGitTag: autoGitSync,
          pushGit: autoGitSync,
        }),
      });

      if (!response.ok) {
        const errData = (await response.json()) as { error?: string };
        const errMsg = errData.error || t('alerts.releaseStartFailed');
        setProjectPipelines((prev) => ({
          ...prev,
          [targetPath]: {
            ...(prev[targetPath] || {
              projectPath: targetPath,
              projectName,
              completed: false,
              currentStageId: 1,
              totalStages: 6,
              stages: initialStages,
            }),
            isReleasing: false,
            failed: true,
            logs: [
              ...(prev[targetPath]?.logs || initialPipelineLogs),
              `[${new Date().toLocaleTimeString()}] HATA: ${errMsg}`,
            ],
          },
        }));
        setProjects((prev) =>
          prev.map((item) => (item.path === targetPath ? { ...item, releasing: false } : item)),
        );
      }
    } catch (err) {
      setProjectPipelines((prev) => ({
        ...prev,
        [targetPath]: {
          ...(prev[targetPath] || {
            projectPath: targetPath,
            projectName,
            completed: false,
            currentStageId: 1,
            totalStages: 6,
            stages: initialStages,
          }),
          isReleasing: false,
          failed: true,
          logs: [
            ...(prev[targetPath]?.logs || initialPipelineLogs),
            `[${new Date().toLocaleTimeString()}] ${language === 'tr' ? 'Sunucu bağlantı hatası' : 'Server connection error'}: ${err instanceof Error ? err.message : String(err)}`,
          ],
        },
      }));
      setProjects((prev) =>
        prev.map((item) => (item.path === targetPath ? { ...item, releasing: false } : item)),
      );
    }
  };

  const handleCancelRelease = async (projectPathToCancel?: string) => {
    const targetPath = projectPathToCancel || activeProjectPath;
    if (!targetPath) return;

    const confirmMsg = t('labels.cancelPipelineConfirm').replace(
      '{project}',
      projectName || (language === 'tr' ? 'Bu proje' : 'This project'),
    );
    const confirmCancel = window.confirm(confirmMsg);
    if (!confirmCancel) return;

    try {
      const res = await authFetch('/api/release/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: targetPath }),
      });

      if (res.ok) {
        setProjectPipelines((prev) => {
          const next = { ...prev };
          delete next[targetPath];
          return next;
        });

        setProjects((prev) =>
          prev.map((item) =>
            item.path === targetPath ? { ...item, releasing: false, currentStageId: 0 } : item,
          ),
        );
        toast.warning(
          language === 'tr'
            ? `"${projectName || 'Proje'}" için dağıtım süreci iptal edildi.`
            : `Release pipeline cancelled for "${projectName || 'Project'}".`,
          t('alerts.releaseCancelledTitle'),
        );
      } else {
        toast.error(t('alerts.releaseCancelFailed'));
      }
    } catch (err) {
      console.error('Release pipeline cancel error:', err);
      toast.error(t('alerts.cancelConnectionErrorDesc'));
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex font-sans selection:bg-primary selection:text-primary-foreground">
      {}
      <aside className="w-80 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col shrink-0 select-none h-screen">
        {}
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow">
                <Rocket className="w-4 h-4" />
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-tight">{t('header.title')}</h1>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground"></span>
                  {t('header.storeComparison')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Tooltip content={t('header.switchLang')} position="bottom">
                <button
                  type="button"
                  onClick={toggleLanguage}
                  className="h-7 px-2 flex items-center justify-center gap-1 rounded-md border border-sidebar-border text-muted-foreground hover:text-foreground text-[10px] font-mono font-bold transition-all cursor-pointer bg-background/50 hover:bg-secondary"
                  aria-label={t('header.language')}
                >
                  <Languages className="w-3.5 h-3.5" />
                  <span>{language.toUpperCase()}</span>
                </button>
              </Tooltip>
              <Tooltip
                content={isDark ? t('header.switchThemeToLight') : t('header.switchThemeToDark')}
                position="bottom"
              >
                <button
                  onClick={() => {
                    const nextTheme = !isDark;
                    setIsDark(nextTheme);
                    toast.info(
                      nextTheme ? t('header.themeDarkActive') : t('header.themeLightActive'),
                      t('header.themeChanged'),
                    );
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                  aria-label={
                    isDark ? t('header.switchThemeToLight') : t('header.switchThemeToDark')
                  }
                >
                  {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <Tooltip content={t('sidebar.autoDiscoverTooltip')} position="bottom">
              <button
                onClick={() => void handleAutoDiscover()}
                disabled={isDiscovering}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-secondary text-secondary-foreground text-[11px] font-medium hover:bg-secondary/80 transition-all border border-border cursor-pointer disabled:opacity-60"
              >
                <Compass
                  className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin text-primary' : 'text-primary'}`}
                />
                <span className="truncate">
                  {isDiscovering ? t('header.discovering') : t('header.discoverProjects')}
                </span>
              </button>
            </Tooltip>

            <Tooltip content={t('sidebar.syncStoresTooltip')} position="bottom">
              <button
                onClick={() => void handleSyncStores()}
                disabled={isSyncingStores}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-secondary text-secondary-foreground text-[11px] font-medium hover:bg-secondary/80 transition-all border border-border cursor-pointer disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isSyncingStores ? 'animate-spin text-primary' : ''}`}
                />
                <span className="truncate">
                  {isSyncingStores ? t('header.syncingStores') : t('header.syncStores')}
                </span>
              </button>
            </Tooltip>

            <Tooltip
              content={t('labels.selectCustomOrAdd')}
              position="bottom"
            >
              <button
                onClick={() => setShowScanModal(true)}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 transition-all shadow-xs cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>{t('sidebar.scanDirectory')}</span>
              </button>
            </Tooltip>
          </div>
        </div>

        {}
        <div className="px-3 pt-3 pb-1 flex items-center justify-between text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-primary" />
            {t('sidebar.projects')} ({projects.length})
          </span>
          <span className="text-[10px] lowercase text-foreground font-mono font-medium">
            store live
          </span>
        </div>

        {}
        <div className="flex-1 p-2 space-y-2 overflow-y-auto">
          {projects.map((p) => {
            const isSelected = p.path === activeProjectPath;
            const pipe = projectPipelines[p.path];
            const isReleasingThis = Boolean(pipe?.isReleasing || p.releasing);
            const currentStage = pipe?.currentStageId || p.currentStageId || 1;
            const totalStageCount = pipe?.totalStages || p.totalStages || 6;
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
                {}
                {isReleasingThis ? (
                  <div className="absolute left-0 top-2 bottom-2 w-1.5 bg-primary rounded-r-full animate-pulse" />
                ) : isSelected ? (
                  <div className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-primary rounded-r-full" />
                ) : null}

                {}
                <div className="flex items-center gap-2.5 mb-2.5">
                  <ProjectAppIcon
                    path={p.path}
                    name={p.name}
                    className="w-8 h-8 rounded-lg shadow-xs shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div
                        className="font-semibold text-xs text-foreground tracking-tight truncate"
                        title={p.name}
                      >
                        {p.name}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => void handleRemoveProject(e, p.path, p.name)}
                        title={t('sidebar.removeProject')}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div
                      className="text-[10px] font-mono text-muted-foreground/80 truncate"
                      title={p.package}
                    >
                      {p.package || 'com.example.app'}
                    </div>
                  </div>
                </div>

                {}
                <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-muted/40 border border-border/40 text-[11px] mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      {language === 'tr' ? 'Yerel' : 'Local'}
                    </span>
                    <span className="font-mono font-semibold text-foreground text-xs">
                      v{p.version || '1.0.0'}
                      <span className="text-[10px] font-normal text-muted-foreground ml-1">
                        #{p.buildNumber || 1}
                      </span>
                    </span>
                  </div>
                  {isReleasingThis ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 shrink-0 bg-primary text-primary-foreground animate-pulse">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      <span>
                        {t('labels.releasingBadge')} ({currentStage}/
                        {totalStageCount})
                      </span>
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 shrink-0 bg-secondary text-secondary-foreground border border-border">
                      <span className="w-1.5 h-1.5 rounded-full bg-foreground/60" />
                      {comp?.badge || (language === 'tr' ? 'Bekliyor' : 'Waiting')}
                    </span>
                  )}
                </div>

                {}
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  {}
                  <div className="p-1.5 rounded-lg bg-background/50 border border-border/40 flex flex-col justify-between">
                    <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground mb-0.5">
                      <GooglePlayIcon className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">Google Play</span>
                    </div>
                    <div className="font-mono text-[11px] font-medium truncate">
                      {comp?.googlePlay?.status === 'live' ? (
                        <span className="text-foreground font-semibold">
                          {comp.googlePlay.version
                            ? comp.googlePlay.version.startsWith('v')
                              ? comp.googlePlay.version
                              : `v${comp.googlePlay.version}`
                            : comp.googlePlay.versionCode
                              ? `#${comp.googlePlay.versionCode}`
                              : t('matrix.inProduction')}
                        </span>
                      ) : comp?.googlePlay?.status === 'not_found' ? (
                        <span className="text-muted-foreground/70 text-[10px]">
                          {t('matrix.notRegistered')}
                        </span>
                      ) : comp?.googlePlay?.status === 'auth_error' ? (
                        <span className="text-muted-foreground text-[10px]">
                          {language === 'tr' ? 'Yetki Gerekli' : 'Auth Required'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60 text-[10px]">-</span>
                      )}
                    </div>
                  </div>

                  {}
                  <div className="p-1.5 rounded-lg bg-background/50 border border-border/40 flex flex-col justify-between">
                    <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground mb-0.5">
                      <AppStoreConnectIcon className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">App Store</span>
                    </div>
                    <div className="font-mono text-[11px] font-medium truncate">
                      {comp?.appStore?.status === 'live' ? (
                        <div>
                          <span className="text-foreground font-semibold">
                            {comp.appStore.version
                              ? comp.appStore.version.startsWith('v')
                                ? comp.appStore.version
                                : `v${comp.appStore.version}`
                              : comp.appStore.buildNumber
                                ? `#${comp.appStore.buildNumber}`
                                : t('matrix.inProduction')}
                          </span>
                          {comp.appStore.appName && (
                            <div
                              className="text-[9px] text-muted-foreground font-sans truncate"
                              title={comp.appStore.appName}
                            >
                              {comp.appStore.appName}
                            </div>
                          )}
                        </div>
                      ) : comp?.appStore?.status === 'not_found' ? (
                        <span className="text-muted-foreground/70 text-[10px]">
                          {t('matrix.notRegistered')}
                        </span>
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

        {}
        <div className="p-3 border-t border-sidebar-border bg-sidebar-accent/20 space-y-1">
          <Tooltip
            content={t('labels.testAndVerifyApiKeys')}
            position="right"
          >
            <button
              onClick={() => setShowStoreTestModal(true)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-all cursor-pointer border border-transparent hover:border-border"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                <span>{t('settings.credentialsTitle')}</span>
              </div>
              <ChevronRight className="w-3 h-3 opacity-60" />
            </button>
          </Tooltip>

          <Tooltip
            content={t('labels.listSqliteRecords')}
            position="right"
          >
            <button
              onClick={() => {
                setActiveMainTab('history');
                void loadHistory('all');
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer border ${
                activeMainTab === 'history'
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground border-transparent hover:border-border'
              }`}
            >
              <div className="flex items-center gap-2">
                <History
                  className={`w-3.5 h-3.5 ${activeMainTab === 'history' ? 'text-primary-foreground' : 'text-primary'}`}
                />
                <span>{t('history.title')}</span>
              </div>
              <ChevronRight className="w-3 h-3 opacity-60" />
            </button>
          </Tooltip>

          <Tooltip
            content={t('labels.releaseStepsAndDocs')}
            position="right"
          >
            <button
              onClick={() => setShowWikiModal(true)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-all cursor-pointer border border-transparent hover:border-border"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-primary" />
                <span>{t('wiki.title')}</span>
              </div>
              <ChevronRight className="w-3 h-3 opacity-60" />
            </button>
          </Tooltip>
        </div>
      </aside>

      {}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {}
        <header className="px-6 py-3.5 border-b border-border bg-card/60 backdrop-blur sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ProjectAppIcon
              path={activeProjectPath}
              name={projectName || (language === 'tr' ? 'Proje' : 'Project')}
              className="w-10 h-10 rounded-xl shadow-sm border border-border"
            />
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold tracking-tight text-foreground">
                  {projectName || (language === 'tr' ? 'Proje Seçilmedi' : 'No Project Selected')}
                </h2>
                {projectPackage && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border">
                    {projectPackage}
                  </span>
                )}
                {hasPubspec && (
                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border border-border">
                    Flutter
                  </span>
                )}
                {gitRemote.connected && (
                  <Tooltip
                    content={`${t('labels.remoteRepoColon')} ${gitRemote.remoteUrl || 'GitHub'}`}
                    position="bottom"
                  >
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border bg-secondary text-secondary-foreground flex items-center gap-1 cursor-help">
                      <CheckCircle2 className="w-2.5 h-2.5 text-foreground" />
                      <span>{t('header.gitConnected')}</span>
                    </span>
                  </Tooltip>
                )}
                <div className="relative group">
                  <Tooltip
                    content={
                      isGitClean
                        ? t('labels.gitCleanAndUpdated')
                        : `${uncommittedFiles.length} ${t('labels.uncommittedChanges')}`
                    }
                    position="bottom"
                  >
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border cursor-default flex items-center gap-1 ${
                        isGitClean
                          ? 'bg-secondary text-secondary-foreground'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      {isGitClean ? (
                        <>
                          <Check className="w-2.5 h-2.5 text-foreground" />
                          <span>{t('header.gitClean')}</span>
                        </>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-foreground/60" />
                          <span>
                            {uncommittedFiles.length > 0
                              ? `${uncommittedFiles.length} ${t('header.gitChanges')}`
                              : t('header.gitChanges')}
                          </span>
                        </>
                      )}
                    </span>
                  </Tooltip>

                  {}
                  {!isGitClean && uncommittedFiles.length > 0 && (
                    <div className="absolute left-0 top-full mt-1.5 hidden group-hover:block z-50 min-w-56 max-w-sm p-2.5 rounded-lg bg-popover/95 backdrop-blur border border-border shadow-xl text-[11px] animate-in fade-in-50 zoom-in-95">
                      <div className="font-semibold text-foreground mb-1.5 flex items-center justify-between border-b border-border/50 pb-1">
                        <span>
                          {t('labels.uncommittedFilesTitle')} (
                          {uncommittedFiles.length})
                        </span>
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-[10px] text-muted-foreground">
                        {uncommittedFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-1.5 truncate text-foreground hover:text-foreground/80"
                          >
                            <span className="text-foreground/60 font-bold">•</span>
                            <span className="truncate" title={file}>
                              {file}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {}
                {!isGitClean && uncommittedFiles.length > 0 && (
                  <Tooltip
                    content={t('labels.pushToRemoteDesc')}
                    position="bottom"
                  >
                    <button
                      type="button"
                      onClick={() => void handleGitCommitPush()}
                      disabled={isGitPushing}
                      className="flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-semibold rounded-full border border-border bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                    >
                      {isGitPushing ? (
                        <>
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                          <span>{t('header.pushing')}</span>
                        </>
                      ) : (
                        <>
                          <GitCommit className="w-2.5 h-2.5 text-foreground" />
                          <span>{t('header.saveAndPush')}</span>
                        </>
                      )}
                    </button>
                  </Tooltip>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate max-w-xl flex items-center gap-1.5">
                {activeProjectPath ? (
                  <>
                    <span className="truncate">{activeProjectPath}</span>
                    <span>•</span>
                    <span>
                      branch:{' '}
                      <span className="text-foreground font-bold font-mono">
                        {gitBranch || 'main'}
                      </span>
                    </span>
                    {gitRemote.webUrl && (
                      <>
                        <span>•</span>
                        <a
                          href={gitRemote.webUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline flex items-center gap-1 shrink-0 font-medium"
                          title={`GitHub: ${gitRemote.remoteUrl || ''}`}
                        >
                          <GitCommit className="w-3 h-3 text-primary" />
                          <span>{gitRemote.ownerRepo || 'GitHub'}</span>
                        </a>
                      </>
                    )}
                    {gitRemote.lastTag && (
                      <>
                        <span>•</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-secondary text-muted-foreground border border-border shrink-0">
                          tag: {gitRemote.lastTag}
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground/60">{t('header.noActiveProject')}</span>
                )}
              </p>
              {gitPushSuccessMsg && (
                <div className="mt-1 text-[11px] font-medium text-foreground flex items-center gap-1 animate-in fade-in">
                  <CheckCircle2 className="w-3 h-3 text-foreground" />
                  <span>{gitPushSuccessMsg}</span>
                </div>
              )}
            </div>
          </div>

          {/* ORTA BÖLÜM: ANA SEKME DEĞİŞTİRİCİ */}
          <div className="flex items-center p-1 bg-secondary/80 rounded-xl border border-border shadow-2xs">
            <Tooltip
              content={t('labels.goToReleaseCenter')}
              position="bottom"
            >
              <button
                type="button"
                onClick={() => setActiveMainTab('dashboard')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeMainTab === 'dashboard'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Rocket className="w-3.5 h-3.5 text-primary" />
                <span>{t('header.releaseCenter')}</span>
              </button>
            </Tooltip>

            <Tooltip
              content={t('labels.sqliteReleaseAndAuditLogs')}
              position="bottom"
            >
              <button
                type="button"
                onClick={() => {
                  setActiveMainTab('history');
                  void loadHistory('all');
                }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeMainTab === 'history'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <History className="w-3.5 h-3.5 text-primary" />
                <span>{t('header.releaseHistory')}</span>
                {historyReleases.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-mono font-bold">
                    {historyReleases.length}
                  </span>
                )}
              </button>
            </Tooltip>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip content={t('header.switchLang')} position="bottom">
              <button
                type="button"
                onClick={toggleLanguage}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-background text-xs font-mono font-bold hover:bg-secondary transition-all cursor-pointer"
                aria-label={t('header.language')}
              >
                <Languages className="w-3.5 h-3.5 text-primary" />
                <span>{language.toUpperCase()}</span>
              </button>
            </Tooltip>

            <Tooltip
              content={t('labels.configureStoreAndAiKeys')}
              position="bottom"
            >
              <button
                onClick={() => setShowStoreTestModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-secondary transition-all cursor-pointer"
              >
                <Key className="w-3.5 h-3.5 text-primary" />
                <span>{t('header.configureApi')}</span>
              </button>
            </Tooltip>

            <Tooltip
              content={t('labels.syncLiveStoresOverApi')}
              position="bottom"
            >
              <button
                onClick={() => void handleSyncStores()}
                disabled={isSyncingStores}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-secondary transition-all cursor-pointer disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isSyncingStores ? 'animate-spin text-primary' : ''}`}
                />
                <span>{isSyncingStores ? t('header.syncingStores') : t('header.syncStores')}</span>
              </button>
            </Tooltip>
          </div>
        </header>

        {activeMainTab === 'dashboard' ? (
          <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
            {/* ===================== CANLI STORE KARŞILAŞTIRMA MATRİSİ ===================== */}
            <section className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              {/* HESAPLANAN MAĞAZA VE EN YÜKSEK SÜRÜM DEĞİŞKENLERİ */}
              {(() => {
                const googleVer =
                  activeComparison?.googlePlay?.status === 'live' &&
                  activeComparison.googlePlay.version
                    ? activeComparison.googlePlay.version.replace(/^v/, '')
                    : '';
                const googleCode =
                  activeComparison?.googlePlay?.status === 'live' &&
                  activeComparison.googlePlay.versionCode
                    ? activeComparison.googlePlay.versionCode
                    : 0;

                let appleVer = '';
                let appleCode = 0;
                if (activeComparison?.appStore?.status === 'live') {
                  if (activeComparison.appStore.version) {
                    const cleanAppVer = activeComparison.appStore.version.replace(/^v/, '');
                    appleVer =
                      cleanAppVer.split('.').length === 2 ? `${cleanAppVer}.0` : cleanAppVer;
                  }
                  if (activeComparison.appStore.buildNumber) {
                    const parsed = parseInt(activeComparison.appStore.buildNumber, 10);
                    if (!isNaN(parsed)) appleCode = parsed;
                  }
                }

                const currentVerClean = currentVersion ? currentVersion.replace(/^v/, '') : '1.0.0';
                const currentCode = currentBuildNumber || 1;

                // 1. Google Play, App Store ve Yerel Kod arasındaki EN BÜYÜK sürümü bul
                let highestVersion = currentVerClean;
                if (googleVer && compareSemver(highestVersion, googleVer) < 0) {
                  highestVersion = googleVer;
                }
                if (appleVer && compareSemver(highestVersion, appleVer) < 0) {
                  highestVersion = appleVer;
                }

                // 2. EN BÜYÜK build numarasını bul
                const highestBuildNumber = Math.max(currentCode, googleCode, appleCode);

                // 3. Eşitlik kontrolü (Mağazalar ve yerel hepsi bu büyük sürüme eşit mi?)
                const hasAnyStoreLive = Boolean(googleVer || appleVer);
                const isGoogleEqual =
                  !googleVer || (googleVer === highestVersion && googleCode === highestBuildNumber);
                const isAppleEqual =
                  !appleVer || (appleVer === highestVersion && appleCode === highestBuildNumber);
                const isLocalEqual =
                  currentVerClean === highestVersion && currentCode === highestBuildNumber;

                const areAllInSync =
                  hasAnyStoreLive && isGoogleEqual && isAppleEqual && isLocalEqual;
                const canSyncToHigher = hasAnyStoreLive && !areAllInSync;

                return (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                          <span className="flex items-center gap-1.5">
                            <GooglePlayIcon className="w-4 h-4 shrink-0" />
                            <AppStoreConnectIcon className="w-4 h-4 shrink-0" />
                          </span>
                          {t('matrix.title')}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t('matrix.subtitle')}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2.5 py-1 rounded-full font-semibold border border-border bg-secondary text-secondary-foreground">
                          {activeComparison?.badge || t('matrix.statusDetermining')}
                        </span>
                      </div>
                    </div>

                    {/* 3 SÜTUNLU KARŞILAŞTIRMA KARTLARI */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* 1. YEREL KOD TABANI */}
                      <div className="p-4 rounded-lg border border-border bg-background/50 space-y-2 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                              <Code2 className="w-3.5 h-3.5 text-primary" /> {t('matrix.localCode')}
                            </span>
                            <span className="font-mono text-foreground font-semibold">
                              {gitBranch || 'main'}
                            </span>
                          </div>
                          <div className="pt-1">
                            <div className="text-2xl font-extrabold font-mono text-foreground">
                              {currentVersion
                                ? currentVersion.startsWith('v')
                                  ? currentVersion
                                  : `v${currentVersion}`
                                : '-'}
                            </div>
                            <div className="text-xs font-mono text-muted-foreground">
                              {t('matrix.buildNumberColon')} #{currentBuildNumber || 1}
                            </div>
                          </div>
                          <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                            {commits.length > 0 ? (
                              <>
                                {t('matrix.lastCommitColon')}{' '}
                                <span className="font-mono text-foreground font-semibold">
                                  {commits[0]?.hash.substring(0, 7)}
                                </span>{' '}
                                ({commits.length} {t('matrix.commitsExamined')})
                              </>
                            ) : isLoadingProject ? (
                              <span className="text-muted-foreground/80 italic">
                                {t('matrix.analyzingCommitHistory')}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60">
                                {t('matrix.noExaminedCommits')}
                              </span>
                            )}
                          </div>
                        </div>

                        <div
                          className="pt-2 border-t border-border/50 text-[11px] text-muted-foreground font-mono truncate"
                          title="pubspec.yaml"
                        >
                          pubspec.yaml: v{currentVersion || '1.0.0'}+{currentBuildNumber || 1}
                        </div>
                      </div>

                      {/* 2. GOOGLE PLAY CONSOLE */}
                      <div className="p-4 rounded-lg border border-border bg-background/50 space-y-2 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                              <GooglePlayIcon className="w-4 h-4" /> Google Play Console
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                googlePlayInfo.connected
                                  ? 'text-foreground bg-secondary border-border'
                                  : 'text-muted-foreground bg-secondary border-transparent'
                              }`}
                            >
                              {googlePlayInfo.connected
                                ? t('labels.apiConnected')
                                : t('labels.notConnected')}
                            </span>
                          </div>
                          <div className="pt-1">
                            <div className="text-2xl font-extrabold font-mono text-foreground flex items-baseline gap-2">
                              {activeComparison?.googlePlay?.status === 'live' ? (
                                activeComparison.googlePlay.version ? (
                                  <span>
                                    {activeComparison.googlePlay.version.startsWith('v')
                                      ? activeComparison.googlePlay.version
                                      : `v${activeComparison.googlePlay.version}`}
                                  </span>
                                ) : activeComparison.googlePlay.versionCode ? (
                                  <span>#{activeComparison.googlePlay.versionCode}</span>
                                ) : (
                                  <span>{t('matrix.inProduction')}</span>
                                )
                              ) : activeComparison?.googlePlay?.status === 'not_found' ? (
                                <span className="text-muted-foreground text-lg">
                                  {t('matrix.notRegistered')}
                                </span>
                              ) : activeComparison?.googlePlay?.status === 'auth_error' ? (
                                <span className="text-destructive text-lg font-bold">
                                  {t('matrix.authRequiredBadge')}
                                </span>
                              ) : googlePlayInfo.connected ? (
                                <span className="text-foreground text-lg font-bold">
                                  {t('matrix.readyConnection')}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-lg">
                                  {t('common.notConfigured')}
                                </span>
                              )}
                              {activeComparison?.googlePlay?.versionCode ? (
                                <span className="text-xs font-normal text-muted-foreground font-mono">
                                  (Build #{activeComparison.googlePlay.versionCode})
                                </span>
                              ) : null}
                            </div>
                            <div
                              className="text-xs font-mono text-muted-foreground truncate"
                              title={googlePlayInfo.serviceAccount}
                            >
                              {t('matrix.accountColon')}{' '}
                              {googlePlayInfo.serviceAccount
                                ? googlePlayInfo.serviceAccount.split('@')[0]
                                : 'play-store-deployer'}
                            </div>
                          </div>
                        </div>

                        <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50 truncate">
                          {activeComparison?.googlePlay?.message || t('matrix.statusChecked')}
                        </div>
                      </div>

                      {/* 3. APPLE APP STORE CONNECT */}
                      <div className="p-4 rounded-lg border border-border bg-background/50 space-y-2 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                              <AppStoreConnectIcon className="w-4 h-4 shrink-0" /> App Store Connect
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                appStoreInfo.connected
                                  ? 'text-foreground bg-secondary border-border'
                                  : 'text-muted-foreground bg-secondary border-transparent'
                              }`}
                            >
                              {appStoreInfo.connected
                                ? t('labels.apiConnected')
                                : t('common.notConfigured')}
                            </span>
                          </div>
                          <div className="pt-1">
                            <div className="text-2xl font-extrabold font-mono text-foreground flex items-baseline gap-2">
                              {activeComparison?.appStore?.status === 'live' ? (
                                activeComparison.appStore.version ? (
                                  <span>
                                    {activeComparison.appStore.version.startsWith('v')
                                      ? activeComparison.appStore.version
                                      : `v${activeComparison.appStore.version}`}
                                  </span>
                                ) : activeComparison.appStore.buildNumber ? (
                                  <span>#{activeComparison.appStore.buildNumber}</span>
                                ) : (
                                  <span>{t('matrix.inProduction')}</span>
                                )
                              ) : activeComparison?.appStore?.status === 'not_found' ? (
                                <span className="text-muted-foreground text-lg">
                                  {t('matrix.notRegistered')}
                                </span>
                              ) : appStoreInfo.connected ? (
                                <span className="text-foreground text-lg font-bold">
                                  {t('matrix.readyConnection')}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-lg">
                                  {t('common.notConfigured')}
                                </span>
                              )}
                              {activeComparison?.appStore?.buildNumber ? (
                                <span className="text-xs font-normal text-muted-foreground font-mono">
                                  (Build #{activeComparison.appStore.buildNumber})
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center justify-between text-xs font-mono text-muted-foreground pt-0.5">
                              <span className="truncate">
                                {activeComparison?.appStore?.appName ? (
                                  <span className="text-foreground font-sans font-semibold inline-flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5 text-foreground" />
                                    <span>{activeComparison.appStore.appName}</span>
                                  </span>
                                ) : (
                                  `Key ID: ${appStoreInfo.keyId || t('common.notConfigured')}`
                                )}
                              </span>
                              {activeComparison?.appStore?.bundleId && (
                                <span
                                  className="text-[10px] text-muted-foreground font-mono truncate"
                                  title={activeComparison.appStore.bundleId}
                                >
                                  {activeComparison.appStore.bundleId}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50 truncate">
                          {activeComparison?.appStore?.message || t('matrix.statusChecked')}
                        </div>
                      </div>
                    </div>

                    {/* KARŞILAŞTIRMA ÖZET KARARI VE TEK EŞİTLEME BUTONU */}
                    <div className="p-3.5 rounded-lg bg-secondary/50 border border-border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-secondary-foreground">
                      <div className="flex items-center gap-2.5">
                        <Info className="w-4 h-4 text-primary shrink-0" />
                        <span>
                          <strong>
                            {language === 'tr' ? 'Karşılaştırma Analizi:' : 'Comparison Analysis:'}
                          </strong>{' '}
                          {activeComparison?.summary ||
                            (language === 'tr'
                              ? 'Mağaza ve yerel sürüm durumu analiz ediliyor.'
                              : 'Analyzing store and local version status.')}
                        </span>
                      </div>

                      <div className="flex items-center shrink-0">
                        {canSyncToHigher ? (
                          <Tooltip
                            content={t('labels.autoSyncLowerVersionDesc')}
                            position="top"
                          >
                            <button
                              type="button"
                              onClick={() => void handleSyncStoreVersion('smart')}
                              disabled={isSyncingStoreVersion}
                              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw
                                className={`w-3.5 h-3.5 ${isSyncingStoreVersion ? 'animate-spin' : ''}`}
                              />
                              <span>
                                {isSyncingStoreVersion
                                  ? t('labels.syncingVersion')
                                  : `${t('labels.syncVersionsBtn')} (${language === 'tr' ? `v${highestVersion}+${highestBuildNumber}'e Yükselt` : `Upgrade to v${highestVersion}+${highestBuildNumber}`})`}
                              </span>
                            </button>
                          </Tooltip>
                        ) : areAllInSync ? (
                          <Tooltip
                            content={t('labels.versionsSyncedDesc')}
                            position="top"
                          >
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border text-foreground font-semibold text-xs cursor-default">
                              <CheckCircle2 className="w-4 h-4 text-foreground" />
                              <span>
                                {t('labels.versionsEqual')} (v{highestVersion} #{highestBuildNumber})
                              </span>
                            </div>
                          </Tooltip>
                        ) : null}
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* EŞİTLEME BAŞARI BİLDİRİMİ */}
              {syncStoreSuccessMsg && (
                <div className="p-3 rounded-lg bg-secondary border border-border text-xs text-foreground flex items-center gap-2 animate-in fade-in duration-200">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-foreground" />
                  <span className="font-semibold">{syncStoreSuccessMsg}</span>
                </div>
              )}
            </section>

            {/* ===================== SÜRÜM DAĞITIM MERKEZİ & FORMU ===================== */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* SOL 2 SÜTUN: AYARLAR & AI NOTLARI */}
              <div className="lg:col-span-2 space-y-6">
                {/* SÜRÜM STRATEJİSİ */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <GitCommit className="w-4 h-4 text-primary" />
                    {t('pipeline.bumpType')}
                  </h4>

                  <div className="grid grid-cols-4 gap-2">
                    {(['patch', 'minor', 'major', 'custom'] as const).map((type) => {
                      const tipText =
                        type === 'patch'
                          ? t('pipeline.bumpPatchTip')
                          : type === 'minor'
                            ? t('pipeline.bumpMinorTip')
                            : type === 'major'
                              ? t('pipeline.bumpMajorTip')
                              : t('pipeline.bumpCustomTip');
                      const label =
                        type === 'patch'
                          ? t('pipeline.patch')
                          : type === 'minor'
                            ? t('pipeline.minor')
                            : type === 'major'
                              ? t('pipeline.major')
                              : t('pipeline.custom');
                      return (
                        <Tooltip key={type} content={tipText} position="top">
                          <button
                            onClick={() => setBumpType(type)}
                            className={`w-full px-3 py-2 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer border ${
                              bumpType === type
                                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                : 'bg-background text-muted-foreground border-border hover:bg-secondary hover:text-foreground'
                            }`}
                          >
                            {label}
                          </button>
                        </Tooltip>
                      );
                    })}
                  </div>

                  {bumpType === 'custom' && (
                    <div className="pt-1">
                      <label className="text-xs text-muted-foreground block mb-1">
                        {t('pipeline.customVersionPlaceholder')}:
                      </label>
                      <input
                        type="text"
                        value={customVersion}
                        onChange={(e) => setCustomVersion(e.target.value)}
                        placeholder={t('pipeline.customVersionPlaceholder')}
                        className="w-full text-xs font-mono px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border text-xs">
                    <div>
                      <span className="text-muted-foreground">Mevcut:</span>{' '}
                      <span className="font-mono font-bold">
                        {currentVersion}+{currentBuildNumber}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <span className="text-muted-foreground">{t('pipeline.nextVersion')}:</span>{' '}
                      <span className="font-mono font-bold text-foreground">
                        {nextVersion}+{nextBuildNumber}
                      </span>
                    </div>
                  </div>
                </div>

                {/* HEDEF MAĞAZALAR & PLATFORM SEÇİMİ */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                      <span className="flex items-center gap-1.5">
                        <GooglePlayIcon className="w-4 h-4 shrink-0" />
                        <AppStoreConnectIcon className="w-4 h-4 shrink-0" />
                      </span>
                      {t('pipeline.targetPlatform')}
                    </h4>

                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-border bg-secondary text-secondary-foreground inline-flex items-center gap-1">
                      <Zap className="w-3 h-3 text-foreground" />
                      <span>
                        {targetAndroid && targetIos
                          ? t('pipeline.both')
                          : targetAndroid
                            ? t('pipeline.fastAndroid')
                            : t('pipeline.fastIos')}
                      </span>
                    </span>
                  </div>

                  {/* HIZLI PLATFORM SEÇİCİ (SEGMENTED CONTROL) */}
                  <div className="p-1.5 bg-secondary/60 rounded-xl border border-border flex flex-col sm:flex-row items-center gap-1.5">
                    <Tooltip
                      content={t('labels.googlePlayAabDesc')}
                      position="top"
                      className="w-full"
                    >
                      <button
                        type="button"
                        onClick={() => applyPlatformMode('android')}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          platformMode === 'android'
                            ? 'bg-background text-foreground shadow-xs border border-border ring-1 ring-border'
                            : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                        }`}
                      >
                        <GooglePlayIcon className="w-4 h-4 shrink-0" />
                        <span>{t('pipeline.androidOnly')}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border border-border">
                          AAB (~1.5 {language === 'tr' ? 'dk' : 'min'})
                        </span>
                      </button>
                    </Tooltip>

                    <Tooltip
                      content={t('labels.appStoreIpaDesc')}
                      position="top"
                      className="w-full"
                    >
                      <button
                        type="button"
                        onClick={() => applyPlatformMode('ios')}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          platformMode === 'ios'
                            ? 'bg-background text-foreground shadow-xs border border-border ring-1 ring-border'
                            : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                        }`}
                      >
                        <AppStoreConnectIcon className="w-4 h-4 shrink-0" />
                        <span>{t('pipeline.iosOnly')}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border border-border">
                          IPA (~2.5 {language === 'tr' ? 'dk' : 'min'})
                        </span>
                      </button>
                    </Tooltip>

                    <Tooltip
                      content={t('labels.bothPlatformsDesc')}
                      position="top"
                      className="w-full"
                    >
                      <button
                        type="button"
                        onClick={() => applyPlatformMode('all')}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          platformMode === 'all'
                            ? 'bg-background text-foreground shadow-xs border border-border ring-1 ring-border'
                            : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                        }`}
                      >
                        <span className="flex items-center -space-x-1">
                          <GooglePlayIcon className="w-3.5 h-3.5" />
                          <AppStoreConnectIcon className="w-3.5 h-3.5" />
                        </span>
                        <span>{t('pipeline.allPlatforms')}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border border-border">
                          {t('pipeline.both')}
                        </span>
                      </button>
                    </Tooltip>
                  </div>

                  {/* AKILLI DEĞİŞİKLİK TESPİTİ (SMART GIT CHANGE DETECTION BANNER) */}
                  {gitNativeChanges &&
                    (gitNativeChanges.androidChanged || gitNativeChanges.iosChanged) && (
                      <div className="space-y-2">
                        {gitNativeChanges.androidChanged && !gitNativeChanges.iosChanged && (
                          <div className="p-3 rounded-lg bg-secondary/60 border border-border text-xs flex flex-wrap items-center justify-between gap-3 text-foreground">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 shrink-0 text-foreground" />
                              <span>
                                <strong>{t('pipeline.smartGitAndroid')}</strong>
                              </span>
                            </div>
                            {platformMode !== 'android' && (
                              <button
                                type="button"
                                onClick={() => applyPlatformMode('android')}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-medium text-[11px] shrink-0 hover:bg-primary/90 transition-colors cursor-pointer shadow-xs"
                              >
                                <Zap className="w-3 h-3" />
                                <span>{t('pipeline.switchToAndroid')}</span>
                              </button>
                            )}
                          </div>
                        )}

                        {gitNativeChanges.iosChanged && !gitNativeChanges.androidChanged && (
                          <div className="p-3 rounded-lg bg-secondary/60 border border-border text-xs flex flex-wrap items-center justify-between gap-3 text-foreground">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 shrink-0 text-foreground" />
                              <span>
                                <strong>{t('pipeline.smartGitIos')}</strong>
                              </span>
                            </div>
                            {platformMode !== 'ios' && (
                              <button
                                type="button"
                                onClick={() => applyPlatformMode('ios')}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-medium text-[11px] shrink-0 hover:bg-primary/90 transition-colors cursor-pointer shadow-xs"
                              >
                                <Zap className="w-3 h-3" />
                                <span>{t('pipeline.switchToIos')}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* GOOGLE PLAY AYARLARI */}
                    <div
                      className={`p-3.5 rounded-lg border transition-all ${
                        targetAndroid
                          ? 'border-border bg-card shadow-xs'
                          : 'border-border/60 bg-muted/30 opacity-60'
                      } space-y-3`}
                    >
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={targetAndroid}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              if (!isChecked && !targetIos) {
                                toast.warning(
                                  t('toast.platformWarning'),
                                  language === 'tr' ? 'Platform Seçimi' : 'Platform Selection',
                                );
                                return;
                              }
                              setTargetAndroid(isChecked);
                              if (isChecked && targetIos) setPlatformMode('all');
                              else if (isChecked && !targetIos) setPlatformMode('android');
                              else if (!isChecked && targetIos) setPlatformMode('ios');
                            }}
                            className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                          />
                          <GooglePlayIcon className="w-4 h-4 shrink-0" />
                          <span>{t('pipeline.googlePlaySettings')}</span>
                        </label>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                            targetAndroid
                              ? 'bg-secondary text-secondary-foreground border-border'
                              : 'bg-muted text-muted-foreground border-transparent'
                          }`}
                        >
                          {targetAndroid
                            ? language === 'tr'
                              ? 'AAB Derlenecek'
                              : 'Build AAB'
                            : t('history.resultSkipped')}
                        </span>
                      </div>

                      {targetAndroid && (
                        <div className="space-y-2 pt-1 border-t border-border/60">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px] text-muted-foreground">
                                {t('pipeline.googleTrack')}:
                              </label>
                              {activeComparison?.googlePlay?.track &&
                              isValidGoogleTrack(activeComparison.googlePlay.track) ? (
                                <span className="text-[10px] text-foreground font-medium flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-foreground"></span>
                                  {t('labels.liveChannelLabel')}{' '}
                                  {getGoogleTrackLabel(activeComparison.googlePlay.track, t)}
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">
                                  {t('labels.autoSelectedBadge')}
                                </span>
                              )}
                            </div>
                            <select
                              value={googleTrack}
                              onChange={(e) => {
                                const newTrack = e.target.value as
                                  'internal' | 'alpha' | 'beta' | 'production';
                                setGoogleTrack(newTrack);
                                const currentPath = activePathRef.current || activeProjectPath;
                                if (currentPath) {
                                  try {
                                    localStorage.setItem(`webicro_track_${currentPath}`, newTrack);
                                  } catch {
                                    // ignore
                                  }
                                }
                              }}
                              className="w-full text-xs px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value="internal">{t('pipeline.trackInternal')}</option>
                              <option value="alpha">{t('pipeline.trackAlpha')}</option>
                              <option value="beta">{t('pipeline.trackBeta')}</option>
                              <option value="production">{t('pipeline.trackProduction')}</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* APPLE APP STORE AYARLARI */}
                    <div
                      className={`p-3.5 rounded-lg border transition-all ${
                        targetIos
                          ? 'border-border bg-card shadow-xs'
                          : 'border-border/60 bg-muted/30 opacity-60'
                      } space-y-3`}
                    >
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={targetIos}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              if (!isChecked && !targetAndroid) {
                                toast.warning(
                                  t('toast.platformWarning'),
                                  language === 'tr' ? 'Platform Seçimi' : 'Platform Selection',
                                );
                                return;
                              }
                              setTargetIos(isChecked);
                              if (isChecked && targetAndroid) setPlatformMode('all');
                              else if (!isChecked && targetAndroid) setPlatformMode('ios');
                              else if (isChecked && !targetAndroid) setPlatformMode('android');
                            }}
                            className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                          />
                          <AppStoreConnectIcon className="w-4 h-4 shrink-0" />
                          <span>{t('pipeline.appStoreSettings')}</span>
                        </label>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                            targetIos
                              ? 'bg-secondary text-secondary-foreground border-border'
                              : 'bg-muted text-muted-foreground border-transparent'
                          }`}
                        >
                          {targetIos
                            ? language === 'tr'
                              ? 'IPA Derlenecek'
                              : 'Build IPA'
                            : t('history.resultSkipped')}
                        </span>
                      </div>

                      {targetIos && (
                        <div className="space-y-2 pt-1 border-t border-border/60 text-xs text-muted-foreground">
                          <p className="text-[11px] leading-relaxed">
                            {t('labels.ipaTestFlightDesc')}
                          </p>
                          <div className="text-[10px] font-mono text-muted-foreground bg-secondary/50 p-2 rounded border border-border">
                            Auth: ES256 JWT • Key:{' '}
                            {appStoreInfo.keyId || (language === 'tr' ? 'Yok' : 'None')}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* AI SÜRÜM NOTLARI */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/60">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                          {t('ai.releaseNotesTitle')}
                        </h4>
                        <span className="text-[11px] text-muted-foreground">
                          {t('labels.bulletNotesCleanOutput')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* HIZLI MOTOR SEÇİCİ */}
                      <div className="flex items-center gap-1.5 bg-background border border-border px-2 py-1 rounded-lg">
                        <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
                        <select
                          value={aiProvider}
                          onChange={(e) =>
                            setAiProvider(
                              e.target.value as 'gemini' | 'openai' | 'anthropic' | 'conventional',
                            )
                          }
                          className="text-xs font-semibold bg-transparent text-foreground cursor-pointer focus:outline-none"
                          title={t('labels.releaseNotesEngine')}
                        >
                          <option value="gemini">Google Gemini</option>
                          <option value="openai">OpenAI (ChatGPT)</option>
                          <option value="anthropic">Anthropic (Claude)</option>
                          <option value="conventional">
                            {t('labels.conventionalResolver')}
                          </option>
                        </select>
                      </div>

                      <Tooltip
                        content={t('labels.manageAiModelsAndKeys')}
                        position="top"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveStoreTab('ai');
                            setShowStoreTestModal(true);
                          }}
                          className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-secondary transition-colors cursor-pointer"
                        >
                          {t('tabs.aiSettings')}
                        </button>
                      </Tooltip>

                      <Tooltip
                        content={t('labels.dualLanguageNotesDesc')}
                        position="top"
                      >
                        <button
                          onClick={() => void handleGenerateAI()}
                          disabled={isGeneratingAI || commits.length === 0}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer disabled:opacity-50 ${
                            (!releaseNotesTR.trim() || !releaseNotesEN.trim()) && commits.length > 0
                              ? 'bg-primary text-primary-foreground border-primary shadow-sm hover:opacity-90 ring-2 ring-primary/30'
                              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-border'
                          }`}
                        >
                          <Sparkles
                            className={`w-3.5 h-3.5 ${isGeneratingAI ? 'animate-spin' : ''}`}
                          />
                          <span>
                            {isGeneratingAI ? t('ai.generating') : t('ai.generateAiNotes')}
                          </span>
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* TÜRKÇE NOTLAR */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{t('ai.notesTr')}</span>
                        <Tooltip
                          content={t('labels.copyTrNotes')}
                          position="top"
                        >
                          <button
                            onClick={() => handleCopyNotes('tr')}
                            disabled={!releaseNotesTR.trim()}
                            className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {copiedLang === 'tr' ? (
                              <Check className="w-3 h-3 text-foreground" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{t('common.copy')}</span>
                          </button>
                        </Tooltip>
                      </div>
                      <textarea
                        rows={6}
                        value={releaseNotesTR}
                        onChange={(e) => setReleaseNotesTR(e.target.value)}
                        placeholder={
                          language === 'tr'
                            ? "Sürüm notu henüz oluşturulmadı. 'AI ile Sürüm Notu Üret' butonuna tıklayarak oluşturun veya buraya manuel girin..."
                            : "Release notes not generated yet. Click 'Generate Notes with AI' to create or enter manually..."
                        }
                        className="w-full text-xs p-3 rounded-lg border border-border bg-background text-foreground font-sans focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed placeholder:text-muted-foreground/60"
                      />
                      <div className="flex items-center justify-between text-[11px] px-1">
                        <span className="text-muted-foreground">{t('ai.notesLimit500')}</span>
                        <span
                          className={`font-mono font-medium ${releaseNotesTR.length > 500 ? 'text-destructive font-bold' : releaseNotesTR.length > 450 ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
                        >
                          {releaseNotesTR.length} / 500
                        </span>
                      </div>
                    </div>

                    {/* İNGİLİZCE NOTLAR */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{t('ai.notesEn')}</span>
                        <Tooltip
                          content={t('labels.copyEnNotes')}
                          position="top"
                        >
                          <button
                            onClick={() => handleCopyNotes('en')}
                            disabled={!releaseNotesEN.trim()}
                            className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {copiedLang === 'en' ? (
                              <Check className="w-3 h-3 text-foreground" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{t('common.copy')}</span>
                          </button>
                        </Tooltip>
                      </div>
                      <textarea
                        rows={6}
                        value={releaseNotesEN}
                        onChange={(e) => setReleaseNotesEN(e.target.value)}
                        placeholder={
                          language === 'tr'
                            ? "Sürüm notu henüz oluşturulmadı. 'AI ile Sürüm Notu Üret' butonuna tıklayarak oluşturun veya buraya manuel girin..."
                            : "Release notes not generated yet. Click 'Generate Notes with AI' to create or enter manually..."
                        }
                        className="w-full text-xs p-3 rounded-lg border border-border bg-background text-foreground font-sans focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed placeholder:text-muted-foreground/60"
                      />
                      <div className="flex items-center justify-between text-[11px] px-1">
                        <span className="text-muted-foreground">{t('ai.notesLimit500')}</span>
                        <span
                          className={`font-mono font-medium ${releaseNotesEN.length > 500 ? 'text-destructive font-bold' : releaseNotesEN.length > 450 ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
                        >
                          {releaseNotesEN.length} / 500
                        </span>
                      </div>
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
                      {t('pipeline.startRelease')}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('pipeline.startReleaseDesc')}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">{t('labels.targetProjectColon')}</span>
                      <span className="font-semibold text-foreground truncate max-w-[130px]">
                        {projectName}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">{t('labels.targetVersionColon')}</span>
                      <span className="font-mono font-bold text-foreground">
                        {nextVersion}+{nextBuildNumber}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">{t('labels.targetPlatformColon')}</span>
                      <span className="font-semibold text-[11px] font-mono px-2 py-0.5 rounded-full border border-border bg-secondary text-secondary-foreground">
                        {targetAndroid && targetIos
                          ? t('pipeline.both')
                          : targetAndroid
                            ? t('pipeline.fastAndroid')
                            : t('pipeline.fastIos')}
                      </span>
                    </div>
                    {targetAndroid && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t('labels.playChannelColon')}</span>
                        <span className="font-semibold text-xs text-foreground">
                          {getGoogleTrackLabel(googleTrack, t)}
                        </span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-border/50">
                      <label className="flex items-start gap-2 cursor-pointer text-xs select-none">
                        <input
                          type="checkbox"
                          checked={autoGitSync}
                          onChange={(e) => setAutoGitSync(e.target.checked)}
                          className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 mt-0.5 cursor-pointer"
                        />
                        <div>
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            <GitCommit className="w-3.5 h-3.5 text-primary" />
                            <span>{t('pipeline.autoGitSync')}</span>
                          </span>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">
                            {t('pipeline.autoGitSyncDesc')}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Tooltip
                      content={
                        !releaseNotesTR.trim() || !releaseNotesEN.trim()
                          ? t('pipeline.notesRequired')
                          : !targetAndroid && !targetIos
                            ? t('pipeline.selectPlatformFirst')
                            : isCurrentProjectReleasing
                              ? t('pipeline.releasing')
                              : t('pipeline.startRelease')
                      }
                      position="top"
                      className="w-full"
                    >
                      <button
                        onClick={() => void handleStartRelease()}
                        disabled={
                          isCurrentProjectReleasing ||
                          !releaseNotesTR.trim() ||
                          !releaseNotesEN.trim() ||
                          (!targetAndroid && !targetIos)
                        }
                        className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-bold text-sm shadow transition-all cursor-pointer ${
                          !releaseNotesTR.trim() ||
                          !releaseNotesEN.trim() ||
                          (!targetAndroid && !targetIos)
                            ? 'bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-60'
                            : 'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed'
                        }`}
                      >
                        <Rocket
                          className={`w-4 h-4 ${isCurrentProjectReleasing ? 'animate-bounce' : ''}`}
                        />
                        <span>
                          {isCurrentProjectReleasing
                            ? `${t('pipeline.releasing')} (${currentActiveStep}/6)...`
                            : !releaseNotesTR.trim() || !releaseNotesEN.trim()
                              ? t('pipeline.notesRequired')
                              : !targetAndroid && !targetIos
                                ? t('pipeline.selectPlatformFirst')
                                : targetAndroid && !targetIos
                                  ? t('pipeline.fastAndroid')
                                  : !targetAndroid && targetIos
                                    ? t('pipeline.fastIos')
                                    : t('pipeline.startRelease')}
                        </span>
                      </button>
                    </Tooltip>

                    {/* İPTAL ET / SIFIRLA BUTONU */}
                    {isCurrentProjectReleasing && (
                      <Tooltip
                        content={t('pipeline.stopConfirm')}
                        position="bottom"
                        className="w-full"
                      >
                        <button
                          type="button"
                          onClick={() => void handleCancelRelease()}
                          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 border border-destructive/20 transition-all cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>{t('pipeline.cancelRelease')}</span>
                        </button>
                      </Tooltip>
                    )}
                  </div>

                  {isCurrentCompleted && (
                    <div className="p-3 rounded-lg bg-secondary border border-border text-foreground text-xs text-center font-medium flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-foreground" />
                      <span>
                        {language === 'tr'
                          ? `Sürüm ${currentDistributedVersion || currentVersion} ${t('labels.versionDistributedSuccess')}`
                          : `Version ${currentDistributedVersion || currentVersion} ${t('labels.versionDistributedSuccess')}`}
                      </span>
                    </div>
                  )}
                </div>

                {/* 6 AŞAMALI SIRALI BORU HATTI STEPPER */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary" />
                      {t('labels.pipelineStagesTitle')}
                    </h4>
                    <span className="text-xs font-mono font-semibold text-primary">
                      {currentActiveStep}/6
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
                    {currentSteps.map((step) => (
                      <Tooltip
                        key={step.id}
                        content={
                          language === 'tr'
                            ? `Aşama ${step.id}: ${getStepLocalizedName(step)} • Durum: ${step.status.toUpperCase()}`
                            : `Stage ${step.id}: ${getStepLocalizedName(step)} • Status: ${step.status.toUpperCase()}`
                        }
                        position="left"
                        className="w-full"
                      >
                        <div
                          className={`w-full flex items-center justify-between p-2 rounded-md text-xs border transition-all ${
                            step.status === 'running'
                              ? 'bg-secondary border-border text-foreground font-semibold'
                              : step.status === 'success'
                                ? 'bg-secondary/40 border-border text-muted-foreground'
                                : step.status === 'skipped'
                                  ? 'bg-muted/40 border-border/40 text-muted-foreground/60'
                                  : step.status === 'failed'
                                    ? 'bg-destructive/10 border-destructive/30 text-destructive font-semibold'
                                    : 'bg-background border-border text-muted-foreground'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-mono text-[10px] w-4 text-muted-foreground">
                              {step.id}
                            </span>
                            <div className="truncate">
                              <span
                                className={`truncate block font-medium ${step.status === 'skipped' ? 'line-through text-muted-foreground/60' : ''}`}
                              >
                                {getStepLocalizedName(step)}
                              </span>
                              {step.details && (
                                <span className="text-[10px] text-muted-foreground/80 block truncate">
                                  {step.details}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 pl-1">
                            {step.status === 'running' && (
                              <RefreshCw className="w-3.5 h-3.5 text-foreground animate-spin" />
                            )}
                            {step.status === 'success' && (
                              <Check className="w-3.5 h-3.5 text-foreground" />
                            )}
                            {step.status === 'skipped' && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                                {language === 'tr' ? 'Atlandı' : 'Skipped'}
                              </span>
                            )}
                            {step.status === 'failed' && (
                              <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                            )}
                            {step.status === 'pending' && (
                              <Clock className="w-3.5 h-3.5 text-muted-foreground/40" />
                            )}
                          </div>
                        </div>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ===================== AI HATA TEŞHİSİ VE KÖK NEDEN ANALİZİ KARTI ===================== */}
            {(currentPipeline?.diagnosis ||
              ((currentPipeline?.error || currentPipeline?.failed) &&
                !currentPipeline?.isReleasing)) && (
              <div className="bg-card border border-destructive/30 rounded-xl p-5 shadow-xs space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-foreground">
                          {t('ai.diagnosisTitle')}
                        </h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-semibold border border-border">
                          {currentPipeline.diagnosis?.categoryTitle ||
                            (language === 'tr' ? 'Hata Analiz Edildi' : 'Error Analyzed')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {language === 'tr' ? 'Hata Kaynağı:' : 'Error Source:'}{' '}
                        <strong className="text-foreground">
                          {currentPipeline.diagnosis?.sourceLabel ||
                            (language === 'tr' ? 'Boru Hattı Yürütücüsü' : 'Pipeline Executor')}
                        </strong>
                      </p>
                    </div>
                  </div>

                  {/* Hata Analizini Yeniden Tetikleme Butonu */}
                  <button
                    type="button"
                    onClick={() => {
                      const errToDiagnose =
                        currentPipeline.error ||
                        currentPipeline.logs.find((l) => l.includes('HATA:')) ||
                        'Bilinmeyen hata';
                      void fetchDiagnosisForPipeline(
                        activeProjectPath,
                        errToDiagnose,
                        currentPipeline.logs,
                      );
                    }}
                    disabled={isDiagnosing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border cursor-pointer transition-all shrink-0 self-start sm:self-auto shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isDiagnosing ? 'animate-spin' : ''}`} />
                    <span>
                      {isDiagnosing
                        ? language === 'tr'
                          ? 'Yeniden Analiz Ediliyor...'
                          : 'Re-analyzing...'
                        : t('ai.reDiagnose')}
                    </span>
                  </button>
                </div>

                {/* KÖK NEDEN VE AÇIKLAMA */}
                <div className="space-y-3">
                  {currentPipeline.diagnosis?.rootCause && (
                    <div className="p-3 rounded-lg bg-secondary/60 border border-border space-y-1">
                      <span className="text-[11px] font-bold text-foreground uppercase tracking-wider block">
                        {t('ai.rootCause')}
                      </span>
                      <p className="text-xs font-medium text-destructive leading-relaxed">
                        {currentPipeline.diagnosis.rootCause}
                      </p>
                    </div>
                  )}

                  {currentPipeline.diagnosis?.explanation && (
                    <div className="p-3.5 rounded-lg bg-secondary/40 border border-border space-y-1.5">
                      <span className="text-[11px] font-bold text-foreground uppercase tracking-wider block">
                        {t('ai.explanation')}
                      </span>
                      <p className="text-xs text-foreground/90 leading-relaxed">
                        {currentPipeline.diagnosis.explanation}
                      </p>
                    </div>
                  )}

                  {/* ÇÖZÜM ADIMLARI */}
                  {currentPipeline.diagnosis?.solutionSteps &&
                    currentPipeline.diagnosis.solutionSteps.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-xs font-semibold text-foreground block">
                          {t('ai.solutionSteps')}
                        </span>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {currentPipeline.diagnosis.solutionSteps.map((step, sIdx) => (
                            <li key={sIdx} className="flex items-start gap-2">
                              <Check className="w-3.5 h-3.5 text-foreground shrink-0 mt-0.5" />
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>

                {/* OTOMATİK DÜZELTME ALANI (Eğer AI düzeltme aksiyonu sunuyorsa) */}
                {currentPipeline.diagnosis?.autoFixAvailable && (
                  <div className="mt-3 p-4 rounded-xl bg-secondary border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-foreground" />
                        <span className="font-bold text-xs text-foreground">
                          {currentPipeline.diagnosis.autoFixDescription || t('ai.autoFix')}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {language === 'tr'
                          ? 'Sistem gereksiz izinleri AndroidManifest.xml dosyasından temizleyecek ve Google Play form zorunluluğunu ortadan kaldıracaktır.'
                          : 'The system will clean unnecessary permissions from AndroidManifest.xml and eliminate Google Play form requirements.'}
                      </p>
                      {autoFixSuccessMsg && (
                        <p className="text-xs font-semibold text-foreground mt-1 flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-foreground" />
                          <span>{autoFixSuccessMsg}</span>
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void handleAutoFix(
                          currentPipeline.diagnosis?.autoFixAction || 'REMOVE_PHOTO_PERMISSIONS',
                        )
                      }
                      disabled={isAutoFixing}
                      className="w-full sm:w-auto px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
                    >
                      <Wrench className={`w-3.5 h-3.5 ${isAutoFixing ? 'animate-spin' : ''}`} />
                      <span>
                        {isAutoFixing
                          ? language === 'tr'
                            ? 'Düzeltiliyor ve Dağıtılıyor...'
                            : 'Fixing and Deploying...'
                          : language === 'tr'
                            ? 'Sorunu Otomatik Düzelt ve Yeniden Başlat'
                            : 'Auto-Fix Issue and Restart'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ===================== CANLI KONSOL & LOG AKIŞI ===================== */}
            <section className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-primary" />
                    {t('pipeline.liveLogs')}
                  </h4>
                  <span className="text-[10px] font-mono text-muted-foreground px-2 py-0.5 rounded bg-muted/60 border border-border/40">
                    {currentLogs.length} {t('labels.linesLogCount')}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCopyLogs}
                  disabled={currentLogs.length === 0}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                  title={t('pipeline.copyLogs')}
                >
                  {isLogsCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-foreground" />
                      <span className="text-foreground font-semibold">
                        {t('pipeline.copiedLogs')}
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{t('pipeline.copyLogs')}</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-4 rounded-lg bg-zinc-950 text-zinc-100 font-mono text-xs h-64 overflow-y-auto space-y-1 border border-zinc-800 select-text cursor-text selection:bg-primary selection:text-primary-foreground">
                {currentLogs.length === 0 ? (
                  <div className="text-zinc-500 flex items-center justify-center h-full select-none">
                    {t('labels.liveLogsEmptyDesc')}
                  </div>
                ) : (
                  currentLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className="leading-relaxed whitespace-pre-wrap break-all select-text"
                    >
                      {log}
                    </div>
                  ))
                )}
                <div ref={terminalEndRef} />
              </div>
            </section>
          </div>
        ) : (
          /* ===================== TAM SAYFA: SÜRÜM DAĞITIM GEÇMİŞİ & SQLITE DENETİM GÜNLÜĞÜ ===================== */
          <div className="p-6 space-y-6 max-w-7xl mx-auto w-full animate-in fade-in duration-200">
            {/* ÜST BAŞLIK VE KONTROLLER */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <History className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    <span>{t('history.title')}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border font-semibold">
                      SQLite
                    </span>
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('history.subtitle')}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start md:self-auto">
                <Tooltip content={t('history.refreshDb')} position="left">
                  <button
                    type="button"
                    onClick={() => {
                      void loadHistory(historyFilter);
                      toast.info(t('toast.dbRefreshed'), 'SQLite');
                    }}
                    disabled={isLoadingHistory}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin text-primary' : ''}`}
                    />
                    <span>
                      {isLoadingHistory ? t('history.refreshingDb') : t('history.refreshDb')}
                    </span>
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* 4 KPI / İSTATİSTİK KARTI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Tooltip content={t('history.totalVersionsTooltip')} position="top">
                <div className="w-full p-4 rounded-xl border border-border bg-card shadow-2xs space-y-1">
                  <div className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                    <span>{t('history.totalReleases')}</span>
                    <Rocket className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-foreground">
                    {historyReleases.length}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t('history.releasePackages')}
                  </div>
                </div>
              </Tooltip>

              <Tooltip content={t('history.successfulTooltip')} position="top">
                <div className="w-full p-4 rounded-xl border border-border bg-card shadow-2xs space-y-1">
                  <div className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                    <span>{t('history.successfulReleases')}</span>
                    <CheckCircle2 className="w-4 h-4 text-foreground" />
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-foreground">
                    {historyReleases.filter((r) => r.status === 'RELEASED').length}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t('history.deliveredToStores')}
                  </div>
                </div>
              </Tooltip>

              <Tooltip content={t('history.failedTooltip')} position="top">
                <div className="w-full p-4 rounded-xl border border-border bg-card shadow-2xs space-y-1">
                  <div className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                    <span>{t('history.failedReleases')}</span>
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-foreground">
                    {historyReleases.filter((r) => r.status === 'FAILED').length}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {language === 'tr' ? 'Düzeltme ve yeniden deneme' : 'Fix and retry'}
                  </div>
                </div>
              </Tooltip>

              <Tooltip content={t('history.auditTooltip')} position="top">
                <div className="w-full p-4 rounded-xl border border-border bg-card shadow-2xs space-y-1">
                  <div className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                    <span>{t('tabs.audit')}</span>
                    <FileText className="w-4 h-4 text-foreground" />
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-foreground">
                    {auditLogs.length}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {language === 'tr' ? 'SQLite işlem günlüğü' : 'SQLite operation log'}
                  </div>
                </div>
              </Tooltip>
            </div>

            {/* FİLTRELEME VE ARAMA ÇUBUĞU */}
            <div className="p-4 rounded-xl border border-border bg-card shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {/* Proje Filtresi */}
                <div className="flex items-center p-0.5 bg-secondary rounded-lg border border-border">
                  <Tooltip
                    content={t('labels.allRegisteredProjectsHistory')}
                    position="top"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryFilter('all');
                        void loadHistory('all');
                      }}
                      className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        historyFilter === 'all'
                          ? 'bg-background text-foreground shadow-2xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('labels.allProjectsOption')}
                    </button>
                  </Tooltip>
                  {projectName && (
                    <Tooltip
                      content={
                        language === 'tr'
                          ? `Yalnızca "${projectName}" projesine ait dağıtımlar`
                          : `Releases only for "${projectName}"`
                      }
                      position="top"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryFilter('current');
                          void loadHistory('current');
                        }}
                        className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                          historyFilter === 'current'
                            ? 'bg-background text-foreground shadow-2xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {projectName}
                      </button>
                    </Tooltip>
                  )}
                </div>

                {/* Durum Filtresi */}
                <div className="flex items-center p-0.5 bg-secondary rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setHistoryStatusFilter('all')}
                    className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      historyStatusFilter === 'all'
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('history.filterAll')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryStatusFilter('success')}
                    className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      historyStatusFilter === 'success'
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('history.filterSuccess')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryStatusFilter('failed')}
                    className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      historyStatusFilter === 'failed'
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('history.filterFailed')}
                  </button>
                </div>
              </div>

              {/* Arama Inputu */}
              <div className="relative min-w-[240px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  placeholder={t('history.searchPlaceholder')}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                {historySearchQuery && (
                  <button
                    type="button"
                    onClick={() => setHistorySearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* İKİ SÜTUNLU GENİŞ FERAH GÖRÜNÜM */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* SOL SÜTUN: KAYITLI DAĞITIMLAR (5 Kolon) */}
              <div className="lg:col-span-5 space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Rocket className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      {t('labels.recordedReleasesTitle')} ({filteredReleases.length})
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    SQLite: releases
                  </span>
                </div>

                {filteredReleases.length === 0 ? (
                  <div className="p-8 rounded-xl bg-card border border-border text-center space-y-2">
                    <History className="w-8 h-8 text-muted-foreground/50 mx-auto" />
                    <p className="text-xs font-semibold text-foreground">
                      {t('history.noReleasesFound')}
                    </p>
                    <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                      {t('labels.noMatchingReleases')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredReleases.map((rel) => {
                      const resolved = getResolvedReleaseInfo(rel);
                      const badge = getReleaseStatusBadge(rel.status);
                      return (
                        <div
                          key={rel.id}
                          className="p-4 rounded-xl border border-border bg-card hover:border-primary/50 transition-all space-y-3 shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border">
                                  {resolved.project}
                                </span>
                                <span className="font-extrabold font-mono text-base text-foreground tracking-tight">
                                  v{resolved.version}
                                </span>
                                <span className="text-xs font-mono text-muted-foreground font-semibold">
                                  #{resolved.buildNumber}
                                </span>
                              </div>
                              <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-2">
                                <span>
                                  ID: <strong className="text-foreground">{rel.releaseId}</strong>
                                </span>
                                <span>•</span>
                                <span>{rel.createdAt}</span>
                              </div>
                            </div>

                            <div className="shrink-0 text-right space-y-0.5">
                              <span
                                className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase border ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                              <div className="text-[10px] text-muted-foreground">
                                {badge.sublabel}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SAĞ SÜTUN: SQLITE DENETİM GÜNLÜKLERİ (7 Kolon) */}
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-border">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      {t('labels.auditLogsTitle')} ({filteredAuditLogs.length})
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    SQLite: audit_logs
                  </span>
                </div>

                {filteredAuditLogs.length === 0 ? (
                  <div className="p-8 rounded-xl bg-card border border-border text-center space-y-2">
                    <FileText className="w-8 h-8 text-muted-foreground/50 mx-auto" />
                    <p className="text-xs font-semibold text-foreground">
                      {t('history.noAuditLogsFound')}
                    </p>
                    <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                      {t('labels.noMatchingAuditLogs')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredAuditLogs.map((log) => {
                      const actionInfo = getAuditActionInfo(log.action);
                      const resultBadge = getAuditResultBadge(log.result);
                      return (
                        <div
                          key={log.id}
                          className="p-4 rounded-xl border border-border bg-card hover:border-border/80 transition-all space-y-2 shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold text-xs ${actionInfo.color}`}>
                                  {actionInfo.title}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                                  {language === 'tr' ? 'Operatör:' : 'Operator:'} {log.actor}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-snug">
                                {actionInfo.desc}
                              </p>
                            </div>

                            <div className="shrink-0 text-right space-y-1">
                              <span
                                className={`inline-block text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${resultBadge.className}`}
                              >
                                {resultBadge.label}
                              </span>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {log.timestamp}
                              </div>
                            </div>
                          </div>

                          {log.releaseId && (
                            <div className="text-[10px] font-mono text-muted-foreground/80 pt-1 border-t border-border/40">
                              {t('labels.relatedReleaseIdLabel')}{' '}
                              <span className="text-foreground">{log.releaseId}</span>
                            </div>
                          )}

                          {renderAuditDetails(log.details)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ===================== MODAL: YENİ PROJE EKLE ===================== */}
      {showAddProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-sm flex items-center gap-2 text-foreground">
                <FolderPlus className="w-4 h-4 text-primary" />
                {t('labels.addNewProjectDirectoryModal')}
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
                  {t('labels.projectNameOptional')}
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder={t('sidebar.projectNamePlaceholder')}
                  className="w-full text-xs px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  {language === 'tr'
                    ? 'Proje Mutlak Dosya Yolu (Path)*:'
                    : 'Project Absolute Path*:'}
                </label>
                <input
                  type="text"
                  required
                  value={newProjectPath}
                  onChange={(e) => setNewProjectPath(e.target.value)}
                  placeholder={t('sidebar.projectPathPlaceholder')}
                  className="w-full text-xs font-mono px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddProjectModal(false)}
                  className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-secondary cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isAddingProject || !newProjectPath.trim()}
                  className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                >
                  {isAddingProject
                    ? language === 'tr'
                      ? 'Ekleniyor...'
                      : 'Adding...'
                    : t('sidebar.verifyAndAdd')}
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
                {t('labels.scanAndImportProjectsTitle')}
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
                {t('labels.scanProjectsBannerDesc')}
              </p>

              {/* HIZLI OTOMATİK TARAMA */}
              <div className="p-3.5 rounded-lg bg-secondary/50 border border-border space-y-2">
                <div className="font-semibold text-foreground flex items-center justify-between">
                  <span>
                    {t('labels.scanGlobalAreaTitle')}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Desktop, Workspace, Projects
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t('labels.scanGlobalAreaDesc')}
                </p>
                <button
                  type="button"
                  onClick={() => void handleAutoDiscover()}
                  disabled={isDiscovering}
                  className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow hover:opacity-90 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Compass className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
                  <span>
                    {isDiscovering ? t('sidebar.scanningSystem') : t('sidebar.scanAllStandard')}
                  </span>
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
                  {t('labels.scanCustomFolderTitle')}
                </div>
                <div>
                  <input
                    type="text"
                    value={scanPathInput}
                    onChange={(e) => setScanPathInput(e.target.value)}
                    placeholder={t('sidebar.customScanPlaceholder')}
                    className="w-full text-xs font-mono px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-[10px] text-muted-foreground mt-1 block">
                    {t('labels.scanCustomFolderDesc')}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={isDiscovering || !scanPathInput.trim()}
                  className="w-full py-2 rounded-lg bg-secondary text-secondary-foreground font-semibold text-xs border border-border hover:bg-secondary/80 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin text-primary' : ''}`}
                  />
                  <span>
                    {isDiscovering ? t('sidebar.scanningFolder') : t('sidebar.scanFolderAndFetch')}
                  </span>
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
                {t('labels.addSingleProjectDirectly')}
              </button>
              <button
                type="button"
                onClick={() => setShowScanModal(false)}
                className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-secondary cursor-pointer"
              >
                {t('common.close')}
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
                  {t('labels.connectAndVerifyApiKeysModal')}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('labels.connectCustomApiKeysDesc').replace(
                    '{project}',
                    projectName || (language === 'tr' ? 'Seçili Proje' : 'Selected Project'),
                  )}
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
                    ? 'bg-secondary text-foreground border-border shadow-xs'
                    : 'bg-background text-muted-foreground border-transparent hover:bg-secondary'
                }`}
              >
                <GooglePlayIcon className="w-4 h-4 shrink-0" />
                <span>Google Play Console API</span>
                {googlePlayInfo.connected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground"></span>
                )}
              </button>

              <button
                onClick={() => setActiveStoreTab('apple')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                  activeStoreTab === 'apple'
                    ? 'bg-secondary text-foreground border-border shadow-xs'
                    : 'bg-background text-muted-foreground border-transparent hover:bg-secondary'
                }`}
              >
                <AppStoreConnectIcon className="w-4 h-4 shrink-0" />
                <span>Apple App Store Connect API</span>
                {appStoreInfo.connected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground"></span>
                )}
              </button>

              <button
                onClick={() => setActiveStoreTab('ai')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                  activeStoreTab === 'ai'
                    ? 'bg-secondary text-foreground border-border shadow-xs'
                    : 'bg-background text-muted-foreground border-transparent hover:bg-secondary'
                }`}
              >
                <Sparkles className="w-4 h-4 shrink-0 text-foreground" />
                <span>{language === 'tr' ? 'Yapay Zeka (AI) Motoru' : 'AI Engine'}</span>
                {(aiConfiguredInfo.geminiConfigured ||
                  aiConfiguredInfo.openaiConfigured ||
                  aiConfiguredInfo.anthropicConfigured) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground"></span>
                )}
              </button>
            </div>

            {/* TAB 1: GOOGLE PLAY API BAĞLANTI FORMU */}
            {activeStoreTab === 'google' && (
              <form onSubmit={(e) => void handleSaveGooglePlay(e)} className="space-y-4">
                <div className="p-3 rounded-lg bg-background border border-border flex items-center justify-between text-xs">
                  <div>
                    <span className="text-muted-foreground">
                      {t('labels.activeRegisteredAccount')}
                    </span>{' '}
                    <span className="font-mono font-semibold text-foreground">
                      {googlePlayInfo.serviceAccount}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      googlePlayInfo.connected
                        ? 'bg-secondary text-foreground border-border'
                        : 'bg-muted text-muted-foreground border-border'
                    }`}
                  >
                    {googlePlayInfo.connected
                      ? t('labels.connectionReadyBadge')
                      : language === 'tr'
                        ? 'Bekliyor'
                        : 'Pending'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>
                      {t('labels.googlePlayJsonLabel')}
                    </span>
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {t('labels.openJsonPasteContent')}
                    </span>
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
                    <span>
                      {t('labels.orDirectJsonPath')}
                    </span>
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {t('labels.jsonPathExamplePlaceholder')}
                    </span>
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
                  <div
                    className={`p-3 rounded-lg text-xs border ${
                      googleTestResult.success
                        ? 'bg-secondary border-border text-foreground'
                        : 'bg-destructive/10 border-destructive/20 text-destructive'
                    }`}
                  >
                    {googleTestResult.success ? (
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 shrink-0 text-foreground" />
                        <span>
                          {googleTestResult.message || t('labels.googlePlaySavedSuccess')}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <X className="w-3.5 h-3.5 shrink-0 text-destructive" />
                        <span>
                          {googleTestResult.error || t('settings.verificationFailed')}
                        </span>
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
                    <span>
                      {t('labels.saveAsGlobalKey')}
                    </span>
                  </label>

                  <Tooltip
                    content={t('labels.googlePlayTestAndSaveDesc')}
                    position="top"
                  >
                    <button
                      type="submit"
                      disabled={
                        isSavingGoogle || (!googleJsonInput.trim() && !googlePathInput.trim())
                      }
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow-xs hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      <Save className={`w-3.5 h-3.5 ${isSavingGoogle ? 'animate-spin' : ''}`} />
                      <span>
                        {isSavingGoogle ? t('settings.testing') : t('settings.saveAndVerify')}
                      </span>
                    </button>
                  </Tooltip>
                </div>
              </form>
            )}

            {/* TAB 2: APPLE APP STORE CONNECT API FORMU */}
            {activeStoreTab === 'apple' && (
              <form onSubmit={(e) => void handleSaveAppleStore(e)} className="space-y-4">
                <div className="p-3 rounded-lg bg-background border border-border flex items-center justify-between text-xs">
                  <div>
                    <span className="text-muted-foreground">
                      {language === 'tr' ? 'Aktif Key ID:' : 'Active Key ID:'}
                    </span>{' '}
                    <span className="font-mono font-semibold text-foreground">
                      {appStoreInfo.keyId || t('common.notConfigured')}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      appStoreInfo.connected
                        ? 'bg-secondary text-foreground border-border'
                        : 'bg-muted text-muted-foreground border-border'
                    }`}
                  >
                    {appStoreInfo.connected
                      ? language === 'tr'
                        ? 'Bağlantı Hazır'
                        : 'Connected'
                      : t('common.notConfigured')}
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
                      placeholder="2X9R427ADR"
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
                    <span>
                      {t('labels.authKeyP8ContentLabel')}
                    </span>
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {t('labels.pastePrivateBlockPlaceholder')}
                    </span>
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
                  <div
                    className={`p-3 rounded-lg text-xs border ${
                      appleTestResult.success
                        ? 'bg-secondary border-border text-foreground'
                        : 'bg-destructive/10 border-destructive/20 text-destructive'
                    }`}
                  >
                    {appleTestResult.success ? (
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 shrink-0 text-foreground" />
                        <span>
                          {appleTestResult.message || t('labels.appStoreSavedSuccess')}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <X className="w-3.5 h-3.5 shrink-0 text-destructive" />
                        <span>
                          {appleTestResult.error || t('settings.verificationFailed')}
                        </span>
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
                    <span>
                      {t('labels.saveAsGlobalKey')}
                    </span>
                  </label>

                  <Tooltip
                    content={t('labels.appStoreTestAndSaveDesc')}
                    position="top"
                  >
                    <button
                      type="submit"
                      disabled={
                        isSavingApple || !appleKeyIdInput.trim() || !appleIssuerIdInput.trim()
                      }
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow-xs hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      <Save className={`w-3.5 h-3.5 ${isSavingApple ? 'animate-spin' : ''}`} />
                      <span>
                        {isSavingApple
                          ? (language === 'tr' ? 'Kaydediliyor & Test Ediliyor...' : 'Saving & Testing...')
                          : t('labels.saveAndVerifyConnectionBtn')}
                      </span>
                    </button>
                  </Tooltip>
                </div>

                {/* CANLI APP STORE CONNECT HESAP UYGULAMALARI */}
                {appStoreInfo.connected && (
                  <div className="mt-4 pt-3 border-t border-border/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          {t('labels.registeredAppsInAccount')}
                        </span>
                        {appleConnectApps.length > 0 && (
                          <span className="text-[10px] font-mono bg-secondary text-foreground border border-border px-1.5 py-0.5 rounded font-medium">
                            {appleConnectApps.length}{' '}
                            {language === 'tr' ? 'Uygulama Bulundu' : 'Apps Found'}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void fetchAppleApps()}
                        disabled={isLoadingAppleApps}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50 font-medium"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${isLoadingAppleApps ? 'animate-spin' : ''}`}
                        />
                        <span>
                          {isLoadingAppleApps
                            ? t('labels.fetchingAppsCount')
                            : t('settings.refreshList')}
                        </span>
                      </button>
                    </div>

                    {isLoadingAppleApps ? (
                      <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2 border border-border/60 rounded-lg bg-secondary/20">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                        <span>
                          {t('labels.fetchingAppsViaApi')}
                        </span>
                      </div>
                    ) : appleConnectApps.length > 0 ? (
                      <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 border border-border/60 rounded-lg p-2 bg-secondary/10">
                        {appleConnectApps.map((app) => {
                          const activeProj = projects.find((p) => p.path === activeProjectPath);
                          const isMatchedWithCurrent =
                            activeProj?.iosBundleId === app.bundleId ||
                            activeProj?.package === app.bundleId;
                          return (
                            <div
                              key={app.id}
                              className={`p-2.5 rounded-md border text-xs flex items-center justify-between transition-colors ${
                                isMatchedWithCurrent
                                  ? 'border-border bg-secondary/50 text-foreground'
                                  : 'border-border bg-background hover:bg-secondary/40 text-foreground'
                              }`}
                            >
                              <div className="space-y-0.5 min-w-0 pr-2">
                                <div className="font-semibold flex items-center gap-1.5 truncate">
                                  <span>{app.name}</span>
                                  {isMatchedWithCurrent && (
                                    <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-secondary text-foreground border border-border font-mono">
                                      {t('labels.activeProjectMatchedBadge')}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] font-mono text-muted-foreground truncate">
                                  Bundle ID:{' '}
                                  <span className="text-foreground font-medium">
                                    {app.bundleId}
                                  </span>
                                </div>
                              </div>
                              <div className="text-[10px] font-mono bg-muted/60 px-2 py-1 rounded text-muted-foreground shrink-0 border border-border/40">
                                ID: {app.id}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground p-3 border border-dashed border-border rounded-lg bg-secondary/10 text-center">
                        {t('settings.noAppsFound')}
                      </div>
                    )}
                  </div>
                )}
              </form>
            )}

            {/* TAB 3: YAPAY ZEKA (AI) MOTORU BAĞLANTI FORMU */}
            {activeStoreTab === 'ai' && (
              <form onSubmit={(e) => void handleSaveAI(e)} className="space-y-4">
                <div className="p-3.5 rounded-lg bg-secondary/40 border border-border text-xs space-y-1">
                  <div className="font-semibold text-foreground flex items-center justify-between">
                    <span>{t('ai.provider')}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {t('ai.dualNotes')}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    {t('ai.offlineSolver')}
                  </p>
                </div>

                {/* SAĞLAYICI SEÇİMİ BUTONLARI */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setAiProvider('gemini')}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      aiProvider === 'gemini'
                        ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                        : 'border-border bg-background hover:bg-secondary text-muted-foreground'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>Google Gemini</span>
                      {aiConfiguredInfo.geminiConfigured && (
                        <span className="w-1.5 h-1.5 rounded-full bg-foreground"></span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Flash & Pro</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAiProvider('openai')}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      aiProvider === 'openai'
                        ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                        : 'border-border bg-background hover:bg-secondary text-muted-foreground'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>OpenAI</span>
                      {aiConfiguredInfo.openaiConfigured && (
                        <span className="w-1.5 h-1.5 rounded-full bg-foreground"></span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">GPT-4o & Mini</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAiProvider('anthropic')}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      aiProvider === 'anthropic'
                        ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                        : 'border-border bg-background hover:bg-secondary text-muted-foreground'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>Anthropic</span>
                      {aiConfiguredInfo.anthropicConfigured && (
                        <span className="w-1.5 h-1.5 rounded-full bg-foreground"></span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Claude 3.5 Sonnet
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAiProvider('conventional')}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      aiProvider === 'conventional'
                        ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                        : 'border-border bg-background hover:bg-secondary text-muted-foreground'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>{language === 'tr' ? 'Konvansiyonel' : 'Conventional'}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-secondary text-foreground border border-border font-mono">
                        {language === 'tr' ? 'Çevrimdışı' : 'Offline'}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {language === 'tr' ? 'API Anahtarsız' : 'No API Key'}
                    </div>
                  </button>
                </div>

                {/* FORM DETAYLARI: GEMINI */}
                {aiProvider === 'gemini' && (
                  <div className="space-y-3 p-3.5 rounded-lg border border-border bg-background">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-semibold text-foreground">
                          Google Gemini API {language === 'tr' ? 'Anahtarı:' : 'Key:'}
                        </label>
                        {aiConfiguredInfo.geminiConfigured && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {language === 'tr' ? 'Kayıtlı:' : 'Saved:'}{' '}
                            {aiConfiguredInfo.geminiMaskedKey}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type={showAiKey ? 'text' : 'password'}
                          value={geminiApiKeyInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setGeminiApiKeyInput(val);
                            if (val.trim().length > 15) {
                              void fetchAiModels('gemini', val);
                            }
                          }}
                          placeholder={
                            aiConfiguredInfo.geminiConfigured
                              ? language === 'tr'
                                ? 'Yeni anahtar girmek için yazın (mevcut korunuyor)'
                                : 'Type to enter new key (current preserved)'
                              : 'AIzaSy...'
                          }
                          className="w-full text-xs font-mono px-3 py-2 pr-9 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAiKey(!showAiKey)}
                          className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {showAiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-semibold text-foreground">
                          {language === 'tr'
                            ? 'Desteklenen Gemini Modeli:'
                            : 'Supported Gemini Model:'}
                        </label>
                        <button
                          type="button"
                          onClick={() => void fetchAiModels('gemini', geminiApiKeyInput)}
                          disabled={isLoadingAiModels}
                          className="text-[10px] text-primary hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title={t('labels.queryModelsLiveBtn')}
                        >
                          <RefreshCw
                            className={`w-3 h-3 ${isLoadingAiModels ? 'animate-spin' : ''}`}
                          />
                          <span>
                            {isLoadingAiModels
                              ? t('labels.fetchingModelsTitle')
                              : (language === 'tr'
                                ? "API'den Modelleri Getir"
                                : 'Fetch Models from API')}
                          </span>
                        </button>
                      </div>
                      <select
                        value={geminiModelInput}
                        onChange={(e) => setGeminiModelInput(e.target.value)}
                        className="w-full text-xs font-mono px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                      >
                        {geminiModelList.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}{' '}
                            {m.recommended
                              ? t('labels.recommendedBadge')
                              : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-muted-foreground">
                        {t('labels.geminiModelsDesc')}
                      </p>
                    </div>
                  </div>
                )}

                {/* FORM DETAYLARI: OPENAI */}
                {aiProvider === 'openai' && (
                  <div className="space-y-3 p-3.5 rounded-lg border border-border bg-background">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-semibold text-foreground">
                          OpenAI API {language === 'tr' ? 'Anahtarı:' : 'Key:'}
                        </label>
                        {aiConfiguredInfo.openaiConfigured && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {language === 'tr' ? 'Kayıtlı:' : 'Saved:'}{' '}
                            {aiConfiguredInfo.openaiMaskedKey}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type={showAiKey ? 'text' : 'password'}
                          value={openaiApiKeyInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setOpenaiApiKeyInput(val);
                            if (val.trim().length > 15) {
                              void fetchAiModels('openai', val);
                            }
                          }}
                          placeholder={
                            aiConfiguredInfo.openaiConfigured
                              ? t('labels.typeToChangeKeyPlaceholder')
                              : 'sk-proj-...'
                          }
                          className="w-full text-xs font-mono px-3 py-2 pr-9 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAiKey(!showAiKey)}
                          className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {showAiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-semibold text-foreground">
                          {language === 'tr'
                            ? 'Desteklenen OpenAI Modeli:'
                            : 'Supported OpenAI Model:'}
                        </label>
                        <button
                          type="button"
                          onClick={() => void fetchAiModels('openai', openaiApiKeyInput)}
                          disabled={isLoadingAiModels}
                          className="text-[10px] text-primary hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title={t('labels.queryModelsLiveBtn')}
                        >
                          <RefreshCw
                            className={`w-3 h-3 ${isLoadingAiModels ? 'animate-spin' : ''}`}
                          />
                          <span>
                            {isLoadingAiModels
                              ? t('labels.fetchingModelsTitle')
                              : (language === 'tr'
                                ? "API'den Modelleri Getir"
                                : 'Fetch Models from API')}
                          </span>
                        </button>
                      </div>
                      <select
                        value={openaiModelInput}
                        onChange={(e) => setOpenaiModelInput(e.target.value)}
                        className="w-full text-xs font-mono px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                      >
                        {openaiModelList.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}{' '}
                            {m.recommended
                              ? t('labels.recommendedBadge')
                              : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* FORM DETAYLARI: ANTHROPIC */}
                {aiProvider === 'anthropic' && (
                  <div className="space-y-3 p-3.5 rounded-lg border border-border bg-background">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-semibold text-foreground">
                          Anthropic Claude API {language === 'tr' ? 'Anahtarı:' : 'Key:'}
                        </label>
                        {aiConfiguredInfo.anthropicConfigured && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {language === 'tr' ? 'Kayıtlı:' : 'Saved:'}{' '}
                            {aiConfiguredInfo.anthropicMaskedKey}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type={showAiKey ? 'text' : 'password'}
                          value={anthropicApiKeyInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAnthropicApiKeyInput(val);
                            if (val.trim().length > 15) {
                              void fetchAiModels('anthropic', val);
                            }
                          }}
                          placeholder={
                            aiConfiguredInfo.anthropicConfigured
                              ? t('labels.typeToChangeKeyPlaceholder')
                              : 'sk-ant-api03-...'
                          }
                          className="w-full text-xs font-mono px-3 py-2 pr-9 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAiKey(!showAiKey)}
                          className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {showAiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground block">
                        {language === 'tr' ? 'Claude Modeli:' : 'Claude Model:'}
                      </label>
                      <select
                        value={anthropicModelInput}
                        onChange={(e) => setAnthropicModelInput(e.target.value)}
                        className="w-full text-xs font-mono px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                      >
                        {anthropicModelList.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}{' '}
                            {m.recommended
                              ? t('labels.recommendedBadge')
                              : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* FORM DETAYLARI: CONVENTIONAL */}
                {aiProvider === 'conventional' && (
                  <div className="p-3.5 rounded-lg border border-border bg-background space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-foreground font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-foreground" />
                      <span>
                        {t('labels.offlineZeroConfigDesc')}
                      </span>
                    </div>
                    <p className="text-muted-foreground leading-relaxed text-[11px]">
                      {t('labels.offlineGitNotesDesc')}
                    </p>
                  </div>
                )}

                {/* TEST SONUCU BİLDİRİMİ */}
                {aiTestResult && (
                  <div
                    className={`p-3 rounded-lg text-xs border ${
                      aiTestResult.success
                        ? 'bg-secondary border-border text-foreground'
                        : 'bg-destructive/10 border-destructive/20 text-destructive'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {aiTestResult.success ? (
                        <Check className="w-3.5 h-3.5 shrink-0 text-foreground" />
                      ) : (
                        <X className="w-3.5 h-3.5 shrink-0 text-destructive" />
                      )}
                      <span>{aiTestResult.message}</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveGlobal}
                      onChange={(e) => setSaveGlobal(e.target.checked)}
                      className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                    />
                    <span>
                      {t('labels.saveAsGlobalKey')}
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    <Tooltip
                      content={t('labels.testAiRequestDesc')}
                      position="top"
                    >
                      <button
                        type="button"
                        onClick={() => void handleTestAI()}
                        disabled={isTestingAI || isSavingAI}
                        className="px-3.5 py-2 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isTestingAI
                          ? (language === 'tr' ? 'Test Ediliyor...' : 'Testing...')
                          : t('labels.testConnectionBtn')}
                      </button>
                    </Tooltip>

                    <Tooltip
                      content={t('labels.saveAiConfigDesc')}
                      position="top"
                    >
                      <button
                        type="submit"
                        disabled={isSavingAI}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow hover:opacity-90 cursor-pointer disabled:opacity-50"
                      >
                        <Save className={`w-3.5 h-3.5 ${isSavingAI ? 'animate-spin' : ''}`} />
                        <span>
                          {isSavingAI
                            ? (language === 'tr' ? 'Kaydediliyor...' : 'Saving...')
                            : t('labels.saveSettingsBtn')}
                        </span>
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </form>
            )}
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
                {t('wiki.title')}
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
                  {t('wiki.googlePlayTitle')}
                </h4>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>{t('wiki.googlePlayStep1')}</li>
                  <li>{t('wiki.googlePlayStep2')}</li>
                  <li>{t('wiki.googlePlayStep3')}</li>
                  <li>{t('wiki.googlePlayStep4')}</li>
                  <li>{t('wiki.googlePlayStep5')}</li>
                </ol>
              </div>

              {/* APPLE APP STORE REHBERİ */}
              <div className="p-4 rounded-xl border border-border bg-background space-y-3">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <AppStoreConnectIcon className="w-4 h-4 shrink-0" />
                  {t('wiki.appStoreTitle')}
                </h4>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>{t('wiki.appStoreStep1')}</li>
                  <li>{t('wiki.appStoreStep2')}</li>
                  <li>{t('wiki.appStoreStep3')}</li>
                  <li>{t('wiki.appStoreStep4')}</li>
                  <li>{t('wiki.appStoreStep5')}</li>
                </ol>
              </div>

              {/* TEST YÖNTEMLERİ */}
              <div className="p-4 rounded-xl border border-border bg-background space-y-2">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  {t('wiki.testTitle')}
                </h4>
                <p>{t('wiki.testDesc')}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
