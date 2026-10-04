# Changelog

All notable changes to this project will be documented in this file.

## 3.0.0 (2026-10-04)

### New Features
- tum arayuz icin monokrom toast bildirim ve tooltip sistemi eklendi
- mobil projeler icin otomatik git ve github baglantisi, commit, tag ve push entegrasyonu eklendi
- google play ve apple app store ile cok kaynakli surum esitleme ozelligi eklendi
- app store connect akilli semantik eslestirme ve manuel uygulama secici eklendi
- magaza surumunu pubspec yaml a esitleme ve ios bundle id akilli eslestirme eklendi
- gecmis ve denetim gunlugu tam sayfa sekmesine tasindi turkcelestirildi
- tek tikla platform secimi akilli git degisiklik tespiti ve dinamik asama atlama eklendi
- canli hata teshisi, kok neden analizi ve otomatik izin duzeltme destegi eklendi
- fotograf ve video izinleri politika hatasi icin teshis ve rehberlik eklendi
- terminal loglarini kopyalama destegi ve android canli derleme log akisi eklendi
- coklu proje bagimsiz dagitimi ve iptal/sifirlama destegi eklendi
- api anahtarina gore dinamik model listeleme ve select secimi eklendi
- yayindaki aktif google play kanalina gore otomatik kanal secimi eklendi
- coklu yapay zeka motoru, esnek api anahtari ve cift dilli madde imli surum notlari eklendi
- google play console resmi dagitim kanali isimleri uygulandi
- cift dilli ai surum notu entegrasyonu ve bos not dagitim guvenlik kilidi
- 6 sirali kurumsal asama, kalici durum ve sidebarda canli gosterge
- stabilize sidebar project ordering, add active border highlight, and render real app icons
- add official Google Play and Apple/AppStore vector brand icons across UI
- deduplicate flutter projects and prioritize store-verified apps
- set light mode as default theme with persistent preference
- eliminate all mock data and connect real step executors
- remove emojis and use lucide icons with generic store discovery
- add generic workspace scanner and live store version comparison for app store and google play
- add persistent store credentials configuration and per-project api connection
- list store-compared projects in sidebar with live sync
- add modern sidebar, project switcher, real store verification and integration wiki
- eliminate all mock data, connect real sqlite database, dynamic git analyzer and live orchestrator
- shadcn oklch temalı React Web Dashboard ve release ui komutu eklendi
- CLI uygulaması, birim testler ve konfigürasyon dosyaları tamamlandı
- master orchestrator, state machine ve release planner tamamlandı
- google-play, app-store ve notifications paketleri tamamlandı
- flutter, artifacts, android, ios ve security paketleri tamamlandı
- changelog, validation ve ai paketleri tamamlandı
- shared, database, config, audit, git ve versioning paketleri tamamlandı

### Improvements & Refactoring
- surum esitleme tek butona indirgendi ve buyuk surume yukseltme kurali uygulandi
- app store kartindaki gereksiz manuel secici kaldirildi
- simulasyon modu ve dagitim guvenlik kilidi uyarisi kaldirildi
- surum notu uretiminde context filtreleme, lite model ve onbellek ile 10x hizlanma saglandi
- kademeli dagitim (rollout) secimi arayuzden kaldirildi ve varsayilan %100 yapildi

### Bug Fixes
- loopback izolasyonu, oturum tokenı, fail-closed mimarisi ve açık kaynak standartları uygulandı
- monorepo kök dizini üzerinden izole alt proje stage ve commit desteği eklendi
- monorepo alt projeleri icin izole git durum denetimi ve degisen dosya onizlemesi eklendi
- sqlite gecmisi coklu proje destegi ve surum senkronizasyonu saglandi
- dagitim basari mesajinda bir sonraki surum yerine gercek dagitilan surumun gosterilmesi saglandi
- xcode 16 deployment target uyumlulugu ve orkestrator kismi basari toleransi eklendi
- android build ve play console yukleme atlanmasi giderildi, magaza senkronizasyonu eklendi
- proje gecislerinde veri karismasini onleyen optimistik durum, magaza onbellegi ve fallback temizligi
- use official Apple App Store Connect icon asset and brand mark
- resolve endpoint mismatch and response pattern in release notes generation
- resolve premature close bug on node 24 with native fetch and fix vundefined display
- sanitize legacy unicode variation selectors from cached project badges

## 3.0.0 (2026-10-04)

