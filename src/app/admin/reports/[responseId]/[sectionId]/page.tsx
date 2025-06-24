
"use client";

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp, updateDoc } from 'firebase/firestore';
import type { CustomerResponse, QuestionnaireVersion, Section as SectionType, AnswerOption } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertCircle, Edit, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

// Helper function to determine color based on score
const getScoreFillColor = (score: number): string => {
  if (score <= 1.5) return 'hsl(var(--chart-5))'; // Red
  if (score > 1.5 && score <= 2.5) return 'hsl(var(--chart-2))'; // Orange
  if (score > 2.5 && score <= 3.5) return 'hsl(var(--chart-3))'; // Yellow
  if (score > 3.5) return 'hsl(var(--chart-4))'; // Green
  return 'hsl(var(--muted))';
};

const getHighestPossibleOptionScore = (questions: SectionType['questions']): number => {
    if (!questions || questions.length === 0 || !questions[0].options || questions[0].options.length === 0) return 4;
    return Math.max(...questions[0].options.map(opt => opt.score), 0);
}

export default function SectionDetailPage() {
  useRequireAuth();
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const responseId = params.responseId as string;
  const sectionId = params.sectionId as string;

  const [response, setResponse] = useState<CustomerResponse | null>(null);
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireVersion | null>(null);
  const [section, setSection] = useState<SectionType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [dynamicComment, setDynamicComment] = useState("");
  const [isEditingDynamicComment, setIsEditingDynamicComment] = useState(false);
  const [isSavingDynamicComment, setIsSavingDynamicComment] = useState(false);
  
  const [adminComment, setAdminComment] = useState("");
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [isSavingComment, setIsSavingComment] = useState(false);

  useEffect(() => {
    if (responseId && sectionId) {
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
          const responseData = { id: responseSnap.id, ...responseSnap.data() } as CustomerResponse;
          setResponse(responseData);

          const questionnaireRef = doc(db, 'questionnaireVersions', responseData.questionnaireVersionId);
          const questionnaireSnap = await getDoc(questionnaireRef);

          if (!questionnaireSnap.exists()) {
            toast({ variant: 'destructive', title: 'Error', description: 'Associated questionnaire version not found.' });
          } else {
             const qData = questionnaireSnap.data() as QuestionnaireVersion;
             setQuestionnaire(qData);
             const currentSection = qData.sections.find(s => s.id === sectionId);
             if (currentSection) {
               setSection(currentSection);
               const initialDynamicComment = responseData.dynamicComments?.[sectionId] ?? currentSection.comment ?? "";
               setDynamicComment(initialDynamicComment);
               setAdminComment(responseData.adminComments?.[sectionId] || "");
             } else {
               toast({ variant: 'destructive', title: 'Error', description: 'Section not found in this questionnaire version.' });
             }
          }

        } catch (error) {
          console.error("Error fetching report details:", error);
          toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch report details.' });
        }
        setIsLoading(false);
      };
      fetchData();
    }
  }, [responseId, sectionId, router, toast]);

  const { sectionAverageScore, highestPossibleScore } = useMemo(() => {
    if (!section || !response) {
      return { sectionAverageScore: 0, highestPossibleScore: 4 };
    }

    const sectionMaxScore = getHighestPossibleOptionScore(section.questions);
    
    let achievedScore = 0;
    let numAnswered = 0;
    section.questions.forEach(q => {
      const selectedOptionId = response.responses[q.id];
      if (!selectedOptionId) return;
      const selectedOption = q.options.find(opt => opt.id === selectedOptionId);
      if (selectedOption && typeof selectedOption.score === 'number') {
        achievedScore += selectedOption.score;
        numAnswered++;
      }
    });

    const averageScore = numAnswered > 0 ? parseFloat((achievedScore / numAnswered).toFixed(2)) : 0;
    return { sectionAverageScore: averageScore, highestPossibleScore: sectionMaxScore };
  }, [section, response]);

  const handleSaveDynamicComment = async () => {
    if (!responseId || !sectionId) return;
    setIsSavingDynamicComment(true);
    try {
        const responseRef = doc(db, 'customerResponses', responseId);
        await updateDoc(responseRef, {
            [`dynamicComments.${sectionId}`]: dynamicComment
        });

        setResponse(prev => {
            if (!prev) return null;
            const newDynamicComments = { ...prev.dynamicComments, [sectionId]: dynamicComment };
            return { ...prev, dynamicComments: newDynamicComments };
        });
        toast({ title: "Success", description: "Dynamic analysis saved successfully." });
        setIsEditingDynamicComment(false);
    } catch (error) {
        console.error("Error saving dynamic comment:", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to save dynamic analysis." });
    } finally {
        setIsSavingDynamicComment(false);
    }
  };
  
  const handleSaveComment = async () => {
    if (!responseId || !sectionId) return;
    setIsSavingComment(true);
    try {
      const responseRef = doc(db, 'customerResponses', responseId);
      await updateDoc(responseRef, {
        [`adminComments.${sectionId}`]: adminComment
      });

      setResponse(prev => prev ? { ...prev, adminComments: { ...prev.adminComments, [sectionId]: adminComment } } : null);
      toast({ title: "Success", description: "Comment saved successfully." });
      setIsEditingComment(false);
    } catch (error) {
      console.error("Error saving comment:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to save comment." });
    } finally {
      setIsSavingComment(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Card><CardHeader><Skeleton className="h-8 w-3/4" /><Skeleton className="h-4 w-1/2 mt-2" /></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-8 w-1/4 mb-2" /></CardHeader><CardContent><Skeleton className="h-24 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (!section || !response) {
    return (
      <div className="text-center py-10">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Section Data Not Found</h2>
        <p className="text-muted-foreground mb-6">The requested section details could not be loaded.</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Button variant="outline" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Executive Summary
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
             <FileText className="h-7 w-7 text-primary" />
             <CardTitle className="text-2xl font-headline">{section.name}</CardTitle>
          </div>
          <CardDescription>{section.description}</CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-lg">Area Average Score: <span className="font-bold text-primary">{sectionAverageScore.toFixed(2)}</span></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Question Breakdown</CardTitle>
          <CardDescription>Scores for each question in this section, ordered by appearance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {section.questions.map((question) => {
            const selectedOptionId = response.responses[question.id];
            const selectedOption = question.options.find(opt => opt.id === selectedOptionId);
            const score = selectedOption?.score ?? 0;
            
            return (
              <div key={question.id} className="space-y-2 border-b pb-4 last:border-b-0">
                <p className="font-medium">{question.question}</p>
                <p className="text-sm text-muted-foreground">Answer: <span className="italic">{selectedOption?.text ?? "Not answered"}</span></p>
                <div className="flex items-center gap-4">
                  <div className="w-full bg-muted rounded-full h-3 flex-1">
                    <div
                      className="h-3 rounded-full"
                      style={{
                        width: `${(score / highestPossibleScore) * 100}%`,
                        backgroundColor: getScoreFillColor(score),
                      }}
                    ></div>
                  </div>
                  <p className="font-bold w-12 text-right">{score.toFixed(2)}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Analysis & Comments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold text-md mb-1">Dynamic Analysis</h3>
                {isEditingDynamicComment ? (
                  <div className="space-y-2">
                    <Textarea
                      value={dynamicComment}
                      onChange={(e) => setDynamicComment(e.target.value)}
                      placeholder="Enter dynamic analysis for this section..."
                      rows={4}
                      disabled={isSavingDynamicComment}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setIsEditingDynamicComment(false)} disabled={isSavingDynamicComment}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveDynamicComment} disabled={isSavingDynamicComment}>
                        {isSavingDynamicComment ? "Saving..." : "Save Analysis"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-3 border rounded-md bg-secondary/20 min-h-[60px]">
                      <p className="text-sm text-secondary-foreground whitespace-pre-wrap">
                        {dynamicComment || "No dynamic analysis for this section."}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => setIsEditingDynamicComment(true)}
                    >
                      <Edit className="mr-2 h-3 w-3" /> Edit Analysis
                    </Button>
                  </>
                )}
            </div>
            <div>
              <h3 className="font-semibold text-md mb-1">Admin Comments</h3>
              {isEditingComment ? (
                <div className="space-y-2">
                  <Textarea
                    value={adminComment}
                    onChange={(e) => setAdminComment(e.target.value)}
                    placeholder="Enter admin comments for this section..."
                    rows={4}
                    disabled={isSavingComment}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsEditingComment(false)} disabled={isSavingComment}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveComment} disabled={isSavingComment}>
                      {isSavingComment ? "Saving..." : "Save Comment"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-3 border rounded-md bg-secondary/20 min-h-[60px]">
                    <p className="text-sm text-secondary-foreground whitespace-pre-wrap">
                      {adminComment || "No admin comments added for this section yet."}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setAdminComment(response?.adminComments?.[sectionId] || "");
                      setIsEditingComment(true);
                    }}
                  >
                    <Edit className="mr-2 h-3 w-3" /> Edit Comment
                  </Button>
                </>
              )}
            </div>
        </CardContent>
      </Card>

    </div>
  );
}
