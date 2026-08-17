/**
 * Web worker for client-side filtering of query result rows.
 * Receives rows once via 'set-rows', then filters on 'filter' messages.
 */

interface SetRowsRequest {
  type: "set-rows";
  rows: (string | null)[][];
}

interface FilterRequest {
  type: "filter";
  term: string;
}

interface FilterResponse {
  type: "filter-result";
  indices: number[];
}

type WorkerMessage = SetRowsRequest | FilterRequest;

let cachedRows: (string | null)[][] = [];

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  if (msg.type === "set-rows") {
    cachedRows = msg.rows;
    return;
  }

  if (msg.type !== "filter") return;

  const { term } = msg;
  if (!term.trim()) {
    const all = Array.from({ length: cachedRows.length }, (_, i) => i);
    const response: FilterResponse = { type: "filter-result", indices: all };
    self.postMessage(response);
    return;
  }

  const lowerTerm = term.toLowerCase();
  const indices: number[] = [];

  for (let i = 0; i < cachedRows.length; i++) {
    const row = cachedRows[i];
    for (let j = 0; j < row.length; j++) {
      const cell = row[j];
      if (cell !== null && cell.toLowerCase().includes(lowerTerm)) {
        indices.push(i);
        break;
      }
    }
  }

  const response: FilterResponse = { type: "filter-result", indices };
  self.postMessage(response);
};
