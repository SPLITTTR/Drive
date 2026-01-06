'use client';

import { useEffect, useState } from 'react';
import { useAuthedFetch, ItemDto } from './api';

type Tab = 'MY_DRIVE' | 'SHARED';
type Crumb = { id: string | null; name: string };

export default function Drive() {
  const authedFetch = useAuthedFetch();

  const [tab, setTab] = useState<Tab>('MY_DRIVE');
  const [path, setPath] = useState<Crumb[]>([{ id: null, name: 'Root' }]);
  const cwd = path[path.length - 1].id; // null = root
  const [items, setItems] = useState<ItemDto[]>([]);
  const [sharedRoots, setSharedRoots] = useState<ItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [myClerkId, setMyClerkId] = useState<string | null>(null);

  const [newFolderName, setNewFolderName] = useState('New folder');

  async function loadMyDrive(folderId: string | null) {
    setLoading(true);
    try {
      const data = folderId
        ? await authedFetch(`/v1/folders/${folderId}/children`)
        : await authedFetch('/v1/root/children');
      setItems((data as ItemDto[]) || []);
    } finally {
      setLoading(false);
    }
  }

  async function loadShared() {
    const data = await authedFetch('/v1/shared');
    setSharedRoots((data as ItemDto[]) || []);
  }

  async function loadMe() {
    const data = (await authedFetch('/v1/me')) as { userId: string; clerkUserId: string };
    setMyClerkId(data?.clerkUserId || null);
  }

  useEffect(() => {
    if (tab === 'MY_DRIVE') loadMyDrive(cwd).catch(err => alert(String(err)));
  }, [tab, cwd]);

  useEffect(() => {
    loadShared().catch(() => {});
    loadMe().catch(() => {});
  }, []);

  async function createFolder() {
    await authedFetch('/v1/folders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parentId: cwd, name: newFolderName }),
    });
    await loadMyDrive(cwd);
  }

  async function deleteItem(id: string) {
    await authedFetch(`/v1/items/${id}`, { method: 'DELETE' });
    await loadMyDrive(cwd);
    await loadShared();
  }

  async function renameItem(id: string) {
    const name = prompt('New name?');
    if (!name) return;
    await authedFetch(`/v1/items/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    await loadMyDrive(cwd);
    await loadShared();
  }

  async function shareRoot(id: string) {
    const target = prompt('Target Clerk user id (e.g. user_...)?');
    if (!target) return;
    const role = (prompt('Role: VIEWER or EDITOR?', 'VIEWER') || 'VIEWER').toUpperCase();
    await authedFetch(`/v1/items/${id}/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetClerkUserId: target, role }),
    });
    alert('Shared.');
  }

  // async function uploadFile(file: File) {
  //   const fd = new FormData();
  //   if (cwd) fd.set('parentId', cwd);
  //   fd.set('file', file);

  //   await authedFetch('/v1/files/upload', { method: 'POST', body: fd });
  //   await loadMyDrive(cwd);
  // }

  type PresignUploadResponse = {
    item: ItemDto;
    uploadUrl: string;
    method: string;
    contentType: string;
  };

  async function uploadFile(file: File) {
    const presign = (await authedFetch('/v1/files/presign-upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parentId: cwd,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      }),
    })) as PresignUploadResponse;

    const putRes = await fetch(presign.uploadUrl, {
      method: presign.method || 'PUT',
      headers: { 'Content-Type': presign.contentType || file.type || 'application/octet-stream' },
      body: file,
    });

    if (!putRes.ok) throw new Error(`Upload to storage failed (${putRes.status})`);

    await loadMyDrive(cwd);
  }


  function goRoot() {
  setTab('MY_DRIVE');
  setPath([{ id: null, name: 'Root' }]);
  }

  function goBack() {
    setPath((p) => (p.length > 1 ? p.slice(0, -1) : p));
  }

  function jumpTo(index: number) {
    setPath((p) => p.slice(0, index + 1));
  }


  function openFolder(it: ItemDto) {
    if (it.type !== 'FOLDER') return;

    if (tab !== 'MY_DRIVE') {
      // coming from Shared tab: start a fresh breadcrumb
      setTab('MY_DRIVE');
      setPath([{ id: null, name: 'Root' }, { id: it.id, name: it.name }]);
      return;
    }

    // normal navigation inside My Drive
    setPath((p) => [...p, { id: it.id, name: it.name }]);
  }



  // function goBack() {
  // setCwdHistory((h) => {
  //   if (h.length === 0) return h;
  //   const prev = h[h.length - 1];
  //   setCwd(prev);
  //   return h.slice(0, -1);
  //   });
  // }

  async function downloadFile(it: ItemDto) {
  // Download via authenticated fetch (so the backend can stay protected).
  const res = (await authedFetch(`/v1/files/${it.id}/download`)) as Response;

  const blob = await res.blob();

  const cd = res.headers.get('content-disposition') || '';
  const match = /filename="([^"]+)"/.exec(cd);
  const filename = match?.[1] || it.name || 'file';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setTab('MY_DRIVE')} disabled={tab === 'MY_DRIVE'}>My Drive</button>
        <button onClick={() => setTab('SHARED')} disabled={tab === 'SHARED'}>Shared with me</button>
        <span style={{ opacity: 0.75 }}>
          Your Clerk user id: <code>{myClerkId ?? '...'}</code>
        </span>
      </div>

      {tab === 'MY_DRIVE' && (
        <>
          <div style={{ display: 'grid', gap: 8 }}>
            <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {path.map((c, idx) => {
                const isLast = idx === path.length - 1;
                return (
                  <span key={String(c.id) + idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {isLast ? (
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                    ) : (
                      <button type="button" onClick={() => jumpTo(idx)}>{c.name}</button>
                    )}
                    {!isLast && <span>/</span>}
                  </span>
                );
              })}
            </nav>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={goBack} disabled={path.length <= 1}>Back</button>
              {/* <button onClick={goRoot} disabled={cwd === null}>Root</button> */}

              <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} style={{ padding: 6, minWidth: 220 }} />
              <button onClick={createFolder}>Create folder</button>

              <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <span>Upload:</span>
                <input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f).catch(err => alert(String(err))); }} />
              </label>

              {loading && <span>Loading…</span>}
            </div>
          </div>

          <ItemTable items={items} onOpenFolder={openFolder} onDelete={deleteItem} onRename={renameItem} onShare={shareRoot} onDownload={downloadFile} />
        </>
      )}

      {tab === 'SHARED' && (
        <>
          <p style={{ margin: 0 }}>
            In this MVP, only <b>root items</b> can be shared (“shared roots only”).
          </p>
          <ItemTable items={sharedRoots} onOpenFolder={openFolder} onDelete={deleteItem} onRename={renameItem} onShare={() => alert('Only owners can share in this MVP')} onDownload={downloadFile} />
        </>
      )}
    </div>
  );
}

