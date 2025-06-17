
"use client";

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function AdminReportsPage() {
  useRequireAuth();

  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="w-8 h-8 text-primary" />
            <CardTitle className="text-2xl font-headline">Assessment Reports</CardTitle>
          </div>
          <CardDescription>
            View and analyze submitted questionnaire data, including executive summaries and detailed area reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-16">
            <Construction className="mx-auto h-16 w-16 text-primary/50 mb-4" />
            <h3 className="text-xl font-semibold text-muted-foreground">Feature Under Construction</h3>
            <p className="text-muted-foreground mt-2">
                The reporting and visualization section is currently under development.
            </p>
            <Link href="/admin/dashboard">
                <Button variant="outline" className="mt-6">Back to Dashboard</Button>
            </Link>
        </CardContent>
      </Card>
    </div>
  );
}
