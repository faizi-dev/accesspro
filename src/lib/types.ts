export interface AnswerOption {
  id: string;
  text: string;
  points: number;
}

export interface Question {
  id: string;
  text: string;
  options: AnswerOption[];
  // order?: number; // If needed for explicit ordering within a section
}

export interface Section {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
  weight: number; // For weighted scoring
  // order?: number; // If needed for explicit ordering of sections
}

export interface QuestionnaireVersion {
  id: string; // Firestore document ID (e.g., "v1.0")
  name: string;
  createdAt: Date; // Or Firebase Timestamp
  isActive: boolean;
  sections: Section[];
}

// For uploading new questionnaire structure
export interface QuestionnaireUploadData {
  versionName: string;
  sections: Array<Omit<Section, 'id'> & { tempId?: string, questions: Array<Omit<Question, 'id'> & { tempId?: string, options: Array<Omit<AnswerOption, 'id'> & { tempId?: string }> }> }>;
}


export interface CustomerLink {
  id: string; // Firestore document ID (unique link ID)
  customerId: string; // e.g., email or a unique identifier for the customer
  questionnaireVersionId: string;
  createdAt: Date; // Or Firebase Timestamp
  expiresAt: Date; // Or Firebase Timestamp
  status: "pending" | "started" | "completed" | "expired";
  currentSectionIndex?: number; // To track progress for "Save and Quit"
  responsesInProgress?: Record<string, string>; // { questionId: selectedOptionId }
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
  averageScore: number; // rawScoreSum / number of questions in section
  weightedScore?: number; // averageScore * sectionWeight (needs careful definition)
}

export interface CustomerResponse {
  id: string; // Firestore document ID
  linkId: string;
  customerId: string;
  questionnaireVersionId: string;
  questionnaireVersionName: string; // Denormalized for easier display
  submittedAt: Date; // Or Firebase Timestamp
  responses: Record<string, string>; // { questionId: selectedOptionId }
  // Calculated scores for reporting
  areaScores: Record<string, { // key is sectionId
    title: string;
    averageScore: number; // e.g. 1-4 scale average
    weightedAverageScore: number; // averageScore * sectionWeight (normalized if needed)
    color: 'red' | 'orange' | 'yellow' | 'green';
  }>;
  questionScores: Record<string, { // key is questionId
    score: number;
    color: 'red' | 'orange' | 'yellow' | 'green';
  }>;
  adminComments?: Record<string, string>; // { 'summary_custom': "comment", 'area_sectionId_custom': "comment" }
}

// For admin user context
export interface AdminUser {
  uid: string;
  email: string | null;
}
