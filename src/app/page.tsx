
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Briefcase } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-blue-100 p-4">
      <header className="mb-12 text-center">
        <h1 className="text-5xl font-headline font-bold text-primary mb-4">
          UpVal
        </h1>
        <p className="text-xl text-foreground/80 max-w-2xl">
          Dynamic Questionnaire Platform for Comprehensive Customer Assessment and Insightful Reporting.
        </p>
      </header>

      {/* className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full" */}
      <div>
        <Card className="shadow-xl hover:shadow-2xl transition-shadow duration-300">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <Briefcase className="w-8 h-8 text-primary" />
              <CardTitle className="text-2xl font-headline">Admin Portal</CardTitle>
            </div>
            <CardDescription>
              Manage questionnaires, customers, and view detailed assessment reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/dashboard" passHref>
              <Button className="w-full" size="lg">
                Go to Admin Dashboard <ArrowRight className="ml-2" />
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Login required for admin access.
            </p>
          </CardContent>
        </Card>

        {/* <Card className="shadow-xl hover:shadow-2xl transition-shadow duration-300">
          <CardHeader>
             <div className="flex items-center gap-3 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/><path d="m10 16-2.5-2.5L10 11"/><path d="m14 16 2.5-2.5L14 11"/></svg>
              <CardTitle className="text-2xl font-headline">Take Assessment</CardTitle>
            </div>
            <CardDescription>
              Access your assigned questionnaire using the unique link provided.
            </CardDescription>
          </CardHeader>
          <CardContent>
             <Link href="/assessment/sample-link" passHref>
              <Button variant="outline" className="w-full" size="lg">
                Example Assessment <ArrowRight className="ml-2" />
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Illustrative link. Actual assessments require a unique, valid link.
            </p>
          </CardContent>
        </Card> */}
      </div>

      <footer className="mt-16 text-center text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} UpVal. All rights reserved.</p>
      </footer>
    </div>
  );
}
