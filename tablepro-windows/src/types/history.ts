export interface HistoryEntry {
  id: number;
  query: string;
  database: string;
  connection_name: string;
  execution_time_ms: number;
  row_count: number;
  timestamp: string;
  status: string;
}
