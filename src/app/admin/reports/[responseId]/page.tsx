
"use client";

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp, updateDoc } from 'firebase/firestore';
import type { CustomerResponse, QuestionnaireVersion, Section as SectionType, AnswerOption, CalculatedSectionScore, CalculatedCountAnalysis, CalculatedMatrixAnalysis } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText, AlertCircle, Edit, Star, Download, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Label as RechartsLabel,
} from 'recharts';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, ImageRun, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';


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
    const { xAxisLabel, yAxisLabel } = data.parent;
    return (
      <div className="p-2 bg-card border rounded-md shadow-lg text-card-foreground text-sm">
        <p className="font-bold">{data.name}</p>
        <p><strong>{xAxisLabel}:</strong> {data.x}</p>
        <p><strong>{yAxisLabel}:</strong> {data.y}</p>
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
  const [isEditingComments, setIsEditingComments] = useState(false);
  const [executiveSummaryComment, setExecutiveSummaryComment] = useState("");
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const matrixChartRef = useRef<HTMLDivElement>(null);


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
          setExecutiveSummaryComment(responseData.adminComments?.executiveSummary || "");

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
        return { reportData: { barScores: [], matrixAnalyses: [], countAnalyses: [], totalAverageRanking: 0 }, highestPossibleScore: 4 };
    }

    const barScores: CalculatedSectionScore[] = [];
    const matrixSections: (SectionType & { answerScore: number })[] = [];
    const countAnalyses: CalculatedCountAnalysis[] = [];
    let overallHighestScore = 4;

    questionnaire.sections.forEach((section, index) => {
        const sectionType = section.type;
        
        // This logic determines type by index for backward compatibility if `type` field is missing.
        const effectiveType = sectionType || (index < 7 ? 'bar' : index < 9 ? 'matrix' : 'count');


        if (effectiveType === 'bar') {
            const sectionMaxScore = getHighestPossibleOptionScore(section.questions);
            if (sectionMaxScore > overallHighestScore) {
                overallHighestScore = sectionMaxScore;
            }

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
            const sectionWeight = typeof section.total_score === 'number' ? section.total_score : (typeof section.weight === 'number' ? section.weight : 0);

            barScores.push({
                sectionId: section.id,
                sectionName: section.name,
                sectionWeight: sectionWeight,
                achievedScore,
                averageScore,
                weightedAverageScore: parseFloat((averageScore * sectionWeight).toFixed(2)),
            });
        }
        
        else if (effectiveType === 'matrix') {
             const question = section.questions[0];
            if (question) {
                const selectedOptionId = response.responses[question.id];
                const selectedOption = question.options.find(opt => opt.id === selectedOptionId);
                if (selectedOption && typeof selectedOption.score === 'number') {
                    matrixSections.push({ ...section, answerScore: selectedOption.score });
                }
            }
        }
        
        else if (effectiveType === 'count') {
            const scoreCounts: Record<string, number> = {};
            section.questions.forEach(q => {
                const selectedOptionId = response.responses[q.id];
                const selectedOption = q.options.find(opt => opt.id === selectedOptionId);
                if (selectedOption && typeof selectedOption.score === 'number') {
                    const scoreKey = String(selectedOption.score);
                    scoreCounts[scoreKey] = (scoreCounts[scoreKey] || 0) + 1;
                }
            });
            let mostFrequentScores: number[] = [];
            let maxCount = 0;
            if (Object.keys(scoreCounts).length > 0) {
                maxCount = Math.max(...Object.values(scoreCounts));
                mostFrequentScores = Object.keys(scoreCounts)
                    .filter(score => scoreCounts[score] === maxCount)
                    .map(Number);
            }
            countAnalyses.push({
                sectionId: section.id,
                sectionName: section.name,
                scoreCounts,
                mostFrequentScores,
            });
        }
    });
    
    // Process collected matrix sections into a single analysis
    const matrixAnalyses: CalculatedMatrixAnalysis[] = [];
    const xSection = matrixSections.find(s => s.matrix_axis === 'x') || matrixSections[0];
    const ySection = matrixSections.find(s => s.matrix_axis === 'y') || matrixSections[1];

    if (xSection && ySection) {
        const xAxisLabel = xSection.name || "X-Axis";
        const yAxisLabel = ySection.name || "Y-Axis";
        const matrixData = {
            sectionId: 'combined-matrix',
            sectionName: 'Double-Entry Matrix Analysis',
            xAxisLabel,
            yAxisLabel,
            data: [{ 
                x: xSection.answerScore, 
                y: ySection.answerScore, 
                name: 'Assessment Result',
                parent: { xAxisLabel, yAxisLabel }
            }],
        };
        matrixAnalyses.push(matrixData);
    }

    const totalAverageRanking = barScores.reduce((sum, score) => {
        return sum + (score.weightedAverageScore || 0);
    }, 0);
    
    return { reportData: { barScores, matrixAnalyses, countAnalyses, totalAverageRanking }, highestPossibleScore: overallHighestScore };

  }, [response, questionnaire]);

  const handleSaveComments = async () => {
    if (!responseId) return;
    setIsSavingComment(true);
    try {
      const responseRef = doc(db, 'customerResponses', responseId);
      await updateDoc(responseRef, {
        "adminComments.executiveSummary": executiveSummaryComment 
      });

      setResponse(prevResponse => {
        if (!prevResponse) return null;
        return {
          ...prevResponse,
          adminComments: {
            ...prevResponse.adminComments,
            executiveSummary: executiveSummaryComment
          }
        };
      });

      toast({ title: "Success", description: "Comments saved successfully." });
      setIsEditingComments(false);
    } catch (error) {
      console.error("Error saving comments:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to save comments." });
    } finally {
      setIsSavingComment(false);
    }
  };

  const handleExportToDocx = async () => {
    if (!response || !questionnaire) {
        toast({ variant: 'destructive', title: 'Error', description: 'Report data not available for export.' });
        return;
    }
    setIsDownloading(true);

    try {
        let chartImageBuffer: Buffer | undefined;
        if (matrixChartRef.current) {
            const canvas = await html2canvas(matrixChartRef.current, { backgroundColor: null });
            const imageDataUrl = canvas.toDataURL('image/png');
            chartImageBuffer = Buffer.from(imageDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
        }
        
        const createHeading = (text: string) => new Paragraph({
            text,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 },
        });

        const docSections: (Paragraph | DocxTable)[] = [];

        docSections.push(new Paragraph({
            text: "Executive Summary",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
        }));

        docSections.push(new Paragraph({ text: `Report for: ${response.customerName || 'N/A'}` }));
        docSections.push(new Paragraph({ text: `Questionnaire: ${response.questionnaireVersionName}` }));
        docSections.push(new Paragraph({ text: `Submitted: ${format(response.submittedAt, 'PPP p')}`, spacing: { after: 240 } }));

        if (reportData.barScores.length > 0) {
             docSections.push(createHeading('Total Average Ranking'));
             docSections.push(new Paragraph({
                children: [new TextRun({ text: reportData.totalAverageRanking.toFixed(2), size: 48, bold: true })],
                alignment: AlignmentType.CENTER
             }));
        }
        
        if (reportData.barScores.length > 0) {
            docSections.push(createHeading('Weighted Area Scores'));
            reportData.barScores.forEach(area => {
                docSections.push(new Paragraph({
                    children: [
                        new TextRun({ text: `${area.sectionName}: `, bold: true }),
                        new TextRun(area.averageScore.toFixed(2))
                    ]
                }));
            });
        }

        if (reportData.matrixAnalyses.length > 0 && chartImageBuffer) {
            docSections.push(createHeading('Double-Entry Matrix Analysis'));
            docSections.push(new Paragraph({
                children: [
                    new ImageRun({
                        data: chartImageBuffer,
                        transformation: {
                            width: 500,
                            height: 300,
                        },
                    }),
                ],
                alignment: AlignmentType.CENTER
            }));
        }

        if (reportData.countAnalyses.length > 0) {
            docSections.push(createHeading('Response Count Analysis'));
            reportData.countAnalyses.forEach(analysis => {
                docSections.push(new Paragraph({ text: analysis.sectionName, bold: true, spacing: { after: 120 } }));
                const tableRows = [
                    new DocxTableRow({
                        children: [
                            new DocxTableCell({ children: [new Paragraph({ text: "Score Value", bold: true })] }),
                            new DocxTableCell({ children: [new Paragraph({ text: "Times Selected", bold: true })] }),
                        ],
                    }),
                ];
                Object.entries(analysis.scoreCounts).sort(([, a], [, b]) => b - a).forEach(([score, count]) => {
                     let scoreTextChildren = [new TextRun(`Score: ${score}`)];
                     if(analysis.mostFrequentScores.includes(Number(score))) {
                        scoreTextChildren.push(new TextRun({ text: " (Most Frequent)", bold: true }));
                     }
                     tableRows.push(new DocxTableRow({
                        children: [
                            new DocxTableCell({ children: [new Paragraph({ children: scoreTextChildren })] }),
                            new DocxTableCell({ children: [new Paragraph(String(count))] }),
                        ],
                     }));
                });
                const table = new DocxTable({
                    rows: tableRows,
                    width: { size: 100, type: WidthType.PERCENTAGE },
                });
                docSections.push(table);
            });
        }

        docSections.push(createHeading('Summary & Comments'));
        docSections.push(new Paragraph({ 
            text: "Admin Comments",
            bold: true,
            spacing: { after: 60 }
        }));
        docSections.push(new Paragraph({ text: response.adminComments?.executiveSummary || "No executive summary comments added yet." }));

        const doc = new Document({
            sections: [{
                children: docSections
            }],
        });

        Packer.toBlob(doc).then(blob => {
            saveAs(blob, `Report-${response.customerName?.replace(/\s/g, '_') || response.id}.docx`);
        });

    } catch (error) {
        console.error("Error exporting to DOCX:", error);
        toast({ variant: "destructive", title: "Export Failed", description: "Could not generate the Word document." });
    } finally {
        setIsDownloading(false);
    }
  };


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

  const sortedBarScores = [...reportData.barScores].sort((a,b) => b.averageScore - a.averageScore);

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
        <div className="flex gap-2">
          <Button onClick={handleExportToDocx} disabled={isDownloading}>
            {isDownloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download as Word
          </Button>
          <Button onClick={() => window.print()}>
            <FileText className="mr-2 h-4 w-4" /> Print/Export (Basic)
          </Button>
        </div>
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
      {reportData.barScores.length > 0 && (
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

      {/* --- BAR CHART SCORES --- */}
      {reportData.barScores.length > 0 && (
        <section>
          <Separator className="my-6" />
          <h2 className="text-2xl font-semibold mb-4 text-primary text-center">Weighted Area Scores</h2>
          <Card>
            <CardHeader>
              <CardTitle>Performance by Area</CardTitle>
              <CardDescription>Average score for each weighted area, ordered high to low.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              {sortedBarScores.map((area) => (
                <div key={area.sectionId} className="grid grid-cols-12 items-center gap-4 border-b pb-4 last:border-b-0 last:pb-0">
                  <p className="col-span-12 sm:col-span-4 font-medium text-sm truncate" title={area.sectionName}>
                    {area.sectionName}
                  </p>
                  <div className="col-span-10 sm:col-span-6">
                    <div className="w-full bg-muted rounded-full h-3">
                      <div
                        className="h-3 rounded-full"
                        style={{
                          width: `${(area.averageScore / highestPossibleScore) * 100}%`,
                          backgroundColor: getScoreFillColor(area.averageScore),
                        }}
                      ></div>
                    </div>
                  </div>
                  <p className={`col-span-2 sm:col-span-2 text-right font-bold ${getScoreTextColorClassName(area.averageScore)}`}>
                    {area.averageScore.toFixed(2)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}
      
      {/* --- MATRIX ANALYSIS --- */}
      {reportData.matrixAnalyses.length > 0 && (
        <section ref={matrixChartRef} className="page-break-before">
          <Separator className="my-6" />
          <h2 className="text-2xl font-semibold mb-4 text-primary text-center">Double-Entry Matrix Analysis</h2>
           <div className="grid grid-cols-1 gap-6">
           {reportData.matrixAnalyses.map(analysis => (
               <Card key={analysis.sectionId}>
                 <CardHeader>
                    <CardTitle className="text-lg">{analysis.sectionName}</CardTitle>
                    <CardDescription>A visual plot of {analysis.xAxisLabel} vs. {analysis.yAxisLabel}.</CardDescription>
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
                              content={<CustomTooltip />}
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

      {/* --- COUNT ANALYSIS --- */}
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
                                    <TableHead>Score Value</TableHead>
                                    <TableHead className="text-right">Times Selected</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Object.entries(analysis.scoreCounts).sort(([, a], [, b]) => b - a).map(([score, count]) => (
                                    <TableRow key={score}>
                                        <TableCell className="font-medium flex items-center">
                                            Score: {score}
                                            {analysis.mostFrequentScores.includes(Number(score)) && (
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
                  {isEditingComments ? (
                    <div className="space-y-2">
                      <Textarea
                        value={executiveSummaryComment}
                        onChange={(e) => setExecutiveSummaryComment(e.target.value)}
                        placeholder="Enter executive summary comments..."
                        rows={4}
                        disabled={isSavingComment}
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setIsEditingComments(false)} disabled={isSavingComment}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={handleSaveComments} disabled={isSavingComment}>
                          {isSavingComment ? "Saving..." : "Save Comments"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="p-3 border rounded-md bg-secondary/20 min-h-[60px]">
                        <p className="text-sm text-secondary-foreground whitespace-pre-wrap">
                          {response?.adminComments?.executiveSummary || "No executive summary comments added yet."}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 print-hide"
                        onClick={() => {
                          setExecutiveSummaryComment(response?.adminComments?.executiveSummary || "");
                          setIsEditingComments(true);
                        }}
                      >
                        <Edit className="mr-2 h-3 w-3" /> Edit Comments
                      </Button>
                    </>
                  )}
                </div>
            </CardContent>
        </Card>
      </section>
      
      <CardFooter className="print-hide">
          <p className="text-xs text-muted-foreground">For a fully editable version, download the report as a Word document.</p>
      </CardFooter>
    </div>
  );
}
