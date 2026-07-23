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

export function FilterControls({
  searchQuery,
  onSearchChange,
  filterSignal,
  onFilterChange,
  isFiltered,
  shownCount,
  totalCount,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filterSignal: string;
  onFilterChange: (value: string) => void;
  isFiltered: boolean;
  shownCount: number;
  totalCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-56">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
        <Input
          placeholder="Search by name or file…"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-9 h-9 rounded-xl border-zinc-200 text-sm"
        />
      </div>
      <Select value={filterSignal} onValueChange={onFilterChange}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Signals</SelectItem>
          <SelectItem value="strong_match">Strong Match</SelectItem>
          <SelectItem value="good_match">Good Match</SelectItem>
          <SelectItem value="partial_match">Partial Match</SelectItem>
          <SelectItem value="weak_match">Weak Match</SelectItem>
          <SelectItem value="no_match">No Match</SelectItem>
        </SelectContent>
      </Select>
      {isFiltered && (
        <span className="text-xs font-medium text-muted-foreground ml-1">
          {shownCount} of {totalCount}
        </span>
      )}
    </div>
  );
}
