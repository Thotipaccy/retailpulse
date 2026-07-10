interface TabNavProps<T extends string> {
  tabs: { id: T; label: string; count?: number }[]
  active: T
  onChange: (id: T) => void
}

export function TabNav<T extends string>({ tabs, active, onChange }: TabNavProps<T>) {
  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b border-white/10 pb-px">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            active === tab.id
              ? 'border-b-2 border-copper text-copper-light'
              : 'text-on-glass-muted hover:text-on-glass'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-xs">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}
