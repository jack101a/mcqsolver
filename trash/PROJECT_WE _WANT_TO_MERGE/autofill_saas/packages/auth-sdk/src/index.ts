export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};

export const authHeader = (accessToken: string): Record<string, string> => ({
  Authorization: `Bearer ${accessToken}`
});