### New Features
- tum arayuz icin monokrom toast bildirim ve tooltip sistemi eklendi
- mobil projeler icin otomatik git ve github baglantisi, commit, tag ve push entegrasyonu eklendi
- google play ve apple app store ile cok kaynakli surum esitleme ozelligi eklendi
- app store connect akilli semantik eslestirme ve manuel uygulama secici eklendi
- magaza surumunu pubspec yaml a esitleme ve ios bundle id akilli eslestirme eklendi
- gecmis ve denetim gunlugu tam sayfa sekmesine tasindi turkcelestirildi
- tek tikla platform secimi akilli git degisiklik tespiti ve dinamik asama atlama eklendi
- canli hata teshisi, kok neden analizi ve otomatik izin duzeltme destegi eklendi
- fotograf ve video izinleri politika hatasi icin teshis ve rehberlik eklendi
- terminal loglarini kopyalama destegi ve android canli derleme log akisi eklendi
- coklu proje bagimsiz dagitimi ve iptal/sifirlama destegi eklendi
- api anahtarina gore dinamik model listeleme ve select secimi eklendi
- yayindaki aktif google play kanalina gore otomatik kanal secimi eklendi
- coklu yapay zeka motoru, esnek api anahtari ve cift dilli madde imli surum notlari eklendi
- google play console resmi dagitim kanali isimleri uygulandi
- cift dilli ai surum notu entegrasyonu ve bos not dagitim guvenlik kilidi
- 6 sirali kurumsal asama, kalici durum ve sidebarda canli gosterge
- stabilize sidebar project ordering, add active border highlight, and render real app icons
- add official Google Play and Apple/AppStore vector brand icons across UI
- deduplicate flutter projects and prioritize store-verified apps
- set light mode as default theme with persistent preference
- eliminate all mock data and connect real step executors
- remove emojis and use lucide icons with generic store discovery
- add generic workspace scanner and live store version comparison for app store and google play
- add persistent store credentials configuration and per-project api connection
- list store-compared projects in sidebar with live sync
- add modern sidebar, project switcher, real store verification and integration wiki
- eliminate all mock data, connect real sqlite database, dynamic git analyzer and live orchestrator
- shadcn oklch temalı React Web Dashboard ve release ui komutu eklendi
- CLI uygulaması, birim testler ve konfigürasyon dosyaları tamamlandı
- master orchestrator, state machine ve release planner tamamlandı
- google-play, app-store ve notifications paketleri tamamlandı
- flutter, artifacts, android, ios ve security paketleri tamamlandı
- changelog, validation ve ai paketleri tamamlandı
- shared, database, config, audit, git ve versioning paketleri tamamlandı

### Improvements & Refactoring
- surum esitleme tek butona indirgendi ve buyuk surume yukseltme kurali uygulandi
- app store kartindaki gereksiz manuel secici kaldirildi
- simulasyon modu ve dagitim guvenlik kilidi uyarisi kaldirildi
- surum notu uretiminde context filtreleme, lite model ve onbellek ile 10x hizlanma saglandi
- kademeli dagitim (rollout) secimi arayuzden kaldirildi ve varsayilan %100 yapildi

### Bug Fixes
- loopback izolasyonu, oturum tokenı, fail-closed mimarisi ve açık kaynak standartları uygulandı
- monorepo kök dizini üzerinden izole alt proje stage ve commit desteği eklendi
- monorepo alt projeleri icin izole git durum denetimi ve degisen dosya onizlemesi eklendi
- sqlite gecmisi coklu proje destegi ve surum senkronizasyonu saglandi
- dagitim basari mesajinda bir sonraki surum yerine gercek dagitilan surumun gosterilmesi saglandi
- xcode 16 deployment target uyumlulugu ve orkestrator kismi basari toleransi eklendi
- android build ve play console yukleme atlanmasi giderildi, magaza senkronizasyonu eklendi
- proje gecislerinde veri karismasini onleyen optimistik durum, magaza onbellegi ve fallback temizligi
- use official Apple App Store Connect icon asset and brand mark
- resolve endpoint mismatch and response pattern in release notes generation
- resolve premature close bug on node 24 with native fetch and fix vundefined display
- sanitize legacy unicode variation selectors from cached project badges

## 3.0.0 (2026-10-04)

### New Features
- tum arayuz icin monokrom toast bildirim ve tooltip sistemi eklendi
- mobil projeler icin otomatik git ve github baglantisi, commit, tag ve push entegrasyonu eklendi
- google play ve apple app store ile cok kaynakli surum esitleme ozelligi eklendi
- app store connect akilli semantik eslestirme ve manuel uygulama secici eklendi
- magaza surumunu pubspec yaml a esitleme ve ios bundle id akilli eslestirme eklendi
- gecmis ve denetim gunlugu tam sayfa sekmesine tasindi turkcelestirildi
- tek tikla platform secimi akilli git degisiklik tespiti ve dinamik asama atlama eklendi
- canli hata teshisi, kok neden analizi ve otomatik izin duzeltme destegi eklendi
- fotograf ve video izinleri politika hatasi icin teshis ve rehberlik eklendi
- terminal loglarini kopyalama destegi ve android canli derleme log akisi eklendi
- coklu proje bagimsiz dagitimi ve iptal/sifirlama destegi eklendi
- api anahtarina gore dinamik model listeleme ve select secimi eklendi
- yayindaki aktif google play kanalina gore otomatik kanal secimi eklendi
- coklu yapay zeka motoru, esnek api anahtari ve cift dilli madde imli surum notlari eklendi
- google play console resmi dagitim kanali isimleri uygulandi
- cift dilli ai surum notu entegrasyonu ve bos not dagitim guvenlik kilidi
- 6 sirali kurumsal asama, kalici durum ve sidebarda canli gosterge
- stabilize sidebar project ordering, add active border highlight, and render real app icons
- add official Google Play and Apple/AppStore vector brand icons across UI
- deduplicate flutter projects and prioritize store-verified apps
- set light mode as default theme with persistent preference
- eliminate all mock data and connect real step executors
- remove emojis and use lucide icons with generic store discovery
- add generic workspace scanner and live store version comparison for app store and google play
- add persistent store credentials configuration and per-project api connection
- list store-compared projects in sidebar with live sync
- add modern sidebar, project switcher, real store verification and integration wiki
- eliminate all mock data, connect real sqlite database, dynamic git analyzer and live orchestrator
- shadcn oklch temalı React Web Dashboard ve release ui komutu eklendi
- CLI uygulaması, birim testler ve konfigürasyon dosyaları tamamlandı
- master orchestrator, state machine ve release planner tamamlandı
- google-play, app-store ve notifications paketleri tamamlandı
- flutter, artifacts, android, ios ve security paketleri tamamlandı
- changelog, validation ve ai paketleri tamamlandı
- shared, database, config, audit, git ve versioning paketleri tamamlandı

