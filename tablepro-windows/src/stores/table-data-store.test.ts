import { describe, it, expect, beforeEach } from "vitest";
import { useTableDataStore, DEFAULT_TAB_DATA } from "./table-data-store";

describe("useTableDataStore", () => {
  beforeEach(() => {
    useTableDataStore.getState().clearAll();
  });

  it("should initialize with empty tabs state", () => {
    expect(useTableDataStore.getState().tabs).toEqual({});
  });

  it("should return DEFAULT_TAB_DATA when tab does not exist", () => {
    const tabData = useTableDataStore.getState().getTabData("non-existent");
    expect(tabData).toEqual(DEFAULT_TAB_DATA);
  });

  it("should correctly set and get tab data", () => {
    const tabId = "tab-1";
    useTableDataStore.getState().setTabData(tabId, {
      tableName: "users",
      page: 2,
      fetchedKey: "some-key",
    });

    const tabData = useTableDataStore.getState().getTabData(tabId);
    expect(tabData.tableName).toBe("users");
    expect(tabData.page).toBe(2);
    expect(tabData.fetchedKey).toBe("some-key");
    expect(tabData.pageSize).toBe(100); // from default
  });

  it("should reset tab data when resetTabData is called", () => {
    const tabId = "tab-1";
    useTableDataStore.getState().setTabData(tabId, { tableName: "users" });
    useTableDataStore.getState().resetTabData(tabId);

    expect(useTableDataStore.getState().tabs[tabId]).toBeUndefined();
    expect(useTableDataStore.getState().getTabData(tabId)).toEqual(DEFAULT_TAB_DATA);
  });

  it("should clear all tabs when clearAll is called", () => {
    useTableDataStore.getState().setTabData("tab-1", { tableName: "users" });
    useTableDataStore.getState().setTabData("tab-2", { tableName: "orders" });
    useTableDataStore.getState().clearAll();

    expect(useTableDataStore.getState().tabs).toEqual({});
  });
});
