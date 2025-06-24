
"use client";

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import type { CustomerResponse, QuestionnaireVersion, Section as SectionType, AnswerOption, CalculatedSectionScore, CalculatedCountAnalysis, CalculatedMatrixAnalysis } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText, AlertCircle, Edit, Star } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Label as RechartsLabel,
  BarChart, Bar, Legend, Cell
} from 'recharts';


// Helper function to determine color based on score for recharts fill AND text
const getScoreFillColor = (score: number): string => {
  if (score <= 1.5) return 'hsl(var(--chart-5))'; // Red
  if (score > 1.5 && score <= 2.5) return 'hsl(var(--chart-2))'; // Orange
  if (score > 2.5 && score <= 3.5) return 'hsl(var(--chart-3))'; // Yellow
  if (score > 3.5) return 'hsl(var(--chart-4))'; // Green
  return 'hsl(var(--muted))';
};

// Helper function to determine tailwind text color class based on score
const getScoreTextColorClassName = (score: number): string => {
  if (score <= 1.5) return 'text-chart-5';
  if (score > 1.5 && score <= 2.5) return 'text-chart-2';
  if (score > 2.5 && score <= 3.5) return 'text-chart-3';
  if (score > 3.5) return 'text-chart-4';
  return 'text-muted-foreground';
};

