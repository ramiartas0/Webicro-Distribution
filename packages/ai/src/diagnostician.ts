import type { AIDiagnosisContext, AIDiagnosisResult, AIProviderType } from './types.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export class AIDiagnostician {
  public static diagnoseHeuristics(ctx: AIDiagnosisContext): AIDiagnosisResult | null {
    const combinedText =
      `${ctx.failedStep || ''} ${ctx.errorText} ${(ctx.recentLogs || []).join(' ')}`.toLowerCase();

    if (
      combinedText.includes('photo and video permissions') ||
      (combinedText.includes('permission_denied') && combinedText.includes('photo')) ||
      (combinedText.includes('permission_denied') && combinedText.includes('media')) ||
      combinedText.includes('read_media_images')
    ) {
      return {
        category: 'STORE_POLICY',
        categoryTitle: 'Google Play Mağaza Politikası ve İzin Beyan Formu Uyarısı',
        source: 'google_play',
        sourceLabel: 'Google Play Güvenlik Politikası (Android 13+ Medya İzinleri)',
        rootCause:
          'Google Play, uygulamanızın AAB paketinde Android 13+ (API 33) için geçerli olan READ_MEDIA_IMAGES veya READ_EXTERNAL_STORAGE izinlerini tespit etti ve konsolda zorunlu tutulan "Fotoğraf ve video izinleri" beyan formunun doldurulmasını şart koşuyor.',
        explanation:
          'Bu durum uygulamanızın kodunun bozuk veya hatalı olmasından DEĞİLDİR. Google Play, galeri yöneticisi veya fotoğraf düzenleyici olmayan uygulamaların bu geniş depolama izinlerini istemesini kısıtlar. Flutter uygulamanız fotoğraf seçmek için zaten Android işletim sisteminin güvenli Photo Picker bileşenini kullandığından bu izinlere teknik olarak ihtiyaç duymaz. Bu gereksiz izinler AndroidManifest.xml dosyasından kaldırıldığında Google Play Console bu beyan formunu istemeyi tamamen bırakacak ve sürüm doğrudan onaylanacaktır.',
        autoFixAvailable: true,
        autoFixAction: 'REMOVE_PHOTO_PERMISSIONS',
        autoFixDescription:
          "Gereksiz Medya İzinlerini AndroidManifest.xml'den Otomatik Temizle (Google Play Form Şartını Düşürür)",
        solutionSteps: [
          'Aşağıdaki "Sorunu Otomatik Düzelt ve Yeniden Başlat" butonuna tıklayarak AndroidManifest.xml içindeki READ_MEDIA_IMAGES ve READ_EXTERNAL_STORAGE satırlarını temizleyin.',
          "Temizlenen yeni derleme Google Play'e yüklendiğinde form zorunluluğu anında kalkacak ve dağıtım başarıyla tamamlanacaktır.",
          'Alternatif (Manuel): Google Play Console -> Politika ve Programlar -> Uygulama İçeriği -> "Fotoğraf ve video izinleri" sayfasına giderek manuel gerekçe formu doldurabilirsiniz (önerilmez, incelemeyi uzatır).',
        ],
      };
    }

    if (
      combinedText.includes('already has version code') ||
      (combinedText.includes('version code') && combinedText.includes('already been used')) ||
      combinedText.includes('apk_version_already_exists')
    ) {
      return {
        category: 'STORE_POLICY',
        categoryTitle: 'Google Play Sürüm Numarası (VersionCode) Çakışması',
        source: 'google_play',
        sourceLabel: 'Google Play Store Dağıtım Doğrulaması',
        rootCause:
          'Yüklemeye çalıştığınız derleme numarası (Build Number / Version Code), Google Play konsolunda daha önce yüklenmiş veya mevcut bir sürümle çakışıyor.',
        explanation:
          'Google Play, aynı veya daha düşük bir versionCode ile yeni paket yüklenmesine izin vermez. Her yeni sürümde build number kesinlikle artırılmalıdır.',
        autoFixAvailable: false,
        autoFixAction: 'NONE',
        solutionSteps: [
          'Dağıtım panelindeki "Hedef Sürüm" alanından build numarasını (+1 veya mağazadakinden yüksek olacak şekilde) artırın.',
          'Örneğin mevcut sürüm 1.2.0+3 ise, 1.2.0+4 veya 1.2.1+4 olarak yeniden dağıtım başlatın.',
        ],
      };
    }

    if (
      combinedText.includes('keystore file not found') ||
      combinedText.includes('keystore password was incorrect') ||
      combinedText.includes('signingconfigs') ||
      combinedText.includes('upload certificate')
    ) {
      return {
        category: 'SIGNING',
        categoryTitle: 'Android İmza ve Keystore Yapılandırma Hatası',
        source: 'native_gradle',
        sourceLabel: 'Android Gradle İmzalama (keystore / key.properties)',
        rootCause:
          "Android AAB paketi derlenirken veya Google Play'e yüklenirken imza sertifikası (keystore) bulunamadı veya şifresi hatalı.",
        explanation:
          'Uygulama kodu sorunsuz derleniyor fakat release modda imzalamak için gereken key.properties veya upload-keystore.jks dosyası eksik/yanlış konumda.',
        autoFixAvailable: false,
        autoFixAction: 'NONE',
        solutionSteps: [
          'android/key.properties dosyasının var olduğunu ve şifrelerin doğru olduğunu teyit edin.',
          'android/app/build.gradle içindeki signingConfigs.release ayarlarını kontrol edin.',
        ],
      };
    }

    if (
      combinedText.includes('target flutter_analyze failed') ||
      (combinedText.includes('flutter analyze') && combinedText.includes('error')) ||
      combinedText.includes('tests failed')
    ) {
      return {
        category: 'APP_CODE',
        categoryTitle: 'Uygulama Kaynak Kodu (Dart / Flutter) Hatası',
        source: 'flutter_code',
        sourceLabel: 'Flutter Kaynak Kodu & Statik Analiz',
        rootCause:
          'Uygulamanızın Dart kodlarında syntax veya tür analizi hataları tespit edildi. Dağıtım güvenlik kilidi hatalı kodun mağazaya gitmesini engelledi.',
        explanation:
          'Bu hata mağazadan veya derleyiciden değil, projenizin Dart kaynak kodundaki derleme/analiz hatalarından kaynaklanmaktadır.',
        autoFixAvailable: false,
        autoFixAction: 'NONE',
        solutionSteps: [
          'Terminalde "flutter analyze" çalıştırarak kırmızı yanan kod satırlarını tespit edin.',
          'Hatalı Dart dosyalarını düzeltin ve dağıtımı tekrar deneyin.',
        ],
      };
    }

    if (
      combinedText.includes('pod install') ||
      combinedText.includes('cocoapods could not find') ||
      combinedText.includes('podfile.lock') ||
      combinedText.includes('xcodebuild failed')
    ) {
      return {
        category: 'NATIVE_BUILD',
        categoryTitle: 'iOS CocoaPods ve Xcode Derleyici Hatası',
        source: 'native_gradle',
        sourceLabel: 'iOS Xcode / CocoaPods Derleyicisi',
        rootCause:
          'iOS uygulamasının yerel CocoaPods bağımlılıkları çözülemedi veya Xcode derleme aşamasında yerel bir hata verdi.',
        explanation:
          'Bu hata Dart kodundan ziyade ios/Podfile veya yerel Swift/Obj-C pod kütüphanelerinin uyumsuzluğundan kaynaklanır.',
        autoFixAvailable: false,
        autoFixAction: 'NONE',
        solutionSteps: [
          'Proje dizininde "cd ios && pod repo update && pod install" komutunu çalıştırın.',
          'Flutter önbelleğini temizleyin: "flutter clean && flutter pub get".',
        ],
      };
    }

    if (
      combinedText.includes('app store connect') &&
      (combinedText.includes('401') ||
        combinedText.includes('unauthorized') ||
        combinedText.includes('forbidden'))
    ) {
      return {
        category: 'STORE_API',
        categoryTitle: 'Apple App Store Connect API Yetkilendirme Hatası',
        source: 'app_store',
        sourceLabel: 'Apple App Store Connect API (JWT)',
        rootCause:
          'Apple App Store Connect API anahtarınız (Key ID, Issuer ID veya .p8 private key) geçersiz, süresi dolmuş veya yetkisi yetersiz.',
        explanation:
          'Apple sunucuları oluşturulan JWT belirtecini reddetti. API anahtarınızın "App Manager" veya "Admin" rolüne sahip olması gerekir.',
        autoFixAvailable: false,
        autoFixAction: 'NONE',
        solutionSteps: [
          'App Store Connect -> Users and Access -> Integrations -> App Store Connect API menüsünden Key ID ve Issuer ID değerlerinizi kontrol edin.',
          'API anahtarının rolünün "Admin" veya en az "App Manager" olduğundan emin olun.',
          'Sağ üstteki "Kendi API\'ne Bağlan" modalından Apple anahtarlarınızı güncelleyin.',
        ],
      };
    }

    if (
      combinedText.includes('failed to load authkey file') ||
      combinedText.includes('altool exited with code 1') ||
      combinedText.includes('could not be found in any of these locations')
    ) {
      return {
        category: 'STORE_API',
        categoryTitle: 'Apple altool AuthKey Anahtar Dosyası Hatası',
        source: 'app_store',
        sourceLabel: 'Apple CLI altool & App Store Connect API',
        rootCause:
          'Apple altool CLI aracı, IPA yüklemesi yapabilmek için ilgili AuthKey_<KEY_ID>.p8 dosyasını yerel anahtar dizinlerinde bulamadı.',
        explanation:
          'Apple altool CLI aracı API anahtarını diskte ~/.appstoreconnect/private_keys veya ~/.private_keys dizinlerinde arar. Bu dosya bulunamadığı için altool yükleme işlemi iptal edildi.',
        autoFixAvailable: true,
        autoFixAction: 'NONE',
        solutionSteps: [
          'Webicro Distribution bu dosyayı otomatik olarak ~/.appstoreconnect/private_keys dizinine konumlandırmaktadır.',
          'App Store Connect Private Key (.p8) içeriğinin veya dosya yolunun eksiksiz girildiğinden emin olun.',
          'Yükleme işlemini yeniden başlatın.',
        ],
      };
    }

    if (
      (combinedText.includes('entity_error.attribute.required') &&
        combinedText.includes('platform')) ||
      (combinedText.includes('missing a required attribute') &&
        combinedText.includes('platform')) ||
      combinedText.includes('/data/attributes/platform')
    ) {
      return {
        category: 'STORE_API',
        categoryTitle: 'Apple App Store Connect API Platform Parametresi Hatası',
        source: 'app_store',
        sourceLabel: 'Apple App Store Connect API (v1 /appStoreVersions)',
        rootCause:
          'App Store Connect sürüm kaydı oluşturulurken Apple API tarafından zorunlu tutulan "platform": "IOS" parametresi eksik gönderildi.',
        explanation:
          'Uygulamanın iOS IPA derlemesi ve altool yüklemesi başarıyla tamamlanmış ve Apple build durumu geçerli (VALID) hale gelmiştir. Ancak sürüm kaydı (/appStoreVersions) API isteğinde platform alanı gönderilmediği için Apple sunucusu 409 Conflict hatası döndürmüştür. Sorun uygulamanın Flutter kodundan veya derlemesinden kaynaklanmamaktadır.',
        autoFixAvailable: false,
        autoFixAction: 'NONE',
        solutionSteps: [
          'Dağıtım motorundaki App Store Connect sürüm oluşturma isteğine zorunlu "platform": "IOS" parametresi eklendi.',
          'IPA paketi halihazırda Apple sunucularında VALID olarak beklediğinden, dağıtımı yeniden başlattığınızda sürüm kaydı ve yayına gönderme sorunsuz tamamlanacaktır.',
        ],
      };
    }

    if (
      combinedText.includes('this edit has been deleted') ||
      (combinedText.includes('failed_precondition') && combinedText.includes('edit'))
    ) {
      return {
        category: 'STORE_API',
        categoryTitle: 'Google Play Console Edit Oturumu Silinme / Çakışma Hatası',
        source: 'google_play',
        sourceLabel: 'Google Play Publisher API (Edits)',
        rootCause:
          'Google Play üzerinde açılan taslak (Edit) oturumu, eşzamanlı bir mağaza sorgusu veya diğer dağıtımın rollback işlemi nedeniyle silindi veya geçersiz kılındı.',
        explanation:
          'Google Play Android Publisher API kuralları uyarınca bir paket adı için aynı anda yalnızca TEK bir Edit oturumu açık olabilir. Başka bir işlem (örneğin mağaza sürüm taraması veya eşzamanlı bir rollback çağrısı) yeni bir Edit açtığında ya da mevcut Edit oturumunu kapattığında, devam eden AAB yüklemesi veya track atama işlemi "This Edit has been deleted" hatası alır. Flutter derlemesi veya AAB paketinde bir hata yoktur.',
        autoFixAvailable: false,
        autoFixAction: 'NONE',
        solutionSteps: [
          'Dağıtım motoruna paket bazlı "Edit Kilidi" (Active Release Edit Lock) entegre edildi; böylece yayın sırasında hiçbir arka plan sorgusu açık Edit oturumunu bozamayacak.',
          'Dağıtım boru hattını yeniden başlatın; yeni ve izole bir Edit oturumu açılarak AAB paketi başarıyla yüklenecektir.',
        ],
      };
    }

    return null;
  }

  public static async diagnoseWithLLM(
    ctx: AIDiagnosisContext,
    options?: {
      provider?: AIProviderType;
      apiKey?: string;
      model?: string;
    },
  ): Promise<AIDiagnosisResult> {
    const provider = options?.provider || 'gemini';
    const apiKey =
      options?.apiKey || process.env['GEMINI_API_KEY'] || process.env['OPENAI_API_KEY'];

    if (!apiKey) {
      return this.fallbackDiagnosis(ctx);
    }

    const systemPrompt = `Sen mobil uygulama dağıtım sistemleri, Google Play Console, Apple App Store Connect ve Flutter/Android/iOS derleme süreçlerinde uzman bir Baş Mühendissin.
Sana bir mobil uygulama dağıtım sürecinde oluşan hata ve loglar verilecek.
Görevin hatayı dikkatle analiz etmek ve KÖK NEDENİ (Root Cause) tespit etmektir.
Kullanıcıya hatanın:
- Uygulama kaynak kodundan mı (Flutter/Dart syntax, bug),
- Yerel derleyiciden mi (Gradle, Pods, Xcode, NDK),
- İmza ve sertifikalardan mı (Keystore, Provisioning Profile, Cert),
- Yoksa Mağaza politikası veya eksik beyan formlarından mı (Google Play Console / App Store gereksinimleri)
kaynaklandığını net ve kesin bir dille açıkla.

Yanıtını YALNIZCA aşağıdaki JSON formatında ver, markdown kod bloğu veya başka metin ekleme:
{
  "category": "STORE_POLICY" | "STORE_API" | "APP_CODE" | "NATIVE_BUILD" | "SIGNING" | "ENVIRONMENT" | "UNKNOWN",
  "categoryTitle": "Kısa ve açıklayıcı Türkçe kategori başlığı",
  "source": "google_play" | "app_store" | "flutter_code" | "native_gradle" | "environment" | "unknown",
  "sourceLabel": "Hatanın doğrudan kaynağı (ör: Google Play Güvenlik Politikası)",
  "rootCause": "Tek cümlelik net kök neden",
  "explanation": "Detaylı, anlaşılır, kullanıcının anlayacağı Türkçe açıklama. Hatanın uygulamadan mı yoksa mağaza politikasından mı kaynaklandığını vurgula.",
  "solutionSteps": [
    "1. Adım...",
    "2. Adım..."
  ],
  "autoFixAvailable": false,
  "autoFixAction": "NONE"
}`;

    const userPrompt = `Proje: ${ctx.projectName || 'Bilinmiyor'} (${ctx.projectPath || ''})
Sürüm: ${ctx.version || '1.0.0'}
Hata Veren Aşama: ${ctx.failedStep || 'Bilinmiyor'}

HATA METNİ:
${ctx.errorText}

SON LOGLAR:
${(ctx.recentLogs || []).slice(-15).join('\n')}`;

    try {
      if (provider === 'gemini') {
        const gemini = new GoogleGenerativeAI(apiKey);
        const candidateModels = [
          options?.model || 'gemini-3.1-flash-lite',
          'gemini-2.5-flash',
          'gemini-3.5-flash',
        ];
        const uniqueCandidates = Array.from(new Set(candidateModels));

        let lastError: unknown;
        for (const candidate of uniqueCandidates) {
          try {
            const model = gemini.getGenerativeModel({
              model: candidate,
              generationConfig: { responseMimeType: 'application/json' },
            });

            const resp = await model.generateContent([{ text: systemPrompt }, { text: userPrompt }]);
            const text = resp.response.text();
            const parsed = JSON.parse(text) as AIDiagnosisResult;
            return parsed;
          } catch (mErr) {
            lastError = mErr;
            continue;
          }
        }
        throw lastError;
      }

      if (provider === 'openai') {
        const openai = new OpenAI({ apiKey });
        const modelName = options?.model || 'gpt-4o-mini';
        const completion = await openai.chat.completions.create({
          model: modelName,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        });

        const content = completion.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(content) as AIDiagnosisResult;
        return parsed;
      }
    } catch (err) {
      console.warn('AI LLM Teşhis hatası, kural tabanlı yedeğe dönülüyor:', err);
    }

    return this.fallbackDiagnosis(ctx);
  }

  public static async diagnose(
    ctx: AIDiagnosisContext,
    options?: {
      provider?: AIProviderType;
      apiKey?: string;
      model?: string;
    },
  ): Promise<AIDiagnosisResult> {
    const heuristic = this.diagnoseHeuristics(ctx);
    if (heuristic) {
      return heuristic;
    }

    return this.diagnoseWithLLM(ctx, options);
  }

  private static fallbackDiagnosis(ctx: AIDiagnosisContext): AIDiagnosisResult {
    return {
      category: 'UNKNOWN',
      categoryTitle: 'Dağıtım İşlem Hatası',
      source: 'unknown',
      sourceLabel: 'Boru Hattı Yürütme Motoru',
      rootCause: ctx.errorText.slice(0, 150),
      explanation:
        'Süreç sırasında beklenmeyen bir hata oluştu. Lütfen log ayrıntılarını inceleyerek veya mağaza/derleme ayarlarınızı kontrol ederek işlemi tekrarlayın.',
      solutionSteps: [
        'Canlı konsol loglarındaki kırmızı hata mesajını inceleyin.',
        'Gerekiyorsa projeyi yerel ortamda "flutter build" ile test edin.',
        'Sorun devam ederse dağıtım parametrelerini gözden geçirin.',
      ],
      autoFixAvailable: false,
      autoFixAction: 'NONE',
    };
  }
}
