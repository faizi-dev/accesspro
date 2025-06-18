
export interface AnswerOption {
  id: string;
  text: string;
  score: number; // Changed from points
}

export interface Question {
  id: string;
  question: string; // Changed from text
  options: AnswerOption[];
}

export interface Section {
  id: string;
  name: string; // Changed from title
  description?: string;
  instructions?: string; // Added
  questions: Question[];
  weight: number;
}

export interface QuestionnaireVersion {
  id: string;
  name: string; // This is the version name (e.g., "Q3 Wellness Survey")
  createdAt: Date;
  isActive: boolean;
  sections: Section[];
}

// Represents the structure of the JSON file being uploaded
export interface QuestionnaireUploadData {
  versionName?: string; // Optional: Can be in JSON or entered in UI
  sections: Array<Omit<Section, 'id'> & { // Expects name, description, instructions, questions, weight
    tempId?: string,
    questions: Array<Omit<Question, 'id'> & { // Expects question, options
      tempId?: string,
      options: Array<Omit<AnswerOption, 'id'> & { tempId?: string }> // Expects text, score
    }>
  }>;
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
  responsesInProgress?: Record<string, string>; // question.id -> option.id
}

export interface UserAnswer {
  questionId: string;
  selectedOptionId: string;
  score: number;
}

export interface SectionResult {
  sectionId: string;
  sectionName: string; // Was sectionTitle
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
  responses: Record<string, string>; // question.id -> option.id
  areaScores: Record<string, { // Key is section.id
    name: string; // Section name
    averageScore: number;
    weightedAverageScore: number;
    color: 'red' | 'orange' | 'yellow' | 'green';
  }>;
  questionScores: Record<string, { // Key is question.id
    score: number;
    color: 'red' | 'orange' | 'yellow' | 'green';
  }>;
  adminComments?: Record<string, string>;
}

export interface AdminUser {
  uid: string;
  email: string | null;
}
