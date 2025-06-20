
export interface AnswerOption {
  id: string;
  text: string;
  score: number;
}

export interface Question {
  id: string;
  question: string;
  options: AnswerOption[];
}

export interface Section {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
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
  versionName?: string;
  sections: Array<Omit<Section, 'id'> & {
    tempId?: string,
    questions: Array<Omit<Question, 'id'> & {
      tempId?: string,
      options: Array<Omit<AnswerOption, 'id'> & { tempId?: string }>
    }>
  }>;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface CustomerLink {
  id: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  questionnaireVersionId: string;
  questionnaireVersionName?: string;
  createdAt: Date;
  expiresAt: Date;
  status: "pending" | "started" | "completed" | "expired";
  currentSectionIndex?: number;
  responsesInProgress?: Record<string, string>; // question.id -> option.id
}

export interface UserAnswer {
  questionId: string;
  selectedOptionId: string;
  score: number;
}

// This type is for dynamic calculation in the report view, not stored in Firestore as is.
export interface CalculatedSectionScore {
  sectionId: string;
  sectionName: string;
  sectionWeight: number;
  achievedScore: number;
  maxPossibleScore: number; // Max score for all questions in this section
  averageScore: number; // Normalized to the typical score range (e.g., 1-4 or 1-5)
  color: 'text-red-600' | 'text-orange-500' | 'text-yellow-500' | 'text-green-600' | 'text-gray-500';
  weightedAverageScore: number;
  numQuestionsInSection: number;
}


export interface CustomerResponse {
  id: string; // This will be the same as the linkId
  linkId: string;
  customerId: string;
  customerName?: string; // Denormalized
  customerEmail?: string; // Denormalized
  questionnaireVersionId: string;
  questionnaireVersionName: string; // Denormalized from QuestionnaireVersion at submission
  submittedAt: Date;
  responses: Record<string, string>; // question.id -> option.id
  adminComments?: { // For storing admin-specific comments
    executiveSummary?: string;
    [sectionId: string]: string | undefined; // Comments per section
  };
  // Calculated scores like areaScores, questionScores are typically computed on-the-fly 
  // or in a separate, more complex reporting data structure, not directly on this basic response object.
}

export interface AdminUser {
  uid: string;
  email: string | null;
}
