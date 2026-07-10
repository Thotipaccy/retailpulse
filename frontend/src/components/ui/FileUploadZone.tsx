import { Upload } from 'lucide-react'

interface FileUploadZoneProps {
  onSelect?: () => void
  accept?: string
}

export function FileUploadZone({ onSelect, accept = '.csv,.xlsx,.json' }: FileUploadZoneProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/20 bg-white/5 px-6 py-12 text-center transition-colors hover:border-copper/40 hover:bg-white/[0.07]">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-copper/15">
        <Upload className="h-7 w-7 text-copper-light" />
      </div>
      <p className="text-sm font-medium text-on-glass">Drag and drop files here</p>
      <p className="mt-1 text-xs text-on-glass-muted">Supported: {accept.replace(/\./g, '').toUpperCase()}</p>
      <button
        type="button"
        onClick={onSelect}
        className="mt-4 rounded-lg bg-copper px-4 py-2 text-sm font-medium text-white hover:bg-copper-light"
      >
        Select Files
      </button>
    </div>
  )
}
