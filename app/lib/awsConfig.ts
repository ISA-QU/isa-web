export const API_BASE_URL =
  "https://8scq4w84j2.execute-api.us-east-1.amazonaws.com/prod";

export const COGNITO_REGION = "us-east-1";
export const COGNITO_CLIENT_ID: string =
  process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "5gro2t44jv4sdiifls6kgq96q6";

export const DASHBOARD_DATA_URL =
  process.env.NEXT_PUBLIC_DASHBOARD_DATA_URL || `${API_BASE_URL}/dashboard`;
