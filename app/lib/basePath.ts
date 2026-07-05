export const BASE_PATH = "/isa-web";

export const asset = (path: string) =>
  `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
