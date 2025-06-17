
import type { Metadata } from 'next';
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'AssessPro Admin',
  description: 'Admin panel for AssessPro.',
};

function AdminLayoutFallback() {
  return (
    <div className="flex h-screen w-full">
      <div className="w-64 border-r p-4 space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="h-full w-full" />
      </div>
    </div>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AdminLayoutFallback />}>
      <AdminLayoutClient>
        {children}
      </AdminLayoutClient>
    </Suspense>
  );
}
