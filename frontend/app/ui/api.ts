import { useAuth } from '@clerk/nextjs';

export type ItemType = 'FOLDER' | 'FILE';

export interface ItemDto {
  id: string;
  parentId: string | null;
  type: ItemType;
  name: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt: string;
  updatedAt: string;
}

function apiBase(): string {
  const v = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!v) throw new Error('Missing NEXT_PUBLIC_API_BASE_URL in .env.local');
  return v;
}

/**
 * Clerk recommends using getToken() and sending it as Bearer for cross-origin requests.
 */
export function useAuthedFetch() {
  const { getToken } = useAuth();

  return async function authedFetch(path: string, init?: RequestInit) {
    const token = await getToken();
    if (!token) throw new Error('No session token (are you signed in?)');

    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${apiBase()}${path}`, { ...init, headers });

    if (!res.ok) {
      // Best-effort: surface backend error message (e.g. { error: "User not found" })
      let msg = `API ${res.status}`;
      try {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const j: any = await res.json();
          msg = j?.error || j?.message || msg;
        } else {
          const t = await res.text();
          if (t) msg = t;
        }
      } catch {}
      throw new Error(msg);
    }
if (res.status === 204) return null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res;
  };
}
