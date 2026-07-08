import type { BudgetType, Filters, SortKey } from '../types'

interface FilterBarProps {
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  countries: string[]
  resultCount: number
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'score', label: 'Best score' },
  { value: 'fewest_bids', label: 'Fewest bids' },
  { value: 'budget', label: 'Highest budget' },
  { value: 'rating', label: 'Client rating' },
]

const BUDGET_OPTIONS: { value: 'all' | 'fixed' | 'hourly'; label: string }[] = [
  { value: 'all', label: 'Any budget' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'hourly', label: 'Hourly' },
]

const ACTIVE_CHIP_STYLE = {
  backgroundColor: 'rgb(var(--accent) / 0.16)',
  color: 'rgb(var(--accent))',
}

export default function FilterBar({
  filters,
  onChange,
  countries,
  resultCount,
}: FilterBarProps) {
  const budgetValue: 'all' | 'fixed' | 'hourly' =
    filters.budgetType === 'all' ? 'all' : filters.budgetType ?? 'all'

  const handleClear = () => {
    onChange({
      search: '',
      budgetType: 'all',
      verifiedOnly: false,
      savedOnly: false,
      country: '',
      minScore: 0,
      minBudget: 0,
      maxBudget: 0,
      lastReplyMaxHours: 0,
    })
  }

  return (
    <div className="card p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <input
          className="input flex-1 min-w-[200px]"
          type="search"
          placeholder="Search title, skills, client…"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          aria-label="Search jobs"
        />

        {/* Sort */}
        <select
          className="select"
          value={filters.sort}
          onChange={(e) => onChange({ sort: e.target.value as SortKey })}
          aria-label="Sort jobs"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Budget type */}
        <select
          className="select"
          value={budgetValue}
          onChange={(e) => {
            const value = e.target.value
            onChange({ budgetType: value === 'all' ? 'all' : (value as BudgetType) })
          }}
          aria-label="Budget type"
        >
          {BUDGET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Country */}
        <select
          className="select"
          value={filters.country}
          onChange={(e) => onChange({ country: e.target.value })}
          aria-label="Client country"
        >
          <option value="">All countries</option>
          {countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>

        {/* Price range (USD) */}
        <div className="flex items-center gap-1" title="Budget range (USD)">
          <input
            type="number"
            min={0}
            step={50}
            className="input w-[84px]"
            placeholder="Min $"
            value={filters.minBudget || ''}
            onChange={(e) => onChange({ minBudget: Number(e.target.value) || 0 })}
            aria-label="Minimum budget (USD)"
          />
          <span className="text-xs text-subtle">–</span>
          <input
            type="number"
            min={0}
            step={50}
            className="input w-[84px]"
            placeholder="Max $"
            value={filters.maxBudget || ''}
            onChange={(e) => onChange({ maxBudget: Number(e.target.value) || 0 })}
            aria-label="Maximum budget (USD)"
          />
        </div>

        {/* Last client reply */}
        <select
          className="select"
          value={filters.lastReplyMaxHours}
          onChange={(e) => onChange({ lastReplyMaxHours: Number(e.target.value) })}
          aria-label="Last client reply within"
        >
          <option value={0}>Any reply time</option>
          <option value={1}>Replied ≤ 1h</option>
          <option value={6}>Replied ≤ 6h</option>
          <option value={24}>Replied ≤ 24h</option>
          <option value={72}>Replied ≤ 3d</option>
          <option value={168}>Replied ≤ 7d</option>
        </select>

        {/* Min score */}
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted whitespace-nowrap">
            Score ≥ {filters.minScore}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={filters.minScore}
            onChange={(e) => onChange({ minScore: Number(e.target.value) })}
            className="w-24 accent-accent cursor-pointer"
            aria-label={`Minimum score ${filters.minScore}`}
          />
        </label>

        {/* Toggle chips */}
        <button
          type="button"
          className="chip"
          aria-pressed={filters.verifiedOnly}
          style={filters.verifiedOnly ? ACTIVE_CHIP_STYLE : undefined}
          onClick={() => onChange({ verifiedOnly: !filters.verifiedOnly })}
        >
          ✅ Verified
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={filters.savedOnly}
          style={filters.savedOnly ? ACTIVE_CHIP_STYLE : undefined}
          onClick={() => onChange({ savedOnly: !filters.savedOnly })}
        >
          ★ Saved
        </button>

        {/* Clear */}
        <button type="button" className="btn-ghost text-sm" onClick={handleClear}>
          Clear
        </button>

        {/* Result count */}
        <span className="ml-auto text-sm text-muted">
          {resultCount} result{resultCount === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}
