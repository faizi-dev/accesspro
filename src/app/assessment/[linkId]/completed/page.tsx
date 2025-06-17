
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AssessmentCompletedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-green-100 p-6 text-center">
      <Card className="max-w-lg w-full shadow-2xl animate-subtle-slide-in">
        <CardHeader>
            <CheckCircle className="mx-auto w-20 h-20 text-accent mb-6" />
            <CardTitle className="text-4xl font-headline text-primary mb-3">Thank You!</CardTitle>
            <CardDescription className="text-xl text-foreground/80">
            Your questionnaire has been successfully submitted.
            </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-10">
            We appreciate you taking the time to complete the assessment. Your responses have been recorded.
          </p>
          <Link href="/" passHref>
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Return to Homepage
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
