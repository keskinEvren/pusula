'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Settings,
  Plus,
  Trash2,
  Building2,
  Wallet,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  FolderKanban,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import type { Account, MerchantMapping, Project } from '@/types/database'

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [mappings, setMappings] = useState<MerchantMapping[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  // Account Modal
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
  const [accountForm, setAccountForm] = useState({
    name: '',
    type: 'vadesiz',
    balance: '',
    note: '',
  })

  // Mapping Modal
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false)
  const [mappingForm, setMappingForm] = useState({
    raw_pattern: '',
    merchant_name: '',
    default_group: 'Kişisel' as 'Kişisel' | 'İş' | 'Finansman' | 'Hariç',
    default_project_id: '',
  })

  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadSettingsData()
  }, [])

  async function loadSettingsData() {
    setLoading(true)
    try {
      const supabase = createClient()
      const [{ data: aData }, { data: mData }, { data: pData }] = await Promise.all([
        supabase.from('accounts').select('*').order('created_at', { ascending: false }),
        supabase.from('merchant_mappings').select('*').order('created_at', { ascending: false }),
        supabase.from('projects').select('*'),
      ])

      if (aData) setAccounts(aData)
      if (mData) setMappings(mData)
      if (pData) setProjects(pData)
    } catch (err) {
      console.error('Error loading settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const { data, error } = await supabase
        .from('accounts')
        .insert({
          user_id: user.id,
          name: accountForm.name,
          type: accountForm.type,
          balance: parseFloat(accountForm.balance || '0'),
          note: accountForm.note || null,
        })
        .select()
        .single()

      if (error) throw error
      if (data) {
        setAccounts([data, ...accounts])
        setIsAccountModalOpen(false)
        setAccountForm({ name: '', type: 'vadesiz', balance: '', note: '' })
      }
    } catch (err: any) {
      alert(err.message || 'Hesap eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateAccountBalance = async (id: string, newBalance: number) => {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('accounts')
        .update({ balance: newBalance })
        .eq('id', id)
      if (error) throw error
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, balance: newBalance } : a))
      )
    } catch (err: any) {
      alert(err.message || 'Bakiye güncellenemedi')
    }
  }

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Bu hesabı silmek istediğinize emin misiniz?')) return
    try {
      const supabase = createClient()
      const { error } = await supabase.from('accounts').delete().eq('id', id)
      if (error) throw error
      setAccounts(accounts.filter((a) => a.id !== id))
    } catch (err: any) {
      alert(err.message || 'Silinemedi')
    }
  }

  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış')

      const { data, error } = await supabase
        .from('merchant_mappings')
        .insert({
          user_id: user.id,
          raw_pattern: mappingForm.raw_pattern,
          merchant_name: mappingForm.merchant_name,
          default_group: mappingForm.default_group,
          default_project_id: mappingForm.default_project_id || null,
        })
        .select()
        .single()

      if (error) throw error
      if (data) {
        setMappings([data, ...mappings])
        setIsMappingModalOpen(false)
        setMappingForm({
          raw_pattern: '',
          merchant_name: '',
          default_group: 'Kişisel',
          default_project_id: '',
        })
      }
    } catch (err: any) {
      alert(err.message || 'Kural eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteMapping = async (id: string) => {
    try {
      const supabase = createClient()
      const { error } = await supabase.from('merchant_mappings').delete().eq('id', id)
      if (error) throw error
      setMappings(mappings.filter((m) => m.id !== id))
    } catch (err: any) {
      alert(err.message || 'Silinemedi')
    }
  }

  return (
    <div className="space-y-6">
      {/* Top PageHeader */}
      <PageHeader
        title="Ayarlar & Kurallar"
        description="Banka/nakit hesap özetiniz ve otomatik ekstre işyeri eşleştirme kurallarınız."
        actions={
          <Link href="/accounts">
            <Button variant="outline" size="sm" className="gap-2 text-xs h-9">
              <Building2 className="h-4 w-4 text-primary" />
              Banka & Kasaları Yönet
            </Button>
          </Link>
        }
      />

      {/* Accounts Overview */}
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Banka & Nakit Hesapları ({accounts.length})
            </CardTitle>
            <CardDescription>
              Hesaplarınızı yönetmek, bakiye güncellemek ve transfer yapmak için{' '}
              <Link href="/accounts" className="text-primary hover:underline font-medium">
                Banka & Kasalar
              </Link>{' '}
              sayfasını kullanın.
            </CardDescription>
          </div>
          <Link href="/accounts">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              Kasalar Sayfası →
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2 flex flex-col justify-between"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-sm text-foreground">{acc.name}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">{acc.type}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteAccount(acc.id)}
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground">Güncel Bakiye</label>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Input
                      type="number"
                      step="0.01"
                      defaultValue={acc.balance}
                      onBlur={(e) =>
                        handleUpdateAccountBalance(acc.id, parseFloat(e.target.value || '0'))
                      }
                      className="h-8 font-mono text-xs font-bold"
                    />
                    <span className="text-xs text-muted-foreground">TL</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {accounts.length === 0 && (
            <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
              Kayıtlı hesap bulunmuyor.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto Merchant Mappings */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400" />
              Otomatik İşyeri Eşleştirme Kuralları ({mappings.length})
            </CardTitle>
            <CardDescription>
              Ekstre yüklendiğinde belirli ifadeleri otomatik işyeri ve projeye atar.
            </CardDescription>
          </div>
          <Button onClick={() => setIsMappingModalOpen(true)} size="sm" variant="outline" className="gap-2 text-xs">
            <Plus className="h-4 w-4" />
            Yeni Kural Tanımla
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-muted-foreground">
                <tr>
                  <th className="p-3">Ekstrede Geçen Metin</th>
                  <th className="p-3">Dönüştürülecek İşyeri</th>
                  <th className="p-3">Varsayılan Grup</th>
                  <th className="p-3">Varsayılan Proje</th>
                  <th className="p-3 text-center">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {mappings.map((m) => {
                  const project = projects.find((p) => p.id === m.default_project_id)
                  return (
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors font-sans">
                      <td className="p-3 font-mono font-semibold text-foreground">
                        {m.raw_pattern}
                      </td>
                      <td className="p-3 text-foreground font-medium">
                        {m.merchant_name}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            m.default_group === 'İş'
                              ? 'purple'
                              : m.default_group === 'Finansman'
                              ? 'destructive'
                              : m.default_group === 'Hariç'
                              ? 'outline'
                              : 'secondary'
                          }
                          className="text-[10px]"
                        >
                          {m.default_group}
                        </Badge>
                      </td>
                      <td className="p-3 font-sans">
                        {project ? (
                          <Badge variant="purple" className="text-[10px] gap-1">
                            <FolderKanban className="h-3 w-3" />
                            {project.name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/60">-</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteMapping(m.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}

                {mappings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-xs text-muted-foreground font-sans">
                      Henüz özel işyeri kuralı eklenmedi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Account Modal */}
      <Modal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        title="Yeni Hesap Ekle"
        description="Likit nakit veya vadesiz banka hesabınızı tanımlayın."
      >
        <form onSubmit={handleAddAccount} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Hesap Adı</label>
            <Input
              required
              placeholder="Örn: Garanti Vadesiz, Enpara Günlük, Nakit Kasa"
              value={accountForm.name}
              onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Hesap Türü</label>
              <Select
                value={accountForm.type}
                onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })}
                className="text-xs"
              >
                <option value="vadesiz">Vadesiz Hesap</option>
                <option value="nakit">Nakit Cüzdan</option>
                <option value="yatırım">Yatırım Hesabı</option>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Mevcut Bakiye (TL)</label>
              <Input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={accountForm.balance}
                onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })}
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAccountModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Ekleniyor...' : 'Hesabı Ekle'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Mapping Modal */}
      <Modal
        isOpen={isMappingModalOpen}
        onClose={() => setIsMappingModalOpen(false)}
        title="Yeni Eşleştirme Kuralı"
        description="Ekstrelerde geçen bir kelime kalıbını otomatik olarak normalize edin."
      >
        <form onSubmit={handleAddMapping} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Ekstredeki Ham İfade (Regex/Kalıp)</label>
            <Input
              required
              placeholder="Örn: AMAZON.COM, HOSTINGER, CURSOR"
              value={mappingForm.raw_pattern}
              onChange={(e) => setMappingForm({ ...mappingForm, raw_pattern: e.target.value })}
              className="text-xs uppercase font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Dönüştürülecek Temiz İşyeri Adı</label>
            <Input
              required
              placeholder="Örn: Amazon Web Hizmetleri"
              value={mappingForm.merchant_name}
              onChange={(e) => setMappingForm({ ...mappingForm, merchant_name: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Varsayılan Grup</label>
              <Select
                value={mappingForm.default_group}
                onChange={(e) =>
                  setMappingForm({
                    ...mappingForm,
                    default_group: e.target.value as any,
                  })
                }
                className="text-xs"
              >
                <option value="Kişisel">Kişisel</option>
                <option value="İş">İş</option>
                <option value="Finansman">Finansman</option>
                <option value="Hariç">Hariç</option>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Varsayılan Proje (Opsiyonel)</label>
              <Select
                value={mappingForm.default_project_id}
                onChange={(e) =>
                  setMappingForm({ ...mappingForm, default_project_id: e.target.value })
                }
                className="text-xs"
              >
                <option value="">(Yok)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsMappingModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : 'Kuralı Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
