/** Uygulamalar ekranları: galeri, uygulama çalıştırma, Prompt Stüdyosu ve düzenleyici. */
export const apps = {
  /** Birden çok uygulama ekranında kullanılanlar */
  backToApps: 'Uygulamalara dön',
  addFavorite: 'Sık kullanılanlara ekle',
  removeFavorite: 'Sık kullanılanlardan çıkar',
  promptText: 'Talimat metni',

  gallery: {
    title: 'Uygulamalar',
    importApp: 'İçe aktar',
    newApp: 'Yeni uygulama',
    search: 'Uygulamalarda ara',
    noMatch: (query: string) => `“${query}” ile eşleşen uygulama yok.`,
    favorites: 'Sık kullanılanlar',
    mine: 'Senin uygulamaların',
    builtin: 'Hazır uygulamalar',
    addFavoriteFor: (name: string) => `${name}: sık kullanılanlara ekle`,
    removeFavoriteFor: (name: string) => `${name}: sık kullanılanlardan çıkar`,
    corporateNote: 'E-posta, toplantı, duyuru ve belge uygulamaları kurumsal kullanım açıkken görünür.',
    enableCorporate: 'Kurumsal uygulamaları aç'
  },

  run: {
    notFound: 'Bu uygulama bulunamadı. Silinmiş ya da kurumsal kullanım kapatılmış olabilir.',
    formSection: 'Bilgiler',
    resultSection: 'Sonuç',
    attachFile: 'Dosya ekle',
    attachHint: 'Metni yapıştırmak yerine dosyasını ekleyebilirsin: PDF, Word, Excel ya da metin.',
    generate: 'Üret',
    regenerate: 'Yeniden üret',
    continueInChat: 'Sohbette devam et',
    empty: 'Formu doldurup “Üret”e bas. Sonuç burada görünecek.',
    writing: 'Yazıyor',
    history: 'Geçmiş',
    /** Formda metin yokken geçmiş satırının adı */
    fromFile: 'Dosyadan üretildi',
    removeRun: 'Bu sonucu geçmişten sil',
    /** Hem düğme etiketi hem de modele giden talimat */
    quickRefines: ['Kısalt', 'Uzat', 'Daha resmi yap', 'Daha samimi yap'],
    refinePlaceholder: 'Başka bir değişiklik iste: örn. son paragrafı çıkar',
    refineLabel: 'Sonuçta değişiklik iste',
    menu: {
      label: 'Uygulama seçenekleri',
      confirmDelete: 'Uygulama ve geçmişi kalıcı olarak silinsin mi?',
      duplicate: 'Kopyasını oluştur ve düzenle',
      copyName: (name: string) => `${name} (kopya)`,
      edit: 'Düzenle',
      exportApp: 'Dışa aktar',
      exported: 'Dosyaya kaydedildi.'
    }
  },

  studio: {
    titleNew: 'Yeni uygulama',
    titleReview: 'Uygulamayı düzenle ve kaydet',
    titleEdit: (name: string) => `${name}: düzenle`,
    backToApp: 'Uygulamaya dön',
    heading: 'Ne yapan bir uygulama istiyorsun?',
    lead: 'Bir cümleyle anlat. Atlas bunu ayrıntılı bir talimata çevirir, sonra o talimattan formu olan bir uygulama yapar.',
    requestPlaceholder: 'Örn. kurumsal IT direktörü gibi e-posta hazırla',
    requestLabel: 'Uygulamanın ne yapacağı',
    examplesLabel: 'Örnek istekler',
    examples: [
      'Kurumsal IT direktörü gibi e-posta hazırla',
      'Müşteri şikayetine nazik ve çözüm odaklı cevap yaz',
      'Haftalık durum raporu hazırla',
      'LinkedIn için kısa ve profesyonel paylaşım yaz'
    ],
    improve: 'Talimatı geliştir',
    improveAgain: 'Baştan geliştir',
    writeMyself: 'Talimatı kendim yazacağım',
    /** "Talimatı kendim yazacağım" ile eklenen başlangıç şablonu */
    promptTemplate: '## Rol\nSen ...\n\n## Amaç\n...\n\n## Kurallar\n- Verilmeyen bilgiyi uydurma.',
    prompt: 'Talimat',
    versions: 'Talimat sürümleri',
    version: (n: number) => `Sürüm ${n}`,
    promptHint: 'Metni elle de düzenleyebilirsin; uygulama bu talimatla çalışır.',
    /** Hem düğme etiketi hem de modele giden talimat */
    promptRefines: ['Daha resmi', 'Daha kısa', 'Daha ayrıntılı', 'Kuralları sıkılaştır'],
    refinePlaceholder: 'Başka bir değişiklik iste: örn. her e-postanın sonuna destek hattını ekle',
    refineLabel: 'Talimatta değişiklik iste',
    buildTitle: 'Bunu uygulamaya çevireyim mi?',
    buildLead: 'Talimata göre ad, ikon ve form alanları önerilir; kaydetmeden önce değiştirebilirsin.',
    build: 'Uygulamaya çevir',
    building: 'Form hazırlanıyor'
  },

  editor: {
    backToPrompt: 'Talimata geri dön',
    appSection: 'Uygulama',
    name: 'Ad',
    description: 'Açıklama',
    descriptionHint: 'Galeride adın altında görünür.',
    icon: 'İkon',
    fieldsSection: 'Form alanları',
    fieldsLead: 'Uygulamayı her kullandığında dolduracağın bilgiler.',
    addField: 'Alan ekle',
    promptSection: 'Talimat',
    promptLead: 'Modelin nasıl yazacağını belirler. Formdaki bilgiler her çalıştırmada bu talimatla birlikte verilir.',
    saveChanges: 'Değişiklikleri kaydet',
    saveApp: 'Uygulamayı kaydet',
    preview: 'Önizleme',
    unnamed: 'Adsız uygulama',
    noDescription: 'Açıklama yok',
    fieldType: {
      text: 'Kısa metin',
      textarea: 'Uzun metin',
      select: 'Seçenek listesi',
      toggle: 'Evet / Hayır'
    },
    fieldNamePlaceholder: 'Alanın adı',
    fieldNameLabel: (n: number) => `${n}. alanın adı`,
    fieldTypeLabel: (n: number) => `${n}. alanın türü`,
    optionsPlaceholder: 'Seçenekler, virgülle ayır: Resmi, Samimi',
    optionsLabel: (n: number) => `${n}. alanın seçenekleri`,
    samplePlaceholder: 'Örnek metin (isteğe bağlı)',
    sampleLabel: (n: number) => `${n}. alanın örnek metni`,
    required: 'Doldurulması zorunlu',
    moveUp: 'Yukarı taşı',
    moveDown: 'Aşağı taşı',
    removeField: 'Alanı sil',
    problems: {
      name: 'Uygulamaya bir ad ver.',
      prompt: 'Talimat boş olamaz.',
      fieldLabel: 'Her alanın bir adı olmalı.',
      options: 'Seçenek listelerinde en az iki seçenek olmalı.'
    }
  },

  form: {
    optional: (label: string) => `${label} (isteğe bağlı)`
  },

  modelPicker: {
    label: 'Bu uygulamada kullanılacak model',
    defaultModel: 'Varsayılan model',
    defaultWith: (model: string) => `Varsayılan (${model})`,
    notInstalled: (model: string) => `${model} (kurulu değil)`
  }
}