### Improvements & Refactoring
- surum esitleme tek butona indirgendi ve buyuk surume yukseltme kurali uygulandi
- app store kartindaki gereksiz manuel secici kaldirildi
- simulasyon modu ve dagitim guvenlik kilidi uyarisi kaldirildi
- surum notu uretiminde context filtreleme, lite model ve onbellek ile 10x hizlanma saglandi
- kademeli dagitim (rollout) secimi arayuzden kaldirildi ve varsayilan %100 yapildi

### Bug Fixes
- loopback izolasyonu, oturum tokenı, fail-closed mimarisi ve açık kaynak standartları uygulandı
- monorepo kök dizini üzerinden izole alt proje stage ve commit desteği eklendi
- monorepo alt projeleri icin izole git durum denetimi ve degisen dosya onizlemesi eklendi
- sqlite gecmisi coklu proje destegi ve surum senkronizasyonu saglandi
- dagitim basari mesajinda bir sonraki surum yerine gercek dagitilan surumun gosterilmesi saglandi
- xcode 16 deployment target uyumlulugu ve orkestrator kismi basari toleransi eklendi
- android build ve play console yukleme atlanmasi giderildi, magaza senkronizasyonu eklendi
- proje gecislerinde veri karismasini onleyen optimistik durum, magaza onbellegi ve fallback temizligi
- use official Apple App Store Connect icon asset and brand mark
- resolve endpoint mismatch and response pattern in release notes generation
- resolve premature close bug on node 24 with native fetch and fix vundefined display
- sanitize legacy unicode variation selectors from cached project badges

## 1.1.0 (2026-10-04)

### New Features
- tum arayuz icin monokrom toast bildirim ve tooltip sistemi eklendi
- mobil projeler icin otomatik git ve github baglantisi, commit, tag ve push entegrasyonu eklendi
- google play ve apple app store ile cok kaynakli surum esitleme ozelligi eklendi
- app store connect akilli semantik eslestirme ve manuel uygulama secici eklendi
- magaza surumunu pubspec yaml a esitleme ve ios bundle id akilli eslestirme eklendi
- gecmis ve denetim gunlugu tam sayfa sekmesine tasindi turkcelestirildi
- tek tikla platform secimi akilli git degisiklik tespiti ve dinamik asama atlama eklendi
- canli hata teshisi, kok neden analizi ve otomatik izin duzeltme destegi eklendi
- fotograf ve video izinleri politika hatasi icin teshis ve rehberlik eklendi
- terminal loglarini kopyalama destegi ve android canli derleme log akisi eklendi
- coklu proje bagimsiz dagitimi ve iptal/sifirlama destegi eklendi
- api anahtarina gore dinamik model listeleme ve select secimi eklendi
- yayindaki aktif google play kanalina gore otomatik kanal secimi eklendi
- coklu yapay zeka motoru, esnek api anahtari ve cift dilli madde imli surum notlari eklendi
- google play console resmi dagitim kanali isimleri uygulandi
- cift dilli ai surum notu entegrasyonu ve bos not dagitim guvenlik kilidi
- 6 sirali kurumsal asama, kalici durum ve sidebarda canli gosterge
- stabilize sidebar project ordering, add active border highlight, and render real app icons
- add official Google Play and Apple/AppStore vector brand icons across UI
- deduplicate flutter projects and prioritize store-verified apps
- set light mode as default theme with persistent preference
- eliminate all mock data and connect real step executors
- remove emojis and use lucide icons with generic store discovery
- add generic workspace scanner and live store version comparison for app store and google play
- add persistent store credentials configuration and per-project api connection
- list store-compared projects in sidebar with live sync
- add modern sidebar, project switcher, real store verification and integration wiki
- eliminate all mock data, connect real sqlite database, dynamic git analyzer and live orchestrator
- shadcn oklch temalı React Web Dashboard ve release ui komutu eklendi
- CLI uygulaması, birim testler ve konfigürasyon dosyaları tamamlandı
- master orchestrator, state machine ve release planner tamamlandı
- google-play, app-store ve notifications paketleri tamamlandı
- flutter, artifacts, android, ios ve security paketleri tamamlandı
- changelog, validation ve ai paketleri tamamlandı
- shared, database, config, audit, git ve versioning paketleri tamamlandı

