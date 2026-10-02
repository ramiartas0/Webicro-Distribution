import { useState, useEffect } from 'react';
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
  ArrowUpRight
} from 'lucide-react';

interface CommitItem {
  hash: string;
  type: 'feat' | 'fix' | 'perf' | 'refactor' | 'chore';
  scope: string;
  message: string;
}

interface PipelineStep {
  id: number;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  duration?: string;
}

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'history' | 'settings'>('pipeline');
  
  // Sürüm Yapılandırması
  const [currentVersion] = useState<string>('2.4.0');
  const [currentBuildNumber] = useState<number>(249);
  const [bumpType, setBumpType] = useState<'patch' | 'minor' | 'major' | 'custom'>('minor');
  const [customVersion, setCustomVersion] = useState<string>('');
  
  // Mağaza Seçimleri
  const [targetAndroid, setTargetAndroid] = useState<boolean>(true);
  const [targetIos, setTargetIos] = useState<boolean>(true);
  const [playTrack, setPlayTrack] = useState<'internal' | 'alpha' | 'beta' | 'production'>('internal');
  const [playRollout, setPlayRollout] = useState<number>(100);
  const [iosSubmitReview, setIosSubmitReview] = useState<boolean>(false);
  const [isDryRun, setIsDryRun] = useState<boolean>(true);

  // AI Sürüm Notları
  const [notesTr, setNotesTr] = useState<string>(
    '• Kurye havuzu ve anlık takip modülü eklendi.\n• Sipariş bildirimlerindeki gecikmeler giderildi.\n• Çevrimdışı mod kararlılığı artırıldı.'
  );
  const [notesEn, setNotesEn] = useState<string>(
    '• Added courier pool and real-time tracking module.\n• Resolved delays in order push notifications.\n• Improved offline mode stability and speed.'
  );
  const [copiedTr, setCopiedTr] = useState<boolean>(false);
  const [copiedEn, setCopiedEn] = useState<boolean>(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);

  // Pipeline Durumu
  const [isReleasing, setIsReleasing] = useState<boolean>(false);
  const [releaseCompleted, setReleaseCompleted] = useState<boolean>(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [logs, setLogs] = useState<string[]>([]);

  // Hesaplanan yeni sürüm
  const getNextVersion = (): string => {
    if (bumpType === 'custom' && customVersion) return customVersion;
    const [maj = 0, min = 0, pat = 0] = currentVersion.split('.').map(Number);
    if (bumpType === 'major') return `${maj + 1}.0.0`;
    if (bumpType === 'minor') return `${maj}.${min + 1}.0`;
    return `${maj}.${min}.${pat + 1}`;
  };

  const nextVersion = getNextVersion();
  const nextBuild = currentBuildNumber + 1;

  // Örnek Commitler
  const commits: CommitItem[] = [
    { hash: 'a1b2c3d', type: 'feat', scope: 'courier', message: 'kurye havuzu ve otomatik atama eklendi' },
    { hash: 'e4f5g6h', type: 'fix', scope: 'notification', message: 'arka plan bildirim sesi sorunu giderildi' },
    { hash: 'i7j8k9l', type: 'perf', scope: 'cart', message: 'sepet hesaplama algoritması hızlandırıldı' },
    { hash: 'm0n1o2p', type: 'fix', scope: 'printer', message: 'bluetooth yazıcı bağlantı kopması düzeltildi' },
    { hash: 'q3r4s5t', type: 'chore', scope: 'deps', message: 'flutter paket bağımlılıkları güncellendi' },
  ];

  // 20 Adımlık Pipeline Listesi
  const initialSteps: PipelineStep[] = [
    { id: 1, name: 'Ortam Kontrolü (Flutter, Java, Xcode)', status: 'pending' },
    { id: 2, name: 'Veritabanı & Migration Başlatma', status: 'pending' },
    { id: 3, name: 'Git Geçmişi & Değişiklik Analizi', status: 'pending' },
    { id: 4, name: 'SemVer & Build Numarası Belirleme', status: 'pending' },
    { id: 5, name: 'Release Planı Oluşturma', status: 'pending' },
    { id: 6, name: 'CHANGELOG.md Güncelleme', status: 'pending' },
    { id: 7, name: 'AI Sürüm Notları Üretimi', status: 'pending' },
    { id: 8, name: 'Mağaza Karakter ve Güvenlik Taraması', status: 'pending' },
    { id: 9, name: 'pubspec.yaml Versiyon Güncelleme', status: 'pending' },
    { id: 10, name: 'Flutter Doctor & Static Analyze', status: 'pending' },
    { id: 11, name: 'Birim & Entegrasyon Testleri', status: 'pending' },
    { id: 12, name: 'Android AAB Release Derleme', status: 'pending' },
    { id: 13, name: 'AAB SHA-256 Hash Doğrulama', status: 'pending' },
    { id: 14, name: 'iOS IPA Release Derleme (macOS)', status: 'pending' },
    { id: 15, name: 'IPA SHA-256 Hash Doğrulama', status: 'pending' },
    { id: 16, name: 'Google Play AAB Yükleme', status: 'pending' },
    { id: 17, name: 'Google Play Sürüm Notları & Dağıtım', status: 'pending' },
    { id: 18, name: 'App Store Connect IPA Gönderimi', status: 'pending' },
    { id: 19, name: 'Apple Build Doğrulama & İnceleme', status: 'pending' },
    { id: 20, name: 'Denetim Günlüğü & Slack/Discord Bildirimi', status: 'pending' },
  ];

  const [steps, setSteps] = useState<PipelineStep[]>(initialSteps);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

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

  const handleRegenerateAi = () => {
    setIsGeneratingAi(true);
    setTimeout(() => {
      setNotesTr('• Kurye havuzunda akıllı rota optimizasyonu sağlandı.\n• Bluetooth termal yazıcı bağlantısı güçlendirildi.\n• Genel performans ve arayüz akıcılığı artırıldı.');
      setNotesEn('• Implemented smart route optimization in courier pool.\n• Enhanced Bluetooth thermal printer connectivity.\n• Improved overall UI performance and responsiveness.');
      setIsGeneratingAi(false);
    }, 1200);
  };

  const startReleasePipeline = () => {
    setIsReleasing(true);
    setReleaseCompleted(false);
    setActiveStepIndex(0);
    setSteps(initialSteps.map(s => ({ ...s, status: 'pending' })));
    setLogs([`[${new Date().toLocaleTimeString()}] 🚀 Webicro Release Pipeline başlatıldı (REL-2026-10-02-${Math.random().toString(16).substring(2, 8).toUpperCase()})`]);

    let current = 0;
    const interval = setInterval(() => {
      if (current < initialSteps.length) {
        setSteps(prev => prev.map((step, idx) => {
          if (idx === current) return { ...step, status: 'running' };
          if (idx < current) return { ...step, status: 'success' };
          return step;
        }));

        setLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ✔ ${initialSteps[current]?.name} tamamlandı.`
        ]);

        setActiveStepIndex(current);
        current++;
      } else {
        clearInterval(interval);
        setSteps(prev => prev.map(s => ({ ...s, status: 'success' })));
        setIsReleasing(false);
        setReleaseCompleted(true);
        setLogs(prev => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] 🎉 Tüm adımlar başarıyla tamamlandı! Sürüm: ${nextVersion}+${nextBuild}`
        ]);
      }
    }, 500);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary selection:text-primary-foreground">
      {/* ÜST BAR (NAVBAR) */}
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/80 backdrop-blur-md px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
            <Rocket className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight">Webicro Distribution</span>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-secondary text-secondary-foreground border border-border">
                v1.0 Orchestrator
              </span>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span>Proje:</span>
              <strong className="text-foreground font-semibold">Piyyuu (Flutter)</strong>
              <span>•</span>
              <span className="text-emerald-500 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Git: main
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
              Mağaza & Ayarlar
            </button>
          </nav>

          <button
            onClick={() => setIsDark(!isDark)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
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
            {/* SOL KOLON: YAPILANDIRMA VE AI NOTLARI (7 Kolon) */}
            <div className="lg:col-span-7 space-y-6">
              {/* 1. KART: SÜRÜM SEÇİMİ */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <h2 className="font-semibold text-sm">Sürüm Yapılandırması (SemVer)</h2>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Mevcut: <span className="font-mono font-medium text-foreground">{currentVersion}+{currentBuildNumber}</span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={() => setBumpType('patch')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      bumpType === 'patch'
                        ? 'border-primary bg-primary/5 text-primary shadow-sm'
                        : 'border-border bg-card hover:bg-accent text-foreground'
                    }`}
                  >
                    <div className="text-xs font-semibold">Patch (Yama)</div>
                    <div className="font-mono text-sm font-bold mt-1">2.4.1</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Hata düzeltmeleri</div>
                  </button>

                  <button
                    onClick={() => setBumpType('minor')}
                    className={`p-3 rounded-lg border text-left transition-all relative ${
                      bumpType === 'minor'
                        ? 'border-primary bg-primary/5 text-primary shadow-sm'
                        : 'border-border bg-card hover:bg-accent text-foreground'
                    }`}
                  >
                    <span className="absolute -top-2 right-2 px-1.5 py-0.2 bg-emerald-500 text-white text-[9px] font-bold rounded-full">
                      ÖNERİLEN
                    </span>
                    <div className="text-xs font-semibold">Minor (Özellik)</div>
                    <div className="font-mono text-sm font-bold mt-1">2.5.0</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">3 yeni özellik</div>
                  </button>

                  <button
                    onClick={() => setBumpType('major')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      bumpType === 'major'
                        ? 'border-primary bg-primary/5 text-primary shadow-sm'
                        : 'border-border bg-card hover:bg-accent text-foreground'
                    }`}
                  >
                    <div className="text-xs font-semibold">Major (Büyük)</div>
                    <div className="font-mono text-sm font-bold mt-1">3.0.0</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Kırıcı değişiklikler</div>
                  </button>

                  <button
                    onClick={() => setBumpType('custom')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      bumpType === 'custom'
                        ? 'border-primary bg-primary/5 text-primary shadow-sm'
                        : 'border-border bg-card hover:bg-accent text-foreground'
                    }`}
                  >
                    <div className="text-xs font-semibold">Özel Sürüm</div>
                    <div className="font-mono text-sm font-bold mt-1">Manuel</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Kendiniz girin</div>
                  </button>
                </div>

                {bumpType === 'custom' && (
                  <input
                    type="text"
                    value={customVersion}
                    onChange={(e) => setCustomVersion(e.target.value)}
                    placeholder="Örn: 2.6.0"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                )}

                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Hesaplanan Hedef Sürüm:</span>
                  <span className="font-mono font-bold text-foreground text-sm bg-accent px-2 py-0.5 rounded">
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
                    onClick={handleRegenerateAi}
                    disabled={isGeneratingAi}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingAi ? 'animate-spin' : ''}`} />
                    Yeniden Üret
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Türkçe Notlar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">🇹🇷 Türkçe (Google Play & App Store)</span>
                      <button
                        onClick={() => copyToClipboard(notesTr, true)}
                        className="hover:text-foreground transition-all"
                      >
                        {copiedTr ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <textarea
                      value={notesTr}
                      onChange={(e) => setNotesTr(e.target.value)}
                      rows={4}
                      className="w-full p-2.5 text-xs rounded-lg border border-border bg-background/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary font-sans leading-relaxed resize-none"
                    />
                    <div className="text-[10px] text-muted-foreground text-right">
                      {notesTr.length} / 500 karakter
                    </div>
                  </div>

                  {/* İngilizce Notlar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">🇬🇧 English (Global)</span>
                      <button
                        onClick={() => copyToClipboard(notesEn, false)}
                        className="hover:text-foreground transition-all"
                      >
                        {copiedEn ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <textarea
                      value={notesEn}
                      onChange={(e) => setNotesEn(e.target.value)}
                      rows={4}
                      className="w-full p-2.5 text-xs rounded-lg border border-border bg-background/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary font-sans leading-relaxed resize-none"
                    />
                    <div className="text-[10px] text-muted-foreground text-right">
                      {notesEn.length} / 4000 karakter
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-secondary/50 rounded-lg border border-border/60 flex items-start gap-2.5 text-xs text-muted-foreground">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Güvenlik Taraması:</strong> Metinler taranmış olup API anahtarı, şifre veya yasaklı kelime içermemektedir. Karakter limitlerine uygundur.
                  </span>
                </div>
              </div>

              {/* 3. KART: DEĞİŞİKLİKLER (COMMITS) */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitCommit className="w-4 h-4 text-primary" />
                    <h2 className="font-semibold text-sm">Tespit Edilen Git Değişiklikleri</h2>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">v2.4.0..HEAD (5 commit)</span>
                </div>

                <div className="space-y-2">
                  {commits.map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border/40 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 font-mono text-[10px] font-bold rounded ${
                          c.type === 'feat' ? 'bg-emerald-500/10 text-emerald-500' :
                          c.type === 'fix' ? 'bg-amber-500/10 text-amber-500' :
                          c.type === 'perf' ? 'bg-purple-500/10 text-purple-500' : 'bg-muted text-muted-foreground'
                        }`}>
                          {c.type}
                        </span>
                        <span className="text-foreground font-medium">{c.message}</span>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">{c.hash}</span>
                    </div>
                  ))}
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
                        <div className="text-xs font-semibold text-foreground">Google Play Store</div>
                        <div className="text-[10px] text-muted-foreground">Android App Bundle (.aab)</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={targetAndroid}
                      onChange={(e) => setTargetAndroid(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                    />
                  </div>

                  {targetAndroid && (
                    <div className="pt-2 border-t border-border/60 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">Kanal (Track)</label>
                        <select
                          value={playTrack}
                          onChange={(e) => setPlayTrack(e.target.value as any)}
                          className="w-full px-2 py-1 text-xs rounded border border-border bg-background"
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
                          className="w-full accent-primary mt-1"
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
                      className="rounded border-border text-primary focus:ring-primary w-4 h-4"
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
                    <p className="text-[10px] text-muted-foreground">Mağazalara yükleme yapmaz, akışı test eder.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isDryRun}
                    onChange={(e) => setIsDryRun(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary"
                  />
                </div>

                {/* BAŞLAT BUTONU */}
                <button
                  onClick={startReleasePipeline}
                  disabled={isReleasing}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
                    isReleasing
                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                      : 'bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.99]'
                  }`}
                >
                  {isReleasing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Sürüm Dağıtımı Yürütülüyor...
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4 text-white" />
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
                          : 'text-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {step.status === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        ) : step.status === 'running' ? (
                          <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                        ) : (
                          <span className="w-3.5 h-3.5 rounded-full border border-border shrink-0"></span>
                        )}
                        <span className="truncate">{step.id}. {step.name}</span>
                      </div>
                      <span className="text-[10px] font-mono shrink-0">
                        {step.status === 'success' ? '✓' : step.status === 'running' ? '...' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CANLI KONSOL ÇIKTISI */}
              <div className="bg-[#0f1117] text-gray-200 border border-border rounded-xl p-4 shadow-sm font-mono text-[11px] space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-gray-800 text-gray-400">
                  <span className="flex items-center gap-1.5 text-xs">
                    <Terminal className="w-3.5 h-3.5" /> Konsol Günlüğü
                  </span>
                  <span className="text-[10px]">canlı</span>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1 leading-relaxed text-gray-300">
                  {logs.length === 0 ? (
                    <span className="text-gray-500">Pipeline başlatıldığında terminal logları burada akacaktır...</span>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className="truncate">{log}</div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* GEÇMİŞ SÜRÜMLER SEKMESİ */}
        {activeTab === 'history' && (
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-base">Yayınlanan Sürümler & Denetim Günlüğü</h2>
                <p className="text-xs text-muted-foreground">Tüm sürümler kriptografik SHA-256 imzası ile kayıt altındadır.</p>
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
                    <th className="py-2.5 font-semibold">SHA-256 İmzası</th>
                    <th className="py-2.5 font-semibold">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  <tr className="hover:bg-accent/40 transition-all">
                    <td className="py-3 font-mono font-medium">REL-2026-10-02-8F3A91</td>
                    <td className="py-3 font-semibold text-foreground">2.4.0</td>
                    <td className="py-3 font-mono">249</td>
                    <td className="py-3 text-muted-foreground">2 Ekim 2026</td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500">
                        BAŞARILI
                      </span>
                    </td>
                    <td className="py-3 font-mono text-[10px] text-muted-foreground">e3b0c44298fc1c149afbf4c8996fb924...</td>
                    <td className="py-3">
                      <button className="text-primary hover:underline flex items-center gap-1">
                        Detay <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                  <tr className="hover:bg-accent/40 transition-all">
                    <td className="py-3 font-mono font-medium">REL-2026-09-18-4B2E10</td>
                    <td className="py-3 font-semibold text-foreground">2.3.9</td>
                    <td className="py-3 font-mono">248</td>
                    <td className="py-3 text-muted-foreground">18 Eyl 2026</td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500">
                        BAŞARILI
                      </span>
                    </td>
                    <td className="py-3 font-mono text-[10px] text-muted-foreground">7d1a58e2f8910b48a044bc1982a173cb...</td>
                    <td className="py-3">
                      <button className="text-primary hover:underline flex items-center gap-1">
                        Detay <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MAĞAZA VE AYARLAR SEKMESİ */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-500" /> Google Play Bağlantı Durumu
              </h2>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-border/60">
                  <span className="text-muted-foreground">Hizmet Hesabı:</span>
                  <span className="font-mono text-foreground font-medium">play-store-deployer@project-f2e8d...</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/60">
                  <span className="text-muted-foreground">Durum:</span>
                  <span className="text-emerald-500 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Bağlı & Yetkili
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">Yetki Seviyesi:</span>
                  <span className="text-foreground">Release Manager (Owner)</span>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Apple className="w-4 h-4 text-foreground" /> App Store Connect Durumu
              </h2>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-border/60">
                  <span className="text-muted-foreground">Key ID:</span>
                  <span className="font-mono text-foreground font-medium">2X9R4ABCD3</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/60">
                  <span className="text-muted-foreground">Durum:</span>
                  <span className="text-emerald-500 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> ES256 JWT Aktif
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">İşlem Motoru:</span>
                  <span className="text-foreground">Auto-Polling (Backoff 30m)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
