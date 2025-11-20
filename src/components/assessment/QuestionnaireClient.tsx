
"use client";

import { useState, useEffect, useMemo } from 'react';
import type { QuestionnaireVersion, Section, Question as QuestionType, AnswerOption, CustomerLink, EmailTemplate, AttachmentFile, CustomerResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Save, Send, ChevronLeft, ChevronRight, Info, ChevronUp, ChevronDown, PlayCircle, Paperclip, UploadCloud, File, Trash2, Loader2 } from 'lucide-react';
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
import { getSupabaseClient } from '@/lib/supabase/config';

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
  
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<AttachmentFile[]>([]);

  const { toast } = useToast();
  const router = useRouter();

  const totalSteps = questionnaire.sections.length + (questionnaire.attachmentConfig?.required ? 1 : 0);
  const isAttachmentStep = questionnaire.attachmentConfig?.required && currentSectionIndex === questionnaire.sections.length;
  const currentStep = isAttachmentStep ? totalSteps : currentSectionIndex + 1;

  const currentSection = questionnaire.sections[currentSectionIndex];
  
  // This is the key logic change for the bug fix
  const isLastSectionWithoutAttachments = currentSectionIndex === questionnaire.sections.length - 1 && !questionnaire.attachmentConfig?.required;

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
    if (isAttachmentStep) {
        // This button won't be shown on attachment step, but as a safeguard.
        return;
    }
    if (!areAllQuestionsAnswered()) {
      toast({ variant: "destructive", title: "Incomplete Section", description: "Please answer all questions before proceeding." });
      return;
    }
    if (currentSectionIndex < questionnaire.sections.length) {
      setCurrentSectionIndex(prev => prev + 1);
      await saveProgress(currentSectionIndex + 1, false); // false = don't redirect
    }
  };

  const handlePreviousSection = async () => {
    if (currentSectionIndex > 0) {
        setCurrentSectionIndex(prev => prev - 1);
        await saveProgress(currentSectionIndex - 1, false);
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
        toast({ title: "Progress Saved", description: "Your answers have been saved." });
      }

    } catch (error) {
      console.error("Error saving progress:", error);
      toast({ variant: "destructive", title: "Save Failed", description: "Could not save your progress." });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const selectedFiles = Array.from(event.target.files);
      const combinedFiles = [...files, ...selectedFiles];

      if (combinedFiles.length > 3) {
        toast({ variant: "destructive", title: "Upload Limit Exceeded", description: "You can upload a maximum of 3 files."});
        return;
      }
      setFiles(combinedFiles);
    }
  };

  const removeFile = (fileToRemove: File) => {
    setFiles(prevFiles => prevFiles.filter(file => file !== fileToRemove));
  };
  
  const handleFileUpload = async (): Promise<AttachmentFile[]> => {
    if (files.length === 0) return [];
    
    setIsUploading(true);
    const supabase = getSupabaseClient();
    const uploadedFilePromises = files.map(async (file) => {
        const filePath = `attachments/${linkId}/${file.name}`;
        const { data, error } = await supabase.storage
            .from('upval_files')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: true
            });

        if (error) {
            throw error;
        }

        const { data: urlData } = supabase.storage
            .from('upval_files')
            .getPublicUrl(filePath);

        return {
            name: file.name,
            url: urlData.publicUrl,
            size: file.size,
            type: file.type,
        };
    });

    try {
        const results = await Promise.all(uploadedFilePromises);
        setUploadedFiles(results);
        toast({ title: "Upload Complete", description: `${results.length} files uploaded successfully.` });
        return results;
    } catch (error) {
        console.error("Error uploading files:", error);
        toast({ variant: "destructive", title: "Upload Failed", description: "Could not upload files." });
        return [];
    } finally {
        setIsUploading(false);
    }
  };


  const handleSubmit = async () => {
    let finalAttachments: AttachmentFile[] = [];
    
    // Check if on the last question section and if all questions are answered
    if (isLastSectionWithoutAttachments && !areAllQuestionsAnswered()) {
        toast({ variant: "destructive", title: "Incomplete Final Section", description: "Please answer all questions before submitting." });
        return;
    }
    
    if (questionnaire.attachmentConfig?.required) {
        if (files.length === 0 && isAttachmentStep) {
             toast({ variant: "destructive", title: "Attachments Missing", description: `Please upload at least one file.` });
             return;
        }
        if (files.length > 0) {
            finalAttachments = await handleFileUpload();
            if (finalAttachments.length !== files.length) {
                toast({ variant: "destructive", title: "Upload Failed", description: "File upload failed. Please try again." });
                return;
            }
        }
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

      const responseDocData: Omit<CustomerResponse, 'id'> = {
        linkId: linkId,
        customerId: customerLink.customerId,
        customerName: fetchedCustomerLinkData.customerName || customerLink.customerName || "N/A",
        customerEmail: fetchedCustomerLinkData.customerEmail || customerLink.customerEmail || "N/A",
        questionnaireVersionId: questionnaire.id,
        questionnaireVersionName: questionnaire.name,
        submittedAt: serverTimestamp() as any, // Cast for RTK query, will be server timestamp
        responses: answers,
        attachments: finalAttachments,
        dynamicComments: dynamicComments,
        adminComments: {},
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

  const progressPercentage = (currentStep / totalSteps) * 100;

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
            <Badge variant="outline">Step {Math.min(currentStep, totalSteps)} of {totalSteps}</Badge>
          </div>
          <Progress value={progressPercentage} className="w-full mt-2" />
        </CardHeader>
      </Card>
      
      {isAttachmentStep ? (
        <Card className="shadow-xl animate-subtle-slide-in" style={{animationDelay: '0.3s'}}>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Paperclip className="h-6 w-6 text-primary"/>
                    <CardTitle className="text-xl font-semibold">Upload Attachments</CardTitle>
                </div>
                <CardDescription>
                    Please upload up to 3 documents to complete your submission. At least one file is required.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="p-6 border-2 border-dashed rounded-lg text-center">
                    <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-2 text-sm font-medium text-foreground">
                        Drag and drop files here, or click to select files
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Supports PDF, DOCX, PNG, JPG, etc. Max 3 files.
                    </p>
                    <Input
                        id="file-upload"
                        type="file"
                        multiple
                        className="sr-only"
                        onChange={handleFileChange}
                        disabled={isUploading || files.length >= 3}
                    />
                    <Label htmlFor="file-upload" className={`mt-4 inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90 ${files.length >= 3 ? 'cursor-not-allowed bg-muted' : 'cursor-pointer'}`}>
                        Select Files
                    </Label>
                </div>

                {files.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="font-medium">Selected files ({files.length} of 3):</h4>
                        <ul className="space-y-2">
                            {files.map((file, index) => (
                                <li key={index} className="flex items-center justify-between p-2 border rounded-md bg-secondary/30">
                                    <div className="flex items-center gap-2 text-sm">
                                        <File className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium">{file.name}</span>
                                        <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => removeFile(file)} disabled={isUploading}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </CardContent>
        </Card>
      ) : currentSection ? (
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
      ) : null}

      <div className="flex justify-between items-center mt-8 animate-subtle-slide-in" style={{animationDelay: '0.5s'}}>
        <Button variant="outline" onClick={() => saveProgress()} disabled={isLoading || isUploading}>
          <Save className="mr-2 h-4 w-4" /> Save and Quit
        </Button>
        <div className="space-x-3">
          <Button variant="ghost" onClick={handlePreviousSection} disabled={isLoading || isUploading || currentSectionIndex === 0}> 
            <ChevronLeft className="mr-2 h-4 w-4" /> Previous
          </Button>
          
          {isLastSectionWithoutAttachments || isAttachmentStep ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={isLoading || isUploading || (isAttachmentStep && files.length === 0) || (isLastSectionWithoutAttachments && !areAllQuestionsAnswered())} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                   {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4" />}
                   {isUploading ? "Uploading..." : "Submit Questionnaire"}
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
                  <AlertDialogAction onClick={handleSubmit} disabled={isLoading || isUploading} className="bg-accent hover:bg-accent/90">
                    {isLoading || isUploading ? 'Submitting...' : 'Yes, Submit'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button onClick={handleNextSection} disabled={isLoading || isUploading || !areAllQuestionsAnswered()} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Next Step <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          )}

        </div>
      </div>
    </div>
  );
}

    

    