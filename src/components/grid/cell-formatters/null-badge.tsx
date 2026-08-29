import React from 'react';
import { DEFAULT_SETTINGS } from '../../../types/settings';

/** Falls back to the default literal so a blank setting never renders an
 *  empty NULL cell, which would be indistinguishable from an empty string. */
export function NullBadge({ text }: { text: string }) {
  return (
    <span className="font-mono text-ui-xs italic text-grid-null-fg select-none">
      {text || DEFAULT_SETTINGS.nullDisplay}
    </span>
  );
}
