
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import type { QuestionnaireVersion, CustomerLink } from '@/lib/types';
import QuestionnaireClient from '@/components/assessment/QuestionnaireClient';
import { AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

async function getQuestionnaireData(linkId: string): Promise<{ questionnaire: QuestionnaireVersion | null; customerLink: CustomerLink | null; error?: string }> {
  try {
    const linkRef = doc(db, 'customerLinks', linkId);
    const linkSnap = await getDoc(linkRef);

    if (!linkSnap.exists()) {
      return { questionnaire: null, customerLink: null, error: "Assessment link not found." };
    }

    const customerLinkData = { id: linkSnap.id, ...linkSnap.data() } as CustomerLink;
    
    // Convert Firestore Timestamps to Dates
    if (customerLinkData.createdAt && (customerLinkData.createdAt as any).toDate) {
      customerLinkData.createdAt = (customerLinkData.createdAt as unknown as Timestamp).toDate();
    }
    if (customerLinkData.expiresAt && (customerLinkData.expiresAt as any).toDate) {
      customerLinkData.expiresAt = (customerLinkData.expiresAt as unknown as Timestamp).toDate();
    }


    if (customerLinkData.status === "completed") {
      return { questionnaire: null, customerLink: customerLinkData, error: "This assessment has already been completed." };
    }

    if (new Date() > new Date(customerLinkData.expiresAt)) {
       // Optionally update status in DB here if not done by a cron job
      return { questionnaire: null, customerLink: customerLinkData, error: "This assessment link has expired." };
    }

    const questionnaireRef = doc(db, 'questionnaireVersions', customerLinkData.questionnaireVersionId);
    const questionnaireSnap = await getDoc(questionnaireRef);

    if (!questionnaireSnap.exists()) {
      return { questionnaire: null, customerLink: customerLinkData, error: "Associated questionnaire not found." };
    }
    
    const questionnaireData = { id: questionnaireSnap.id, ...questionnaireSnap.data() } as QuestionnaireVersion;
    if (questionnaireData.createdAt && (questionnaireData.createdAt as any).toDate) {
      questionnaireData.createdAt = (questionnaireData.createdAt as unknown as Timestamp).toDate();
    }
    
    if (!questionnaireData.isActive) {
        return { questionnaire: null, customerLink: customerLinkData, error: "This questionnaire version is currently not active." };
    }


    return { questionnaire: questionnaireData, customerLink: customerLinkData };

  } catch (err) {
    console.error("Error fetching questionnaire data:", err);
    return { questionnaire: null, customerLink: null, error: "An error occurred while loading the assessment." };
  }
}

export default async function AssessmentPage({ params }: { params: { linkId: string } }) {
  const { linkId } = params;
  const { questionnaire, customerLink, error } = await getQuestionnaireData(linkId);

  if (error) {
    let Icon = AlertCircle;
    if (error.includes("expired")) Icon = Clock;
    
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6 text-center">
        <Icon className="w-16 h-16 text-destructive mb-6" />
        <h1 className="text-3xl font-bold text-foreground mb-3">Access Denied</h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-md">{error}</p>
        <Link href="/" passHref>
          <Button variant="outline">Go to Homepage</Button>
        </Link>
      </div>
    );
  }
  
  if (!questionnaire || !customerLink) {
     return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6 text-center">
        <AlertCircle className="w-16 h-16 text-destructive mb-6" />
        <h1 className="text-3xl font-bold text-foreground mb-3">Error Loading Assessment</h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-md">Could not load the assessment. Please try again later or contact support.</p>
        <Link href="/" passHref>
          <Button variant="outline">Go to Homepage</Button>
        </Link>
      </div>
    );
  }

  return <QuestionnaireClient questionnaire={questionnaire} customerLink={customerLink} linkId={linkId} />;
}

export const revalidate = 0; // Ensure dynamic rendering and data fetching on each request
