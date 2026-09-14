module.exports = {
  region: "us-east-1",
  apiBaseUrl: "https://8scq4w84j2.execute-api.us-east-1.amazonaws.com/",
  s3: {
    bucket: "isa-transcripts",
    prefix: "transcripts",
  },

  tables: {
    gpa: "gpa",
    gradescale: "gradescales",
  },
  cors: {
    allowedOrigins: [
      "http://localhost:3000",
      "https://isa-qu.github.io",
    ],
  },
};
