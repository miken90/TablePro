import { Channel, invoke } from '@tauri-apps/api/core';

export type SpikeChunk =
  | { kind: 'Meta'; total_estimate: number }
  | { kind: 'Rows'; idx: number; rows: string[][] }
  | { kind: 'Done'; rows_total: number; ms: number };

export async function runSpike(totalRows = 100_000, chunkSize = 1000) {
  const ch = new Channel<SpikeChunk>();
  const t0 = performance.now();
  let received = 0;
  let chunks = 0;
  ch.onmessage = (msg) => {
    if (msg.kind === 'Rows') {
      received += msg.rows.length;
      chunks++;
    } else if (msg.kind === 'Done') {
      const wall = performance.now() - t0;
      // eslint-disable-next-line no-console
      console.log(
        `[spike] rows=${received} chunks=${chunks} wallMs=${wall.toFixed(1)} rustMs=${msg.ms} rps=${(received / (wall / 1000)).toFixed(0)}`,
      );
    }
  };
  await invoke('spike_stream', { channel: ch, totalRows, chunkSize });
}
