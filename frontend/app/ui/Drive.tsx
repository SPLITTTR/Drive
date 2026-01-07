'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
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
  const { user, isLoaded, isSignedIn } = useUser();

  const [tab, setTab] = useState<Tab>('MY_DRIVE');
  const [viewMode, setViewMode] = useState<ViewMode>('GRID');
  // Separate navigation stacks so Back behaves correctly in My Drive vs Shared.
  const [myPath, setMyPath] = useState<Crumb[]>([{ id: null, name: 'Root' }]);
  const [sharedPath, setSharedPath] = useState<Crumb[]>([{ id: null, name: 'Shared' }]);

  const myCwd = myPath[myPath.length - 1].id; // null = My Drive root
  const sharedCwd = sharedPath[sharedPath.length - 1].id; // null = Shared root (list shared items)

  const [items, setItems] = useState<ItemDto[]>([]);
  const [sharedRoots, setSharedRoots] = useState<ItemDto[]>([]);
  const [sharedItems, setSharedItems] = useState<ItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [myClerkId, setMyClerkId] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string | null>(null);

  const [newFolderName, setNewFolderName] = useState('New folder');

  // Image preview + thumbnails
  const [thumbUrlById, setThumbUrlById] = useState<ThumbMap>({});
  const [previewId, setPreviewId] = useState<string | null>(null);

  const [pickedFileName, setPickedFileName] = useState<string>('No file chosen');

  // Search
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<ItemDto[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);



  const thumbsRef = useRef<ThumbMap>({});
  
  // Share dialog state (role picker + username input)
  const [shareOpen, setShareOpen] = useState(false);
  const [shareItemId, setShareItemId] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState('');
  const [shareRole, setShareRole] = useState<'VIEWER' | 'EDITOR'>('VIEWER');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

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

  async function loadSharedChildren(folderId: string) {
    setLoading(true);
    try {
      const data = await authedFetch(`/v1/folders/${folderId}/children`);
      setSharedItems((data as ItemDto[]) || []);
    } finally {
      setLoading(false);
    }
  }

  async function loadMe() {
    const data = (await authedFetch('/v1/me')) as { userId: string; clerkUserId: string; username?: string | null };
    setMyClerkId(data?.clerkUserId || null);

    if (data?.username) {
      setMyUsername(data.username);
      return;
    }

    const clerkUsername = user?.username;
    if (clerkUsername) {
      try {
        const updated = (await authedFetch('/v1/me/username', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: clerkUsername }),
        })) as { username?: string };
        setMyUsername(updated?.username || clerkUsername);
      } catch {
        // If username already taken in our DB (should not happen if Clerk enforces uniqueness), keep null.
        setMyUsername(null);
      }
    } else {
      setMyUsername(null);
    }
  }

  useEffect(() => {
    if (tab === 'MY_DRIVE') loadMyDrive(myCwd).catch(err => alert(String(err)));
  }, [tab, myCwd]);

  useEffect(() => {
    if (tab !== 'SHARED') return;
    if (sharedCwd === null) {
      loadShared().catch(() => {});
    } else {
      loadSharedChildren(sharedCwd).catch(err => alert(String(err)));
    }
  }, [tab, sharedCwd]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    loadMe().catch(() => {});
  }, [isLoaded, isSignedIn, user?.username]);

  // Build thumbnails for images in current view.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const currentList = searchQ.trim() ? searchResults : (tab === 'MY_DRIVE' ? items : (sharedCwd === null ? sharedRoots : sharedItems));
      const current = currentList.filter(isImage);
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
  }, [tab, items, sharedRoots, sharedItems, sharedCwd, searchQ, searchResults]);
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
      body: JSON.stringify({ parentId: myCwd, name: newFolderName }),
    });
    await loadMyDrive(myCwd);
  }

  
  async function runSearch(q: string) {
    const query = q.trim();
    if (!query) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    setSearchBusy(true);
    setSearchError(null);
    try {
      const cwd = tab === 'MY_DRIVE' ? myCwd : sharedCwd;
      const scope = tab === 'MY_DRIVE' ? 'MY_DRIVE' : 'SHARED';
      const url =
        cwd
          ? `/v1/search?q=${encodeURIComponent(query)}&limit=50&scope=${scope}&folderId=${encodeURIComponent(String(cwd))}`
          : `/v1/search?q=${encodeURIComponent(query)}&limit=50&scope=${scope}`;
      const res = (await authedFetch(url)) as ItemDto[];
      setSearchResults(Array.isArray(res) ? res : []);
    } catch (e: any) {
      setSearchResults([]);
      setSearchError(String(e?.message || e));
    } finally {
      setSearchBusy(false);
    }
  }

  // Debounced search
  useEffect(() => {
    const q = searchQ;
    const t = setTimeout(() => {
      runSearch(q).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ, tab, myCwd, sharedCwd]);

async function refreshCurrent() {
    if (searchQ.trim()) {
      await runSearch(searchQ);
      return;
    }

if (tab === 'MY_DRIVE') {
      await loadMyDrive(myCwd);
      return;
    }

    if (sharedCwd === null) {
      await loadShared();
    } else {
      await loadSharedChildren(sharedCwd);
    }
  }

  async function deleteItem(id: string) {
    await authedFetch(`/v1/items/${id}`, { method: 'DELETE' });
    await refreshCurrent();
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
    setMyPath(p => p.map(c => (c.id === id ? { ...c, name } : c)));
    setSharedPath(p => p.map(c => (c.id === id ? { ...c, name } : c)));

    await refreshCurrent();
  }

  async function shareItem(id: string) {
    setShareItemId(id);
    setShareTarget('');
    setShareRole('VIEWER');
    setShareError(null);
    setShareOpen(true);
  }


  async function submitShare() {
    if (!shareItemId) return;
    const target = shareTarget.trim();
    if (!target) return;

    // Prevent sharing to self (also enforced on backend)
    if (myUsername && target.toLowerCase() === myUsername.toLowerCase()) {
      setShareError('You can not share to yourself');
      return;
    }

    setShareBusy(true);
    setShareError(null);
    try {
      await authedFetch(`/v1/items/${shareItemId}/share`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUsername: target, role: shareRole }),
      });
      setShareOpen(false);
      setShareItemId(null);
      setShareTarget('');
      alert('Shared.');
    } catch (e: any) {
      setShareError(String(e?.message || e));
    } finally {
      setShareBusy(false);
    }
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
        parentId: myCwd,
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

    await loadMyDrive(myCwd);
  }

  function goRoot() {
    if (tab === 'MY_DRIVE') {
      setMyPath([{ id: null, name: 'Root' }]);
    } else {
      setSharedPath([{ id: null, name: 'Shared' }]);
    }
  }

  function goBack() {
    if (tab === 'MY_DRIVE') {
      setMyPath(p => (p.length > 1 ? p.slice(0, -1) : p));
    } else {
      setSharedPath(p => (p.length > 1 ? p.slice(0, -1) : p));
    }
  }

  function jumpTo(index: number) {
    if (tab === 'MY_DRIVE') {
      setMyPath(p => p.slice(0, index + 1));
    } else {
      setSharedPath(p => p.slice(0, index + 1));
    }
  }

  function openFolder(it: ItemDto) {
    if (it.type !== 'FOLDER') return;

    // If user opens an item from search results, exit search and navigate normally.
    if (searchQ.trim()) {
      setSearchQ('');
      setSearchResults([]);
      setSearchError(null);
    }

if (tab === 'MY_DRIVE') {
      setMyPath(p => [...p, { id: it.id, name: it.name }]);
    } else {
      setSharedPath(p => [...p, { id: it.id, name: it.name }]);
    }
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

  const activePath = tab === 'MY_DRIVE' ? myPath : sharedPath;
  const cwd = tab === 'MY_DRIVE' ? myCwd : sharedCwd;
  const currentList = searchQ.trim() ? searchResults : (tab === 'MY_DRIVE' ? items : (sharedCwd === null ? sharedRoots : sharedItems));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setTab('MY_DRIVE')} disabled={tab === 'MY_DRIVE'}>My Drive</button>
        <button onClick={() => setTab('SHARED')} disabled={tab === 'SHARED'}>Shared with me</button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        <input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Search files and folders…"
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 8, minWidth: 240, flex: '1 1 320px' }}
        />
        {searchQ.trim() ? (
          <button
            type="button"
            onClick={() => { setSearchQ(''); setSearchResults([]); setSearchError(null); }}
          >
            Clear
          </button>
        ) : null}
        {searchBusy ? <span style={{ opacity: 0.7 }}>Searching…</span> : null}
        {searchError ? <span style={{ color: 'crimson' }}>{searchError}</span> : null}
      </div>


      {tab === 'MY_DRIVE' && (
        <>
          <div style={{ display: 'grid', gap: 8 }}>
            <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {activePath.map((c, idx) => {
                const isLast = idx === activePath.length - 1;
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
              <button onClick={goBack} disabled={activePath.length <= 1}>Back</button>
              {/* <button onClick={goRoot} disabled={cwd === null}>Root</button> */}

              <span style={{ marginLeft: 8, opacity: 0.8 }}>View:</span>
              <button onClick={() => setViewMode('GRID')} disabled={viewMode === 'GRID'}>Grid</button>
              <button onClick={() => setViewMode('LIST')} disabled={viewMode === 'LIST'}>List</button>

              <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} style={{ padding: 6, minWidth: 220 }} />
              <button onClick={createFolder}>Create folder</button>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span>Upload:</span>

                {/* skrit native input */}
                <input
                  id="filePicker"
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setPickedFileName(f.name);
                    uploadFile(f).catch(err => alert(String(err)));
                    // opcijsko: reset, da lahko izbereš isti file še enkrat
                    e.currentTarget.value = '';
                  }}
                />

                {/* gumb za izbiro */}
                <label
                  htmlFor="filePicker"
                  style={{
                    padding: '6px 10px',
                    border: '1px solid #ccc',
                    borderRadius: 6,
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Browse…
                </label>

                {/* filename s truncation, fiksna širina => nič ne skače */}
                <span
                  title={pickedFileName}
                  style={{
                    maxWidth: 260,     // prilagodi po želji
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'inline-block',
                    opacity: 0.85
                  }}
                >
                  {pickedFileName}
                </span>
              </div>


              {loading && <span>Loading…</span>}
            </div>
          </div>

          {viewMode === 'GRID' ? (
            <ItemGrid
              items={currentList}
              thumbUrlById={thumbUrlById}
              onOpenFolder={openFolder}
              onPreview={(it) => setPreviewId(it.id)}
              onDownload={downloadFile}
              onRename={renameItem}
              onShare={shareItem}
              onDelete={deleteItem}
            />
          ) : (
            <ItemTable
              items={currentList}
              onOpenFolder={openFolder}
              onDelete={deleteItem}
              onRename={renameItem}
              onShare={shareItem}
              onDownload={downloadFile}
            />
          )}
        </>
      )}

      {tab === 'SHARED' && (
        <>
          <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {activePath.map((c, idx) => {
              const isLast = idx === activePath.length - 1;
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
            <button onClick={goBack} disabled={activePath.length <= 1}>Back</button>

            <span style={{ marginLeft: 8, opacity: 0.8 }}>View:</span>
            <button onClick={() => setViewMode('GRID')} disabled={viewMode === 'GRID'}>Grid</button>
            <button onClick={() => setViewMode('LIST')} disabled={viewMode === 'LIST'}>List</button>

            {loading && <span>Loading…</span>}
          </div>

          {viewMode === 'GRID' ? (
            <ItemGrid
              items={currentList}
              thumbUrlById={thumbUrlById}
              onOpenFolder={openFolder}
              onPreview={(it) => setPreviewId(it.id)}
              onDelete={deleteItem}
              onRename={renameItem}
              onShare={shareItem}
              onDownload={downloadFile}
            />
          ) : (
            <ItemTable
              items={currentList}
              onOpenFolder={openFolder}
              onDelete={deleteItem}
              onRename={renameItem}
              onShare={shareItem}
              onDownload={downloadFile}
            />
          )}
        </>
      )}
      {shareOpen && (
        <ShareDialog
          target={shareTarget}
          role={shareRole}
          busy={shareBusy}
          error={shareError}
          onTargetChange={setShareTarget}
          onPickRole={setShareRole}
          onSubmit={submitShare}
          onClose={() => {
            setShareOpen(false);
            setShareItemId(null);
          }}
        />
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


function ShareDialog({
  target,
  role,
  busy,
  error,
  onTargetChange,
  onPickRole,
  onSubmit,
  onClose,
}: {
  target: string;
  role: 'VIEWER' | 'EDITOR';
  busy: boolean;
  error: string | null;
  onTargetChange: (v: string) => void;
  onPickRole: (r: 'VIEWER' | 'EDITOR') => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 10,
          padding: 16,
          width: 'min(520px, 95vw)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ fontWeight: 700 }}>Share</div>
          <button onClick={onClose} type="button">Close</button>
        </div>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, opacity: 0.8 }}>Username</span>
          <input
            ref={inputRef}
            value={target}
            onChange={(e) => onTargetChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit();
              if (e.key === 'Escape') onClose();
            }}
            placeholder="e.g. jane_doe"
            style={{ padding: 8, border: '1px solid #ccc', borderRadius: 8 }}
          />
                  {error && (
            <div style={{ marginTop: 8, color: 'crimson', fontSize: 13 }}>
              {error}
            </div>
          )}
</label>

        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, opacity: 0.8 }}>Access</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onPickRole('VIEWER')}
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: '1px solid #ccc',
                fontWeight: role === 'VIEWER' ? 700 : 400,
                background: role === 'VIEWER' ? '#f2f2f2' : 'white',
              }}
            >
              Viewer
            </button>
            <button
              type="button"
              onClick={() => onPickRole('EDITOR')}
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: '1px solid #ccc',
                fontWeight: role === 'EDITOR' ? 700 : 400,
                background: role === 'EDITOR' ? '#f2f2f2' : 'white',
              }}
            >
              Editor
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" onClick={onSubmit} disabled={busy || !target.trim()}>
            {busy ? 'Sharing…' : 'Share'}
          </button>
        </div>
      </div>
    </div>
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