### Improvements & Refactoring
- surum esitleme tek butona indirgendi ve buyuk surume yukseltme kurali uygulandi
- app store kartindaki gereksiz manuel secici kaldirildi
- simulasyon modu ve dagitim guvenlik kilidi uyarisi kaldirildi
- surum notu uretiminde context filtreleme, lite model ve onbellek ile 10x hizlanma saglandi
- kademeli dagitim (rollout) secimi arayuzden kaldirildi ve varsayilan %100 yapildi

### Bug Fixes
- loopback izolasyonu, oturum tokenı, fail-closed mimarisi ve açık kaynak standartları uygulandı
- monorepo kök dizini üzerinden izole alt proje stage ve commit desteği eklendi
- monorepo alt projeleri icin izole git durum denetimi ve degisen dosya onizlemesi eklendi
- sqlite gecmisi coklu proje destegi ve surum senkronizasyonu saglandi
- dagitim basari mesajinda bir sonraki surum yerine gercek dagitilan surumun gosterilmesi saglandi
- xcode 16 deployment target uyumlulugu ve orkestrator kismi basari toleransi eklendi
- android build ve play console yukleme atlanmasi giderildi, magaza senkronizasyonu eklendi
- proje gecislerinde veri karismasini onleyen optimistik durum, magaza onbellegi ve fallback temizligi
- use official Apple App Store Connect icon asset and brand mark
- resolve endpoint mismatch and response pattern in release notes generation
- resolve premature close bug on node 24 with native fetch and fix vundefined display
- sanitize legacy unicode variation selectors from cached project badges

## 3.0.0 (2026-10-04)

### New Features
- tum arayuz icin monokrom toast bildirim ve tooltip sistemi eklendi
- mobil projeler icin otomatik git ve github baglantisi, commit, tag ve push entegrasyonu eklendi
- google play ve apple app store ile cok kaynakli surum esitleme ozelligi eklendi
- app store connect akilli semantik eslestirme ve manuel uygulama secici eklendi
- magaza surumunu pubspec yaml a esitleme ve ios bundle id akilli eslestirme eklendi
- gecmis ve denetim gunlugu tam sayfa sekmesine tasindi turkcelestirildi
- tek tikla platform secimi akilli git degisiklik tespiti ve dinamik asama atlama eklendi
- canli hata teshisi, kok neden analizi ve otomatik izin duzeltme destegi eklendi
- fotograf ve video izinleri politika hatasi icin teshis ve rehberlik eklendi
- terminal loglarini kopyalama destegi ve android canli derleme log akisi eklendi
- coklu proje bagimsiz dagitimi ve iptal/sifirlama destegi eklendi
- api anahtarina gore dinamik model listeleme ve select secimi eklendi
- yayindaki aktif google play kanalina gore otomatik kanal secimi eklendi
- coklu yapay zeka motoru, esnek api anahtari ve cift dilli madde imli surum notlari eklendi
- google play console resmi dagitim kanali isimleri uygulandi
- cift dilli ai surum notu entegrasyonu ve bos not dagitim guvenlik kilidi
- 6 sirali kurumsal asama, kalici durum ve sidebarda canli gosterge
- stabilize sidebar project ordering, add active border highlight, and render real app icons
- add official Google Play and Apple/AppStore vector brand icons across UI
- deduplicate flutter projects and prioritize store-verified apps
- set light mode as default theme with persistent preference
- eliminate all mock data and connect real step executors
- remove emojis and use lucide icons with generic store discovery
- add generic workspace scanner and live store version comparison for app store and google play
- add persistent store credentials configuration and per-project api connection
- list store-compared projects in sidebar with live sync
- add modern sidebar, project switcher, real store verification and integration wiki
- eliminate all mock data, connect real sqlite database, dynamic git analyzer and live orchestrator
- shadcn oklch temalı React Web Dashboard ve release ui komutu eklendi
- CLI uygulaması, birim testler ve konfigürasyon dosyaları tamamlandı
- master orchestrator, state machine ve release planner tamamlandı
- google-play, app-store ve notifications paketleri tamamlandı
- flutter, artifacts, android, ios ve security paketleri tamamlandı
- changelog, validation ve ai paketleri tamamlandı
- shared, database, config, audit, git ve versioning paketleri tamamlandı

### Improvements & Refactoring
- surum esitleme tek butona indirgendi ve buyuk surume yukseltme kurali uygulandi
- app store kartindaki gereksiz manuel secici kaldirildi
- simulasyon modu ve dagitim guvenlik kilidi uyarisi kaldirildi
- surum notu uretiminde context filtreleme, lite model ve onbellek ile 10x hizlanma saglandi
- kademeli dagitim (rollout) secimi arayuzden kaldirildi ve varsayilan %100 yapildi

### Bug Fixes
- monorepo kök dizini üzerinden izole alt proje stage ve commit desteği eklendi
- monorepo alt projeleri icin izole git durum denetimi ve degisen dosya onizlemesi eklendi
- sqlite gecmisi coklu proje destegi ve surum senkronizasyonu saglandi
- dagitim basari mesajinda bir sonraki surum yerine gercek dagitilan surumun gosterilmesi saglandi
- xcode 16 deployment target uyumlulugu ve orkestrator kismi basari toleransi eklendi
- android build ve play console yukleme atlanmasi giderildi, magaza senkronizasyonu eklendi
- proje gecislerinde veri karismasini onleyen optimistik durum, magaza onbellegi ve fallback temizligi
- use official Apple App Store Connect icon asset and brand mark
- resolve endpoint mismatch and response pattern in release notes generation
- resolve premature close bug on node 24 with native fetch and fix vundefined display
- sanitize legacy unicode variation selectors from cached project badges

