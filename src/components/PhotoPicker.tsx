import * as React from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { fileToThumbnail } from '@/lib/image'
import { Thumb } from './Thumb'
import { Button } from './ui/button'

export function PhotoPicker({
  value,
  onChange,
  name,
}: {
  value?: Blob
  onChange: (b?: Blob) => void
  name: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      onChange(await fileToThumbnail(file))
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Thumb blob={value} name={name || '?'} square className="size-16 text-xl" />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFile}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Camera className="size-4" /> {busy ? 'Processing…' : value ? 'Change' : 'Add photo'}
      </Button>
      {value && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  )
}
