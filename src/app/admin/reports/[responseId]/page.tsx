
"use client";

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import type { CustomerResponse, QuestionnaireVersion, Section as SectionType, Question as QuestionType, AnswerOption, CalculatedSectionScore } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText, AlertCircle, Loader2, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

// Helper function to determine color based on score
const getScoreColor = (score: number): CalculatedSectionScore['color'] => {
  if (score <= 1.5) return 'text-red-600';
  if (score <= 2.5) return 'text-orange-500';
  if (score <= 3.5) return 'text-yellow-500';
  if (score > 3.5) return 'text-green-600';
  return 'text-gray-500'; // Should not happen if scores are always > 0
};

// Helper to find max score for an option array (defaulting to 4 if not findable - adjust if needed)
const getHighestPossibleOptionScore = (options: AnswerOption[]): number => {
    if (!options || options.length === 0) return 4; // Default assumption
    return Math.max(...options.map(opt => opt.score), 0);
}


export default function ReportDetailsPage() {
  useRequireAuth();
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const responseId = params.responseId as string;

  const [response, setResponse] = useState<CustomerResponse | null>(null);
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireVersion | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (responseId) {
      const fetchData = async () => {
        setIsLoading(true);
        try {
          const responseRef = doc(db, 'customerResponses', responseId);
          const responseSnap = await getDoc(responseRef);

          if (!responseSnap.exists()) {
            toast({ variant: 'destructive', title: 'Error', description: 'Assessment response not found.' });
            router.push('/admin/reports');
            return;
          }
          const responseData = { 
              id: responseSnap.id, 
              ...responseSnap.data(),
              submittedAt: (responseSnap.data().submittedAt as Timestamp)?.toDate() || new Date()
          } as CustomerResponse;
          setResponse(responseData);

          const questionnaireRef = doc(db, 'questionnaireVersions', responseData.questionnaireVersionId);
          const questionnaireSnap = await getDoc(questionnaireRef);

          if (!questionnaireSnap.exists()) {
            toast({ variant: 'destructive', title: 'Error', description: 'Associated questionnaire version not found.' });
            setQuestionnaire(null); // Or handle more gracefully
          } else {
             const qData = questionnaireSnap.data();
             setQuestionnaire({ 
                id: questionnaireSnap.id, 
                ...qData,
                createdAt: (qData.createdAt as Timestamp)?.toDate() || new Date()
            } as QuestionnaireVersion);
          }

        } catch (error) {
          console.error("Error fetching report details:", error);
          toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch report details.' });
        }
        setIsLoading(false);
      };
      fetchData();
    }
  }, [responseId, router, toast]);

  const calculatedSectionScores = useMemo((): CalculatedSectionScore[] => {
    if (!response || !questionnaire) return [];

    return questionnaire.sections.map(section => {
      let achievedScore = 0;
      let maxPossibleScoreInSection = 0;
      let questionsInThisSectionAnswered = 0;
      
      const highestPossibleScorePerQuestion = getHighestPossibleOptionScore(section.questions[0]?.options || []);


      section.questions.forEach(q => {
        const selectedOptionId = response.responses[q.id];
        const selectedOption = q.options.find(opt => opt.id === selectedOptionId);
        if (selectedOption) {
          achievedScore += selectedOption.score;
          questionsInThisSectionAnswered++;
        }
        maxPossibleScoreInSection += Math.max(...q.options.map(opt => opt.score), 0);
      });
      
      // averageScore: raw average of points achieved for questions in this section
      // For example, if a section has 2 questions, Q1 (score 3/4) and Q2 (score 2/4),
      // achievedScore = 5. Number of questions = 2. averageScore = 2.5.
      const averageScore = section.questions.length > 0 
        ? parseFloat((achievedScore / section.questions.length).toFixed(2)) 
        : 0;

      return {
        sectionId: section.id,
        sectionName: section.name,
        sectionWeight: section.weight,
        achievedScore,
        maxPossibleScore: maxPossibleScoreInSection,
        averageScore,
        color: getScoreColor(averageScore),
        weightedAverageScore: parseFloat((averageScore * section.weight).toFixed(2)),
        numQuestionsInSection: section.questions.length,
      };
    }).sort((a, b) => b.averageScore - a.averageScore); // Sort by average score descending for Zones 1-7

  }, [response, questionnaire]);


  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <Button variant="outline" onClick={() => router.push('/admin/reports')} className="mb-4 print-hide">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Reports List
        </Button>
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-8 w-1/2" />
        <Card><CardHeader><Skeleton className="h-8 w-1/4 mb-2" /><Skeleton className="h-4 w-full" /></CardHeader><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-8 w-1/4 mb-2" /><Skeleton className="h-4 w-full" /></CardHeader><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (!response || !questionnaire) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] text-center p-6">
        <AlertCircle className="w-16 h-16 text-destructive mb-6" />
        <h1 className="text-2xl font-bold text-foreground mb-3">Report Data Not Found</h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-md">
          The necessary data to display this report could not be found. It's possible the response or its questionnaire version is missing.
        </p>
        <Button variant="outline" onClick={() => router.push('/admin/reports')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Reports List
        </Button>
      </div>
    );
  }

  const staticExecutiveText = "This executive summary provides a high-level overview of the assessment results. Scores are color-coded for quick identification of strengths and areas for attention. Weighted averages reflect the relative importance of each area as defined in the questionnaire structure.";


  return (
    <div className="space-y-8 p-4 md:p-6 print:p-2">
      <style jsx global>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-hide { display: none !important; }
          .print-p-0 { padding: 0 !important; }
          .print-m-0 { margin: 0 !important; }
          .print-shadow-none { box-shadow: none !important; }
          .print-border-none { border: none !important; }
          .page-break-before { page-break-before: always; }
        }
      `}</style>

      <div className="flex justify-between items-center print-hide">
        <Button variant="outline" onClick={() => router.push('/admin/reports')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Reports List
        </Button>
        <Button onClick={() => window.print()}>
          <FileText className="mr-2 h-4 w-4" /> Print/Export Page (Basic)
        </Button>
      </div>

      <Card className="print-shadow-none print-border-none">
        <CardHeader className="text-center print-p-0 print-m-0">
          <CardTitle className="text-3xl font-headline text-primary">Executive Summary</CardTitle>
          <CardDescription className="text-lg">
            Report for: {response.customerName || 'N/A'} <br />
            Questionnaire: {response.questionnaireVersionName} <br />
            Submitted: {format(response.submittedAt, 'PPP p')}
          </CardDescription>
        </CardHeader>
        <Separator className="my-6" />

        <CardContent className="space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3 text-primary border-b pb-2">Area Scores (Zones 1-7)</h2>
            <p className="text-sm text-muted-foreground mb-4">Areas are ordered by average score (descending). Average score is calculated out of the highest possible score for a single question (e.g., 4 or 5).</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {calculatedSectionScores.map((secScore) => (
                <Card key={secScore.sectionId} className="shadow-md">
                  <CardHeader>
                    <CardTitle className="text-lg flex justify-between items-center">
                      <span>{secScore.sectionName}</span>
                       <span className={`px-2 py-0.5 text-xs rounded-full font-mono ${secScore.color.replace('text-', 'bg-').replace('-600', '-100').replace('-500','-100')} ${secScore.color}`}>
                         Avg: {secScore.averageScore.toFixed(2)}
                       </span>
                  </CardTitle>
                  </CardHeader>
                  <CardContent>
                     <div className="w-full bg-muted rounded-full h-2.5 mb-1">
                        <div 
                            className={`h-2.5 rounded-full ${secScore.color.replace('text-', 'bg-')}`} 
                            style={{ width: `${(secScore.averageScore / getHighestPossibleOptionScore(questionnaire.sections.find(s=>s.id === secScore.sectionId)?.questions[0]?.options || [])) * 100}%` }}
                        ></div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Achieved: {secScore.achievedScore} / {secScore.maxPossibleScore} (from {secScore.numQuestionsInSection} questions)
                    </p>
                    <p className={`text-sm font-medium ${secScore.color}`}>Weighted Average: {secScore.weightedAverageScore.toFixed(2)} (Weight: {secScore.sectionWeight})</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
          
          <Separator className="my-6" />

          <section>
            <h2 className="text-xl font-semibold mb-3 text-primary border-b pb-2">Additional Analysis (Zones 8-10)</h2>
            <Card className="bg-muted/30 p-4">
                <p className="text-muted-foreground text-sm">
                    <strong>Zone 8 & 9 (Double-entry Visual Matrix):</strong> Details for these zones, including the visual matrix, will be implemented in a future update.
                </p>
                <Separator className="my-3"/>
                <p className="text-muted-foreground text-sm">
                    <strong>Zone 10 (Count-based Analysis):</strong> Detailed count-based analysis of answer selections will be implemented in a future update.
                </p>
            </Card>
          </section>

          <Separator className="my-6" />
          
          <section>
            <h2 className="text-xl font-semibold mb-3 text-primary border-b pb-2">Summary & Comments</h2>
            <Card>
                <CardContent className="pt-6 space-y-4">
                    <div>
                        <h3 className="font-semibold text-md mb-1">General Observations</h3>
                        <p className="text-sm text-muted-foreground italic">{staticExecutiveText}</p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-md mb-1">Admin Comments</h3>
                         <div className="p-3 border rounded-md bg-secondary/20 min-h-[60px]">
                            <p className="text-sm text-secondary-foreground">
                                {response.adminComments?.executiveSummary || "No executive summary comments added yet."}
                            </p>
                         </div>
                        {/* Placeholder for editing comments - to be implemented later */}
                        <Button variant="outline" size="sm" className="mt-2 print-hide" disabled> 
                            <Edit className="mr-2 h-3 w-3"/> Edit Comments
                        </Button>
                    </div>
                </CardContent>
            </Card>
          </section>

        </CardContent>
        <CardFooter className="print-hide">
            <p className="text-xs text-muted-foreground">Full report export to PDF/Word will be available in a future update. Use browser print for a basic version.</p>
        </CardFooter>
      </Card>
    </div>
  );
}
