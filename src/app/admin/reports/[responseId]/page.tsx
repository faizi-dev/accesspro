

"use client";

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp, updateDoc } from 'firebase/firestore';
import type { AttachmentFile, AreaScoreText, CustomerResponse, QuestionnaireVersion, Section as SectionType, ReportTotalAverage, CalculatedSectionScore, CalculatedCountAnalysis, CalculatedMatrixAnalysis } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText, AlertCircle, Edit, Star, Download, Loader2, MessageSquareQuote, ListOrdered, Paperclip } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Label as RechartsLabel,
} from 'recharts';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, ImageRun, AlignmentType, ShadingType, ExternalHyperlink } from 'docx';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';


// Helper function to determine tailwind CSS class based on score
const getScoreColorClass = (score: number): { text: string; bg: string } => {
  if (score < 1.5) return { text: 'text-red-600', bg: 'bg-red-600' };
  if (score >= 1.5 && score <= 2.5) return { text: 'text-orange-500', bg: 'bg-orange-500' };
  if (score > 2.5 && score <= 3.5) return { text: 'text-yellow-500', bg: 'bg-yellow-500' };
  if (score > 3.5) return { text: 'text-green-600', bg: 'bg-green-600' };
  return { text: 'text-muted-foreground', bg: 'bg-muted' };
};

// Helper function to determine color based on score for recharts fill
const getScoreFillColor = (score: number): string => {
  if (score < 1.5) return 'hsl(0 72% 51%)';
  if (score >= 1.5 && score <= 2.5) return 'hsl(25 95% 53%)';
  if (score > 2.5 && score <= 3.5) return 'hsl(48 96% 53%)';
  if (score > 3.5) return 'hsl(142 71% 45%)';
  return 'hsl(var(--muted))';
};

const getHighestPossibleOptionScore = (questions: SectionType['questions']): number => {
    if (!questions || questions.length === 0 || !questions[0].options || questions[0].options.length === 0) return 4;
    // In a weighted section, assume all questions have same max score
    return Math.max(...questions[0].options.map(opt => opt.score), 0);
}

// Helper function to get HEX color for DOCX export
const getScoreHexColor = (score: number): string => {
  if (score < 1.5) return 'E53E3E'; // Red
  if (score >= 1.5 && score <= 2.5) return 'DD6B20'; // Orange
  if (score > 2.5 && score <= 3.5) return 'D69E2E'; // Yellow
  if (score > 3.5) return '38A169'; // Green
  return '718096'; // Gray
};

const defaultScoreLabels: ReportTotalAverage = {
  green: "Corpo in salute",
  yellow: "Corpo con aree di miglioramento",
  orange: "Corpo in difficolta da analizzare",
  red: "Corpo con criticità urgenti",
};

const defaultMatrixLabels: AreaScoreText = {
  area_X_less_than_3_area_Y_less_than_3: "OFFICINA FAMIGLIARE",
  area_X_less_than_3_area_Y_greater_than_3: "IMPRESA SISTEMA",
  area_X_greater_than_3_area_Y_less_than_3: "HUB MANAGERIALE",
  area_X_greater_than_3_area_Y_greater_than_3: "ECOSISTEMA EVOLUTO",
};

