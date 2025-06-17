
"use client";

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import type { QuestionnaireUploadData, Section, Question, AnswerOption } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { UploadCloud, FileJson, Wand2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

// Helper to generate a slug-like ID
const generateSlug = (text: string) => {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
};


export default function UploadQuestionnairePage() {
  useRequireAuth();
  const [versionName, setVersionName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [jsonContent, setJsonContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0];
      setFile(selectedFile);
      if (selectedFile.type === "application/json") {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const content = e.target?.result as string;
            setJsonContent(content);
            const parsed = JSON.parse(content);
            if (parsed.versionName && !versionName) { // Auto-fill version name if empty
                setVersionName(parsed.versionName);
            }
          } catch (err) {
            toast({ variant: "destructive", title: "Invalid JSON", description: "The file is not valid JSON." });
            setJsonContent('');
          }
        };
        reader.readAsText(selectedFile);
      } else {
         toast({ variant: "destructive", title: "Invalid File Type", description: "Please upload a JSON file." });
         setJsonContent('');
         setFile(null);
      }
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!versionName.trim() || (!file && !jsonContent.trim())) {
      toast({ variant: "destructive", title: "Missing Information", description: "Please provide a version name and a JSON file or paste JSON content." });
      return;
    }
    setIsLoading(true);

    try {
      let questionnaireData: QuestionnaireUploadData;
      if (jsonContent) {
        questionnaireData = JSON.parse(jsonContent);
      } else if (file) {
        const content = await file.text();
        questionnaireData = JSON.parse(content);
      } else {
        throw new Error("No JSON data provided.");
      }
      
      // Validate basic structure (can be expanded with Zod)
      if (!questionnaireData.sections || !Array.isArray(questionnaireData.sections)) {
        throw new Error("Invalid JSON structure: 'sections' array is missing or not an array.");
      }

      // Assign unique IDs if not present, ensuring slugs for readability
      const processedSections: Section[] = questionnaireData.sections.map((section, sIdx) => {
        const sectionId = section.tempId || generateSlug(section.title) || `section-${sIdx + 1}-${uuidv4().slice(0,4)}`;
        return {
          ...section,
          id: sectionId,
          questions: section.questions.map((question, qIdx) => {
            const questionId = question.tempId || generateSlug(question.text.substring(0,20)) || `q-${sIdx + 1}-${qIdx + 1}-${uuidv4().slice(0,4)}`;
            return {
              ...question,
              id: questionId,
              options: question.options.map((option, oIdx) => ({
                ...option,
                id: option.tempId || String.fromCharCode(97 + oIdx), // a, b, c, d
              })),
            };
          }),
        };
      });

      const newVersionId = generateSlug(versionName) || `v-${Date.now()}`;

      const versionDoc = {
        name: versionName,
        sections: processedSections,
        isActive: false, // Default to inactive, admin can activate later
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'questionnaireVersions', newVersionId), versionDoc);

      toast({
        title: "Upload Successful",
        description: `Questionnaire version "${versionName}" (ID: ${newVersionId}) has been uploaded.`,
      });
      setVersionName('');
      setFile(null);
      setJsonContent('');
    } catch (error: any) {
      console.error("Error uploading questionnaire: ", error);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "Could not parse JSON or save to database.",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const sampleJson = `{
  "versionName": "Sample Wellness Survey V1",
  "sections": [
    {
      "title": "Diet and Wellness",
      "description": "This section explores your eating habits and awareness of wellness.",
      "weight": 0.3,
      "questions": [
        {
          "text": "How many servings of fruits and vegetables do you consume on average per day?",
          "options": [
            { "text": "Less than 2 servings", "points": 1 },
            { "text": "2-3 servings", "points": 2 },
            { "text": "4-5 servings", "points": 3 },
            { "text": "More than 5 servings", "points": 4 }
          ]
        }
      ]
    }
  ]
}`;


  return (
    <Card className="max-w-2xl mx-auto shadow-xl">
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
            <UploadCloud className="w-8 h-8 text-primary" />
            <CardTitle className="text-2xl font-headline">Upload New Questionnaire Version</CardTitle>
        </div>
        <CardDescription>
          Provide a version name and upload a JSON file containing the questionnaire structure, questions, options, points, and section weights.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="versionName" className="text-base">Version Name</Label>
            <Input
              id="versionName"
              type="text"
              placeholder="e.g., Q идеалы 2024 Employee Survey"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              required
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="jsonFile" className="text-base">Upload JSON File</Label>
            <div className="mt-1 flex items-center space-x-2">
              <FileJson className="h-6 w-6 text-muted-foreground"/>
              <Input
                id="jsonFile"
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
            </div>
          </div>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or paste JSON content</span>
            </div>
          </div>

          <div>
            <Label htmlFor="jsonContent" className="text-base">JSON Content</Label>
            <Textarea
              id="jsonContent"
              placeholder="Paste your questionnaire JSON here..."
              value={jsonContent}
              onChange={(e) => setJsonContent(e.target.value)}
              rows={10}
              className="mt-1 font-code text-sm"
            />
            <Button type="button" variant="link" size="sm" onClick={() => setJsonContent(sampleJson)} className="mt-1 text-primary">
              <Wand2 className="mr-1 h-3 w-3" /> Load Sample JSON
            </Button>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading} size="lg">
            {isLoading ? 'Uploading...' : 'Upload Questionnaire'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// Ensure uuid is installed: npm install uuid
// And types: npm install --save-dev @types/uuid
