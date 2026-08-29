/**
 * Phase 10 — every remaining hand-rolled `fixed inset-0` overlay uses the
 * phase 2 kit (`Dialog` or `Popover`) instead of its own bespoke modal
 * shell. `role="dialog"` alone is vacuous as a check (only 3 files carried
 * it at HEAD before this phase), so this enumerates by the actual overlay
 * marker and checks for the kit import, with a reasoned allow-list for the
 * two shapes that genuinely do not fit Dialog's title/body/footer contract.
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('../components/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const ALLOWED: Array<{ file: string; reason: string }> = [
  {
    file: '../components/onboarding/onboarding-dialog.tsx',
    reason: 'multi-step wizard — each step (WelcomeStep, AddConnectionStep, QuickStartStep) owns its own <h1> and primary CTA; wrapping in Dialog would either duplicate the h1 per screen (violates 5.16 one-h1-per-modal) or require restructuring three sibling step components beyond this adoption pass',
  },
  {
    file: '../components/palette/palette.tsx',
    reason: 'design-spec 5.16 "Is the palette modal?" ruling: modal (role="dialog" aria-modal="true") but deliberately scrimless and without Dialog\'s title/footer chrome — a dense utility, not a bordered dialog shell',
  },
];

describe('canonical-adoption: fixed inset-0 overlays use the kit', () => {
  it('every fixed inset-0 overlay imports Dialog or Popover, or is explicitly allow-listed', () => {
    const allowedSet = new Set(ALLOWED.map((a) => a.file));
    const offenders: string[] = [];

    for (const [path, text] of Object.entries(SOURCES)) {
      if (path.includes('__tests__') || path.includes('.test.')) continue;
      if (path.endsWith('/ui/dialog.tsx')) continue; // the canonical source itself
      if (!text.includes('fixed inset-0')) continue;
      if (allowedSet.has(path)) continue;

      const importsKit = /from ["'].*\/ui["']/.test(text) && /\b(Dialog|Popover)\b/.test(text);
      if (!importsKit) offenders.push(path);
    }

    expect(offenders).toEqual([]);
  });

  it('the allow-list has at most two entries, each still matching real source', () => {
    expect(ALLOWED.length).toBeLessThanOrEqual(2);
    for (const entry of ALLOWED) {
      const text = SOURCES[entry.file];
      expect(text, `${entry.file} not found`).toBeDefined();
      expect(text, `${entry.file} no longer contains fixed inset-0 — remove this stale allow-list entry`).toContain('fixed inset-0');
    }
  });
});
