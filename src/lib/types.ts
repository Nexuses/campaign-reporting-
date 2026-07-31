export interface LeadRow {
  email: string;
  first_name: string;
  last_name: string;
  company_name: string;
  phone_number: string;
  website: string;
  location: string;
  linkedin_profile: string;
  lead_status: string;
  current_seq_num: string;
  email_account: string;
  lead_category: string;
  is_opened: string;
  is_clicked: string;
  is_bounced: string;
  is_unsubscribed?: string;
  got_reply: string;
  sent_time: string;
}

export interface ConvertOptions {
  campaignName: string;
  edmLabel?: string;
  totalSentOverride?: number;
}

export interface ConvertResult {
  fileName: string;
  buffer: Buffer;
  stats: {
    totalSent: number;
    opens: number;
    clicks: number;
    hardBounces: number;
    softBounces: number;
    unsubscribes: number;
  };
}