## 3.0.0 (2026-10-04)

### New Features
- tum arayuz icin monokrom toast bildirim ve tooltip sistemi eklendi
- mobil projeler icin otomatik git ve github baglantisi, commit, tag ve push entegrasyonu eklendi
- google play ve apple app store ile cok kaynakli surum esitleme ozelligi eklendi
- app store connect akilli semantik eslestirme ve manuel uygulama secici eklendi
- magaza surumunu pubspec yaml a esitleme ve ios bundle id akilli eslestirme eklendi
- gecmis ve denetim gunlugu tam sayfa sekmesine tasindi turkcelestirildi
- tek tikla platform secimi akilli git degisiklik tespiti ve dinamik asama atlama eklendi
- canli hata teshisi, kok neden analizi ve otomatik izin duzeltme destegi eklendi
- fotograf ve video izinleri politika hatasi icin teshis ve rehberlik eklendi
- terminal loglarini kopyalama destegi ve android canli derleme log akisi eklendi
- coklu proje bagimsiz dagitimi ve iptal/sifirlama destegi eklendi
- api anahtarina gore dinamik model listeleme ve select secimi eklendi
- yayindaki aktif google play kanalina gore otomatik kanal secimi eklendi
- coklu yapay zeka motoru, esnek api anahtari ve cift dilli madde imli surum notlari eklendi
- google play console resmi dagitim kanali isimleri uygulandi
- cift dilli ai surum notu entegrasyonu ve bos not dagitim guvenlik kilidi
- 6 sirali kurumsal asama, kalici durum ve sidebarda canli gosterge
- stabilize sidebar project ordering, add active border highlight, and render real app icons
- add official Google Play and Apple/AppStore vector brand icons across UI
- deduplicate flutter projects and prioritize store-verified apps
- set light mode as default theme with persistent preference
- eliminate all mock data and connect real step executors
- remove emojis and use lucide icons with generic store discovery
- add generic workspace scanner and live store version comparison for app store and google play
- add persistent store credentials configuration and per-project api connection
- list store-compared projects in sidebar with live sync
- add modern sidebar, project switcher, real store verification and integration wiki
- eliminate all mock data, connect real sqlite database, dynamic git analyzer and live orchestrator
- shadcn oklch temalı React Web Dashboard ve release ui komutu eklendi
- CLI uygulaması, birim testler ve konfigürasyon dosyaları tamamlandı
- master orchestrator, state machine ve release planner tamamlandı
- google-play, app-store ve notifications paketleri tamamlandı
- flutter, artifacts, android, ios ve security paketleri tamamlandı
- changelog, validation ve ai paketleri tamamlandı
- shared, database, config, audit, git ve versioning paketleri tamamlandı

### Improvements & Refactoring
- surum esitleme tek butona indirgendi ve buyuk surume yukseltme kurali uygulandi
- app store kartindaki gereksiz manuel secici kaldirildi
- simulasyon modu ve dagitim guvenlik kilidi uyarisi kaldirildi
- surum notu uretiminde context filtreleme, lite model ve onbellek ile 10x hizlanma saglandi
- kademeli dagitim (rollout) secimi arayuzden kaldirildi ve varsayilan %100 yapildi

### Bug Fixes
- monorepo kök dizini üzerinden izole alt proje stage ve commit desteği eklendi
- monorepo alt projeleri icin izole git durum denetimi ve degisen dosya onizlemesi eklendi
- sqlite gecmisi coklu proje destegi ve surum senkronizasyonu saglandi
- dagitim basari mesajinda bir sonraki surum yerine gercek dagitilan surumun gosterilmesi saglandi
- xcode 16 deployment target uyumlulugu ve orkestrator kismi basari toleransi eklendi
- android build ve play console yukleme atlanmasi giderildi, magaza senkronizasyonu eklendi
- proje gecislerinde veri karismasini onleyen optimistik durum, magaza onbellegi ve fallback temizligi
- use official Apple App Store Connect icon asset and brand mark
- resolve endpoint mismatch and response pattern in release notes generation
- resolve premature close bug on node 24 with native fetch and fix vundefined display
- sanitize legacy unicode variation selectors from cached project badges

## 3.0.0 (2026-10-04)

