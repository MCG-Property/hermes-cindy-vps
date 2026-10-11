/**
 * IDE — one coding interface for Cursor, Claude Code, OpenCode and Codex.
 *
 * A first-class `/ide` page + a sidebar nav row right under Kanban. Agent panels (each mirroring its product's UI) open from the
 * "+" menu and stay mounted while you switch; the Hermes chat stays docked across all of them and calls the agents as tools.
 * Everything runs through `ctx.rest` against the plugin's own router (`plugins/ide/dashboard/plugin_api.py`) on the connected box,
 * so it works the same on the local machine and every SSH-remote Hermes box.
 */

import './ide.css'

import {
  type HermesPlugin,
  host,
  PALETTE_AREA,
  type PaletteContribution,
  type RouteContribution,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  type SidebarNavContribution
} from '@hermes/plugin-sdk'

import { bindApi } from './api'
import { IdePage } from './ide-page'
import { bindStore } from './store'

const plugin: HermesPlugin = {
  id: 'ide',
  name: 'IDE',
  description: 'Unified coding interface: Cursor, Claude Code, OpenCode and Codex panels plus a persistent Hermes chat that calls them as tools.',
  defaultEnabled: true,
  register(ctx) {
    ctx.onDispose(bindApi(ctx.rest))
    ctx.onDispose(bindStore(ctx.storage))

    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: '/ide' } satisfies RouteContribution, render: () => <IdePage /> },
      // Directly under Kanban (order 50).
      { id: 'nav', area: SIDEBAR_NAV_AREA, order: 51, data: { codicon: 'code', label: 'IDE', path: '/ide' } satisfies SidebarNavContribution },
      {
        id: 'open',
        area: PALETTE_AREA,
        data: { id: 'ide.open', keywords: ['ide', 'code', 'cursor', 'claude', 'codex', 'opencode', 'agent'], label: 'Open IDE', run: () => host.navigate('/ide') } satisfies PaletteContribution
      }
    ])
  }
}

export default plugin
