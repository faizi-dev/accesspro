
export interface AnswerOption {
  id: string;
  text: string;
  score: number;
}

export interface Question {
  id:string;
  question: string;
  options: AnswerOption[];
}

export interface Section {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  type?: 'weighted' | 'matrix' | 'count'; // Type to determine analysis method
  questions: Question[];
  weight: number; // For 'weighted' type, for others it could be 0
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
  sections: Array<Omit<Section, 'id' | 'weight'> & {
    weight?: number;
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
  averageScore: number;
  weightedAverageScore: number;
}

// New type for count analysis
export interface CalculatedCountAnalysis {
  sectionId: string;
  sectionName: string;
  // An object where key is the score, and value is its count
  scoreCounts: Record<string, number>;
  // An array of scores that are most frequent
  mostFrequentScores: number[];
}

// New type for Matrix analysis
export interface CalculatedMatrixAnalysis {
  sectionId: string;
  sectionName: string;
  xAxisLabel: string;
  yAxisLabel: string;
  data: { x: number; y: number; name: string, parent: any }[];
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

    

    