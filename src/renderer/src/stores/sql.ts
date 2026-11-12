import { create } from 'zustand'
import type { SqlApproval, SqlConnection, SqlResult } from '@shared/types'

interface SqlState {
  connections: SqlConnection[]
  /** Sohbet başına bekleyen onaylar */
  approvals: Record<string, SqlApproval[]>
  /** Sohbet başına Atlas'ın çalıştırdığı son sorgu ve sonucu */
  last: Record<string, { sql: string; result: SqlResult }>
  /** Veritabanı paneli açık mı */
  paneOpen: boolean
  load(): Promise<void>
  respond(approval: SqlApproval, approved: boolean): Promise<void>
  setPane(open: boolean): void
}

export const useSql = create<SqlState>((set) => ({
  connections: [],
  approvals: {},
  last: {},
  paneOpen: false,

  async load() {
    set({ connections: await window.api.sql.list() })
  },

  async respond(approval, approved) {
    set((s) => ({
      approvals: { ...s.approvals, [approval.conversationId]: (s.approvals[approval.conversationId] ?? []).filter((a) => a.id !== approval.id) }
    }))
    await window.api.sql.respond(approval.id, approved)
  },

  setPane(open) {
    set({ paneOpen: open })
  }
}))

let subscribed = false
/** Ana süreçten gelen onay isteklerini ve sorgu sonuçlarını dinlemeye başlar; bir kez çağrılır. */
export function subscribeSql(): void {
  if (subscribed) return
  subscribed = true
  window.api.sql.onApproval((approval) =>
    useSql.setState((s) => ({
      approvals: { ...s.approvals, [approval.conversationId]: [...(s.approvals[approval.conversationId] ?? []), approval] }
    }))
  )
  window.api.sql.onResult(({ conversationId, sql, result }) =>
    // Yalnızca satır döndüren sorgular panelde gösterilir.
    useSql.setState((s) => (result.columns.length > 0 ? { last: { ...s.last, [conversationId]: { sql, result } } } : s))
  )
}
