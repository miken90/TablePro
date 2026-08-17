import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buildWhereClause } from '../components/filter/filter-types';
import type { FilterCondition, FilterLogic } from '../components/filter/filter-types';
import { parseFilterQuery } from '../utils/filter-parser';
import type { ParsedFilterCondition } from '../utils/filter-parser';

interface TabFilterState {
  conditions: FilterCondition[];
  logic: FilterLogic;
  appliedFilterClause: string;
  quickSearchTerm: string;
  quickSearchClause: string;
  /** Raw text from the quick filter bar */
  filterQuery: string;
  /** Parsed conditions from filterQuery */
  parsedConditions: ParsedFilterCondition[];
}

interface FilterState {
  byTab: Record<string, TabFilterState>;
  initializeTab: (tabId: string) => void;
  addCondition: (tabId: string) => void;
  updateCondition: (tabId: string, id: string, condition: FilterCondition) => void;
  removeCondition: (tabId: string, id: string) => void;
  setLogic: (tabId: string, logic: FilterLogic) => void;
  applyFilter: (tabId: string) => void;
  clearFilter: (tabId: string) => void;
  setQuickSearch: (tabId: string, term: string, clause: string) => void;
  clearQuickSearch: (tabId: string) => void;
  applyPreset: (tabId: string, conditions: FilterCondition[], logic: FilterLogic) => void;
  /** Quick filter bar actions */
  setFilterQuery: (tabId: string, query: string) => void;
  removeParsedCondition: (tabId: string, index: number) => void;
  clearFilters: (tabId: string) => void;
}

let nextId = 1;

function makeCondition(): FilterCondition {
  return {
    id: `${Date.now()}-${nextId++}`,
    column: '',
    operator: '=',
    value: '',
    enabled: true,
  };
}

function makeTabState(): TabFilterState {
  return {
    conditions: [makeCondition()],
    logic: 'AND',
    appliedFilterClause: '',
    quickSearchTerm: '',
    quickSearchClause: '',
    filterQuery: '',
    parsedConditions: [],
  };
}

function getTab(byTab: Record<string, TabFilterState>, tabId: string): TabFilterState {
  return byTab[tabId] ?? makeTabState();
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      byTab: {},

      initializeTab: (tabId) => {
        set((state) => {
          if (state.byTab[tabId]) return state;
          return {
            byTab: {
              ...state.byTab,
              [tabId]: makeTabState(),
            },
          };
        });
      },

      addCondition: (tabId) => {
        set((state) => {
          const tab = getTab(state.byTab, tabId);
          return {
            byTab: {
              ...state.byTab,
              [tabId]: { ...tab, conditions: [...tab.conditions, makeCondition()] },
            },
          };
        });
      },

      updateCondition: (tabId, id, condition) => {
        set((state) => {
          const tab = getTab(state.byTab, tabId);
          return {
            byTab: {
              ...state.byTab,
              [tabId]: {
                ...tab,
                conditions: tab.conditions.map((c) => (c.id === id ? condition : c)),
              },
            },
          };
        });
      },

      removeCondition: (tabId, id) => {
        set((state) => {
          const tab = getTab(state.byTab, tabId);
          const nextConditions = tab.conditions.filter((c) => c.id !== id);
          return {
            byTab: {
              ...state.byTab,
              [tabId]: {
                ...tab,
                conditions: nextConditions.length > 0 ? nextConditions : [makeCondition()],
              },
            },
          };
        });
      },

      setLogic: (tabId, logic) => {
        set((state) => {
          const tab = getTab(state.byTab, tabId);
          return {
            byTab: {
              ...state.byTab,
              [tabId]: { ...tab, logic },
            },
          };
        });
      },

      applyFilter: (tabId) => {
        set((state) => {
          const tab = getTab(state.byTab, tabId);
          return {
            byTab: {
              ...state.byTab,
              [tabId]: {
                ...tab,
                appliedFilterClause: buildWhereClause(tab.conditions, tab.logic),
              },
            },
          };
        });
      },

      clearFilter: (tabId) => {
        set((state) => {
          const tab = getTab(state.byTab, tabId);
          return {
            byTab: {
              ...state.byTab,
              [tabId]: {
                ...tab,
                conditions: [makeCondition()],
                logic: 'AND',
                appliedFilterClause: '',
              },
            },
          };
        });
      },

      setQuickSearch: (tabId, term, clause) => {
        set((state) => {
          const tab = getTab(state.byTab, tabId);
          return {
            byTab: {
              ...state.byTab,
              [tabId]: {
                ...tab,
                quickSearchTerm: term,
                quickSearchClause: clause,
              },
            },
          };
        });
      },

      clearQuickSearch: (tabId) => {
        set((state) => {
          const tab = getTab(state.byTab, tabId);
          return {
            byTab: {
              ...state.byTab,
              [tabId]: {
                ...tab,
                quickSearchTerm: '',
                quickSearchClause: '',
              },
            },
          };
        });
      },

      applyPreset: (tabId, conditions, logic) => {
        set((state) => {
          const tab = getTab(state.byTab, tabId);
          const nextConditions = conditions.length > 0 ? conditions : [makeCondition()];
          return {
            byTab: {
              ...state.byTab,
              [tabId]: {
                ...tab,
                conditions: nextConditions,
                logic,
                appliedFilterClause: buildWhereClause(nextConditions, logic),
              },
            },
          };
        });
      },

      setFilterQuery: (tabId, query) => {
        set((state) => {
          const tab = getTab(state.byTab, tabId);
          const parsedConditions = parseFilterQuery(query);
          return {
            byTab: {
              ...state.byTab,
              [tabId]: { ...tab, filterQuery: query, parsedConditions },
            },
          };
        });
      },

      removeParsedCondition: (tabId, index) => {
        set((state) => {
          const tab = getTab(state.byTab, tabId);
          const nextConditions = tab.parsedConditions.filter((_, i) => i !== index);
          // Rebuild the query string from remaining conditions
          const newQuery = nextConditions
            .map((c) => {
              if (!c.column) return c.value;
              const op = c.operator === '=' ? '' : c.operator;
              return `${c.column}:${op}${c.value}`;
            })
            .join(' AND ');
          return {
            byTab: {
              ...state.byTab,
              [tabId]: { ...tab, filterQuery: newQuery, parsedConditions: nextConditions },
            },
          };
        });
      },

      clearFilters: (tabId) => {
        set((state) => {
          const tab = getTab(state.byTab, tabId);
          return {
            byTab: {
              ...state.byTab,
              [tabId]: {
                ...tab,
                filterQuery: '',
                parsedConditions: [],
                quickSearchTerm: '',
                quickSearchClause: '',
              },
            },
          };
        });
      },
    }),
    {
      name: 'tablepro-filters',
      partialize: (state) => ({ byTab: state.byTab }),
    },
  ),
);
