
"use client";

import { useState, useEffect, useMemo } from 'react';
import type { QuestionnaireVersion, Section, Question as QuestionType, AnswerOption, CustomerLink, EmailTemplate } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Save, Send, ChevronLeft, ChevronRight, Info, ChevronUp, ChevronDown, PlayCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { updateDoc, doc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface QuestionnaireClientProps {
  questionnaire: QuestionnaireVersion;
  customerLink: CustomerLink;
  linkId: string;
}


export default function QuestionnaireClient({ questionnaire, customerLink, linkId }: QuestionnaireClientProps) {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(customerLink.currentSectionIndex || 0);
  const [answers, setAnswers] = useState<Record<string, string>>(customerLink.responsesInProgress || {});
  const [isLoading, setIsLoading] = useState(false);
  const [openAdditionalText, setOpenAdditionalText] = useState<Record<string, boolean>>({});
  const [showIntro, setShowIntro] = useState(customerLink.status === 'pending' && !!questionnaire.description);
  const { toast } = useToast();
  const router = useRouter();

  const currentSection = questionnaire.sections[currentSectionIndex];
  
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentSectionIndex, showIntro]);

  const toggleAdditionalText = (questionId: string) => {
    setOpenAdditionalText(prev => ({...prev, [questionId]: !prev[questionId]}));
  }

  const handleAnswerChange = (questionId: string, optionId: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: optionId }));
  };

  const areAllQuestionsAnswered = () => {
    if (!currentSection) return false;
    return currentSection.questions.every(q => answers[q.id]);
  };

  const handleNextSection = async () => {
    if (!areAllQuestionsAnswered()) {
      toast({ variant: "destructive", title: "Incomplete Section", description: "Please answer all questions before proceeding." });
      return;
    }
    if (currentSectionIndex < questionnaire.sections.length - 1) {
      setCurrentSectionIndex(prev => prev + 1);
      await saveProgress(currentSectionIndex + 1, false); // false = don't redirect
    }
  };

  const startQuestionnaire = async () => {
    setShowIntro(false);
    // Mark as started in the database
    await saveProgress(0, false);
  }

  const saveProgress = async (newSectionIndex?: number, shouldRedirect: boolean = true) => {
    setIsLoading(true);
    try {
      const linkRef = doc(db, 'customerLinks', linkId);
      await updateDoc(linkRef, {
        responsesInProgress: answers,
        currentSectionIndex: newSectionIndex !== undefined ? newSectionIndex : currentSectionIndex,
        status: "started",
      });

      if (shouldRedirect) {
        router.push(`/assessment/${linkId}/saved`);
      } else if (!showIntro) { // Only toast if not on intro screen
        toast({ title: "Progress Saved", description: "Your answers for this section have been saved." });
      }

    } catch (error) {
      console.error("Error saving progress:", error);
      toast({ variant: "destructive", title: "Save Failed", description: "Could not save your progress." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!areAllQuestionsAnswered() && currentSectionIndex === questionnaire.sections.length -1 ) {
       toast({ variant: "destructive", title: "Incomplete Final Section", description: "Please answer all questions in this final section." });
       return;
    }
    setIsLoading(true);
    try {
      // Fetch the original customerLink to get customerName and customerEmail
      const customerLinkRef = doc(db, 'customerLinks', linkId);
      const customerLinkSnap = await getDoc(customerLinkRef);
      let fetchedCustomerLinkData: Partial<CustomerLink> = {};
      if (customerLinkSnap.exists()) {
        fetchedCustomerLinkData = customerLinkSnap.data() as CustomerLink;
      }
      
      const dynamicComments: Record<string, string> = {};
      questionnaire.sections.forEach(section => {
        if (section.comment) {
            dynamicComments[section.id] = section.comment;
        }
      });

      const responseDocData = {
        linkId: linkId,
        customerId: customerLink.customerId,
        customerName: fetchedCustomerLinkData.customerName || customerLink.customerName || "N/A",
        customerEmail: fetchedCustomerLinkData.customerEmail || customerLink.customerEmail || "N/A",
        questionnaireVersionId: questionnaire.id,
        questionnaireVersionName: questionnaire.name, // Denormalized from the current questionnaire version
        submittedAt: serverTimestamp(),
        responses: answers,
        dynamicComments: dynamicComments, // Initialize dynamic comments
        adminComments: {}, // Initialize adminComments
      };
      
      await setDoc(doc(db, 'customerResponses', linkId), responseDocData);

      // Update link status to completed
      const linkRefDoc = doc(db, 'customerLinks', linkId);
      await updateDoc(linkRefDoc, {
        status: "completed",
        responsesInProgress: {}, 
        currentSectionIndex: questionnaire.sections.length, 
      });

      // Send completion email
      const templateRef = doc(db, 'emailTemplates', 'assessmentCompleted');
      const templateSnap = await getDoc(templateRef);
      if (templateSnap.exists()) {
          try {
              const template = templateSnap.data() as EmailTemplate;
              let { subject, body } = template;
              
              const customerName = fetchedCustomerLinkData.customerName || customerLink.customerName || "N/A";
              const customerEmail = fetchedCustomerLinkData.customerEmail || customerLink.customerEmail || "";
              const questionnaireName = questionnaire.name;

              subject = subject.replace(/{{customerName}}/g, customerName).replace(/{{questionnaireName}}/g, questionnaireName);
              body = body.replace(/{{customerName}}/g, customerName).replace(/{{questionnaireName}}/g, questionnaireName);

              if(customerEmail) {
                  await fetch('/api/send-email', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ to: customerEmail, subject, html: body }),
                  });
              }
          } catch (emailError) {
              console.error("Failed to send completion email:", emailError);
              // Do not block user flow if email fails.
          }
      }

      router.push(`/assessment/${linkId}/completed`);
    } catch (error) {
      console.error("Error submitting questionnaire:", error);
      toast({ variant: "destructive", title: "Submission Failed", description: "Could not submit your questionnaire." });
    } finally {
      setIsLoading(false);
    }
  };

  const progressPercentage = ((currentSectionIndex + 1) / questionnaire.sections.length) * 100;

  if (showIntro && questionnaire.description) {
    return (
        <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col items-center justify-center min-h-[calc(100vh-4rem)]">
            <Card className="w-full shadow-2xl animate-subtle-slide-in">
                <CardHeader>
                    <CardTitle className="text-3xl font-headline text-primary text-center">{questionnaire.description.header}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 text-center">
                    <p className="text-muted-foreground whitespace-pre-wrap">{questionnaire.description.details}</p>
                    <Button onClick={startQuestionnaire} size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                        <PlayCircle className="mr-2 h-5 w-5" /> Start Assessment
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
  }


  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      <Card className="shadow-xl animate-subtle-slide-in" style={{animationDelay: '0.1s'}}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl font-headline text-primary">{questionnaire.name}</CardTitle>
            <Badge variant="outline">Section {currentSectionIndex + 1} of {questionnaire.sections.length}</Badge>
          </div>
          <Progress value={progressPercentage} className="w-full mt-2" />
        </CardHeader>
      </Card>

      {currentSection && (
        <Card key={currentSection.id} className="shadow-xl animate-subtle-slide-in" style={{animationDelay: '0.3s'}}>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">{currentSectionIndex + 1}. {currentSection.name}</CardTitle>
            {currentSection.description && <CardDescription className="mt-1">{currentSection.description}</CardDescription>}
             {currentSection.instructions && (
                <div className="flex items-start gap-2 p-3 my-2 border border-blue-200 bg-blue-50/50 rounded-md text-sm text-blue-700">
                    <Info className="h-5 w-5 mt-0.5 shrink-0 text-blue-600" />
                    <p>{currentSection.instructions}</p>
                </div>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {currentSection.questions.map((question, qIndex) => {
                const isAnswered = !!answers[question.id];
                return (
                  <div key={question.id} className={`py-4 border-b last:border-b-0 transition-colors duration-300 ${isAnswered ? 'border-green-200' : 'border-border'}`}>
                    <p className="font-medium mb-2 text-foreground/90">
                      {qIndex + 1}. {question.question}
                      {!isAnswered && <span className="text-destructive ml-1">*</span>}
                    </p>

                    {question.additional_text && (
                      <div className="mb-4">
                        <Button variant="link" size="sm" onClick={() => toggleAdditionalText(question.id)} className="p-0 h-auto text-primary text-sm flex items-center gap-1">
                          {openAdditionalText[question.id] ? 'Hide explanation' : 'Need help answering?'}
                          {openAdditionalText[question.id] 
                              ? <ChevronUp className="h-4 w-4"/> 
                              : <ChevronDown className="h-4 w-4"/>
                          }
                        </Button>
                        {openAdditionalText[question.id] && (
                          <div className="mt-2 text-sm text-muted-foreground p-3 bg-secondary/20 border-l-2 border-primary rounded-r-md animate-accordion-down">
                              <p className="whitespace-pre-wrap">{question.additional_text}</p>
                          </div>
                        )}
                      </div>
                    )}

                    <RadioGroup
                      value={answers[question.id]}
                      onValueChange={(value) => handleAnswerChange(question.id, value)}
                      className="space-y-2"
                    >
                      {question.options.map((option) => (
                        <div key={option.id} className="flex items-center space-x-3 p-3 rounded-md border hover:bg-accent/50 transition-colors cursor-pointer has-[:checked]:bg-accent has-[:checked]:border-primary">
                          <RadioGroupItem value={option.id} id={`${question.id}-${option.id}`} />
                          <Label htmlFor={`${question.id}-${option.id}`} className="flex-1 cursor-pointer text-foreground/80 has-[:checked]:text-accent-foreground">
                            {option.text}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                )
            })}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between items-center mt-8 animate-subtle-slide-in" style={{animationDelay: '0.5s'}}>
        <Button variant="outline" onClick={() => saveProgress()} disabled={isLoading}>
          <Save className="mr-2 h-4 w-4" /> Save and Quit
        </Button>
        <div className="space-x-3">
          <Button variant="ghost" disabled={true}> 
            <ChevronLeft className="mr-2 h-4 w-4" /> Previous
          </Button>

          {currentSectionIndex < questionnaire.sections.length - 1 ? (
            <Button onClick={handleNextSection} disabled={isLoading || !areAllQuestionsAnswered()} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Next Section <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={isLoading || !areAllQuestionsAnswered()} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                  <Send className="mr-2 h-4 w-4" /> Submit Questionnaire
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Submission</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to submit your answers? You will not be able to make changes after submission.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSubmit} disabled={isLoading} className="bg-accent hover:bg-accent/90">
                    {isLoading ? 'Submitting...' : 'Yes, Submit'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}
