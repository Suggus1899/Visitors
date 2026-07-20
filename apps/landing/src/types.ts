import type { ComponentType } from 'react';

export interface DemoResponse {
  accessToken: string;
  refreshToken: string;
  demoSlug: string;
  expiresAt: string;
  redirectUrl?: string;
  /** Optional demo credentials returned by the backend. */
  credentials?: {
    guardia: { email: string; password: string };
    admin: { email: string; password: string };
    auditor: { email: string; password: string };
  };
  /** Links to the tenant-scoped apps for the demo tenant. */
  links?: {
    admin?: string;
    auditor?: string;
    system?: string;
  };
}

export interface DemoRequest {
  name: string;
  email: string;
  company: string;
  phone: string;
}

export interface FeatureItem {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

export interface PricingTier {
  name: string;
  price: string;
  period?: string;
  description: string;
  limits: string[];
  features: string[];
  highlighted?: boolean;
  cta: string;
}

export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company: string;
  initials: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}
