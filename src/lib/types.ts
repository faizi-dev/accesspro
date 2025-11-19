

export interface AnswerOption {
  id: string;
  text: string;
  score: number;
}

export interface Question {
  id:string;
  question: string;
  options: AnswerOption[];
  additional_text?: string | null;
}

export interface AreaScoreText {
  // For 'bar' type
  score_less_than_1_5?: string;
  score_between_1_51_and_2_5?: string;
  score_between_2_51_and_3_5?: string;
  score_greater_than_3_5?: string;
  // For 'matrix' type
  area_X_less_than_3_area_Y_less_than_3?: string;
  area_X_less_than_3_area_Y_greater_than_3?: string;
  area_X_greater_than_3_area_Y_less_than_3?: string;
  area_X_greater_than_3_area_Y_greater_than_3?: string;
  // For 'count' type
  [key: `score_${number}`]: string;
}


export interface Section {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  comment: string | null;
  type: 'bar' | 'matrix' | 'count';
  weight: number; // For backward compatibility
  total_score: number | null;
  matrix_axis: 'x' | 'y' | null;
  questions: Question[];
  area_score_text?: AreaScoreText | null;
}

export interface QuestionnaireDescription {
  header: string;
  details: string;
}

export interface ReportTotalAverage {
  green: string;
  yellow: string;
  orange: string;
  red: string;
}

export interface AttachmentConfig {
  required: boolean;
  count: number; // 1, 2 or 3
}

export interface QuestionnaireVersion {
  id: string;
  name: string;
  createdAt: Date;
  isActive: boolean;
  description?: QuestionnaireDescription;
  report_total_average?: ReportTotalAverage;
  sections: Section[];
  attachmentConfig?: AttachmentConfig;
}

// This defines the shape of the JSON file being uploaded.
// Optional fields here will be parsed as 'undefined' if missing.
export interface SectionUpload {
  name: string;
  tempId?: string;
  description?: string;
  instructions?: string;
  comment?: string;
  type?: 'bar' | 'matrix' | 'count';
  weight?: number;
  total_score?: number;
  matrix_axis?: 'x' | 'y';
  area_score_text?: AreaScoreText;
  questions: Array<Omit<Question, 'id'> & {
    tempId?: string,
    additional_text?: string,
    options: Array<Omit<AnswerOption, 'id'> & { tempId?: string }>
  }>;
}

export interface QuestionnaireUploadData {
  versionName?: string;
  description?: QuestionnaireDescription;
  report_total_average?: ReportTotalAverage;
  sections: SectionUpload[];
  attachmentConfig?: AttachmentConfig;
}

export interface Customer {
  id: string;
  firstName: string;
  lastName?: string;
  email: string;
  jobTitle?: string;
  sector?: string;
  numberOfEmployees?: string;
  turnover?: string;
  province?: string;
  need?: string;
  returnDeadline?: Date | null;
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
  sectionWeight: number; // Will be populated by total_score
  achievedScore: number;
  averageScore: number;
  weightedAverageScore: number;
  analysisText?: string;
}

// New type for count analysis
export interface CalculatedCountAnalysis {
  sectionId: string;
  sectionName: string;
  // An object where key is the score, and value is its count
  scoreCounts: Record<string, number>;
  // An array of scores that are most frequent
  mostFrequentScores: number[];
  analysisText?: string;
}

// New type for Matrix analysis
export interface CalculatedMatrixAnalysis {
  sectionId: string;
  sectionName: string;
  xSectionId: string;
  ySectionId: string;
  xAxisLabel: string;
  yAxisLabel: string;
  data: { x: number; y: number; name: string, parent: any }[];
  xAxisDomain: [number, number];
  yAxisDomain: [number, number];
  analysisText?: string;
}

export interface AttachmentFile {
    name: string;
    url: string;
    size: number;
    type: string;
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
  attachments?: AttachmentFile[];
  dynamicComments?: { // Editable comments, initialized from questionnaire
    [sectionId: string]: string | undefined;
  };
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

export interface EmailTemplate {
  id: 'newAssessment' | 'assessmentCompleted' | 'reminder7Day' | 'reminder2DayCustomer' | 'reminder2DayAdmin';
  subject: string;
  body: string; // HTML body
  placeholders: string[];
}

    