function ItemTable({
  items,
  onOpenFolder,
  onDelete,
  onRename,
  onShare,
  onDownload,
}: {
  items: ItemDto[];
  onOpenFolder: (it: ItemDto) => void;
  onDelete: (id: string) => void;
  onRename: (id: string) => void;
  onShare: (id: string) => void;
  onDownload: (it: ItemDto) => void;
}) {
  if (!items.length) return <div style={{ opacity: 0.7 }}>No items.</div>;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th align="left">Name</th>
          <th align="left">Type</th>
          <th align="left">Size</th>
          <th align="left">Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <tr key={it.id} style={{ borderTop: '1px solid #ddd' }}>
            <td style={{ padding: '8px 0' }}>
              {it.type === 'FOLDER' ? (
                <button onClick={() => onOpenFolder(it)} style={{ textAlign: 'left' }}>{it.name}</button>
              ) : (
                <span>{it.name}</span>
              )}
            </td>
            <td>{it.type}</td>
            <td>{it.type === 'FILE' ? (it.sizeBytes ?? 0) : ''}</td>
            <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {it.type === 'FILE' && <button onClick={() => onDownload(it)}>Download</button>}
              <button onClick={() => onRename(it.id)}>Rename</button>
              <button onClick={() => onShare(it.id)}>Share</button>
              <button onClick={() => onDelete(it.id)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