// New helper for thermometer image and text
const getThermometerInfo = (score: number, scoreLabels: ReportTotalAverage = defaultScoreLabels) => {
    if (score < 1.5) {
        return { image: '/red_thermometer.png', text: scoreLabels.red, color: 'text-red-600' };
    }
    if (score >= 1.5 && score <= 2.5) {
        return { image: '/orange_thermometer.png', text: scoreLabels.orange, color: 'text-orange-500' };
    }
    if (score > 2.5 && score <= 3.5) {
        return { image: '/yellow_thermometer.png', text: scoreLabels.yellow, color: 'text-yellow-500' };
    }
    // score > 3.5
    return { image: '/green_thermometer.png', text: scoreLabels.green, color: 'text-green-600' };
};


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
  const [isExportingAnswers, setIsExportingAnswers] = useState(false);
  const [selectedSections, setSelectedSections] = useState<Record<string, boolean>>({});

  const matrixChartRef = useRef<HTMLDivElement>(null);
  const barChartExportRef = useRef<HTMLDivElement>(null);
  const countAnalysisExportRef = useRef<HTMLDivElement>(null);
  
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

        if (sectionType === 'bar') {
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
            
            let analysisText = "";
            if (section.area_score_text) {
              if (averageScore < 1.5) analysisText = section.area_score_text.score_less_than_1_5 ?? "";
              else if (averageScore >= 1.5 && averageScore <= 2.5) analysisText = section.area_score_text.score_between_1_51_and_2_5 ?? "";
              else if (averageScore > 2.5 && averageScore <= 3.5) analysisText = section.area_score_text.score_between_2_51_and_3_5 ?? "";
              else if (averageScore > 3.5) analysisText = section.area_score_text.score_greater_than_3_5 ?? "";
            }

            barScores.push({
                sectionId: section.id,
                sectionName: section.name,
                sectionWeight: sectionWeight,
                achievedScore,
                averageScore,
                weightedAverageScore: parseFloat((averageScore * sectionWeight).toFixed(2)),
                analysisText,
            });
        }
        
        else if (sectionType === 'matrix') {
             const question = section.questions[0];
            if (question) {
                const selectedOptionId = response.responses[question.id];
                const selectedOption = question.options.find(opt => opt.id === selectedOptionId);
                if (selectedOption && typeof selectedOption.score === 'number') {
                    matrixSections.push({ ...section, answerScore: selectedOption.score });
                }
            }
        }
        
        else if (sectionType === 'count') {
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
            let analysisText = "";
            if(mostFrequentScores.length > 0 && section.area_score_text) {
              // Handle multiple "most frequent" if they have the same count
              analysisText = mostFrequentScores.map(score => section.area_score_text?.[`score_${score}`] ?? "").join(' / ');
            }

            countAnalyses.push({
                sectionId: section.id,
                sectionName: section.name,
                scoreCounts,
                mostFrequentScores,
                analysisText,
            });
        }
    });
    
    const matrixAnalyses: CalculatedMatrixAnalysis[] = [];
    if (matrixSections.length >= 2) {
      const xSection = matrixSections.find(s => s.matrix_axis === 'x');
      const ySection = matrixSections.find(s => s.matrix_axis === 'y');
  
      if (xSection && ySection) {
          const xAxisLabel = xSection.name || "X-Axis";
          const yAxisLabel = ySection.name || "Y-Axis";
          const xScore = xSection.answerScore;
          const yScore = ySection.answerScore;

          const matrixTextConfig = xSection.area_score_text || defaultMatrixLabels;
          let analysisText = "";
          if(xScore < 3 && yScore < 3) analysisText = matrixTextConfig.area_X_less_than_3_area_Y_less_than_3 ?? "";
          else if(xScore < 3 && yScore >= 3) analysisText = matrixTextConfig.area_X_less_than_3_area_Y_greater_than_3 ?? "";
          else if(xScore >= 3 && yScore < 3) analysisText = matrixTextConfig.area_X_greater_than_3_area_Y_less_than_3 ?? "";
          else if(xScore >= 3 && yScore >= 3) analysisText = matrixTextConfig.area_X_greater_than_3_area_Y_greater_than_3 ?? "";


          const xQuestion = xSection.questions?.[0];
          const yQuestion = ySection.questions?.[0];

          let xAxisDomain: [number, number] = [0, 5]; // Default fallback
          if (xQuestion?.options?.length > 0) {
              const xMax = Math.max(...xQuestion.options.map(o => o.score));
              xAxisDomain = [0, xMax];
          }

          let yAxisDomain: [number, number] = [0, 5]; // Default fallback
          if (yQuestion?.options?.length > 0) {
              const yMax = Math.max(...yQuestion.options.map(o => o.score));
              yAxisDomain = [0, yMax];
          }

          const matrixData = {
              sectionId: 'combined-matrix',
              xSectionId: xSection.id,
              ySectionId: ySection.id,
              sectionName: 'Double-Entry Matrix Analysis',
              xAxisLabel,
              yAxisLabel,
              analysisText,
              data: [{ 
                  x: xScore, 
                  y: yScore, 
                  name: 'Assessment Result',
                  parent: { xAxisLabel, yAxisLabel }
              }],
              xAxisDomain,
              yAxisDomain,
          };
          matrixAnalyses.push(matrixData);
      }
    }


    const totalAverageRanking = barScores.reduce((sum, score) => {
        const weight = typeof score.sectionWeight === 'number' ? score.sectionWeight : 0;
        return sum + (score.averageScore * weight);
    }, 0);
    
    return { reportData: { barScores, matrixAnalyses, countAnalyses, totalAverageRanking }, highestPossibleScore: overallHighestScore };

  }, [response, questionnaire]);

  useEffect(() => {
    if (questionnaire?.sections) {
      const initialSelection = questionnaire.sections.reduce((acc, section) => {
        acc[section.id] = true;
        return acc;
      }, {} as Record<string, boolean>);
      setSelectedSections(initialSelection);
    }
  }, [questionnaire]);

  const handleSectionSelectionChange = (sectionId: string, isSelected: boolean) => {
    setSelectedSections(prev => ({
      ...prev,
      [sectionId]: isSelected,
    }));
  };

  const handleMatrixSelectionChange = (xId: string, yId: string, isSelected: boolean) => {
    setSelectedSections(prev => ({
        ...prev,
        [xId]: isSelected,
        [yId]: isSelected,
    }));
  };

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

  const sortedBarScores = [...reportData.barScores].sort((a,b) => b.averageScore - a.averageScore);

  const handleExportToDocx = async () => {
    if (!response || !questionnaire) {
        toast({ variant: 'destructive', title: 'Error', description: 'Report data not available for export.' });
        return;
    }
    setIsDownloading(true);

    const includedSectionIds = Object.keys(selectedSections).filter(id => selectedSections[id]);
    if (includedSectionIds.length === 0 && (!response.attachments || response.attachments.length === 0)) {
        toast({ variant: 'destructive', title: 'No Content Selected', description: 'Please select at least one section or have attachments to include in the export.' });
        setIsDownloading(false);
        return;
    }

    const includedBarScores = reportData.barScores.filter(score => includedSectionIds.includes(score.sectionId));
    const includedCountAnalyses = reportData.countAnalyses.filter(analysis => includedSectionIds.includes(analysis.sectionId));
    const includedSections = questionnaire.sections.filter(section => includedSectionIds.includes(section.id));
    
    const matrixAnalysis = reportData.matrixAnalyses[0];
    const shouldIncludeMatrix = matrixAnalysis && selectedSections[matrixAnalysis.xSectionId] && selectedSections[matrixAnalysis.ySectionId];

    try {
        let thermometerImageBuffer: ArrayBuffer | undefined;
        if (reportData.barScores.length > 0) {
            const { image: thermometerImageSrc } = getThermometerInfo(
                reportData.totalAverageRanking,
                questionnaire.report_total_average
            );
            if (thermometerImageSrc) {
                const imageUrl = `${window.location.origin}${thermometerImageSrc}`;
                const imageBlob = await (await fetch(imageUrl)).blob();
                thermometerImageBuffer = await imageBlob.arrayBuffer();
            }
        }

        let barChartImageBuffer: ArrayBuffer | undefined;
        if (barChartExportRef.current && includedBarScores.length > 0) {
            const canvas = await html2canvas(barChartExportRef.current, { backgroundColor: '#FFFFFF', scale: 2 });
            const imageDataUrl = canvas.toDataURL('image/png');
            barChartImageBuffer = Buffer.from(imageDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
        }
        
        let matrixChartImageBuffer: ArrayBuffer | undefined;
        if (matrixChartRef.current && shouldIncludeMatrix) {
            const canvas = await html2canvas(matrixChartRef.current, { backgroundColor: '#FFFFFF', scale: 2 });
            const imageDataUrl = canvas.toDataURL('image/png');
            matrixChartImageBuffer = Buffer.from(imageDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
        }
        
        let countAnalysisImageBuffer: ArrayBuffer | undefined;
        if (countAnalysisExportRef.current && includedCountAnalyses.length > 0) {
            const canvas = await html2canvas(countAnalysisExportRef.current, { backgroundColor: '#FFFFFF', scale: 2 });
            const imageDataUrl = canvas.toDataURL('image/png');
            countAnalysisImageBuffer = Buffer.from(imageDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
        }

        const fetchImageAsBuffer = async (url: string) => {
            try {
                const response = await fetch(url);
                if (!response.ok) return null;
                const blob = await response.blob();
                return await blob.arrayBuffer();
            } catch (e) {
                console.error("Failed to fetch image for DOCX:", e);
                return null;
            }
        };

        const docChildren: (Paragraph | DocxTable | undefined)[] = [];

        docChildren.push(new Paragraph({
            text: "Executive Summary",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
        }));

        const createHeaderLine = (text: string) => new Paragraph({
            children: [new TextRun({ text, size: 28 })], // 14pt font size
            spacing: { after: 60 }
        });

        docChildren.push(createHeaderLine(`Report for: ${response.customerName || 'N/A'}`));
        docChildren.push(createHeaderLine(`Questionnaire: ${response.questionnaireVersionName}`));
        docChildren.push(createHeaderLine(`Submitted: ${format(response.submittedAt, 'PPP p')}`));
        docChildren.push(new Paragraph({ text: '', spacing: { after: 240 } }));


        if (reportData.barScores.length > 0 && thermometerImageBuffer) {
             docChildren.push(new Paragraph({
                children: [
                    new ImageRun({
                        data: thermometerImageBuffer,
                        transformation: { width: 224, height: 224 },
                    }),
                ],
                alignment: AlignmentType.CENTER,
             }));

            const { text: scoreText } = getThermometerInfo(reportData.totalAverageRanking, questionnaire.report_total_average);
            docChildren.push(new Paragraph({
                 children: [
                    new TextRun({
                        text: `Total Average: ${reportData.totalAverageRanking.toFixed(2)} : ${scoreText}`,
                        size: 32, // 16pt font size
                        bold: true,
                        color: getScoreHexColor(reportData.totalAverageRanking)
                    })
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 240 }
            }));
        }
        
        if (includedBarScores.length > 0 && barChartImageBuffer) {
            docChildren.push(new Paragraph({
                children: [
                    new ImageRun({
                        data: barChartImageBuffer,
                        transformation: {
                            width: 550,
                            height: (barChartExportRef.current?.clientHeight || 300) * (550 / (barChartExportRef.current?.clientWidth || 800)),
                        },
                    }),
                ],
                alignment: AlignmentType.CENTER
            }));
        }
        
        const createHeading = (text: string, level: HeadingLevel = HeadingLevel.HEADING_2) => new Paragraph({
            text,
            heading: level,
            spacing: { before: 240, after: 120 },
        });

        if (shouldIncludeMatrix && matrixChartImageBuffer) {
            docChildren.push(createHeading('Double-Entry Matrix Analysis'));
            if(matrixAnalysis.analysisText) {
                docChildren.push(new Paragraph({ text: matrixAnalysis.analysisText, alignment: AlignmentType.CENTER, bold: true, color: "5DADE2", spacing: { after: 120 } }));
            }
            docChildren.push(new Paragraph({
                children: [
                    new ImageRun({
                        data: matrixChartImageBuffer,
                        transformation: {
                            width: 500,
                            height: (matrixChartRef.current?.clientHeight || 300) * (500 / (matrixChartRef.current?.clientWidth || 600)),
                        },
                    }),
                ],
                alignment: AlignmentType.CENTER
            }));
        }

        if (includedCountAnalyses.length > 0) {
            docChildren.push(createHeading('Response Count Analysis'));
            includedCountAnalyses.forEach(analysis => {
                if(analysis.analysisText) {
                    docChildren.push(new Paragraph({ text: `${analysis.sectionName}: ${analysis.analysisText}`, alignment: AlignmentType.CENTER, bold: true, color: "5DADE2", spacing: { after: 120 } }));
                }
            });
            if (countAnalysisImageBuffer) {
              docChildren.push(new Paragraph({
                  children: [
                      new ImageRun({
                          data: countAnalysisImageBuffer,
                          transformation: {
                              width: 550,
                              height: (countAnalysisExportRef.current?.clientHeight || 300) * (550 / (countAnalysisExportRef.current?.clientWidth || 800)),
                          },
                      }),
                  ],
                  alignment: AlignmentType.CENTER
              }));
            }
        }
        
        // Attachment section in Word doc
        if (response.attachments && response.attachments.length > 0) {
            docChildren.push(createHeading('Uploaded Attachments'));

            for (const file of response.attachments) {
                if (file.type.startsWith('image/')) {
                    const imageBuffer = await fetchImageAsBuffer(file.url);
                    if (imageBuffer) {
                        docChildren.push(new Paragraph({ text: file.name, style: "IntenseQuote" }));
                        docChildren.push(new Paragraph({
                            children: [
                                new ImageRun({
                                    data: imageBuffer,
                                    transformation: { width: 400, height: 300 }, // Adjust size as needed
                                }),
                            ],
                            spacing: { after: 120 }
                        }));
                    }
                } else {
                    // For non-image files, add a hyperlink
                    docChildren.push(new Paragraph({
                        children: [
                            new TextRun("File: "),
                            new ExternalHyperlink({
                                children: [
                                    new TextRun({
                                        text: file.name,
                                        style: "Hyperlink",
                                    }),
                                ],
                                link: file.url,
                            }),
                        ],
                         spacing: { after: 120 }
                    }));
                }
            }
        }

        docChildren.push(createHeading('Summary & Comments'));
        docChildren.push(new Paragraph({ 
            text: "Admin Comments",
            bold: true,
            spacing: { after: 60 }
        }));
        docChildren.push(new Paragraph({ text: response.adminComments?.executiveSummary || "No executive summary comments added yet." }));

        // --- Detailed Section Pages ---
        const barSectionsForExport = includedSections.filter(s => s.type === 'bar');

        if (barSectionsForExport.length > 0) {
            docChildren.push(new Paragraph({
                text: "ALLEGATO 1: ANALISI DI DETTAGLIO DI OGNI AREA",
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
                pageBreakBefore: true,
                spacing: { after: 240 }
            }));
        }

        for (const section of barSectionsForExport) {
            docChildren.push(createHeading(section.name, HeadingLevel.HEADING_2));
            if (section.description) {
                docChildren.push(new Paragraph({ text: section.description, style: "TOC1" }));
            }

            // Find calculated score for this section
            const calculatedScoreData = reportData.barScores.find(s => s.sectionId === section.id);
            const sectionAverageScore = calculatedScoreData?.averageScore || 0;
            const analysisText = calculatedScoreData?.analysisText || "";
            
            docChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: "Area Average Score: ", bold: true }),
                    new TextRun({ text: sectionAverageScore.toFixed(2), bold: true, color: "5DADE2" })
                ],
                spacing: { after: 240 }
            }));

            if(analysisText) {
                docChildren.push(new Paragraph({
                    children: [ new TextRun({ text: analysisText, bold: true, color: getScoreHexColor(sectionAverageScore) }) ],
                    spacing: { after: 240 },
                    alignment: AlignmentType.CENTER
                }));
            }

            docChildren.push(createHeading("Question Breakdown", HeadingLevel.HEADING_3));

            for (const question of section.questions) {
                const selectedOptionId = response.responses[question.id];
                const selectedOption = question.options.find(opt => opt.id === selectedOptionId);
                const score = selectedOption?.score ?? 0;

                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: question.question, bold: true })],
                    spacing: { after: 60 }
                }));
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: `Answer: `, italics: true }), new TextRun({ text: selectedOption?.text ?? "Not answered" })],
                    spacing: { after: 120 }
                }));
                
                // Create bar graphic for score
                const questionHighestScore = getHighestPossibleOptionScore([question]);
                const scorePercentage = questionHighestScore > 0 ? (score / questionHighestScore) : 0;
                const barColor = getScoreHexColor(score);
                const totalBarWidth = 7000; // In DXA (twentieths of a point)
                const filledWidth = Math.round(totalBarWidth * scorePercentage);
                const unfilledWidth = totalBarWidth - filledWidth;
                
                const barGraphic = new DocxTable({
                    width: { size: totalBarWidth, type: WidthType.DXA },
                    rows: [
                        new DocxTableRow({
                            height: { value: 200, rule: 'atLeast' },
                            children: [
                                new DocxTableCell({
                                    width: { size: filledWidth, type: WidthType.DXA },
                                    shading: { type: ShadingType.CLEAR, fill: barColor },
                                    children: [new Paragraph('')],
                                    borders: { top: {style: 'nil'}, bottom: {style: 'nil'}, left: {style: 'nil'}, right: {style: 'nil'} }
                                }),
                                new DocxTableCell({
                                    width: { size: unfilledWidth, type: WidthType.DXA },
                                    shading: { type: ShadingType.CLEAR, fill: 'E5E7EB' }, // a light grey
                                    children: [new Paragraph('')],
                                    borders: { top: {style: 'nil'}, bottom: {style: 'nil'}, left: {style: 'nil'}, right: {style: 'nil'} }
                                }),
                            ],
                        }),
                    ],
                    borders: {
                        top: { style: "single", size: 2, color: "auto" },
                        bottom: { style: "single", size: 2, color: "auto" },
                        left: { style: "single", size: 2, color: "auto" },
                        right: { style: "single", size: 2, color: "auto" },
                    },
                });

                const layoutTable = new DocxTable({
                    width: { size: '100%', type: WidthType.PERCENTAGE },
                    columnWidths: [totalBarWidth + 100, 1500],
                    rows: [
                        new DocxTableRow({
                            children: [
                                new DocxTableCell({
                                    children: [barGraphic],
                                    borders: { top: {style: 'nil'}, bottom: {style: 'nil'}, left: {style: 'nil'}, right: {style: 'nil'} }
                                }),
                                new DocxTableCell({
                                    children: [new Paragraph({
                                        children: [new TextRun({ text: score.toFixed(2), bold: true, color: barColor })],
                                        alignment: AlignmentType.RIGHT,
                                    })],
                                    verticalAlign: 'center',
                                    borders: { top: {style: 'nil'}, bottom: {style: 'nil'}, left: {style: 'nil'}, right: {style: 'nil'} }
                                }),
                            ],
                        }),
                    ],
                });

                docChildren.push(layoutTable);
                
                docChildren.push(new Paragraph({
                    text: "",
                    border: { bottom: { color: "auto", space: 1, value: "single", size: 6 } },
                    spacing: { after: 240, before: 240 }
                }));
            }

            docChildren.push(createHeading("Analysis & Comments", HeadingLevel.HEADING_3));
            
            const dynamicComment = response.dynamicComments?.[section.id] ?? section.comment ?? "No dynamic analysis for this section.";
            docChildren.push(new Paragraph({ text: "Dynamic Analysis", bold: true, spacing: { after: 60 } }));
            docChildren.push(new Paragraph({ text: dynamicComment, spacing: { after: 120 } }));

            const adminComment = response.adminComments?.[section.id] ?? "No admin comments added for this section yet.";
            docChildren.push(new Paragraph({ text: "Admin Comments", bold: true, spacing: { after: 60 } }));
            docChildren.push(new Paragraph({ text: adminComment, spacing: { after: 240 } }));

            // Add page break after each detailed section except the last one
            if (section !== barSectionsForExport[barSectionsForExport.length - 1]) {
                docChildren.push(new Paragraph({ pageBreakBefore: true }));
            }
        }

        const doc = new Document({
            styles: {
                paragraphStyles: [
                    {
                        id: "IntenseQuote",
                        name: "Intense Quote",
                        basedOn: "Normal",
                        next: "Normal",
                        quickFormat: true,
                        run: {
                            italics: true,
                            color: "76923C",
                        },
                    },
                ],
            },
            sections: [{
                children: docChildren.filter((s): s is Paragraph | DocxTable => !!s)
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

  const handleExportAnswersToDocx = async () => {
    if (!response || !questionnaire) {
        toast({ variant: 'destructive', title: 'Error', description: 'Data not available for export.' });
        return;
    }
    setIsExportingAnswers(true);

    try {
        const docChildren: Paragraph[] = [];

        docChildren.push(new Paragraph({
            text: "Full Assessment Responses",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
        }));

        docChildren.push(new Paragraph({ text: `Report for: ${response.customerName || 'N/A'}` }));
        docChildren.push(new Paragraph({ text: `Questionnaire: ${response.questionnaireVersionName}` }));
        docChildren.push(new Paragraph({ text: `Submitted: ${format(response.submittedAt, 'PPP p')}`, spacing: { after: 240 } }));

        for (const [sIdx, section] of questionnaire.sections.entries()) {
            docChildren.push(new Paragraph({
                text: `Section ${sIdx + 1}: ${section.name}`,
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 100 },
                border: { bottom: { color: "auto", space: 1, value: "single", size: 6 } }
            }));

            for (const [qIdx, question] of section.questions.entries()) {
                const selectedOptionId = response.responses[question.id];
                const selectedOption = question.options.find(opt => opt.id === selectedOptionId);
                
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: `${qIdx + 1}. ${question.question}`, bold: true })],
                    spacing: { before: 120, after: 60 }
                }));
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: `Answer: ${selectedOption?.text ?? "Not answered"}`, italics: true })],
                    spacing: { after: 120 },
                    indent: { left: 720 } // 0.5 inch indent
                }));
            }
        }
        
        const doc = new Document({
            sections: [{ children: docChildren }],
        });

        Packer.toBlob(doc).then(blob => {
            saveAs(blob, `Full-Answers-${response.customerName?.replace(/\s/g, '_') || response.id}.docx`);
        });

    } catch (error) {
        console.error("Error exporting answers to DOCX:", error);
        toast({ variant: "destructive", title: "Export Failed", description: "Could not generate the answers document." });
    } finally {
        setIsExportingAnswers(false);
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
  
  const sortedIncludedBarScores = [...reportData.barScores].filter(s => selectedSections[s.sectionId]).sort((a,b) => b.averageScore - a.averageScore);
  const includedCountAnalyses = reportData.countAnalyses.filter(analysis => selectedSections[analysis.sectionId]);
  
  const matrixAnalysis = reportData.matrixAnalyses[0];
  const shouldIncludeMatrix = matrixAnalysis && selectedSections[matrixAnalysis.xSectionId] && selectedSections[matrixAnalysis.ySectionId];

  const { image: thermometerImage, text: thermometerText, color: thermometerColor } = getThermometerInfo(
    reportData.totalAverageRanking,
    questionnaire.report_total_average
  );

  const staticExecutiveText = "This executive summary provides a high-level overview of the assessment results. Scores are color-coded for quick identification of strengths and areas for attention. Weighted averages reflect the relative importance of each area as defined in the questionnaire structure.";

  return (
    <div className="space-y-8 p-4 md:p-6 print:p-2">
      {/* Hidden containers for DOCX export */}
      <div className="absolute -left-[9999px] top-auto w-[800px] bg-white text-black p-4">
        <div ref={barChartExportRef} className="space-y-4 p-8">
            <div className="space-y-4 pt-2 px-4">
                {sortedIncludedBarScores.map((area) => (
                <div key={area.sectionId} className="grid grid-cols-12 items-start gap-2 border-b pb-4 last:border-b-0 last:pb-0">
                    <div className="col-span-4 font-medium text-sm self-start whitespace-normal">
                        <div>{area.sectionName}</div>
                         {area.analysisText && (
                            <div className="text-xs text-slate-500 italic mt-1">{area.analysisText}</div>
                         )}
                    </div>
                    <div className="col-span-7 self-center">
                    <div className="w-full bg-slate-200 rounded-full h-3">
                        <div
                        className="h-3 rounded-full"
                        style={{
                            width: `${(area.averageScore / highestPossibleScore) * 100}%`,
                            backgroundColor: getScoreFillColor(area.averageScore),
                        }}
                        ></div>
                    </div>
                    </div>
                    <p className={`col-span-1 text-right font-bold ${getScoreColorClass(area.averageScore).text} self-center`}>
                    {area.averageScore.toFixed(2)}
                    </p>
                </div>
                ))}
            </div>
        </div>
        <div ref={countAnalysisExportRef} className="space-y-4 p-8 w-[800px]">
            <h2 className="text-2xl font-semibold mb-4 text-primary text-center">Response Count Analysis</h2>
            {includedCountAnalyses.map(analysis => (
            <div key={analysis.sectionId} className="p-4 border border-slate-200 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">{analysis.sectionName}</h3>
                {analysis.analysisText && (
                  <div className="text-center mb-4 p-2 bg-slate-100 rounded-md">
                      <p className="font-semibold text-primary">{analysis.analysisText}</p>
                  </div>
                )}
                <table className="w-full text-sm">
                <thead className="border-b border-slate-300">
                    <tr>
                    <th className="p-2 text-left font-medium text-slate-600">Score Value</th>
                    <th className="p-2 text-right font-medium text-slate-600">Times Selected</th>
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(analysis.scoreCounts).sort(([, a], [, b]) => b - a).map(([score, count]) => (
                    <tr key={score} className={analysis.mostFrequentScores.includes(Number(score)) ? 'bg-yellow-100' : ''}>
                        <td className="p-2 font-medium">
                        Score: {score}
                        {analysis.mostFrequentScores.includes(Number(score)) && (
                            <span className="ml-2 font-bold text-yellow-800">(Most Frequent)</span>
                        )}
                        </td>
                        <td className="p-2 text-right">{count}</td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
            ))}
        </div>
      </div>
      
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
           <Dialog>
             <DialogTrigger asChild>
                <Button variant="secondary">
                    <ListOrdered className="mr-2 h-4 w-4" />
                    View All Responses
                </Button>
             </DialogTrigger>
             <DialogContent className="max-w-2xl">
                 <DialogHeader>
                    <DialogTitle>All Submitted Answers</DialogTitle>
                    <DialogDescription>A complete list of all questions and the answers provided by the user.</DialogDescription>
                 </DialogHeader>
                 <ScrollArea className="h-[60vh] pr-6">
                    <div className="space-y-6">
                        {questionnaire.sections.map((section, sIdx) => (
                            <div key={section.id}>
                                <h3 className="text-lg font-semibold text-primary border-b pb-2 mb-3">
                                    Section {sIdx + 1}: {section.name}
                                </h3>
                                <div className="space-y-4">
                                    {section.questions.map((question, qIdx) => {
                                        const selectedOptionId = response.responses[question.id];
                                        const selectedOption = question.options.find(opt => opt.id === selectedOptionId);
                                        return (
                                            <div key={question.id} className="text-sm">
                                                <p className="font-medium">{qIdx + 1}. {question.question}</p>
                                                <p className="text-muted-foreground pl-4">
                                                    &rarr; <span className="italic">{selectedOption?.text ?? "Not answered"}</span>
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                 </ScrollArea>
                 <DialogFooter className="sm:justify-between gap-2">
                    <Button onClick={handleExportAnswersToDocx} disabled={isExportingAnswers}>
                        {isExportingAnswers ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Export as Word
                    </Button>
                    <DialogTrigger asChild>
                       <Button variant="outline">Close</Button>
                    </DialogTrigger>
                 </DialogFooter>
             </DialogContent>
           </Dialog>
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
            Submitted: {format(response.submittedAt, 'PPP p')}</CardDescription>
        </CardHeader>
      </Card>
      
      {/* --- TOTAL AVERAGE RANKING --- */}
      {reportData.barScores.length > 0 && (
          <Card className="print-shadow-none print-border-none">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Total Average Ranking</CardTitle>
               <CardDescription>Weighted composite score from all scored areas.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center gap-4">
                {thermometerImage && <img src={thermometerImage} alt={thermometerText} className="h-56 w-56 object-contain"/>}
                <p className={`text-lg font-bold text-center ${thermometerColor}`}>
                    Total Average: {reportData.totalAverageRanking.toFixed(2)} : {thermometerText}
                </p>
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
              <CardDescription>Average score for each weighted area, ordered high to low. Use the switches to select sections for the Word export.</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[40%]">Area</TableHead>
                            <TableHead>Score</TableHead>
                            <TableHead>Details</TableHead>
                            <TableHead className="text-right">Include in Export</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedBarScores.map((area) => (
                            <TableRow key={area.sectionId}>
                                <TableCell className="font-medium space-y-2 align-top">
                                  <div>{area.sectionName}</div>
                                   {area.analysisText && (
                                     <div className="flex items-start gap-2 text-xs text-muted-foreground p-2 bg-secondary/30 rounded-md">
                                        <MessageSquareQuote className="h-4 w-4 mt-0.5 shrink-0" />
                                        <p className="italic">{area.analysisText}</p>
                                     </div>
                                   )}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <div className="w-24 bg-muted rounded-full h-3">
                                            <div
                                                className="h-3 rounded-full"
                                                style={{
                                                    width: `${(area.averageScore / highestPossibleScore) * 100}%`,
                                                    backgroundColor: getScoreFillColor(area.averageScore),
                                                }}
                                            ></div>
                                        </div>
                                        <span className={`font-bold ${getScoreColorClass(area.averageScore).text}`}>
                                            {area.averageScore.toFixed(2)}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Link href={`/admin/reports/${responseId}/${area.sectionId}`}>
                                        <Button variant="outline" size="sm">Details</Button>
                                    </Link>
                                </TableCell>
                                <TableCell className="text-right">
                                     <Switch
                                        checked={selectedSections[area.sectionId] ?? false}
                                        onCheckedChange={(checked) => handleSectionSelectionChange(area.sectionId, checked)}
                                        aria-label={`Toggle inclusion of ${area.sectionName} in export`}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
          </Card>
        </section>
      )}

      {/* --- ATTACHMENTS --- */}
      {response.attachments && response.attachments.length > 0 && (
        <section>
          <Separator className="my-6" />
          <h2 className="text-2xl font-semibold mb-4 text-primary text-center">Uploaded Attachments</h2>
          <Card>
            <CardHeader>
              <CardTitle>Submitted Files</CardTitle>
              <CardDescription>Files uploaded by the user during the assessment.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {response.attachments.map((file, index) => (
                  <li key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Paperclip className="h-5 w-5 text-primary" />
                      <div className="flex flex-col">
                        <span className="font-medium">{file.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {file.type} - {(file.size / 1024).toFixed(2)} KB
                        </span>
                      </div>
                    </div>
                    <a href={file.url} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm">
                        <Download className="mr-2 h-4 w-4" /> Download
                      </Button>
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}
      
      {/* --- MATRIX ANALYSIS --- */}
      {matrixAnalysis && (
        <section ref={matrixChartRef} className="page-break-before">
          <Separator className="my-6" />
          <h2 className="text-2xl font-semibold mb-4 text-primary text-center">Double-Entry Matrix Analysis</h2>
           <div className="grid grid-cols-1 gap-6">
               <Card>
                 <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{matrixAnalysis.sectionName}</CardTitle>
                      <CardDescription>A visual plot of {matrixAnalysis.xAxisLabel} vs. {matrixAnalysis.yAxisLabel}.</CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Label htmlFor={`matrix-switch`} className="text-sm">Include in Export</Label>
                        <Switch
                            id={`matrix-switch`}
                            checked={!!(selectedSections[matrixAnalysis.xSectionId] && selectedSections[matrixAnalysis.ySectionId])}
                            onCheckedChange={(checked) => handleMatrixSelectionChange(matrixAnalysis.xSectionId, matrixAnalysis.ySectionId, checked)}
                            aria-label={`Toggle inclusion of ${matrixAnalysis.sectionName} in export`}
                        />
                    </div>
                 </CardHeader>
                 <CardContent>
                    {matrixAnalysis.analysisText && (
                        <div className="text-center mb-4 p-2 bg-secondary/50 rounded-md">
                            <p className="font-semibold text-primary">{matrixAnalysis.analysisText}</p>
                        </div>
                    )}
                    <ResponsiveContainer width="100%" height={300}>
                        <ScatterChart
                            margin={{ top: 20, right: 30, bottom: 40, left: 30 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                                type="number" 
                                dataKey="x" 
                                name={matrixAnalysis.xAxisLabel} 
                                domain={matrixAnalysis.xAxisDomain}
                                allowDecimals={false}
                            >
                                <RechartsLabel value={matrixAnalysis.xAxisLabel} offset={-25} position="insideBottom" fill="hsl(var(--foreground))" fontSize={12} />
                            </XAxis>
                            <YAxis 
                                type="number" 
                                dataKey="y" 
                                name={matrixAnalysis.yAxisLabel} 
                                domain={matrixAnalysis.yAxisDomain}
                                allowDecimals={false}
                            >
                                 <RechartsLabel value={matrixAnalysis.yAxisLabel} angle={-90} position="insideLeft" style={{ textAnchor: 'middle' }} fill="hsl(var(--foreground))" fontSize={12} />
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
                            <Scatter name={matrixAnalysis.sectionName} data={matrixAnalysis.data} fill="hsl(var(--primary))" r={10} />
                        </ScatterChart>
                    </ResponsiveContainer>
                 </CardContent>
              </Card>
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
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>{analysis.sectionName}</CardTitle>
                        <div className="flex items-center space-x-2">
                           <Label htmlFor={`count-switch-${analysis.sectionId}`} className="text-sm">Include in Export</Label>
                           <Switch
                                id={`count-switch-${analysis.sectionId}`}
                                checked={selectedSections[analysis.sectionId] ?? false}
                                onCheckedChange={(checked) => handleSectionSelectionChange(analysis.sectionId, checked)}
                                aria-label={`Toggle inclusion of ${analysis.sectionName} in export`}
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        {analysis.analysisText && (
                            <div className="text-center mb-4 p-2 bg-secondary/50 rounded-md">
                                <p className="font-semibold text-primary">{analysis.analysisText}</p>
                            </div>
                        )}
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
