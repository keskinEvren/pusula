import { readFileSync, writeFileSync } from 'node:fs'
const file='src/app/journal/page.tsx'
let src=readFileSync(file,'utf8')
const a=src.indexOf('  async function handleSaveEntry()'), b=src.indexOf('  function handleAddTag()',a)
src=src.slice(0,a)+`  async function handleSaveEntry() {
    if (saveStatus === 'saving' || (!editorTitle.trim() && !editorContent.trim())) return
    setSaveStatus('saving')
    const isNew = isEditingNew || !selectedEntryId
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Oturum açılmamış.')
      const current = entries.find((entry) => entry.id === selectedEntryId)
      const entry: JournalEntry = {
        ...current,
        id: isNew ? crypto.randomUUID() : selectedEntryId!, user_id: user.id,
        entry_date: editorDate, title: editorTitle.trim() || 'Başlıksız Seyir Notu', content: editorContent,
        mood: editorMood, template_type: editorTemplate, tags: editorTags,
        weather_note: editorWeather || null, pinned: editorPinned, word_count: countWords(editorContent),
        created_at: current?.created_at || new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      // Commit remotely first; failure leaves the editor and saved list unchanged.
      const { error } = await supabase.from('journal_entries').upsert(entry)
      if (error) throw error
      saveEntriesToLocal(isNew ? [entry, ...entries] : entries.map((item) => item.id === entry.id ? entry : item))
      setSelectedEntryId(entry.id)
      setIsEditingNew(false)
      setSaveStatus('saved')
      toast.success(isNew ? 'Yeni kayıt eklendi.' : 'Kayıt güncellendi.')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (error: any) {
      setSaveStatus('idle')
      toast.error('Kayıt kaydedilemedi: ' + (error.message || 'Bağlantı hatası'))
    }
  }

  async function confirmDeleteEntry() {
    if (!entryToDelete) return
    const id = entryToDelete
    try {
      if (isUUID(id)) {
        const { error } = await createClient().from('journal_entries').delete().eq('id', id)
        if (error) throw error
      }
      const updated = entries.filter((entry) => entry.id !== id)
      saveEntriesToLocal(updated)
      if (selectedEntryId === id) {
        if (updated.length > 0) { setSelectedEntryId(updated[0].id); populateEditor(updated[0]) }
        else handleCreateNewEntry()
      }
      toast.success('Kayıt silindi.')
      setEntryToDelete(null)
    } catch (error: any) {
      toast.error('Kayıt silinemedi: ' + (error.message || 'Bağlantı hatası'))
    }
  }

`+src.slice(b)
writeFileSync(file,src)
