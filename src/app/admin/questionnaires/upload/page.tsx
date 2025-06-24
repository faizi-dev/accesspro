
"use client";

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import type { QuestionnaireUploadData, Section } from '@/lib/types';
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
  if (!text) return `item-${uuidv4().substring(0,4)}`; // Fallback for empty text
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
            const parsed = JSON.parse(content) as QuestionnaireUploadData; // Use the type
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
      
      if (!questionnaireData.sections || !Array.isArray(questionnaireData.sections)) {
        throw new Error("Invalid JSON structure: 'sections' array is missing or not an array.");
      }

      // Process sections from QuestionnaireUploadData to internal Section[] type
      const processedSections: Section[] = questionnaireData.sections.map((sectionUpload, sIdx) => {
        const sectionSlug = generateSlug(sectionUpload.name?.substring(0,30) || `section${sIdx}`);
        const sectionId = sectionUpload.tempId 
          ? `${sectionUpload.tempId}_s_${sIdx}_${uuidv4().substring(0,4)}` 
          : `${sectionSlug}-s${sIdx}-${uuidv4().substring(0,8)}`;
        
        if (sectionUpload.type === 'bar' && typeof sectionUpload.total_score !== 'number') {
            throw new Error(`Bar section "${sectionUpload.name || `at index ${sIdx}`}" is missing a 'total_score' or has an invalid one.`);
        }
        
        if (sectionUpload.type === 'matrix' && !sectionUpload.matrix_axis) {
            throw new Error(`Matrix section "${sectionUpload.name || `at index ${sIdx}`}" is missing a 'matrix_axis' property.`);
        }

        return {
          id: sectionId,
          name: sectionUpload.name,
          description: sectionUpload.description || null,
          instructions: sectionUpload.instructions || null,
          comment: sectionUpload.comment || null,
          type: sectionUpload.type || 'bar',
          weight: sectionUpload.weight || 0,
          total_score: sectionUpload.total_score ?? null, // Use nullish coalescing to allow 0
          matrix_axis: sectionUpload.matrix_axis || null,
          questions: sectionUpload.questions.map((questionUpload, qIdx) => {
            const sectionNameForError = `in section ${sIdx + 1} ("${sectionUpload.name}")`;
            const questionNameForError = `question ${qIdx + 1}`;

            if (!questionUpload.question || typeof questionUpload.question !== 'string') {
              throw new Error(`A question is missing its "question" text ${sectionNameForError}.`);
            }
             if (!questionUpload.options || !Array.isArray(questionUpload.options)) {
              throw new Error(`A question is missing its "options" array ${sectionNameForError}, ${questionNameForError}.`);
            }

            const questionSlug = generateSlug(questionUpload.question?.substring(0,30) || `question${qIdx}`);
            const questionId = questionUpload.tempId 
              ? `${questionUpload.tempId}_s${sIdx}_q${qIdx}_${uuidv4().substring(0,4)}` 
              : `${questionSlug}-s${sIdx}-q${qIdx}-${uuidv4().substring(0,8)}`;
            
            return {
              id: questionId,
              question: questionUpload.question,
              options: questionUpload.options.map((optionUpload, oIdx) => {
                 if (!optionUpload.text || typeof optionUpload.text !== 'string') {
                  throw new Error(`An option is missing its "text" ${sectionNameForError}, ${questionNameForError}.`);
                }
                if (typeof optionUpload.score !== 'number') {
                  throw new Error(`An option is missing a numeric "score" ${sectionNameForError}, ${questionNameForError}.`);
                }

                const optionSlug = generateSlug(optionUpload.text?.substring(0,15) || `option${oIdx}`);
                const optionId = optionUpload.tempId 
                  ? `${optionUpload.tempId}_s${sIdx}_q${qIdx}_o${oIdx}_${uuidv4().substring(0,4)}`
                  : `${optionSlug}-s${sIdx}-q${qIdx}-o${oIdx}-${uuidv4().substring(0,8)}`;
                
                return {
                  id: optionId,
                  text: optionUpload.text,
                  score: optionUpload.score,
                };
              }),
            };
          }),
        };
      });

      const newVersionId = generateSlug(versionName) || `v-${Date.now()}`;

      const versionDoc = {
        name: versionName, // This is the overall questionnaire version name
        sections: processedSections,
        isActive: false,
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
  "versionName": "Dynamic Assessment V5",
  "sections": [
    {
      "name": "Core Competency A",
      "type": "bar",
      "total_score": 0.2,
      "comment": "This is a default analysis for Competency A. It highlights key trends and observations.",
      "questions": [
        {
          "question": "How do you rate competency A?",
          "options": [
            { "text": "Needs Improvement", "score": 1 },
            { "text": "Meets Expectations", "score": 2 },
            { "text": "Exceeds Expectations", "score": 3 },
            { "text": "Outstanding", "score": 4 }
          ]
        }
      ]
    },
    {
      "name": "Core Competency B",
      "type": "bar",
      "total_score": 0.3,
      "questions": [
        {
          "question": "How do you rate competency B?",
          "options": [
            { "text": "Needs Improvement", "score": 1 },
            { "text": "Meets Expectations", "score": 2 },
            { "text": "Exceeds Expectations", "score": 3 },
            { "text": "Outstanding", "score": 4 }
          ]
        }
      ]
    },
    {
      "name": "Effort Assessment",
      "description": "Rate the effort required for a key task.",
      "type": "matrix",
      "matrix_axis": "x",
      "questions": [
        {
          "question": "Rate the 'Effort' required (1=Low, 5=High)",
          "options": [
            { "text": "1", "score": 1 }, { "text": "2", "score": 2 }, { "text": "3", "score": 3 }, { "text": "4", "score": 4 }, { "text": "5", "score": 5 }
          ]
        }
      ]
    },
    {
      "name": "Impact Assessment",
      "description": "Rate the impact expected from a key task.",
      "type": "matrix",
      "matrix_axis": "y",
      "questions": [
        {
          "question": "Rate the 'Impact' expected (1=Low, 5=High)",
          "options": [
            { "text": "1", "score": 1 }, { "text": "2", "score": 2 }, { "text": "3", "score": 3 }, { "text": "4", "score": 4 }, { "text": "5", "score": 5 }
          ]
        }
      ]
    },
    {
      "name": "Tool Preference",
      "type": "count",
      "questions": [
        {
          "question": "Which tool do you prefer for collaboration?",
          "options": [
            { "text": "Tool A", "score": 1 },
            { "text": "Tool B", "score": 2 },
            { "text": "Tool C", "score": 3 }
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
          Provide a version name, then upload or paste a JSON file. Each section must have a `name` and `type` ('bar', 'matrix', 'count'). `bar` sections need `total_score`. `matrix` sections need `matrix_axis` ('x' or 'y').
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="versionName" className="text-base">Version Name</Label>
            <Input
              id="versionName"
              type="text"
              placeholder="e.g., Q3 2024 Dynamic Survey"
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
