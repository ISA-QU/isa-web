declare module "plotly.js-dist-min" {
  export * from "plotly.js";
  import type * as Plotly from "plotly.js";
  const plotly: typeof Plotly;
  export default plotly;
}
