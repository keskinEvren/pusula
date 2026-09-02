'use client'

import { useEffect, useState } from 'react'
import {
  Plus,
  Search,
  Filter,
  Trash2,
  ReceiptText,
  Calendar,
  FolderKanban,
  Download,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import type { Transaction, Project, CreditCard, Account } from '@/types/database'

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [groupFilter, setGroupFilter] = useState<string>('ALL')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')
  const [projectFilter, setProjectFilter] = useState<string>('ALL')

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [newTx, setNewTx] = useState({
    date: new Date().toISOString().split('T')[0],
    account_or_card: 'Garanti Vadesiz',
    type: 'Harcama',
    description: '',
    merchant: '',
    amount: '',
    analysis_group: 'Kişisel',
    project_id: '',
  })

  useEffect(() => {
    loadTransactions()
  }, [])

  async function loadTransactions() {
    setLoading(true)
    try {
      const supabase = createClient()
      const [{ data: txs }, { data: prjs }, { data: crds }, { data: accs }] = await Promise.all([
        supabase.from('transactions').select('*').order('date', { ascending: false }),
        supabase.from('projects').select('*'),
        supabase.from('credit_cards').select('*'),
        supabase.from('accounts').select('*'),
      ])

      if (txs) setTransactions(txs)
      if (prjs) setProjects(prjs)
      if (crds) setCards(crds)
      if (accs) setAccounts(accs)
    } catch (err) {
      console.error('Error loading transactions:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) throw new Error('Oturum açılmamış')

      const amountNum = parseFloat(newTx.amount || '0')

      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          date: newTx.date,
          account_or_card: newTx.account_or_card,
          type: newTx.type as any,
          description: newTx.description || newTx.merchant,
          merchant: newTx.merchant || newTx.description,
          amount: amountNum,
          analysis_group: newTx.analysis_group as any,
          project_id: newTx.project_id || null,
        })
        .select()
        .single()

      if (error) throw error

      if (data) {
        setTransactions([data, ...transactions])
        setIsAddModalOpen(false)
        setNewTx({
          date: new Date().toISOString().split('T')[0],
          account_or_card: 'Garanti Vadesiz',
          type: 'Harcama',
          description: '',
          merchant: '',
          amount: '',
          analysis_group: 'Kişisel',
          project_id: '',
        })
      }
    } catch (err: any) {
      alert(err.message || 'Kayıt eklenemedi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu hareketi silmek istediğinize emin misiniz?')) return

    try {
      const supabase = createClient()
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error

      setTransactions(transactions.filter((t) => t.id !== id))
    } catch (err: any) {
      alert(err.message || 'Silinemedi')
    }
  }

  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch =
      (t.merchant && t.merchant.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesGroup = groupFilter === 'ALL' || t.analysis_group === groupFilter
    const matchesType = typeFilter === 'ALL' || t.type === typeFilter
    const matchesProject = projectFilter === 'ALL' || t.project_id === projectFilter

    return matchesSearch && matchesGroup && matchesType && matchesProject
  })

  const totalFilteredAmount = filteredTransactions
    .filter((t) => t.analysis_group !== 'Hariç')
    .reduce((sum, t) => sum + t.amount, 0)

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Genel İşlem Defteri
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tüm banka hareketleriniz, nakit harcamalarınız ve projelerle ilişkili maliyetler
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsAddModalOpen(true)} className="gap-2 shadow-md">
            <Plus className="h-4 w-4" />
            Manuel Hareket Ekle
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="border-border bg-card shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="İşyeri veya açıklama ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            {/* Group Filter */}
            <Select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="text-xs"
            >
              <option value="ALL">Tüm Gruplar</option>
              <option value="Kişisel">Kişisel</option>
              <option value="İş">İş</option>
              <option value="Finansman">Finansman</option>
              <option value="Hariç">Hariç</option>
            </Select>

            {/* Type Filter */}
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs"
            >
              <option value="ALL">Tüm İşlem Türleri</option>
              <option value="Harcama">Harcama</option>
              <option value="Kart Ödemesi">Kart Ödemesi</option>
              <option value="Gelir">Gelir</option>
              <option value="Finansman/Masraf">Finansman/Masraf</option>
              <option value="İade">İade</option>
            </Select>

            {/* Project Filter */}
            <Select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="text-xs"
            >
              <option value="ALL">Tüm Projeler</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
            <div>
              Toplam <strong>{filteredTransactions.length}</strong> hareket listeleniyor
            </div>
            <div>
              Filtrelenen Tüketim Toplamı:{' '}
              <strong className="text-foreground font-mono text-sm">
                {formatCurrency(totalFilteredAmount)}
              </strong>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border uppercase font-semibold text-muted-foreground">
              <tr>
                <th className="p-3">Tarih</th>
                <th className="p-3">Hesap / Kart</th>
                <th className="p-3">İşyeri / Açıklama</th>
                <th className="p-3">Tür</th>
                <th className="p-3">Grup</th>
                <th className="p-3">Bağlı Proje</th>
                <th className="p-3 text-right">Tutar</th>
                <th className="p-3 text-center">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono">
              {filteredTransactions.map((tx) => {
                const project = projects.find((p) => p.id === tx.project_id)
                return (
                  <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(tx.date)}
                    </td>
                    <td className="p-3 font-sans text-muted-foreground whitespace-nowrap">
                      {tx.account_or_card || '-'}
                    </td>
                    <td className="p-3 font-sans max-w-xs truncate">
                      <div className="font-semibold text-foreground">
                        {tx.merchant || tx.description}
                      </div>
                      {tx.merchant && tx.merchant !== tx.description && (
                        <div className="text-[10px] text-muted-foreground truncate" title={tx.description}>
                          {tx.description}
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-sans">
                      <Badge variant="outline" className="text-[10px]">
                        {tx.type}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          tx.analysis_group === 'İş'
                            ? 'purple'
                            : tx.analysis_group === 'Finansman'
                            ? 'destructive'
                            : tx.analysis_group === 'Hariç'
                            ? 'outline'
                            : 'secondary'
                        }
                        className="text-[10px]"
                      >
                        {tx.analysis_group}
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
                    <td className="p-3 text-right font-bold whitespace-nowrap">
                      <span
                        className={
                          tx.analysis_group === 'Hariç'
                            ? 'text-muted-foreground'
                            : tx.analysis_group === 'Finansman'
                            ? 'text-destructive'
                            : 'text-foreground'
                        }
                      >
                        {formatCurrency(tx.amount)}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(tx.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}

              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-xs text-muted-foreground font-sans">
                    Arama kriterlerinize uygun hareket bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Transaction Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Yeni Hareket Ekle"
        description="Genel işlem defterine manuel harcama, gelir veya transfer ekleyin."
      >
        <form onSubmit={handleAddTransaction} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Tarih</label>
              <Input
                type="date"
                required
                value={newTx.date}
                onChange={(e) => setNewTx({ ...newTx, date: e.target.value })}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Tutar (TL)</label>
              <Input
                type="number"
                step="0.01"
                required
                placeholder="150.00"
                value={newTx.amount}
                onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })}
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">İşyeri / Açıklama</label>
            <Input
              required
              placeholder="Örn: Hostinger, ŞOK Market, Yemek"
              value={newTx.merchant}
              onChange={(e) => setNewTx({ ...newTx, merchant: e.target.value, description: e.target.value })}
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">İşlem Türü</label>
              <Select
                value={newTx.type}
                onChange={(e) => setNewTx({ ...newTx, type: e.target.value })}
                className="text-xs"
              >
                <option value="Harcama">Harcama</option>
                <option value="Kart Ödemesi">Kart Ödemesi</option>
                <option value="Gelir">Gelir</option>
                <option value="Finansman/Masraf">Finansman/Masraf</option>
                <option value="İade">İade</option>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Analiz Grubu</label>
              <Select
                value={newTx.analysis_group}
                onChange={(e) => setNewTx({ ...newTx, analysis_group: e.target.value })}
                className="text-xs"
              >
                <option value="Kişisel">Kişisel</option>
                <option value="İş">İş</option>
                <option value="Finansman">Finansman</option>
                <option value="Hariç">Hariç</option>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">İlişkili Proje (Opsiyonel)</label>
            <Select
              value={newTx.project_id}
              onChange={(e) => setNewTx({ ...newTx, project_id: e.target.value })}
              className="text-xs"
            >
              <option value="">(Yok - Genel Gider)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddModalOpen(false)}
            >
              İptal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
