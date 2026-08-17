export interface Journal {
  id: string;
  journal_date: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface JournalList {
  items: Journal[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface JournalFilters {
  dateFrom: string;
  dateTo: string;
  page: number;
}

export interface JournalPayload {
  journal_date: string;
  title: string;
  content: string;
}

export type JournalUpdatePayload = Partial<JournalPayload>;
