'use client';
import { useToast } from '@/components/Toast';

export default function ToastSmoke() {
  const toast = useToast(); // same API as before + helpers
  return (
    <div className="flex flex-wrap gap-2">
      <button className="px-3 py-1.5 rounded border" onClick={() => toast('Default toast')}>
        Default
      </button>
      <button className="px-3 py-1.5 rounded border" onClick={() => toast.success('Success ✅')}>
        Success
      </button>
      <button className="px-3 py-1.5 rounded border" onClick={() => toast.error('Something broke')}>
        Error
      </button>
      <button className="px-3 py-1.5 rounded border" onClick={() => toast.info('Heads up!')}>
        Info
      </button>
    </div>
  );
}