'use client'

import { useState, useEffect } from 'react'
import {
  Building2,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Coins,
  DollarSign,
  TrendingUp,
  CreditCard,
  Edit,
  Trash2,
  Check,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import type { Account, Transaction } from '@/types/database'

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  // Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<'vadesiz' | 'vadeli' | 'doviz' | 'kasa' | 'diger'>('vadesiz')
  const [balance, setBalance] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: accs }, { data: txs }] = await Promise.all([
      supabase.from('accounts').select('*').order('created_at', { ascending: true }),
      supabase.from('transactions').select('*').order('date', { ascending: false }),
    ])

    if (accs) setAccounts(accs)
    if (txs) setTransactions(txs)
    setLoading(false)
  }

  const handleOpenAddModal = () => {
    setEditingAccount(null)
    setName('')
    setType('vadesiz')
    setBalance('')
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (acc: Account) => {
    setEditingAccount(acc)
    setName(acc.name)
    setType(acc.type as any)
    setBalance(acc.balance.toString())
    setIsModalOpen(true)
  }

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const numericBalance = parseFloat(balance.replace(',', '.')) || 0

    if (editingAccount) {
      await supabase
        .from('accounts')
        .update({
          name,
          type,
          balance: numericBalance,
        })
        .eq('id', editingAccount.id)
    } else {
      await supabase.from('accounts').insert({
        user_id: user.id,
        name,
        type,
        balance: numericBalance,
      })
    }

    setSaving(false)
    setIsModalOpen(false)
    loadData()
  }

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Bu hesabı silmek istediğinize emin misiniz?')) return
    const supabase = createClient()
    await supabase.from('accounts').delete().eq('id', id)
    loadData()
  }

  const totalCash = accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0)

  // Filter transactions for bank / cash movements
  const accountTransactions = transactions.filter((t) => {
    if (t.card_id && !t.account_id && t.type === 'Harcama') return false // Skip credit card spendings
    if (selectedAccountId === 'all') return true
    return t.account_id === selectedAccountId || t.account_or_card?.toLowerCase().includes(
      accounts.find((a) => a.id === selectedAccountId)?.name.toLowerCase() || '---'
    )
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Banka Hesapları & Kasalar
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tüm vadesiz banka hesaplarınızı, döviz/altın varlıklarınızı ve nakit kasalarınızı yönetin.
          </p>
        </div>
        <Button onClick={handleOpenAddModal} className="gap-2 shadow-md">
          <Plus className="h-4 w-4" />
          Hesap / Kasa Ekle
        </Button>
      </div>

      {/* Total Ready Cash Card */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Toplam Hazır Nakit & Likit Kasa
            </CardTitle>
            <Wallet className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-foreground">
              {formatCurrency(totalCash)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {accounts.length} aktif hesap ve kasa üzerinden
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vadesiz Banka Hesapları
            </CardTitle>
            <Building2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {formatCurrency(
                accounts
                  .filter((a) => a.type === 'vadesiz')
                  .reduce((sum, a) => sum + Number(a.balance || 0), 0)
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {accounts.filter((a) => a.type === 'vadesiz').length} banka hesabı
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Fiziki Kasa / Diğer
            </CardTitle>
            <Coins className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {formatCurrency(
                accounts
                  .filter((a) => a.type !== 'vadesiz')
                  .reduce((sum, a) => sum + Number(a.balance || 0), 0)
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Nakit, altın veya döviz varlıkları
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Accounts Grid */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-4">Hesaplarınız</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((acc) => (
            <Card key={acc.id} className="border-border bg-card shadow-sm hover:border-primary/50 transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">{acc.name}</CardTitle>
                      <CardDescription className="text-xs capitalize">{acc.type} hesabı</CardDescription>
                    </div>
                  </div>
                  <Badge variant={acc.balance > 0 ? 'success' : 'outline'} className="text-xs">
                    {acc.balance > 0 ? 'Aktif Bakiye' : '0,00 TL'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="mt-2 text-2xl font-bold font-mono text-foreground">
                  {formatCurrency(acc.balance)}
                </div>
                <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenEditModal(acc)}
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Edit className="h-3.5 w-3.5 mr-1" />
                    Düzenle
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteAccount(acc.id)}
                    className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Sil
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Account Cashflow & Transactions Table */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">Banka & Nakit Akış Geçmişi</CardTitle>
              <CardDescription className="text-xs">
                Hesaplarınıza giren tahsilatlar, çıkan transferler ve kart ödemeleri
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Hesap Filtresi:</span>
              <Select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-48 text-xs font-semibold"
              >
                <option value="all">Tüm Banka Hesapları</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-muted-foreground">
              <tr>
                <th className="p-3">Tarih</th>
                <th className="p-3">Hesap</th>
                <th className="p-3">Tür</th>
                <th className="p-3">Açıklama / Gönderen-Alıcı</th>
                <th className="p-3">Grup</th>
                <th className="p-3 text-right">Tutar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono">
              {accountTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground font-sans">
                    Bu hesaba ait henüz nakit hareketi bulunmuyor.
                  </td>
                </tr>
              ) : (
                accountTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(tx.date)}
                    </td>
                    <td className="p-3 font-semibold text-foreground font-sans">
                      {tx.account_or_card || 'Vadesiz Hesap'}
                    </td>
                    <td className="p-3 font-sans">
                      <Badge
                        variant={
                          tx.type === 'Gelir' || tx.type === 'Tahsilat'
                            ? 'success'
                            : tx.type === 'Kart Ödemesi'
                            ? 'outline'
                            : 'default'
                        }
                        className="text-[10px]"
                      >
                        {tx.type}
                      </Badge>
                    </td>
                    <td className="p-3 font-sans max-w-sm truncate" title={tx.description || tx.merchant || ''}>
                      <span className="font-medium text-foreground">{tx.merchant}</span>
                      {tx.description && (
                        <span className="text-muted-foreground ml-1.5 text-[11px]">({tx.description})</span>
                      )}
                    </td>
                    <td className="p-3 font-sans">
                      <Badge variant="outline" className="text-[10px]">
                        {tx.analysis_group}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-bold whitespace-nowrap">
                      <span
                        className={
                          tx.type === 'Gelir' || tx.type === 'Tahsilat'
                            ? 'text-success'
                            : tx.analysis_group === 'Hariç'
                            ? 'text-muted-foreground'
                            : 'text-foreground'
                        }
                      >
                        {tx.type === 'Gelir' || tx.type === 'Tahsilat' ? '+' : '-'} {formatCurrency(tx.amount)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal for Add / Edit */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAccount ? 'Hesabı Düzenle' : 'Yeni Hesap / Kasa Ekle'}
      >
        <form onSubmit={handleSaveAccount} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Hesap / Banka Adı</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: Garanti Vadesiz TL, Fiziki Kasa..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Hesap Türü</label>
              <Select value={type} onChange={(e) => setType(e.target.value as any)}>
                <option value="vadesiz">Vadesiz TL</option>
                <option value="vadeli">Vadeli Mevduat</option>
                <option value="doviz">Döviz / Altın</option>
                <option value="kasa">Fiziki Nakit Kasa</option>
                <option value="diger">Diğer</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Mevcut Bakiye (₺)</label>
              <Input
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
