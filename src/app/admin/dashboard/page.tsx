
"use client";

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { FileText, Users, BarChart3, UploadCloud, Settings, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext'; // To display user info

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const { user: authUser } = useAuth();


  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-theme(spacing.32))]">
        <div className="text-center">
          <svg className="mx-auto h-12 w-12 text-primary animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-2 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }
  
  const quickLinks = [
    { title: "Upload Questionnaire", href: "/admin/questionnaires/upload", icon: UploadCloud, description: "Add a new version of the assessment." },
    { title: "Manage Versions", href: "/admin/questionnaires/manage", icon: Settings, description: "View and organize existing questionnaires." },
    { title: "Manage Customers", href: "/admin/customers", icon: Users, description: "Oversee customer records and link assignments." },
    { title: "View Reports", href: "/admin/reports", icon: BarChart3, description: "Analyze submitted assessment data." },
  ];

  return (
    <div className="space-y-8">
      <Card className="bg-card shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-headline">Welcome, {authUser?.email?.split('@')[0] || 'Admin'}!</CardTitle>
          <CardDescription>Here's a quick overview of your AssessPro platform.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            From this dashboard, you can manage all aspects of the assessment process, from creating and versioning questionnaires to tracking customer progress and analyzing results.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map((link) => (
          <Card key={link.href} className="hover:shadow-xl transition-shadow duration-300 flex flex-col">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <link.icon className="w-7 h-7 text-primary" />
                <CardTitle className="text-xl font-headline">{link.title}</CardTitle>
              </div>
              <CardDescription>{link.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Link href={link.href} passHref>
                <Button className="w-full">
                  Go to {link.title.split(' ')[0]} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <Card className="shadow-lg">
        <CardHeader>
            <CardTitle className="text-2xl font-headline">Platform Statistics</CardTitle>
            <CardDescription>A summary of key metrics.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-secondary/30 rounded-lg text-center">
                <p className="text-3xl font-bold text-primary">12</p>
                <p className="text-sm text-muted-foreground">Active Questionnaires</p>
            </div>
            <div className="p-4 bg-secondary/30 rounded-lg text-center">
                <p className="text-3xl font-bold text-primary">150</p>
                <p className="text-sm text-muted-foreground">Customers Managed</p>
            </div>
            <div className="p-4 bg-secondary/30 rounded-lg text-center">
                <p className="text-3xl font-bold text-primary">85</p>
                <p className="text-sm text-muted-foreground">Completed Assessments</p>
            </div>
        </CardContent>
      </Card>

    </div>
  );
}