### New Features
- tum arayuz icin monokrom toast bildirim ve tooltip sistemi eklendi
- mobil projeler icin otomatik git ve github baglantisi, commit, tag ve push entegrasyonu eklendi
- google play ve apple app store ile cok kaynakli surum esitleme ozelligi eklendi
- app store connect akilli semantik eslestirme ve manuel uygulama secici eklendi
- magaza surumunu pubspec yaml a esitleme ve ios bundle id akilli eslestirme eklendi
- gecmis ve denetim gunlugu tam sayfa sekmesine tasindi turkcelestirildi
- tek tikla platform secimi akilli git degisiklik tespiti ve dinamik asama atlama eklendi
- canli hata teshisi, kok neden analizi ve otomatik izin duzeltme destegi eklendi
- fotograf ve video izinleri politika hatasi icin teshis ve rehberlik eklendi
- terminal loglarini kopyalama destegi ve android canli derleme log akisi eklendi
- coklu proje bagimsiz dagitimi ve iptal/sifirlama destegi eklendi
- api anahtarina gore dinamik model listeleme ve select secimi eklendi
- yayindaki aktif google play kanalina gore otomatik kanal secimi eklendi
- coklu yapay zeka motoru, esnek api anahtari ve cift dilli madde imli surum notlari eklendi
- google play console resmi dagitim kanali isimleri uygulandi
- cift dilli ai surum notu entegrasyonu ve bos not dagitim guvenlik kilidi
- 6 sirali kurumsal asama, kalici durum ve sidebarda canli gosterge
- stabilize sidebar project ordering, add active border highlight, and render real app icons
- add official Google Play and Apple/AppStore vector brand icons across UI
- deduplicate flutter projects and prioritize store-verified apps
- set light mode as default theme with persistent preference
- eliminate all mock data and connect real step executors
- remove emojis and use lucide icons with generic store discovery
- add generic workspace scanner and live store version comparison for app store and google play
- add persistent store credentials configuration and per-project api connection
- list store-compared projects in sidebar with live sync
- add modern sidebar, project switcher, real store verification and integration wiki
- eliminate all mock data, connect real sqlite database, dynamic git analyzer and live orchestrator
- shadcn oklch temalı React Web Dashboard ve release ui komutu eklendi
- CLI uygulaması, birim testler ve konfigürasyon dosyaları tamamlandı
- master orchestrator, state machine ve release planner tamamlandı
- google-play, app-store ve notifications paketleri tamamlandı
- flutter, artifacts, android, ios ve security paketleri tamamlandı
- changelog, validation ve ai paketleri tamamlandı
- shared, database, config, audit, git ve versioning paketleri tamamlandı

### Improvements & Refactoring
- surum esitleme tek butona indirgendi ve buyuk surume yukseltme kurali uygulandi
- app store kartindaki gereksiz manuel secici kaldirildi
- simulasyon modu ve dagitim guvenlik kilidi uyarisi kaldirildi
- surum notu uretiminde context filtreleme, lite model ve onbellek ile 10x hizlanma saglandi
- kademeli dagitim (rollout) secimi arayuzden kaldirildi ve varsayilan %100 yapildi

### Bug Fixes
- monorepo kök dizini üzerinden izole alt proje stage ve commit desteği eklendi
- monorepo alt projeleri icin izole git durum denetimi ve degisen dosya onizlemesi eklendi
- sqlite gecmisi coklu proje destegi ve surum senkronizasyonu saglandi
- dagitim basari mesajinda bir sonraki surum yerine gercek dagitilan surumun gosterilmesi saglandi
- xcode 16 deployment target uyumlulugu ve orkestrator kismi basari toleransi eklendi
- android build ve play console yukleme atlanmasi giderildi, magaza senkronizasyonu eklendi
- proje gecislerinde veri karismasini onleyen optimistik durum, magaza onbellegi ve fallback temizligi
- use official Apple App Store Connect icon asset and brand mark
- resolve endpoint mismatch and response pattern in release notes generation
- resolve premature close bug on node 24 with native fetch and fix vundefined display
- sanitize legacy unicode variation selectors from cached project badges

## 3.0.0 (2026-10-04)

### New Features
- tum arayuz icin monokrom toast bildirim ve tooltip sistemi eklendi
- mobil projeler icin otomatik git ve github baglantisi, commit, tag ve push entegrasyonu eklendi
- google play ve apple app store ile cok kaynakli surum esitleme ozelligi eklendi
- app store connect akilli semantik eslestirme ve manuel uygulama secici eklendi
- magaza surumunu pubspec yaml a esitleme ve ios bundle id akilli eslestirme eklendi
- gecmis ve denetim gunlugu tam sayfa sekmesine tasindi turkcelestirildi
- tek tikla platform secimi akilli git degisiklik tespiti ve dinamik asama atlama eklendi
- canli hata teshisi, kok neden analizi ve otomatik izin duzeltme destegi eklendi
- fotograf ve video izinleri politika hatasi icin teshis ve rehberlik eklendi
- terminal loglarini kopyalama destegi ve android canli derleme log akisi eklendi
- coklu proje bagimsiz dagitimi ve iptal/sifirlama destegi eklendi
- api anahtarina gore dinamik model listeleme ve select secimi eklendi
- yayindaki aktif google play kanalina gore otomatik kanal secimi eklendi
- coklu yapay zeka motoru, esnek api anahtari ve cift dilli madde imli surum notlari eklendi
- google play console resmi dagitim kanali isimleri uygulandi
- cift dilli ai surum notu entegrasyonu ve bos not dagitim guvenlik kilidi
- 6 sirali kurumsal asama, kalici durum ve sidebarda canli gosterge
- stabilize sidebar project ordering, add active border highlight, and render real app icons
- add official Google Play and Apple/AppStore vector brand icons across UI
- deduplicate flutter projects and prioritize store-verified apps
- set light mode as default theme with persistent preference
- eliminate all mock data and connect real step executors
- remove emojis and use lucide icons with generic store discovery
- add generic workspace scanner and live store version comparison for app store and google play
- add persistent store credentials configuration and per-project api connection
- list store-compared projects in sidebar with live sync
- add modern sidebar, project switcher, real store verification and integration wiki
- eliminate all mock data, connect real sqlite database, dynamic git analyzer and live orchestrator
- shadcn oklch temalı React Web Dashboard ve release ui komutu eklendi
- CLI uygulaması, birim testler ve konfigürasyon dosyaları tamamlandı
- master orchestrator, state machine ve release planner tamamlandı
- google-play, app-store ve notifications paketleri tamamlandı
- flutter, artifacts, android, ios ve security paketleri tamamlandı
- changelog, validation ve ai paketleri tamamlandı
- shared, database, config, audit, git ve versioning paketleri tamamlandı

