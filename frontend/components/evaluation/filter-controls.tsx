"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Hire-signal options: the default filter, used by both results pages. */
const SIGNAL_OPTIONS = [
  { value: "all", label: "All signals" },
  { value: "strong_match", label: "Strong match" },
  { value: "good_match", label: "Good match" },
  { value: "partial_match", label: "Partial match" },
  { value: "weak_match", label: "Weak match" },
  { value: "no_match", label: "No match" },
];

export function FilterControls({
  searchQuery,
  onSearchChange,
  filterSignal,
  onFilterChange,
  isFiltered,
  shownCount,
  totalCount,
  filterOptions = SIGNAL_OPTIONS,
  actions,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filterSignal: string;
  onFilterChange: (value: string) => void;
  isFiltered: boolean;
  shownCount: number;
  totalCount: number;
  // Lets the Interviews tab filter by interview state instead of hire
  // signal; the search box and the "n of m" readout are identical either way.
  filterOptions?: { value: string; label: string }[];
  // Right-aligned controls that act on the table below, e.g. expand all.
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-56">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by name or file…"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-9 h-9 rounded-xl text-sm"
        />
      </div>
      <Select value={filterSignal} onValueChange={onFilterChange}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {filterOptions.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isFiltered && (
        <span className="text-xs font-medium text-muted-foreground ml-1">
          {shownCount} of {totalCount}
        </span>
      )}
      {actions && <div className="ml-auto flex items-center gap-3">{actions}</div>}
    </div>
  );
}
