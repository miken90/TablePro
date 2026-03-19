import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buildWhereClause } from '../components/filter/filter-types';
import type { FilterCondition, FilterLogic } from '../components/filter/filter-types';

interface TabFilterState {
  conditions: FilterCondition[];
  logic: FilterLogic;
  appliedFilterClause: string;
  quickSearchTerm: string;
  quickSearchClause: string;
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
    }),
    {
      name: 'tablepro-filters',
      partialize: (state) => ({ byTab: state.byTab }),
    },
  ),
);
