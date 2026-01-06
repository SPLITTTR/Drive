'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthedFetch, ItemDto } from './api';

type Tab = 'MY_DRIVE' | 'SHARED';
type ViewMode = 'GRID' | 'LIST';
type Crumb = { id: string | null; name: string };

type ThumbMap = Record<string, string>; // itemId -> objectURL

function isImage(it: ItemDto): boolean {
  return it.type === 'FILE' && !!it.mimeType && it.mimeType.startsWith('image/');
}

export default function Drive() {
  const authedFetch = useAuthedFetch();

  const [tab, setTab] = useState<Tab>('MY_DRIVE');
  const [viewMode, setViewMode] = useState<ViewMode>('GRID');
  const [path, setPath] = useState<Crumb[]>([{ id: null, name: 'Root' }]);
  const cwd = path[path.length - 1].id; // null = root

  const [items, setItems] = useState<ItemDto[]>([]);
  const [sharedRoots, setSharedRoots] = useState<ItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [myClerkId, setMyClerkId] = useState<string | null>(null);

  const [newFolderName, setNewFolderName] = useState('New folder');

  // Image preview + thumbnails
  const [thumbUrlById, setThumbUrlById] = useState<ThumbMap>({});
  const [previewId, setPreviewId] = useState<string | null>(null);

  const thumbsRef = useRef<ThumbMap>({});
  useEffect(() => {
    thumbsRef.current = thumbUrlById;
  }, [thumbUrlById]);

  const previewItem = useMemo(() => {
    if (!previewId) return null;
    const src = tab === 'MY_DRIVE' ? items : sharedRoots;
    return src.find(i => i.id === previewId) || null;
  }, [previewId, tab, items, sharedRoots]);

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

  // Build thumbnails for images in current view.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const current = (tab === 'MY_DRIVE' ? items : sharedRoots).filter(isImage);
      const currentIds = new Set(current.map(i => i.id));

      // Revoke thumbnails for images that are no longer visible.
      setThumbUrlById(prev => {
        const next: ThumbMap = {};
        for (const [id, url] of Object.entries(prev)) {
          if (currentIds.has(id)) {
            next[id] = url;
          } else {
            try { URL.revokeObjectURL(url); } catch {}
          }
        }
        return next;
      });

      // Fetch missing thumbnails (limited concurrency).
      const missing = current.filter(i => !thumbsRef.current[i.id]);
      if (!missing.length) return;

      const queue = [...missing];
      const concurrency = 4;

      async function worker() {
        while (queue.length && !cancelled) {
          const it = queue.shift();
          if (!it) break;
          try {
            const res = (await authedFetch(`/v1/files/${it.id}/download`)) as Response;
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            if (cancelled) {
              try { URL.revokeObjectURL(url); } catch {}
              return;
            }
            setThumbUrlById(prev => {
              const prevUrl = prev[it.id];
              if (prevUrl) {
                try { URL.revokeObjectURL(prevUrl); } catch {}
              }
              return { ...prev, [it.id]: url };
            });
          } catch {
            // ignore per-item errors
          }
        }
      }

      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    }

    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, items, sharedRoots]);
  // Cleanup all thumbnails on unmount.
  useEffect(() => {
    return () => {
      for (const url of Object.values(thumbsRef.current)) {
        try { URL.revokeObjectURL(url); } catch {}
      }
    };
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
    // keep breadcrumb consistent if user renames a folder in the current path
    setPath(p => p.map(c => (c.id === id ? { ...c, name } : c)));

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

  const currentList = tab === 'MY_DRIVE' ? items : sharedRoots;

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

              <span style={{ marginLeft: 8, opacity: 0.8 }}>View:</span>
              <button onClick={() => setViewMode('GRID')} disabled={viewMode === 'GRID'}>Grid</button>
              <button onClick={() => setViewMode('LIST')} disabled={viewMode === 'LIST'}>List</button>

              <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} style={{ padding: 6, minWidth: 220 }} />
              <button onClick={createFolder}>Create folder</button>

              <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <span>Upload:</span>
                <input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f).catch(err => alert(String(err))); }} />
              </label>

              {loading && <span>Loading…</span>}
            </div>
          </div>

          {viewMode === 'GRID' ? (
            <ItemGrid
              items={items}
              thumbUrlById={thumbUrlById}
              onOpenFolder={openFolder}
              onPreview={(it) => setPreviewId(it.id)}
              onDownload={downloadFile}
              onRename={renameItem}
              onShare={shareRoot}
              onDelete={deleteItem}
            />
          ) : (
            <ItemTable
              items={items}
              onOpenFolder={openFolder}
              onDelete={deleteItem}
              onRename={renameItem}
              onShare={shareRoot}
              onDownload={downloadFile}
            />
          )}
        </>
      )}

      {tab === 'SHARED' && (
        <>
          <p style={{ margin: 0 }}>
            In this MVP, only <b>root items</b> can be shared (“shared roots only”).
          </p>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ opacity: 0.8 }}>View:</span>
            <button onClick={() => setViewMode('GRID')} disabled={viewMode === 'GRID'}>Grid</button>
            <button onClick={() => setViewMode('LIST')} disabled={viewMode === 'LIST'}>List</button>
          </div>

          {viewMode === 'GRID' ? (
            <ItemGrid
              items={sharedRoots}
              thumbUrlById={thumbUrlById}
              onOpenFolder={openFolder}
              onPreview={(it) => setPreviewId(it.id)}
              onDownload={downloadFile}
              onRename={renameItem}
              onShare={() => alert('Only owners can share in this MVP')}
              onDelete={deleteItem}
            />
          ) : (
            <ItemTable
              items={sharedRoots}
              onOpenFolder={openFolder}
              onDelete={deleteItem}
              onRename={renameItem}
              onShare={() => alert('Only owners can share in this MVP')}
              onDownload={downloadFile}
            />
          )}
        </>
      )}

      {previewId && (
        <ImagePreview
          title={previewItem?.name || 'Preview'}
          url={thumbUrlById[previewId]}
          onClose={() => setPreviewId(null)}
          onDownload={() => {
            if (previewItem) downloadFile(previewItem).catch(err => alert(String(err)));
          }}
        />
      )}
    </div>
  );
}

