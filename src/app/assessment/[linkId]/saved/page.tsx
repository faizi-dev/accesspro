
"use client";

import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useParams } from 'next/navigation';

export default function AssessmentSavedPage() {
  const params = useParams();
  const linkId = params.linkId as string;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-blue-100 p-6 text-center">
      <Card className="max-w-lg w-full shadow-2xl animate-subtle-slide-in">
        <CardHeader>
            <Save className="mx-auto w-20 h-20 text-primary mb-6" />
            <CardTitle className="text-4xl font-headline text-primary mb-3">Progress Saved!</CardTitle>
            <CardDescription className="text-xl text-foreground/80">
              Your answers have been saved successfully.
            </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-10">
            You can close this window and continue later using the same assessment link, as long as it has not expired.
          </p>
          <Link href={`/assessment/${linkId}`} passHref>
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Return to Questionnaire
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
