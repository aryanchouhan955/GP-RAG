'use client';
import * as React from 'react';
import { useUser } from '@clerk/nextjs';
import { Upload, Loader2, CheckCircle2, AlertCircle, Clock, FileText } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const POLL_INTERVAL_MS = 3000;

type ProcessingStatus = 'idle' | 'uploading' | 'processing' | 'ready' | 'failed';

interface UploadedDoc {
  file_id: string;
  filename: string;
  status: ProcessingStatus;
}

const StatusBadge = ({ status }: { status: ProcessingStatus }) => {
  const map: Record<ProcessingStatus, { color: string; label: string; icon: React.ReactNode }> = {
    idle:       { color: 'text-muted-foreground', label: '',          icon: null },
    uploading:  { color: 'text-blue-400',         label: 'Uploading', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    processing: { color: 'text-amber-400',        label: 'Processing',icon: <Clock className="h-3 w-3 animate-pulse" /> },
    ready:      { color: 'text-emerald-400',      label: 'Ready',     icon: <CheckCircle2 className="h-3 w-3" /> },
    failed:     { color: 'text-red-400',          label: 'Failed',    icon: <AlertCircle className="h-3 w-3" /> },
  };
  const { color, label, icon } = map[status];
  if (!label) return null;
  return (
    <span className={`flex items-center gap-1 text-[10px] font-medium shrink-0 ${color}`}>
      {icon}{label}
    </span>
  );
};

const FileUploadComponent: React.FC = () => {
  const { user } = useUser();
  const [status, setStatus] = React.useState<ProcessingStatus>('idle');
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = React.useState<UploadedDoc[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const pollTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const userId = user?.id ?? 'anonymous';

  const refreshDocs = React.useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/documents`, { headers: { 'x-user-id': userId } });
      if (!res.ok) return;
      const data = await res.json();
      setUploadedDocs(data.documents ?? []);
    } catch { /* ignore polling errors */ }
  }, [userId]);

  React.useEffect(() => {
    refreshDocs();
    const startPolling = () => {
      if (pollTimerRef.current) return;
      pollTimerRef.current = setInterval(async () => {
        await refreshDocs();
        setUploadedDocs((docs) => {
          const stillProcessing = docs.some((d) => d.status === 'processing');
          if (!stillProcessing && pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setStatus((prev) => (prev === 'processing' ? 'ready' : prev));
          }
          return docs;
        });
      }, POLL_INTERVAL_MS);
    };
    startPolling();
    return () => {
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    };
  }, [refreshDocs]);

  const uploadFile = async (file: File) => {
    setStatus('uploading');
    setFileName(file.name);

    const formData = new FormData();
    formData.append('pdf', file);
    const apiKey = localStorage.getItem('gemini_api_key') || '';

    try {
      const res = await fetch(`${API_URL}/upload/pdf`, {
        method: 'POST',
        headers: { 'x-gemini-api-key': apiKey, 'x-user-id': userId },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Upload failed (${res.status}): ${err}`);
      }
      setStatus('processing');
      await refreshDocs();
      if (!pollTimerRef.current) {
        pollTimerRef.current = setInterval(async () => {
          await refreshDocs();
          setUploadedDocs((docs) => {
            const stillProcessing = docs.some((d) => d.status === 'processing');
            if (!stillProcessing && pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              setStatus('ready');
            }
            return docs;
          });
        }, POLL_INTERVAL_MS);
      }
    } catch (err) {
      console.error('Upload failed', err);
      setStatus('failed');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    await uploadFile(e.target.files[0]);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') await uploadFile(file);
  };

  const isBusy = status === 'uploading' || status === 'processing';

  return (
    <div className="flex flex-col gap-4">
      <input
        type="file"
        accept="application/pdf"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* ── Drop zone ──────────────────────────────── */}
      <div
        onClick={() => !isBusy && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center gap-2
          rounded-xl border-2 border-dashed px-4 py-6 text-center
          transition-all duration-200 cursor-pointer select-none
          ${isBusy
            ? 'border-primary/30 bg-primary/5 cursor-not-allowed'
            : dragging
            ? 'border-primary/70 bg-primary/10 scale-[1.01]'
            : 'border-border/60 hover:border-primary/50 hover:bg-primary/5'}
        `}
      >
        {isBusy ? (
          <>
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
            <p className="text-xs font-medium text-primary">
              {status === 'uploading' ? 'Uploading…' : 'Embedding…'}
            </p>
          </>
        ) : (
          <>
            <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">
                {dragging ? 'Drop it here' : 'Upload PDF'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Click or drag & drop
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Current file status ────────────────────── */}
      {fileName && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs
          ${status === 'failed'
            ? 'bg-red-500/10 border border-red-500/20 text-red-400'
            : 'bg-secondary/40 border border-border/50 text-muted-foreground'}`}
        >
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate flex-1 font-medium">{fileName}</span>
          <StatusBadge status={status} />
        </div>
      )}

      {/* ── Uploaded docs list ─────────────────────── */}
      {uploadedDocs.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] font-semibold px-1">
            Your Documents
          </p>
          <div className="space-y-1">
            {uploadedDocs.map((doc) => (
              <div
                key={doc.file_id}
                className="group flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg
                  bg-secondary/30 border border-border/40
                  hover:border-border/70 transition-colors"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    doc.status === 'ready'
                      ? 'bg-emerald-400'
                      : doc.status === 'failed'
                      ? 'bg-red-400'
                      : 'bg-amber-400 animate-pulse'
                  }`}
                />
                <span className="truncate flex-1 text-muted-foreground">{doc.filename}</span>
                <StatusBadge status={doc.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploadComponent;
