// @vitest-environment jsdom
/**
 * M8 — SCR-08 card anatomy (design-spec 5.16, 2.3): engine icon, name,
 * status, environment badge, meta line; the context menu's Delete item
 * is danger-ghost (it only opens a confirm), never the filled danger
 * variant (AUDIT M5).
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import '../../i18n';
import { ConnectionCard } from './connection-card';
import type { SavedConnection } from '../../types/connection';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const conn: SavedConnection = {
  id: '1',
  name: 'Prod Postgres',
  tag: 'production',
  config: {
    host: 'db.example.com',
    port: 5432,
    user: 'admin',
    password: '',
    database: 'appdb',
    dbType: 'postgres',
    sslMode: 'disable',
    sshEnabled: false,
    sshHost: '',
    sshPort: 22,
    sshUser: '',
    sshAuthMethod: 'password',
    sshPassword: '',
    sshKeyPath: '',
    sshKeyPassphrase: '',
  },
};

const noop = () => {};

describe('connection card anatomy', () => {
  it('renders engine icon, name, status, environment badge, and a meta line', () => {
    const html = renderToStaticMarkup(
      createElement(ConnectionCard, {
        conn,
        connectingId: null,
        status: 'connected',
        onConnect: noop,
        onEdit: noop,
        onDelete: noop,
      }),
    );

    expect(html).toContain('Prod Postgres');
    expect(html).toContain('aria-label="Connected"');
    expect(html).toContain('PROD');
    expect(html).toContain('db.example.com:5432');
    expect(html).toContain('appdb');
    // Engine icon: an svg renders for the card's identity glyph.
    expect(html).toContain('<svg');
  });

  it("the Delete menu item is danger-ghost, not the filled danger variant", () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    act(() => {
      root.render(
        createElement(ConnectionCard, {
          conn,
          connectingId: null,
          status: 'connected',
          onConnect: noop,
          onEdit: noop,
          onDelete: noop,
        }),
      );
    });

    const card = container.querySelector('[role="button"]') as HTMLElement;
    act(() => {
      card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    });

    const deleteItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent?.includes('Delete'),
    ) as HTMLElement;
    expect(deleteItem).toBeDefined();
    expect(deleteItem.className).toContain('text-accent-red');
    expect(deleteItem.className).toContain('hover:bg-accent-red-subtle');
    // Danger-ghost is text-only: never the filled bg-accent-red-fill.
    expect(deleteItem.className).not.toContain('bg-accent-red-fill');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
