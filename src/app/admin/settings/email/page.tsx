"use client";

import { useState, useEffect, type FormEvent } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { EmailTemplate } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Mail, Save, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

const defaultTemplates: Record<string, Omit<EmailTemplate, 'id'>> = {
  newAssessment: {
    subject: "Your Assessment Link for {{questionnaireName}}",
    body: `
<p>Hello {{customerName}},</p>
<p>Here is your unique link to begin the assessment: <strong>{{questionnaireName}}</strong>.</p>
<p><a href="{{assessmentLink}}">Click here to start your assessment</a></p>
<p>This link will expire on {{expiryDate}}.</p>
<p>Thank you,</p>
<p>The AssessPro Team</p>
    `.trim(),
    placeholders: ['{{customerName}}', '{{questionnaireName}}', '{{assessmentLink}}', '{{expiryDate}}'],
  },
  assessmentCompleted: {
    subject: "Thank You for Completing Your Assessment",
    body: `
<p>Hello {{customerName}},</p>
<p>Thank you for completing the <strong>{{questionnaireName}}</strong> assessment.</p>
<p>We have received your responses and will be in touch with you shortly with feedback.</p>
<p>Best regards,</p>
<p>The AssessPro Team</p>
    `.trim(),
    placeholders: ['{{customerName}}', '{{questionnaireName}}'],
  }
};

export default function EmailSettingsPage() {
  useRequireAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Record<string, EmailTemplate>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);
      try {
        const fetchedTemplates: Record<string, EmailTemplate> = {};
        for (const id in defaultTemplates) {
          const docRef = doc(db, 'emailTemplates', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            fetchedTemplates[id] = { id: docSnap.id, ...docSnap.data() } as EmailTemplate;
          } else {
            // If template doesn't exist in DB, use default and save it
            const newTemplate: EmailTemplate = { id: id as EmailTemplate['id'], ...defaultTemplates[id] };
            await setDoc(docRef, newTemplate);
            fetchedTemplates[id] = newTemplate;
          }
        }
        setTemplates(fetchedTemplates);
      } catch (error) {
        console.error("Error fetching email templates:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load email templates.' });
      }
      setIsLoading(false);
    };
    fetchTemplates();
  }, [toast]);

  const handleTemplateChange = (id: string, field: 'subject' | 'body', value: string) => {
    setTemplates(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const handleSaveTemplate = async (id: string) => {
    setIsSaving(prev => ({ ...prev, [id]: true }));
    try {
      const templateToSave = templates[id];
      const docRef = doc(db, 'emailTemplates', id);
      await setDoc(docRef, templateToSave, { merge: true });
      toast({ title: 'Template Saved', description: `The "${templateToSave.subject}" template has been updated.` });
    } catch (error) {
      console.error("Error saving template:", error);
      toast({ variant: 'destructive', title: 'Save Failed', description: 'Could not save the email template.' });
    }
    setIsSaving(prev => ({ ...prev, [id]: false }));
  };
  
  const TemplateEditor = ({ templateId, title, description }: { templateId: keyof typeof defaultTemplates, title: string, description: string }) => {
      const template = templates[templateId];
      if (!template) return <Skeleton className="h-64 w-full" />;

      return (
          <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor={`${templateId}-subject`}>Subject</Label>
                    <Input
                        id={`${templateId}-subject`}
                        value={template.subject}
                        onChange={(e) => handleTemplateChange(templateId, 'subject', e.target.value)}
                        disabled={isSaving[templateId]}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor={`${templateId}-body`}>Body (HTML is supported)</Label>
                    <Textarea
                        id={`${templateId}-body`}
                        value={template.body}
                        onChange={(e) => handleTemplateChange(templateId, 'body', e.target.value)}
                        rows={10}
                        className="font-mono text-xs"
                        disabled={isSaving[templateId]}
                    />
                </div>
                <div className="flex items-center justify-between">
                     <div className="text-sm text-muted-foreground space-x-1">
                        <span>Placeholders:</span>
                        {template.placeholders.map(p => <Badge key={p} variant="secondary" className="font-mono">{p}</Badge>)}
                    </div>
                    <Button onClick={() => handleSaveTemplate(templateId)} disabled={isSaving[templateId]}>
                        {isSaving[templateId] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Template
                    </Button>
                </div>
            </CardContent>
        </Card>
      )
  }

  return (
    <div className="space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Mail className="w-8 h-8 text-primary" />
            <CardTitle className="text-2xl font-headline">Email Notification Settings</CardTitle>
          </div>
          <CardDescription>
            Manage the content of automated emails sent to customers. Your SMTP settings must be configured in your environment variables for emails to be sent.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <div className="space-y-6">
        {isLoading ? (
            <>
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
            </>
        ) : (
            <>
                <TemplateEditor 
                    templateId="newAssessment"
                    title="New Assessment Email"
                    description="This email is sent to a customer when a new assessment link is generated for them."
                />
                <TemplateEditor 
                    templateId="assessmentCompleted"
                    title="Assessment Completion Email"
                    description="This email is sent to a customer immediately after they successfully submit their questionnaire."
                />
            </>
        )}
      </div>
    </div>
  );
}
