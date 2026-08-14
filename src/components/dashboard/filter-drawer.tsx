import React, { useEffect, useState } from "react";
import { Filter, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";

export interface FilterState {
  itemType: string;
  collectionLine: string;
  metalPurity: string;
  metalType: string;
}

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onApplyFilters: (filters: FilterState) => void;
  onResetFilters: () => void;
}

interface FilterOptions {
  itemTypes: string[];
  collectionLines: string[];
  metalPurities: string[];
  metalTypes: string[];
}

function FilterSection({ 
  title, 
  options, 
  selected, 
  onSelect 
}: { 
  title: string, 
  options: string[], 
  selected: string, 
  onSelect: (val: string) => void 
}) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="flex flex-col border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur-md shadow-sm transition-all duration-300">
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex justify-between items-center p-3.5 text-xs font-semibold transition-colors ${isOpen ? 'bg-muted/50' : 'hover:bg-muted/30'}`}
      >
        <span className="text-foreground/90">{title} {selected && <span className="text-primary ml-1.5 font-bold tracking-wide">• {selected}</span>}</span>
        <ChevronDown className={`h-4 w-4 opacity-60 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="p-2 bg-black/5 dark:bg-black/20 border-t border-border/50 flex flex-col gap-1 max-h-52 overflow-y-auto shadow-inner">
          <button
            type="button"
            onClick={() => onSelect("")}
            className={`text-left px-3 py-2 text-xs rounded-lg transition-all duration-200 ${!selected ? 'bg-primary/15 text-primary font-semibold shadow-sm' : 'hover:bg-black/10 dark:hover:bg-white/5 text-muted-foreground hover:text-foreground'}`}
          >
            All {title}s
          </button>
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => onSelect(opt)}
              className={`text-left px-3 py-2 text-xs rounded-lg transition-all duration-200 ${selected === opt ? 'bg-primary/15 text-primary font-semibold shadow-sm' : 'hover:bg-black/10 dark:hover:bg-white/5 text-muted-foreground hover:text-foreground'}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FilterDrawer({
  isOpen,
  onClose,
  filters,
  onApplyFilters,
  onResetFilters,
}: FilterDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);
  const [options, setOptions] = useState<FilterOptions>({
    itemTypes: [],
    collectionLines: [],
    metalPurities: [],
    metalTypes: [],
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch filter options when mounted and whenever localFilters change
  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();

    const fetchOptions = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (localFilters.itemType) params.set("itemType", localFilters.itemType);
        if (localFilters.collectionLine) params.set("collectionLine", localFilters.collectionLine);
        if (localFilters.metalPurity) params.set("metalPurity", localFilters.metalPurity);
        if (localFilters.metalType) params.set("metalType", localFilters.metalType);

        const res = await fetch(`/api/catalog/filters?${params}`, { signal: controller.signal });
        const json = await res.json();
        if (json.data) {
          setOptions(json.data);
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Failed to fetch filters", err);
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchOptions();

    return () => {
      controller.abort();
    };
  }, [localFilters, isOpen]);

  // Update local state when filters prop changes (e.g., when the drawer opens with active filters)
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  if (!mounted) return null;

  const handleApply = () => {
    onApplyFilters(localFilters);
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-75 sm:w-87.5 flex flex-col p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <span className="text-sm">Filters</span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 relative">
          {isLoading && (
            <div className="absolute top-0 right-4 flex items-center justify-center">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            </div>
          )}
          <>
            <FilterSection
              title="Collection Line"
              options={options.collectionLines}
              selected={localFilters.collectionLine}
              onSelect={(val) => setLocalFilters({ ...localFilters, collectionLine: val })}
            />
            
            <FilterSection
              title="Item Type"
              options={options.itemTypes}
              selected={localFilters.itemType}
              onSelect={(val) => setLocalFilters({ ...localFilters, itemType: val })}
            />
            
            <FilterSection
              title="Purity"
              options={options.metalPurities}
              selected={localFilters.metalPurity}
              onSelect={(val) => setLocalFilters({ ...localFilters, metalPurity: val })}
            />
            
            <FilterSection
              title="Metal Color"
              options={options.metalTypes}
              selected={localFilters.metalType}
              onSelect={(val) => setLocalFilters({ ...localFilters, metalType: val })}
            />
          </>
        </div>

        <SheetFooter className="p-4 border-t flex items-center justify-between gap-3 flex-row sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="flex-1 text-xs h-9 bg-background"
            onClick={() => {
              const reset = { itemType: "", collectionLine: "", metalPurity: "", metalType: "" };
              setLocalFilters(reset);
              onResetFilters();
              onClose();
            }}
          >
            RESET
          </Button>
          <Button
            type="button"
            className="flex-1 text-xs h-9"
            onClick={handleApply}
          >
            APPLY
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