### Improvements & Refactoring
- surum esitleme tek butona indirgendi ve buyuk surume yukseltme kurali uygulandi
- app store kartindaki gereksiz manuel secici kaldirildi
- simulasyon modu ve dagitim guvenlik kilidi uyarisi kaldirildi
- surum notu uretiminde context filtreleme, lite model ve onbellek ile 10x hizlanma saglandi
- kademeli dagitim (rollout) secimi arayuzden kaldirildi ve varsayilan %100 yapildi

### Bug Fixes
- monorepo kök dizini üzerinden izole alt proje stage ve commit desteği eklendi
- monorepo alt projeleri icin izole git durum denetimi ve degisen dosya onizlemesi eklendi
- sqlite gecmisi coklu proje destegi ve surum senkronizasyonu saglandi
- dagitim basari mesajinda bir sonraki surum yerine gercek dagitilan surumun gosterilmesi saglandi
- xcode 16 deployment target uyumlulugu ve orkestrator kismi basari toleransi eklendi
- android build ve play console yukleme atlanmasi giderildi, magaza senkronizasyonu eklendi
- proje gecislerinde veri karismasini onleyen optimistik durum, magaza onbellegi ve fallback temizligi
- use official Apple App Store Connect icon asset and brand mark
- resolve endpoint mismatch and response pattern in release notes generation
- resolve premature close bug on node 24 with native fetch and fix vundefined display
- sanitize legacy unicode variation selectors from cached project badges

## 3.0.0 (2026-10-04)

### New Features
- tum arayuz icin monokrom toast bildirim ve tooltip sistemi eklendi
- mobil projeler icin otomatik git ve github baglantisi, commit, tag ve push entegrasyonu eklendi
- google play ve apple app store ile cok kaynakli surum esitleme ozelligi eklendi
- app store connect akilli semantik eslestirme ve manuel uygulama secici eklendi
- magaza surumunu pubspec yaml a esitleme ve ios bundle id akilli eslestirme eklendi
- gecmis ve denetim gunlugu tam sayfa sekmesine tasindi turkcelestirildi
- tek tikla platform secimi akilli git degisiklik tespiti ve dinamik asama atlama eklendi
- canli hata teshisi, kok neden analizi ve otomatik izin duzeltme destegi eklendi
- fotograf ve video izinleri politika hatasi icin teshis ve rehberlik eklendi
- terminal loglarini kopyalama destegi ve android canli derleme log akisi eklendi
- coklu proje bagimsiz dagitimi ve iptal/sifirlama destegi eklendi
- api anahtarina gore dinamik model listeleme ve select secimi eklendi
- yayindaki aktif google play kanalina gore otomatik kanal secimi eklendi
- coklu yapay zeka motoru, esnek api anahtari ve cift dilli madde imli surum notlari eklendi
- google play console resmi dagitim kanali isimleri uygulandi
- cift dilli ai surum notu entegrasyonu ve bos not dagitim guvenlik kilidi
- 6 sirali kurumsal asama, kalici durum ve sidebarda canli gosterge
- stabilize sidebar project ordering, add active border highlight, and render real app icons
- add official Google Play and Apple/AppStore vector brand icons across UI
- deduplicate flutter projects and prioritize store-verified apps
- set light mode as default theme with persistent preference
- eliminate all mock data and connect real step executors
- remove emojis and use lucide icons with generic store discovery
- add generic workspace scanner and live store version comparison for app store and google play
- add persistent store credentials configuration and per-project api connection
- list store-compared projects in sidebar with live sync
- add modern sidebar, project switcher, real store verification and integration wiki
- eliminate all mock data, connect real sqlite database, dynamic git analyzer and live orchestrator
- shadcn oklch temalı React Web Dashboard ve release ui komutu eklendi
- CLI uygulaması, birim testler ve konfigürasyon dosyaları tamamlandı
- master orchestrator, state machine ve release planner tamamlandı
- google-play, app-store ve notifications paketleri tamamlandı
- flutter, artifacts, android, ios ve security paketleri tamamlandı
- changelog, validation ve ai paketleri tamamlandı
- shared, database, config, audit, git ve versioning paketleri tamamlandı

### Improvements & Refactoring
- surum esitleme tek butona indirgendi ve buyuk surume yukseltme kurali uygulandi
- app store kartindaki gereksiz manuel secici kaldirildi
- simulasyon modu ve dagitim guvenlik kilidi uyarisi kaldirildi
- surum notu uretiminde context filtreleme, lite model ve onbellek ile 10x hizlanma saglandi
- kademeli dagitim (rollout) secimi arayuzden kaldirildi ve varsayilan %100 yapildi

