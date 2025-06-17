
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, query, Timestamp } from 'firebase/firestore';
import type { CustomerResponse, QuestionnaireVersion, Question, Section as SectionType, AnswerOption } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChartHorizontal, FileSearch, AlertTriangle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from "@/hooks/use-toast"; // Added this import
import { Label } from '@/components/ui/label'; // Added this import for consistency, it's used below

interface SectionAverageScore {
  name: string;
  averageScore: number;
  responsesCount: number;
}

export default function AdminReportsPage() {
  useRequireAuth();
  const { toast } = useToast();

  const [responses, setResponses] = useState<CustomerResponse[]>([]);
  const [questionnaireVersions, setQuestionnaireVersions] = useState<QuestionnaireVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const responsesSnapshot = await getDocs(collection(db, 'customerResponses'));
        const fetchedResponses = responsesSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            submittedAt: (data.submittedAt as Timestamp)?.toDate ? (data.submittedAt as Timestamp).toDate() : new Date(data.submittedAt),
          } as CustomerResponse;
        });
        setResponses(fetchedResponses);

        const versionsSnapshot = await getDocs(collection(db, 'questionnaireVersions'));
        const fetchedVersions = versionsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: (data.createdAt as Timestamp)?.toDate ? (data.createdAt as Timestamp).toDate() : new Date(data.createdAt),
          } as QuestionnaireVersion;
        });
        setQuestionnaireVersions(fetchedVersions);
        if (fetchedVersions.length > 0) {
          // Sort versions by creation date, newest first, then select the first one
          const sortedVersions = fetchedVersions.sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime());
          setSelectedVersionId(sortedVersions[0].id); 
        }

      } catch (error) {
        console.error("Error fetching report data:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not fetch report data." });
      }
      setIsLoading(false);
    };
    fetchData();
  }, [toast]); // Added toast to dependency array as it's used in error handling

  const selectedQuestionnaireVersion = useMemo(() => {
    return questionnaireVersions.find(v => v.id === selectedVersionId);
  }, [selectedVersionId, questionnaireVersions]);

  const reportData = useMemo(() => {
    if (!selectedQuestionnaireVersion || responses.length === 0) {
      return { sectionAverages: [], totalCompleted: 0 };
    }

    const relevantResponses = responses.filter(r => r.questionnaireVersionId === selectedVersionId);
    const totalCompleted = relevantResponses.length;

    const questionDetailsMap = new Map<string, { sectionId: string, sectionTitle: string, options: Map<string, number> }>();
    selectedQuestionnaireVersion.sections.forEach(section => {
      section.questions.forEach(question => {
        const optionsMap = new Map<string, number>();
        question.options.forEach(opt => optionsMap.set(opt.id, opt.points));
        questionDetailsMap.set(question.id, { sectionId: section.id, sectionTitle: section.title, options: optionsMap });
      });
    });
    
    const sectionScoresData: Record<string, { totalPoints: number; answerCount: number; responseCount: Set<string> }> = {};

    selectedQuestionnaireVersion.sections.forEach(section => {
      sectionScoresData[section.id] = { totalPoints: 0, answerCount: 0, responseCount: new Set() };
    });
    
    relevantResponses.forEach(response => {
      Object.entries(response.responses).forEach(([questionId, optionId]) => {
        const details = questionDetailsMap.get(questionId);
        if (details) {
          const points = details.options.get(optionId as string) || 0; // Ensure optionId is treated as string
          sectionScoresData[details.sectionId].totalPoints += points;
          sectionScoresData[details.sectionId].answerCount += 1;
          sectionScoresData[details.sectionId].responseCount.add(response.id);
        }
      });
    });

    const sectionAverages: SectionAverageScore[] = selectedQuestionnaireVersion.sections.map(section => {
      const data = sectionScoresData[section.id];
      // Calculate average score based on unique responses that contributed to answers in this section
      // This provides average points per question *answered* in this section, across submissions that had answers for this section.
      const numResponsesForSection = data.responseCount.size > 0 ? data.responseCount.size : 1; // Avoid division by zero
      const numQuestionsInSection = section.questions.length > 0 ? section.questions.length : 1; // Avoid division by zero
      // Average score per question in the section
      const avgScorePerQuestion = data.answerCount > 0 ? (data.totalPoints / data.answerCount) : 0;
      
      // A more robust average score per section would be sum of (total points for section / number of questions in section) / number of responses
      // This interpretation: (total points for a section from all responses) / (number of responses * number of questions in section)
      // But the current one is simpler: sum of points / number of answers made in that section.
      // Let's stick to the simpler: average points per *answered* question in the section.

      return {
        name: section.title,
        averageScore: data.answerCount > 0 ? parseFloat((data.totalPoints / data.answerCount).toFixed(2)) : 0,
        responsesCount: data.responseCount.size,
      };
    });
    
    return { sectionAverages, totalCompleted };

  }, [responses, selectedQuestionnaireVersion]);


  const chartConfig = {
    averageScore: {
      label: "Avg. Score",
      color: "hsl(var(--chart-1))",
    },
  } satisfies import("@/components/ui/chart").ChartConfig;


  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-40 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-8 w-1/3" /></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <FileSearch className="w-8 h-8 text-primary" />
            <CardTitle className="text-2xl font-headline">Assessment Reports</CardTitle>
          </div>
          <CardDescription>
            Analyze submitted questionnaire data. Select a questionnaire version to view specific reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="questionnaireVersionSelect" className="text-sm font-medium">Select Questionnaire Version:</Label>
            <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
              <SelectTrigger id="questionnaireVersionSelect" className="w-full md:w-1/2 mt-1">
                <SelectValue placeholder="Select a version" />
              </SelectTrigger>
              <SelectContent>
                {questionnaireVersions.length > 0 ? (
                  questionnaireVersions.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name} (ID: {v.id})</SelectItem>
                  ))
                ) : (
                  <SelectItem value="-" disabled>No versions available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {selectedQuestionnaireVersion && reportData.totalCompleted > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl font-semibold">
                  <BarChartHorizontal className="w-6 h-6 text-primary" />
                  Average Scores per Section
                </CardTitle>
                <CardDescription>
                  For questionnaire: {selectedQuestionnaireVersion.name} (Total Submissions: {reportData.totalCompleted})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportData.sectionAverages.length > 0 ? (
                  <ChartContainer config={chartConfig} className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportData.sectionAverages} layout="vertical" margin={{ right: 30, left: 120 }}> {/* Increased left margin */}
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 12, dy: 5 }} interval={0} />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend content={<ChartLegendContent />} />
                        <Bar dataKey="averageScore" fill="var(--color-averageScore)" radius={4} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                ) : (
                  <p className="text-muted-foreground text-center py-4">No response data available to display charts for this version.</p>
                )}
              </CardContent>
            </Card>
          )}
          
          {selectedQuestionnaireVersion && reportData.totalCompleted === 0 && (
             <Card className="mt-6">
                <CardContent className="py-10 text-center">
                    <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-xl font-semibold text-muted-foreground">No Submissions Yet</h3>
                    <p className="text-muted-foreground mt-2">
                        There are no completed assessments for the selected questionnaire version ({selectedQuestionnaireVersion.name}).
                    </p>
                </CardContent>
            </Card>
          )}
          
          {!selectedQuestionnaireVersion && questionnaireVersions.length > 0 && (
             <Card className="mt-6">
                <CardContent className="py-10 text-center">
                    <FileSearch className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-xl font-semibold text-muted-foreground">Select a Version</h3>
                    <p className="text-muted-foreground mt-2">
                        Please select a questionnaire version from the dropdown to view its reports.
                    </p>
                </CardContent>
            </Card>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
