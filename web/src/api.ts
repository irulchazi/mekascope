import type { BikeStage } from './data'

export type Annotation = { label: string; description?: string; box: [number, number, number, number] }
export type Scan = { recognized: boolean; equipment: string; component: string | null; model: string | null; confidence: number; summary: string; annotations: Annotation[] }
export type Investigation = {
  summary: string
  sources: { label: string; status: 'provided' | 'inferred' | 'missing'; detail: string }[]
  evidence: { text: string; source: 'photo' | 'user' | 'sample' | 'inference' }[]
  hypotheses: { name: string; confidence: number; reasoning: string }[]
  checks: { title: string; instruction: string }[]
}
export type Verification = { conclusion: 'supported' | 'inconclusive'; diagnosis: string; confidence: number; severity: 'low' | 'medium' | 'high' | 'unknown'; summary: string; action: string; verification: string; expected: string }
export type Step = { id: string; title: string; instruction: string; completed: boolean; observation: string; image_url: string | null }
export type BoardStatus = 'todo' | 'in_progress' | 'done'
export type ServiceTask = { id: number; created_at: string; status: 'open' | 'resolved'; board_status: BoardStatus; recommendation: Verification; resolved_at: string | null; outcome_notes: string | null }
export type MaintenanceTask = ServiceTask & { case_id: string; equipment: string; component: string | null; symptom: string }
export type Case = {
  id: string; created_at: string; symptom: string; context: Record<string, string>; image_url: string
  available_stages: BikeStage[]; scan: Scan | null; investigation: Investigation | null; verification: Verification | null
  steps: Step[]; operation: string | null; operation_expires_at: string | null; last_error: string | null; task: ServiceTask | null
}
export type Pump = { id: string; name: string; location: string; image: string; component: string; symptom: string; diagnosis: string; confidence: number; severity: string; action: string; inventory: string; duration: string }
export type Catalog = { bicycle: { id: string; image: string; symptom: string; context: Record<string, string> }; pump: Pump }

const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')
export const imageUrl = (path: string) => path.startsWith('/api/v1/') ? base + path.slice('/api/v1'.length) : path

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

async function request<T>(path: string, init: RequestInit = {}, read: (response: Response) => Promise<T> = response => response.json()): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  init.signal?.addEventListener('abort', abort, { once: true })
  if (init.signal?.aborted) controller.abort()
  const timeout = window.setTimeout(() => controller.abort(), 90_000)
  try {
    const response = await fetch(base + path, { ...init, signal: controller.signal })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const detail = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail)
        ? body.detail.map((item: { msg: string }) => item.msg).join('; ') : 'Request failed. Please retry.'
      throw new ApiError(detail, response.status)
    }
    return await read(response)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(error instanceof DOMException && error.name === 'AbortError'
      ? 'The request timed out. Refresh the case before retrying.' : 'Cannot reach the API. Check the backend connection and retry.', 0)
  } finally { window.clearTimeout(timeout); init.signal?.removeEventListener('abort', abort) }
}

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
export const api = {
  tasks: (signal?: AbortSignal) => request<MaintenanceTask[]>('/tasks', { signal }),
  moveTask: (id: number, status: BoardStatus, notes = '') => request<MaintenanceTask>(`/tasks/${id}/status`, { ...json({ status, notes }), method: 'PUT' }),
  previewImage: (file: File, signal: AbortSignal) => {
    const body = new FormData()
    body.set('image', file)
    return request<Blob>('/images/preview', { method: 'POST', body, signal }, response => response.blob())
  },
  catalog: () => request<Catalog>('/catalog'),
  getCase: (id: string) => request<Case>(`/cases/${id}`),
  createCase: (body: FormData) => request<Case>('/cases', { method: 'POST', body }),
  analyze: (id: string, operation: 'scan' | 'investigate' | 'verify') => request<Case>(`/cases/${id}/${operation}`, { method: 'POST' }),
  saveStep: (id: string, step: string, body: FormData) => request<Case>(`/cases/${id}/verification-steps/${step}`, { method: 'PUT', body }),
  approve: (id: string) => request<Case>(`/cases/${id}/tasks`, json({ approved: true })),
  resolve: (id: number, notes: string) => request<Case>(`/tasks/${id}/resolve`, json({ notes })),
}