function ItemGrid({
  items,
  thumbUrlById,
  onOpenFolder,
  onPreview,
  onDownload,
  onRename,
  onShare,
  onDelete,
}: {
  items: ItemDto[];
  thumbUrlById: ThumbMap;
  onOpenFolder: (it: ItemDto) => void;
  onPreview: (it: ItemDto) => void;
  onDownload: (it: ItemDto) => void;
  onRename: (id: string) => void;
  onShare: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!items.length) return <div style={{ opacity: 0.7 }}>No items.</div>;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: 12,
    }}>
      {items.map((it) => {
        const img = it.type === 'FILE' && !!it.mimeType && it.mimeType.startsWith('image/');
        const thumb = img ? thumbUrlById[it.id] : undefined;

        return (
          <div
            key={it.id}
            style={{
              border: '1px solid #ddd',
              borderRadius: 10,
              padding: 10,
              display: 'grid',
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (it.type === 'FOLDER') onOpenFolder(it);
                else if (img) onPreview(it);
              }}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: it.type === 'FOLDER' || img ? 'pointer' : 'default',
                textAlign: 'left',
              }}
              title={it.type === 'FOLDER' ? 'Open folder' : img ? 'Preview image' : it.name}
            >
              <div style={{
                height: 120,
                borderRadius: 8,
                border: '1px solid #eee',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                background: '#fafafa',
              }}>
                {it.type === 'FOLDER' ? (
                  <div style={{ fontSize: 42, opacity: 0.85 }}>📁</div>
                ) : img ? (
                  thumb ? (
                    <img src={thumb} alt={it.name} style={{ maxWidth: '100%', maxHeight: '100%' }} />
                  ) : (
                    <div style={{ opacity: 0.7 }}>Loading…</div>
                  )
                ) : (
                  <div style={{ fontSize: 42, opacity: 0.65 }}>📄</div>
                )}
              </div>
              <div style={{ fontSize: 13, wordBreak: 'break-word' }}>{it.name}</div>
            </button>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {it.type === 'FILE' && img && <button onClick={() => onPreview(it)}>Preview</button>}
              {it.type === 'FILE' && <button onClick={() => onDownload(it)}>Download</button>}
              <button onClick={() => onRename(it.id)}>Rename</button>
              <button onClick={() => onShare(it.id)}>Share</button>
              <button onClick={() => onDelete(it.id)}>Delete</button>
            </div>
          </div>
        );
      })}
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

function ImagePreview({
  title,
  url,
  onClose,
  onDownload,
}: {
  title: string;
  url?: string;
  onClose: () => void;
  onDownload: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1000px, 95vw)',
          maxHeight: '95vh',
          background: 'white',
          borderRadius: 12,
          overflow: 'hidden',
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: 10, borderBottom: '1px solid #eee' }}>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onDownload}>Download</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>

        <div style={{ padding: 12, display: 'grid', placeItems: 'center' }}>
          {url ? (
            <img src={url} alt={title} style={{ maxWidth: '100%', maxHeight: 'calc(95vh - 80px)' }} />
          ) : (
            <div style={{ opacity: 0.8 }}>Loading…</div>
          )}
        </div>
      </div>
    </div>
  );
}
