
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import type { QuestionnaireVersion, Section as SectionType, Question as QuestionType, AnswerOption } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowLeft, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function PreviewQuestionnairePage() {
  useRequireAuth();
  const params = useParams();
  const router = useRouter();
  const versionId = params.versionId as string;

  const [questionnaire, setQuestionnaire] = useState<QuestionnaireVersion | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (versionId) {
      const fetchQuestionnaire = async () => {
        setIsLoading(true);
        try {
          const docRef = doc(db, 'questionnaireVersions', versionId);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            setQuestionnaire({
              id: docSnap.id,
              ...data,
              createdAt: (data.createdAt as Timestamp)?.toDate ? (data.createdAt as Timestamp).toDate() : new Date(data.createdAt),
            } as QuestionnaireVersion);
          } else {
            console.log("No such document!");
            // Optionally, redirect or show a "not found" message
          }
        } catch (error) {
          console.error("Error fetching questionnaire: ", error);
        }
        setIsLoading(false);
      };
      fetchQuestionnaire();
    }
  }, [versionId]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Manage Versions
        </Button>
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="border p-4 rounded-md">
                <Skeleton className="h-6 w-1/3 mb-2" />
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!questionnaire) {
    return (
      <div className="text-center py-10">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Questionnaire Not Found</h2>
        <p className="text-muted-foreground mb-6">The requested questionnaire version could not be found.</p>
        <Button onClick={() => router.push('/admin/questionnaires/manage')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Manage Versions
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => router.back()} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Manage Versions
      </Button>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-7 w-7 text-primary" />
              <CardTitle className="text-2xl font-headline">{questionnaire.name}</CardTitle>
            </div>
            <Badge variant={questionnaire.isActive ? "default" : "secondary"} className={questionnaire.isActive ? "bg-green-500 text-white" : ""}>
              {questionnaire.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <CardDescription>
            Version ID: {questionnaire.id} | Created: {questionnaire.createdAt.toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {questionnaire.sections.map((section: SectionType, sectionIndex: number) => (
              <AccordionItem value={`section-${sectionIndex}`} key={section.id || sectionIndex}>
                <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                  <div className="flex items-center gap-2">
                     <span className="text-primary">{sectionIndex + 1}.</span> {section.title} 
                     <Badge variant="outline">Weight: {section.weight}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pl-6 pr-2 pt-2">
                  {section.description && <p className="text-sm text-muted-foreground mb-3">{section.description}</p>}
                  {section.questions.map((question: QuestionType, questionIndex: number) => (
                    <Card key={question.id || questionIndex} className="bg-background/50">
                      <CardHeader>
                        <CardTitle className="text-base font-medium">
                          Q{questionIndex + 1}: {question.text}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {question.options.map((option: AnswerOption, optionIndex: number) => (
                            <li key={option.id || optionIndex} className="flex items-center justify-between p-2 border rounded-md bg-card">
                              <span>{String.fromCharCode(97 + optionIndex)}) {option.text}</span>
                              <Badge variant="secondary" className="font-mono">Points: {option.points}</Badge>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
