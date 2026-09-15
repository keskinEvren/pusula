'use client'

import React, { useState, useEffect } from 'react'
import {
  X,
  CreditCard as CardIcon,
  Building2,
  FileText,
  FileSpreadsheet,
  Code,
  ShieldCheck,
  Sparkles,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface StatementGuideSheetProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: 'credit_card' | 'bank_account'
}

interface BankItem {
  id: string
  name: string
  badge: string
  types: string[]
  supportedCards: string
  howToExport: string
  tip?: string
}

const SUPPORTED_BANKS: BankItem[] = [
  {
    id: 'enpara',
    name: 'Enpara.com (QNB)',
    badge: 'Doğrudan Ayrıştırma',
    types: ['PDF Ekstre', 'HTML Hesap Özeti', 'Excel/CSV'],
    supportedCards: 'Kredi Kartı & Vadesiz TL/Döviz Hesapları',
    howToExport:
      'Enpara Cep Şubesi > Kredi Kartı veya Vadesiz Hesap > "Ekstre / Hesap Özeti" > "Ekstre Gönder" adımlarını izleyin. E-postanıza gelen PDF veya HTML dosyasını doğrudan yükleyin.',
    tip: 'Enpara e-posta hesap özetleri HTML formatında gelir. Pusula HTML dosyasını anında ayrıştırıp FAST/EFT açıklamalarını temizler.',
  },
  {
    id: 'akbank',
    name: 'Akbank (Axess / Wings)',
    badge: 'Doğrudan Ayrıştırma',
    types: ['PDF Ekstre', 'Excel/CSV'],
    supportedCards: 'Axess Platinum, Wings, Free, Akbank Kart',
    howToExport:
      'Akbank Mobil > Kartlarım > Kredi Kartı seçin > "Ekstre Görüntüle" > Sağ üstteki indirme simgesinden "PDF Olarak Kaydet" seçeneğini kullanın.',
    tip: 'Ekstredeki faiz, kesinti ve chip-para satırları ana harcama tutarından otomatik ayırt edilir.',
  },
  {
    id: 'garanti',
    name: 'Garanti BBVA (Bonus)',
    badge: 'Doğrudan Ayrıştırma',
    types: ['PDF Ekstre', 'Excel/CSV'],
    supportedCards: 'Bonus Trink, Bonus Platinum, Miles&Smiles, Shop&Fly',
    howToExport:
      'Garanti BBVA Mobil > Hesap ve Kart > Kredi Kartları > "Hesap Özeti" > "e-Ekstre İndir / Paylaş (PDF)".',
    tip: 'Taksitli işlemler (örn. "2/6") ve iadeler otomatik tanınarak analiz grubuna ayrılır.',
  },
  {
    id: 'ziraat',
    name: 'Ziraat Bankası (Bankkart)',
    badge: 'Doğrudan Ayrıştırma',
    types: ['PDF Ekstre', 'Excel/CSV'],
    supportedCards: 'Bankkart Combo, Platinum, 5349- serisi kartlar',
    howToExport:
      'Ziraat Mobil > Kartlarım > Kredi Kartı > "Dönem Ekstresi" > "Ekstre Paylaş / İndir (PDF)".',
    tip: 'Ziraat Bankası çok sütunlu döviz ve puan satırları ana TL tutarından filtrelenir.',
  },
  {
    id: 'other',
    name: 'Diğer Bankalar & Fintekler',
    badge: 'Standart Şablon',
    types: ['Excel (.xlsx, .xls)', 'CSV (.csv)', 'Standart PDF'],
    supportedCards: 'İş Bankası, Yapı Kredi, QNB, TEB, Papara vb.',
    howToExport:
      'İnternet veya mobil bankacılıktan hesap ve kart hareketlerinizi "Excel (.xlsx)" veya "CSV" olarak dışa aktarın.',
    tip: 'Pusula "Tarih", "Açıklama" ve "Tutar" sütunlarını otomatik algılar; dosya düzenini bozmanıza gerek yoktur.',
  },
]

