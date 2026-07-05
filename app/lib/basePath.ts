export const BASE_PATH = "/qugpa";

export const asset = (path: string) =>
  `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
