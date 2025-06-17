
"use client";

import { useState, useEffect, useMemo } from 'react';
import type { QuestionnaireVersion, Section, Question as QuestionType, AnswerOption, CustomerLink } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge"; // Added import for Badge
import { AlertCircle, CheckCircle, Save, Send, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { updateDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface QuestionnaireClientProps {
  questionnaire: QuestionnaireVersion;
  customerLink: CustomerLink;
  linkId: string;
}

// Helper function to shuffle an array (Fisher-Yates shuffle)
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}


export default function QuestionnaireClient({ questionnaire, customerLink, linkId }: QuestionnaireClientProps) {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(customerLink.currentSectionIndex || 0);
  const [answers, setAnswers] = useState<Record<string, string>>(customerLink.responsesInProgress || {});
  const [isLoading, setIsLoading] = useState(false);
  const [shuffledOptionsCache, setShuffledOptionsCache] = useState<Record<string, AnswerOption[]>>({});
  const { toast } = useToast();
  const router = useRouter();

  const currentSection = questionnaire.sections[currentSectionIndex];

  useEffect(() => {
    // Pre-shuffle options for all questions in the current section if not already cached
    const newCache = { ...shuffledOptionsCache };
    let cacheUpdated = false;
    currentSection.questions.forEach(q => {
      if (!newCache[q.id]) {
        newCache[q.id] = shuffleArray(q.options);
        cacheUpdated = true;
      }
    });
    if (cacheUpdated) {
      setShuffledOptionsCache(newCache);
    }
  }, [currentSection, shuffledOptionsCache]);


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
      await saveProgress(currentSectionIndex + 1);
    }
  };

  const saveProgress = async (newSectionIndex?: number) => {
    setIsLoading(true);
    try {
      const linkRef = doc(db, 'customerLinks', linkId);
      await updateDoc(linkRef, {
        responsesInProgress: answers,
        currentSectionIndex: newSectionIndex !== undefined ? newSectionIndex : currentSectionIndex,
        status: "started",
      });
      toast({ title: "Progress Saved", description: "Your answers have been saved." });
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
      // Create final response document
      // TODO: Add score calculation here
      const responseDoc = {
        linkId: linkId,
        customerId: customerLink.customerId,
        questionnaireVersionId: questionnaire.id,
        questionnaireVersionName: questionnaire.name,
        submittedAt: serverTimestamp(),
        responses: answers,
        areaScores: {}, // Placeholder for calculated scores
        questionScores: {}, // Placeholder for calculated scores
      };
      // Using linkId as responseId for simplicity, or generate a new one
      await setDoc(doc(db, 'customerResponses', linkId), responseDoc);

      // Update link status to completed
      const linkRef = doc(db, 'customerLinks', linkId);
      await updateDoc(linkRef, {
        status: "completed",
        responsesInProgress: {}, // Clear in-progress answers
        currentSectionIndex: questionnaire.sections.length, // Mark as past the last section
      });

      router.push(`/assessment/${linkId}/completed`);
    } catch (error) {
      console.error("Error submitting questionnaire:", error);
      toast({ variant: "destructive", title: "Submission Failed", description: "Could not submit your questionnaire." });
    } finally {
      setIsLoading(false);
    }
  };

  const progressPercentage = ((currentSectionIndex + 1) / questionnaire.sections.length) * 100;

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
            <CardTitle className="text-xl font-semibold">{currentSectionIndex + 1}. {currentSection.title}</CardTitle>
            {currentSection.description && <CardDescription className="mt-1">{currentSection.description}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-6">
            {currentSection.questions.map((question, qIndex) => {
                const shuffledQOptions = shuffledOptionsCache[question.id] || question.options;
                return (
                  <div key={question.id} className="py-4 border-b last:border-b-0">
                    <p className="font-medium mb-3 text-foreground/90">
                      {qIndex + 1}. {question.text}
                      {!answers[question.id] && <span className="text-destructive ml-1">*</span>}
                    </p>
                    <RadioGroup
                      value={answers[question.id]}
                      onValueChange={(value) => handleAnswerChange(question.id, value)}
                      className="space-y-2"
                    >
                      {shuffledQOptions.map((option) => (
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
          {/* Previous button is disabled as per requirements */}
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