export function StatementGuideSheet({
  isOpen,
  onClose,
  initialMode = 'credit_card',
}: StatementGuideSheetProps) {
  const [guideMode, setGuideMode] = useState<'credit_card' | 'bank_account'>(initialMode)
  const [expandedBank, setExpandedBank] = useState<string | null>('enpara')
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setGuideMode(initialMode)
    }
  }, [isOpen, initialMode])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-sheet-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl h-full border-l border-border bg-card text-card-foreground shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 overflow-hidden"
      >
        {/* Top Header */}
        <div className="p-5 border-b border-border/60 bg-muted/20 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-muted border border-border/60 text-foreground">
                <FileText className="h-4 w-4" />
              </span>
              <h2 id="guide-sheet-title" className="text-base sm:text-lg font-bold text-foreground">
                Ekstre & Banka Rehberi
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Desteklenen formatlar, banka dökümleri ve hızlı içe aktarma kuralları
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
            aria-label="Rehberi Kapat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="px-5 pt-3 pb-2 border-b border-border/40 bg-card shrink-0">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/30 border border-border/60">
            <button
              type="button"
              onClick={() => setGuideMode('credit_card')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                guideMode === 'credit_card'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <CardIcon className="h-3.5 w-3.5" />
              <span>Kredi Kartı Ekstresi</span>
            </button>
            <button
              type="button"
              onClick={() => setGuideMode('bank_account')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                guideMode === 'bank_account'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Vadesiz Hesap Özeti</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
          {/* Format Highlights Strip */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Desteklenen Dosya Formatları
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded-xl border border-border/60 bg-muted/20 flex items-center gap-2.5">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="font-semibold text-foreground">.PDF</div>
                  <div className="text-[10px] text-muted-foreground">e-Ekstre</div>
                </div>
              </div>
              <div className="p-2.5 rounded-xl border border-border/60 bg-muted/20 flex items-center gap-2.5">
                <Code className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="font-semibold text-foreground">.HTML</div>
                  <div className="text-[10px] text-muted-foreground">E-posta Özeti</div>
                </div>
              </div>
              <div className="p-2.5 rounded-xl border border-border/60 bg-muted/20 flex items-center gap-2.5">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="font-semibold text-foreground">.XLSX / .XLS</div>
                  <div className="text-[10px] text-muted-foreground">Excel Tablosu</div>
                </div>
              </div>
              <div className="p-2.5 rounded-xl border border-border/60 bg-muted/20 flex items-center gap-2.5">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="font-semibold text-foreground">.CSV</div>
                  <div className="text-[10px] text-muted-foreground">Metin Dökümü</div>
                </div>
              </div>
            </div>
          </div>

          {/* Mode Specific Explanation Card */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2.5">
            <div className="font-semibold text-sm text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>
                {guideMode === 'credit_card'
                  ? 'Kredi Kartı Ekstresi Ayrıştırma Özellikleri'
                  : 'Vadesiz Hesap Özeti Ayrıştırma Özellikleri'}
              </span>
            </div>
            <ul className="space-y-2 text-muted-foreground text-[11px] leading-relaxed">
              {guideMode === 'credit_card' ? (
                <>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span>
                      Dönem toplam borcu, asgari ödeme tutarı ve hesap kesim / son ödeme tarihleri otomatik okunur.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span>
                      Taksitli harcamalar (örn. <strong>3/6</strong>) algılanır ve taksit takvimi oluşturulur.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span>
                      İadeler negatif olarak yansıtılarak kart borcu ve harcama hacmi dengelenir.
                    </span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span>
                      Gelen ve giden EFT/FAST transferleri nakit akışınıza doğrudan entegre edilir.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span>
                      Açık borçlarınız varsa (Borç & Alacak), açıklamadaki kişi ismi taranarak borç mutabakatı önerilir.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span>
                      Hesaptan kredi kartına yapılan ödemeler tespit edilip mükerrer harcama yazılması engellenir.
                    </span>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* Banks Accordion List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Bankadan Ekstre Nasıl İndirilir?
              </span>
              <span className="text-[11px] text-muted-foreground">Banka seçin</span>
            </div>

            <div className="space-y-2">
              {SUPPORTED_BANKS.map((b) => {
                const isExpanded = expandedBank === b.id
                return (
                  <div
                    key={b.id}
                    className={`rounded-xl border transition-all overflow-hidden ${
                      isExpanded ? 'border-border bg-card shadow-sm' : 'border-border/60 bg-card/40 hover:border-border hover:bg-card'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedBank(isExpanded ? null : b.id)}
                      className="w-full p-3.5 text-left flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-semibold text-foreground text-xs">
                          {b.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                          • {b.supportedCards}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/70 text-muted-foreground">
                          {b.badge}
                        </Badge>
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-border/40 text-[11px] bg-muted/10 animate-in fade-in">
                        <div>
                          <span className="font-semibold text-foreground block mb-0.5">Nasıl Dışa Aktarılır?</span>
                          <p className="text-muted-foreground leading-relaxed">{b.howToExport}</p>
                        </div>
                        {b.tip && (
                          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50 text-muted-foreground leading-relaxed">
                            <strong className="text-foreground">İpucu: </strong>
                            {b.tip}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {b.types.map((t) => (
                            <span key={t} className="px-2 py-0.5 rounded-md bg-muted border border-border/50 text-[10px] text-foreground font-mono">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Privacy & Guarantees Strip */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
            <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
              <span>Gizlilik & Sıfır Sunucu İletimi Güvencesi</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Ekstre dosyalarınız (PDF, HTML, Excel) <strong>asla harici bir sunucuya veya üçüncü taraf servisine yüklenmez</strong>.
              Tüm metin ve satır çıkarma işlemleri doğrudan tarayıcınızın belleğinde (client-side) güvenle gerçekleşir.
            </p>
          </div>

          {/* FAQs Accordion */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Sık Sorulan Sorular</span>
            </div>

            <div className="space-y-1.5">
              {[
                {
                  id: 'password',
                  q: 'Şifreli (T.C. kimlik şifreli) PDF ekstremi nasıl yüklerim?',
                  a: 'Banka PDF’ini bilgisayarınızdaki Google Chrome veya Edge tarayıcısında açıp şifrenizi girin. Ardından Ctrl+P (veya Cmd+P) tuşlayıp hedef yazıcı olarak "PDF Olarak Kaydet" seçin. Oluşan yeni şifresiz PDF dosyasını Pusula’ya sorunsuzca yükleyebilirsiniz.',
                },
                {
                  id: 'duplicate',
                  q: 'Aynı ekstreyi tekrar yüklersem mükerrer kayıt oluşur mu?',
                  a: 'Hayır. Pusula her yüklenen dosyanın SHA-256 dijital parmak izini kontrol eder. Daha önce yüklenmiş bir dosya tespit edildiğinde sistem sizi anında uyarır.',
                },
                {
                  id: 'rollback',
                  q: 'Yüklediğim bir ekstreyi sonradan geri alabilir miyim?',
                  a: 'Evet. "Ekstre Merkezi (/imports)" sayfasından dilediğiniz ekstre paketini bulup "Geri Al" (Atomic Rollback) butonuna basarak o ekstreyle eklenmiş tüm hareketleri tek tıkla silebilirsiniz.',
                },
              ].map((faq) => {
                const isOpenFaq = expandedFaq === faq.id
                return (
                  <div
                    key={faq.id}
                    className="rounded-xl border border-border/60 bg-card/40 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedFaq(isOpenFaq ? null : faq.id)}
                      className="w-full p-3 text-left flex items-center justify-between gap-2 text-xs font-semibold text-foreground hover:bg-muted/30"
                    >
                      <span>{faq.q}</span>
                      {isOpenFaq ? (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                    </button>
                    {isOpenFaq && (
                      <div className="px-3 pb-3 text-[11px] text-muted-foreground leading-relaxed border-t border-border/40 pt-2 bg-muted/10 animate-in fade-in">
                        {faq.a}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer Action */}
        <div className="p-4 border-t border-border/60 bg-muted/20 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-muted-foreground">
            Dosyanız hazırsa hemen sürükleyip bırakabilirsiniz
          </span>
          <Button size="sm" onClick={onClose} className="text-xs h-8 px-4 font-semibold">
            Kapat
          </Button>
        </div>
      </div>
    </div>
  )
}
