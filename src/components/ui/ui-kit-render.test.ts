// @vitest-environment jsdom
/**
 * Static markup for the canonical component kit (design-spec 5.16).
 *
 * `renderToStaticMarkup` proves DOM shape and attributes; it runs no
 * effects, so focus/keyboard behaviour is covered separately in
 * `dialog-focus.test.ts`.
 */

import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { IconButton } from './icon-button';
import { Field } from './field';
import { Dialog } from './dialog';
import { Popover } from './popover';

describe('Button', () => {
  it('emits a different class set for danger vs danger-ghost', () => {
    const danger = renderToStaticMarkup(
      createElement(Button, { variant: 'danger', children: 'Drop' }),
    );
    const dangerGhost = renderToStaticMarkup(
      createElement(Button, { variant: 'danger-ghost', children: 'Delete' }),
    );

    // danger: FILLED — the control that commits the write.
    expect(danger).toContain('bg-accent-red-fill');
    expect(danger).not.toContain('bg-accent-red-subtle');
    // danger-ghost: text-only — stages/selects intent, writes nothing.
    expect(dangerGhost).toContain('text-accent-red');
    expect(dangerGhost).not.toContain('bg-accent-red-fill');
  });
});

describe('IconButton', () => {
  it('output contains the required aria-label', () => {
    const html = renderToStaticMarkup(
      createElement(IconButton, { icon: createElement('span'), 'aria-label': 'Refresh' }),
    );
    expect(html).toContain('aria-label="Refresh"');
  });
});

describe('Field', () => {
  it('markup has no outline-none', () => {
    const html = renderToStaticMarkup(
      createElement(Field, { children: createElement('input') }),
    );
    expect(html).not.toContain('outline-none');
  });
});

describe('Dialog', () => {
  it('emits role="dialog", aria-modal="true", and exactly one <h1>', () => {
    const html = renderToStaticMarkup(
      createElement(Dialog, {
        open: true,
        onClose: () => {},
        title: 'Confirm',
        children: createElement('p', null, 'Body'),
      }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
  });

  it('renders nothing while closed', () => {
    const html = renderToStaticMarkup(
      createElement(Dialog, {
        open: false,
        onClose: () => {},
        title: 'Confirm',
        children: createElement('p', null, 'Body'),
      }),
    );
    expect(html).toBe('');
  });
});

describe('Popover', () => {
  it('emits role="dialog" and no aria-modal', () => {
    const anchorRef = createRef<HTMLButtonElement>();
    const html = renderToStaticMarkup(
      createElement(Popover, {
        open: true,
        onClose: () => {},
        anchorRef,
        children: createElement('p', null, 'Content'),
      }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain('aria-modal');
  });
});