const getHighestPossibleOptionScore = (questions: SectionType['questions']): number => {
    if (!questions || questions.length === 0 || !questions[0].options || questions[0].options.length === 0) return 4;
    // In a weighted section, assume all questions have same max score
    return Math.max(...questions[0].options.map(opt => opt.score), 0);
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="p-2 bg-card border rounded-md shadow-lg text-card-foreground text-sm">
        <p className="font-bold">{label}</p>
        <p><strong>Average Score:</strong> <span style={{ color: getScoreFillColor(data.averageScore) }}>{data.averageScore.toFixed(2)}</span></p>
        <p><strong>Weighted Score:</strong> {data.weightedAverageScore.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground">(Weight: {data.sectionWeight})</p>
      </div>
    );
  }
  return null;
};


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

  const { reportData, highestPossibleScore } = useMemo(() => {
    if (!response || !questionnaire) {
        return { reportData: { weightedScores: [], matrixAnalyses: [], countAnalyses: [], totalAverageRanking: 0 }, highestPossibleScore: 4 };
    }

    const weightedScores: CalculatedSectionScore[] = [];
    const matrixAnalyses: CalculatedMatrixAnalysis[] = [];
    const countAnalyses: CalculatedCountAnalysis[] = [];
    let overallHighestScore = 4;

    for (const section of questionnaire.sections) {
        // Determine the highest possible score across all questions for normalization
        const sectionMaxScore = getHighestPossibleOptionScore(section.questions);
        if (sectionMaxScore > overallHighestScore) {
            overallHighestScore = sectionMaxScore;
        }
        
        let sectionType = section.type;

        // For backward compatibility, if type is not set, infer it.
        if (!sectionType) {
          if (section.weight > 0) {
            sectionType = 'weighted';
          } else if (section.questions.length === 2 && section.questions.every(q => q.options.length >= 2)) {
            // Heuristic: If weight is 0, 2 questions, it's likely a matrix.
            sectionType = 'matrix';
          } else {
            // Fallback for non-weighted, non-matrix sections.
            sectionType = 'count';
          }
        }

        if (sectionType === 'weighted') {
            let achievedScore = 0;
            let maxPossibleScoreInSection = 0;
            
            section.questions.forEach(q => {
                const selectedOptionId = response.responses[q.id];
                const selectedOption = q.options.find(opt => opt.id === selectedOptionId);
                if (selectedOption) {
                    achievedScore += selectedOption.score;
                }
                maxPossibleScoreInSection += Math.max(...q.options.map(opt => opt.score), 0);
            });

            const averageScore = section.questions.length > 0 
                ? parseFloat((achievedScore / section.questions.length).toFixed(2)) 
                : 0;
            
            weightedScores.push({
                sectionId: section.id,
                sectionName: section.name,
                sectionWeight: section.weight,
                achievedScore,
                maxPossibleScore: maxPossibleScoreInSection,
                averageScore,
                weightedAverageScore: parseFloat((averageScore * section.weight).toFixed(2)),
                numQuestionsInSection: section.questions.length,
            });
        } else if (sectionType === 'matrix') {
            if (section.questions.length < 2) {
                console.warn(`Matrix section "${section.name}" has fewer than 2 questions and will be skipped.`);
                continue;
            }
            const q1 = section.questions[0];
            const q2 = section.questions[1];

            const selectedOptionId1 = response.responses[q1.id];
            const selectedOption1 = q1.options.find(opt => opt.id === selectedOptionId1);
            
            const selectedOptionId2 = response.responses[q2.id];
            const selectedOption2 = q2.options.find(opt => opt.id === selectedOptionId2);

            if (selectedOption1 && selectedOption2) {
                matrixAnalyses.push({
                    sectionId: section.id,
                    sectionName: section.name,
                    xAxisLabel: q1.question,
                    yAxisLabel: q2.question,
                    data: [
                        { x: selectedOption1.score, y: selectedOption2.score, name: section.name }
                    ],
                });
            }
        } else if (sectionType === 'count') {
            const answerCounts: Record<string, number> = {};
            
            section.questions.forEach(q => {
                const selectedOptionId = response.responses[q.id];
                const selectedOption = q.options.find(opt => opt.id === selectedOptionId);
                if (selectedOption) {
                    answerCounts[selectedOption.text] = (answerCounts[selectedOption.text] || 0) + 1;
                }
            });
            
            let mostFrequentAnswers: string[] = [];
            let maxCount = 0;
            if (Object.keys(answerCounts).length > 0) {
                maxCount = Math.max(...Object.values(answerCounts));
                mostFrequentAnswers = Object.keys(answerCounts).filter(
                    text => answerCounts[text] === maxCount
                );
            }

            countAnalyses.push({
                sectionId: section.id,
                sectionName: section.name,
                answerCounts,
                mostFrequentAnswers,
            });
        }
    }

    const totalAverageRanking = weightedScores.reduce((sum, score) => {
        return sum + score.weightedAverageScore;
    }, 0);
    
    return { reportData: { weightedScores, matrixAnalyses, countAnalyses, totalAverageRanking }, highestPossibleScore: overallHighestScore };

  }, [response, questionnaire]);


  if (isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <Button variant="outline" onClick={() => router.push('/admin/reports')} className="mb-4 print-hide">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Reports List
        </Button>
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-8 w-1/2" />
        <Card><CardHeader><Skeleton className="h-8 w-1/4 mb-2" /><Skeleton className="h-4 w-full" /></CardHeader><CardContent><Skeleton className="h-48 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-8 w-1/4 mb-2" /><Skeleton className="h-4 w-full" /></CardHeader><CardContent><Skeleton className="h-48 w-full" /></CardContent></Card>
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

  const sortedWeightedScores = [...reportData.weightedScores].sort((a,b) => b.averageScore - a.averageScore);

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
      </Card>
      
      {/* --- TOTAL AVERAGE RANKING --- */}
      {reportData.weightedScores.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl text-center">Total Average Ranking</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
                <p className={`text-5xl font-bold ${getScoreTextColorClassName(reportData.totalAverageRanking)}`}>{reportData.totalAverageRanking.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground mt-1">Weighted composite score from all scored areas.</p>
            </CardContent>
          </Card>
      )}

      {/* --- ZONE 1-7: WEIGHTED AREA SCORES --- */}
      {reportData.weightedScores.length > 0 && (
        <section>
          <Separator className="my-6" />
          <h2 className="text-2xl font-semibold mb-4 text-primary text-center">Weighted Area Scores</h2>
          <Card>
            <CardHeader>
              <CardTitle>Performance by Area</CardTitle>
              <CardDescription>Bar chart showing the average score for each weighted area, ordered high to low.</CardDescription>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(250, sortedWeightedScores.length * 40)}>
                    <BarChart
                        data={sortedWeightedScores}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" domain={[0, highestPossibleScore]} />
                        <YAxis type="category" dataKey="sectionName" width={150} interval={0} tick={{width: 140, textAnchor: 'end'}}/>
                        <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))' }}/>
                        <Bar dataKey="averageScore" radius={[0, 4, 4, 0]}>
                            {sortedWeightedScores.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={getScoreFillColor(entry.averageScore)} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
          </Card>
        </section>
      )}
      
      {/* --- ZONE 8-9: MATRIX ANALYSIS --- */}
      {reportData.matrixAnalyses.length > 0 && (
        <section className="page-break-before">
          <Separator className="my-6" />
          <h2 className="text-2xl font-semibold mb-4 text-primary text-center">Double-Entry Matrix Analysis</h2>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           {reportData.matrixAnalyses.map(analysis => (
               <Card key={analysis.sectionId}>
                 <CardHeader>
                    <CardTitle className="text-lg">{analysis.sectionName}</CardTitle>
                    <CardDescription>A visual plot of the responses for this matrix.</CardDescription>
                 </CardHeader>
                 <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <ScatterChart
                            margin={{ top: 20, right: 30, bottom: 40, left: 30 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" dataKey="x" name={analysis.xAxisLabel} domain={['dataMin - 1', 'dataMax + 1']}>
                                <RechartsLabel value={analysis.xAxisLabel} offset={-25} position="insideBottom" fill="hsl(var(--foreground))" fontSize={12} />
                            </XAxis>
                            <YAxis type="number" dataKey="y" name={analysis.yAxisLabel} domain={['dataMin - 1', 'dataMax + 1']}>
                                 <RechartsLabel value={analysis.yAxisLabel} angle={-90} position="insideLeft" style={{ textAnchor: 'middle' }} fill="hsl(var(--foreground))" fontSize={12} />
                            </YAxis>
                            <RechartsTooltip 
                              cursor={{ strokeDasharray: '3 3' }} 
                              contentStyle={{ 
                                backgroundColor: 'hsl(var(--card))', 
                                border: '1px solid hsl(var(--border))',
                                borderRadius: 'var(--radius)' 
                              }} 
                            />
                            <Scatter name={analysis.sectionName} data={analysis.data} fill="hsl(var(--primary))" r={10} />
                        </ScatterChart>
                    </ResponsiveContainer>
                 </CardContent>
              </Card>
           ))}
           </div>
        </section>
      )}

      {/* --- ZONE 10: COUNT ANALYSIS --- */}
      {reportData.countAnalyses.length > 0 && (
        <section className="page-break-before">
            <Separator className="my-6" />
            <h2 className="text-2xl font-semibold mb-4 text-primary text-center">Response Count Analysis</h2>
            <div className="space-y-4">
            {reportData.countAnalyses.map(analysis => (
                <Card key={analysis.sectionId}>
                    <CardHeader><CardTitle>{analysis.sectionName}</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Answer</TableHead>

                                    <TableHead className="text-right">Count</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Object.entries(analysis.answerCounts).sort(([, a], [, b]) => b - a).map(([text, count]) => (
                                    <TableRow key={text}>
                                        <TableCell className="font-medium flex items-center">
                                            {text}
                                            {analysis.mostFrequentAnswers.includes(text) && (
                                                <Badge variant="secondary" className="ml-2 bg-yellow-200 text-yellow-800">
                                                    <Star className="h-3 w-3 mr-1"/> Most Frequent
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">{count}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            ))}
            </div>
        </section>
      )}

      <Separator className="my-6" />
      
      {/* --- FOOTER & COMMENTS --- */}
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
                    <Button variant="outline" size="sm" className="mt-2 print-hide" disabled> 
                        <Edit className="mr-2 h-3 w-3"/> Edit Comments
                    </Button>
                </div>
            </CardContent>
        </Card>
      </section>
      
      <CardFooter className="print-hide">
          <p className="text-xs text-muted-foreground">Full report export to PDF/Word will be available in a future update. Use browser print for a basic version.</p>
      </CardFooter>
    </div>
  );
}

    