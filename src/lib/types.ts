
export interface AnswerOption {
  id: string;
  text: string;
  points: number;
}

export interface Question {
  id: string;
  text: string;
  options: AnswerOption[];
}

export interface Section {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
  weight: number; 
}

export interface QuestionnaireVersion {
  id: string; 
  name: string;
  createdAt: Date; 
  isActive: boolean;
  sections: Section[];
}

export interface QuestionnaireUploadData {
  versionName: string;
  sections: Array<Omit<Section, 'id'> & { tempId?: string, questions: Array<Omit<Question, 'id'> & { tempId?: string, options: Array<Omit<AnswerOption, 'id'> & { tempId?: string }> }> }>;
}

export interface Customer {
  id: string; // Firestore document ID
  name: string;
  email: string;
  createdAt: Date; // Or Firebase Timestamp
}

export interface CustomerLink {
  id: string; 
  customerId: string; 
  customerName?: string; // Denormalized for easier display
  customerEmail?: string; // Denormalized
  questionnaireVersionId: string;
  questionnaireVersionName?: string; // Denormalized
  createdAt: Date; 
  expiresAt: Date; 
  status: "pending" | "started" | "completed" | "expired";
  currentSectionIndex?: number; 
  responsesInProgress?: Record<string, string>; 
}

export interface UserAnswer {
  questionId: string;
  selectedOptionId: string;
  score: number;
}

export interface SectionResult {
  sectionId: string;
  sectionTitle: string;
  answers: UserAnswer[];
  rawScoreSum: number;
  maxPossibleScore: number;
  averageScore: number; 
  weightedScore?: number; 
}

export interface CustomerResponse {
  id: string; 
  linkId: string;
  customerId: string;
  questionnaireVersionId: string;
  questionnaireVersionName: string; 
  submittedAt: Date; 
  responses: Record<string, string>; 
  areaScores: Record<string, { 
    title: string;
    averageScore: number; 
    weightedAverageScore: number; 
    color: 'red' | 'orange' | 'yellow' | 'green';
  }>;
  questionScores: Record<string, { 
    score: number;
    color: 'red' | 'orange' | 'yellow' | 'green';
  }>;
  adminComments?: Record<string, string>; 
}

export interface AdminUser {
  uid: string;
  email: string | null;
}
