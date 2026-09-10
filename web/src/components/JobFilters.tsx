import type { ReactNode } from 'react'
import type { Job } from '../types'
import {
  BUDGET_BANDS,
  CUSTOM_BUDGET,
  DEFAULT_FILTERS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  activeFilterCount,
  budgetRangeLabel,
  countryOptions,
  type JobFilterState,
  type SortKey,
  type StatusFilter,
} from '../lib/jobFilters'

interface Props {
  jobs: Job[]
  filters: JobFilterState
  onChange: (next: JobFilterState) => void
  /** How many rows survive the current filters (shown next to the controls). */
  shown: number
  total: number
}

/** A labelled <select> with the shared chevron affordance. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-[190px]">
      <span className="stat-label">{label}</span>
      <span className="relative block">
        {children}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </label>
  )
}

/**
 * Dropdown filters over the stored feed. These narrow what you look at — the
 * archive filters (country allowlist, price floor, non-payer, AI category) still
 * run in the scraper and decide what is stored in the first place.
 */
export default function JobFilters({ jobs, filters, onChange, shown, total }: Props) {
  const countries = countryOptions(jobs)
  const set = <K extends keyof JobFilterState>(key: K, value: JobFilterState[K]) =>
    onChange({ ...filters, [key]: value })
  const active = activeFilterCount(filters)
  const rangeLabel = budgetRangeLabel(filters)

  return (
    <div className="card flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Country">
          <select
            className="select"
            value={filters.country}
            onChange={(e) => set('country', e.target.value)}
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label} ({c.count})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Budget">
          <select
            className="select"
            value={filters.budget}
            onChange={(e) => set('budget', e.target.value)}
          >
            {BUDGET_BANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
            <option value={CUSTOM_BUDGET}>Custom range…</option>
          </select>
        </Field>

        <Field label="Question">
          <select
            className="select"
            value={filters.status}
            onChange={(e) => set('status', e.target.value as StatusFilter)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Sort by">
          <select
            className="select"
            value={filters.sort}
            onChange={(e) => set('sort', e.target.value as SortKey)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="ml-auto flex items-center gap-3 pb-0.5">
          <span className="text-sm text-muted">
            {shown === total ? `${total} projects` : `${shown} of ${total}`}
          </span>
          {active > 0 && (
            <button className="btn btn-ghost text-sm" onClick={() => onChange(DEFAULT_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {filters.budget === CUSTOM_BUDGET && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border/60 pt-3">
          <label className="flex flex-col gap-1">
            <span className="stat-label">Min (USD)</span>
            <input
              className="input w-32"
              type="number"
              min={0}
              step={50}
              value={filters.budgetMin || ''}
              placeholder="0"
              onChange={(e) => set('budgetMin', Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <span className="pb-2 text-muted">–</span>
          <label className="flex flex-col gap-1">
            <span className="stat-label">Max (USD)</span>
            <input
              className="input w-32"
              type="number"
              min={0}
              step={50}
              value={filters.budgetMax ?? ''}
              placeholder="No limit"
              onChange={(e) =>
                set('budgetMax', e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))
              }
            />
          </label>
          <p className="pb-2 text-xs text-subtle">
            Leave Max empty for no ceiling. Hourly and budget-less projects always pass.
          </p>
        </div>
      )}

      {rangeLabel && (
        <p className="text-xs text-subtle">
          Showing projects whose posted budget overlaps <b>{rangeLabel}</b>.
        </p>
      )}
    </div>
  )
}
