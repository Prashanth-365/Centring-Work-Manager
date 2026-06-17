import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { FormScaffold } from '@/components/FormScaffold'
import { PhotoPicker } from '@/components/PhotoPicker'
import { Field } from '@/components/Field'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useOwner } from '@/lib/hooks'
import { createOwner, deleteOwner, updateOwner } from '@/lib/repo'

export function OwnerForm() {
  const { id } = useParams()
  const editing = !!id
  const existing = useOwner(id)
  const navigate = useNavigate()

  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [location, setLocation] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [photo, setPhoto] = React.useState<Blob>()
  const [error, setError] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [confirmDel, setConfirmDel] = React.useState(false)
  const loaded = React.useRef(false)

  React.useEffect(() => {
    if (existing && !loaded.current) {
      loaded.current = true
      setName(existing.name)
      setPhone(existing.phone ?? '')
      setLocation(existing.location ?? '')
      setNotes(existing.notes ?? '')
      setPhoto(existing.photoThumb)
    }
  }, [existing])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    const data = {
      name: name.trim(),
      phone: phone.trim() || undefined,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      photoThumb: photo,
    }
    if (editing) {
      await updateOwner(id!, data)
      navigate(`/owners/${id}`, { replace: true })
    } else {
      const newId = await createOwner(data)
      navigate(`/owners/${newId}`, { replace: true })
    }
  }

  return (
    <FormScaffold
      title={editing ? 'Edit owner' : 'New owner'}
      onSubmit={submit}
      submitting={saving}
      footerExtra={
        editing ? (
          <Button type="button" variant="outline" size="lg" onClick={() => setConfirmDel(true)}>
            <Trash2 className="size-4" />
          </Button>
        ) : undefined
      }
    >
      <PhotoPicker value={photo} onChange={setPhoto} name={name || 'Owner'} />

      <Field label="Name" required error={error}>
        {(fid) => (
          <Input
            id={fid}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError('')
            }}
            placeholder="Owner name"
          />
        )}
      </Field>

      <Field label="Phone">
        {(fid) => (
          <Input id={fid} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile" />
        )}
      </Field>

      <Field label="Location">
        {(fid) => (
          <Input id={fid} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Area / town" />
        )}
      </Field>

      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title="Delete this owner?"
        description="Buildings linked to this owner will keep working but lose the link."
        onConfirm={async () => {
          await deleteOwner(id!)
          navigate('/owners', { replace: true })
        }}
      />
    </FormScaffold>
  )
}