### Bug Fixes
- monorepo kök dizini üzerinden izole alt proje stage ve commit desteği eklendi
- monorepo alt projeleri icin izole git durum denetimi ve degisen dosya onizlemesi eklendi
- sqlite gecmisi coklu proje destegi ve surum senkronizasyonu saglandi
- dagitim basari mesajinda bir sonraki surum yerine gercek dagitilan surumun gosterilmesi saglandi
- xcode 16 deployment target uyumlulugu ve orkestrator kismi basari toleransi eklendi
- android build ve play console yukleme atlanmasi giderildi, magaza senkronizasyonu eklendi
- proje gecislerinde veri karismasini onleyen optimistik durum, magaza onbellegi ve fallback temizligi
- use official Apple App Store Connect icon asset and brand mark
- resolve endpoint mismatch and response pattern in release notes generation
- resolve premature close bug on node 24 with native fetch and fix vundefined display
- sanitize legacy unicode variation selectors from cached project badges

## 3.0.0 (2026-10-04)

### New Features
- tum arayuz icin monokrom toast bildirim ve tooltip sistemi eklendi
- mobil projeler icin otomatik git ve github baglantisi, commit, tag ve push entegrasyonu eklendi
- google play ve apple app store ile cok kaynakli surum esitleme ozelligi eklendi
- app store connect akilli semantik eslestirme ve manuel uygulama secici eklendi
- magaza surumunu pubspec yaml a esitleme ve ios bundle id akilli eslestirme eklendi
- gecmis ve denetim gunlugu tam sayfa sekmesine tasindi turkcelestirildi
- tek tikla platform secimi akilli git degisiklik tespiti ve dinamik asama atlama eklendi
- canli hata teshisi, kok neden analizi ve otomatik izin duzeltme destegi eklendi
- fotograf ve video izinleri politika hatasi icin teshis ve rehberlik eklendi
- terminal loglarini kopyalama destegi ve android canli derleme log akisi eklendi
- coklu proje bagimsiz dagitimi ve iptal/sifirlama destegi eklendi
- api anahtarina gore dinamik model listeleme ve select secimi eklendi
- yayindaki aktif google play kanalina gore otomatik kanal secimi eklendi
- coklu yapay zeka motoru, esnek api anahtari ve cift dilli madde imli surum notlari eklendi
- google play console resmi dagitim kanali isimleri uygulandi
- cift dilli ai surum notu entegrasyonu ve bos not dagitim guvenlik kilidi
- 6 sirali kurumsal asama, kalici durum ve sidebarda canli gosterge
- stabilize sidebar project ordering, add active border highlight, and render real app icons
- add official Google Play and Apple/AppStore vector brand icons across UI
- deduplicate flutter projects and prioritize store-verified apps
- set light mode as default theme with persistent preference
- eliminate all mock data and connect real step executors
- remove emojis and use lucide icons with generic store discovery
- add generic workspace scanner and live store version comparison for app store and google play
- add persistent store credentials configuration and per-project api connection
- list store-compared projects in sidebar with live sync
- add modern sidebar, project switcher, real store verification and integration wiki
- eliminate all mock data, connect real sqlite database, dynamic git analyzer and live orchestrator
- shadcn oklch temalı React Web Dashboard ve release ui komutu eklendi
- CLI uygulaması, birim testler ve konfigürasyon dosyaları tamamlandı
- master orchestrator, state machine ve release planner tamamlandı
- google-play, app-store ve notifications paketleri tamamlandı
- flutter, artifacts, android, ios ve security paketleri tamamlandı
- changelog, validation ve ai paketleri tamamlandı
- shared, database, config, audit, git ve versioning paketleri tamamlandı

### Improvements & Refactoring
- surum esitleme tek butona indirgendi ve buyuk surume yukseltme kurali uygulandi
- app store kartindaki gereksiz manuel secici kaldirildi
- simulasyon modu ve dagitim guvenlik kilidi uyarisi kaldirildi
- surum notu uretiminde context filtreleme, lite model ve onbellek ile 10x hizlanma saglandi
- kademeli dagitim (rollout) secimi arayuzden kaldirildi ve varsayilan %100 yapildi

### Bug Fixes
- monorepo kök dizini üzerinden izole alt proje stage ve commit desteği eklendi
- monorepo alt projeleri icin izole git durum denetimi ve degisen dosya onizlemesi eklendi
- sqlite gecmisi coklu proje destegi ve surum senkronizasyonu saglandi
- dagitim basari mesajinda bir sonraki surum yerine gercek dagitilan surumun gosterilmesi saglandi
- xcode 16 deployment target uyumlulugu ve orkestrator kismi basari toleransi eklendi
- android build ve play console yukleme atlanmasi giderildi, magaza senkronizasyonu eklendi
- proje gecislerinde veri karismasini onleyen optimistik durum, magaza onbellegi ve fallback temizligi
- use official Apple App Store Connect icon asset and brand mark
- resolve endpoint mismatch and response pattern in release notes generation
- resolve premature close bug on node 24 with native fetch and fix vundefined display
- sanitize legacy unicode variation selectors from cached project badges

