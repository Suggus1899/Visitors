export interface IEmailService {
  isConfigured(): boolean;
  sendPasswordResetEmail(to: string, token: string, username: string): Promise<void>;
  sendPasswordChangedEmail(to: string, username: string): Promise<void>;
}
