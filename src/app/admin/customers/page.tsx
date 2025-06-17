
"use client";

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function AdminCustomersPage() {
  useRequireAuth();

  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-8 h-8 text-primary" />
            <CardTitle className="text-2xl font-headline">Customer Management</CardTitle>
          </div>
          <CardDescription>
            Manage customer records, assign questionnaires, and generate unique access links.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-16">
            <Construction className="mx-auto h-16 w-16 text-primary/50 mb-4" />
            <h3 className="text-xl font-semibold text-muted-foreground">Feature Under Construction</h3>
            <p className="text-muted-foreground mt-2">
                This section for managing customers and assessment links is currently being developed.
            </p>
            <Link href="/admin/dashboard">
                <Button variant="outline" className="mt-6">Back to Dashboard</Button>
            </Link>
        </CardContent>
      </Card>
    </div>
  );
}
