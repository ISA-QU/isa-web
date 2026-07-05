# QU GPA Calculator — backend

Six Lambdas behind an API Gateway HTTP API, backed by two DynamoDB tables and one S3 bucket. No auth.

## Resources you need to create

### S3
- **Bucket**: any name. Block all public access. Lambdas read/write objects under `transcripts/<studentId>.json`.

### DynamoDB
- **gpa** table — PK `studentId` (String). On-demand capacity.
- **gradescale** table — PK `instituteId` (String). On-demand capacity.

### Lambdas (Python 3.12, x86_64)
You already created the first three. Create three more.

Handler (all six): `lambda_function.lambda_handler`

| Lambda | Source |
|---|---|
| `get-transcripts` | `lambdas/get-transcripts/lambda_function.py` |
| `upload-transcript` | `lambdas/upload-transcript/lambda_function.py` |
| `delete-transcript` | `lambdas/delete-transcript/lambda_function.py` |
| `get-gradescales` | `lambdas/get-gradescales/lambda_function.py` |
| `upload-gradescale` | `lambdas/upload-gradescale/lambda_function.py` |
| `delete-gradescale` | `lambdas/delete-gradescale/lambda_function.py` |

Table names (`gpa`, `gradescales`), bucket (`isa-transcripts`), and S3 prefix (`transcripts`) are hardcoded at the top of each file. Edit them in source if anything changes.

For each Lambda: paste the corresponding `lambda_function.py` content into the AWS console editor and Deploy. `boto3` is part of the Python 3.12 runtime, so no zip upload, layers, or environment variables needed.

### IAM execution role per Lambda

Attach an inline policy to each Lambda's execution role with the permissions it needs.

**get-transcripts** — read gpa table + read S3:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["dynamodb:Scan", "dynamodb:GetItem"], "Resource": "arn:aws:dynamodb:<region>:<acct>:table/<TABLE_GPA>" },
    { "Effect": "Allow", "Action": ["s3:GetObject"], "Resource": "arn:aws:s3:::<S3_BUCKET>/*" }
  ]
}
```

**upload-transcript** — write gpa + write S3:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["dynamodb:PutItem"], "Resource": "arn:aws:dynamodb:<region>:<acct>:table/<TABLE_GPA>" },
    { "Effect": "Allow", "Action": ["s3:PutObject"], "Resource": "arn:aws:s3:::<S3_BUCKET>/*" }
  ]
}
```

**delete-transcript** — delete gpa + delete S3:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["dynamodb:DeleteItem"], "Resource": "arn:aws:dynamodb:<region>:<acct>:table/<TABLE_GPA>" },
    { "Effect": "Allow", "Action": ["s3:DeleteObject"], "Resource": "arn:aws:s3:::<S3_BUCKET>/*" }
  ]
}
```

**get-gradescales** — read gradescale:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["dynamodb:Scan", "dynamodb:GetItem"], "Resource": "arn:aws:dynamodb:<region>:<acct>:table/<TABLE_GRADESCALE>" }
  ]
}
```

**upload-gradescale** — write gradescale:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["dynamodb:PutItem"], "Resource": "arn:aws:dynamodb:<region>:<acct>:table/<TABLE_GRADESCALE>" }
  ]
}
```

**delete-gradescale** — delete gradescale:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["dynamodb:DeleteItem"], "Resource": "arn:aws:dynamodb:<region>:<acct>:table/<TABLE_GRADESCALE>" }
  ]
}
```

All Lambdas additionally inherit the standard `AWSLambdaBasicExecutionRole` for CloudWatch logs.

### API Gateway (HTTP API)

Create one HTTP API. Add these routes and bind each to the corresponding Lambda integration:

| Method | Route | Lambda |
|---|---|---|
| GET | /transcripts | get-transcripts |
| GET | /transcripts/{studentId} | get-transcripts |
| POST | /transcripts | upload-transcript |
| DELETE | /transcripts/{studentId} | delete-transcript |
| GET | /gradescales | get-gradescales |
| GET | /gradescales/{instituteId} | get-gradescales |
| POST | /gradescales | upload-gradescale |
| DELETE | /gradescales/{instituteId} | delete-gradescale |

### CORS
On the HTTP API, configure CORS:
- Access-Control-Allow-Origin: `http://localhost:3000` and `https://<user>.github.io` (whatever's in `awsConfig.js`)
- Access-Control-Allow-Methods: `GET, POST, DELETE, OPTIONS`
- Access-Control-Allow-Headers: `Content-Type`

## Putting it together

1. Fill in `backend/awsConfig.js` with your region, table names, bucket, API URL, allowed origins.
2. For each Lambda, paste `lambdas/<name>/index.mjs` into the console and set its env vars.
3. Attach the IAM policies above to each execution role.
4. Wire the routes in API Gateway HTTP API.
5. Configure CORS.
6. Copy the API base URL into `app/lib/awsConfig.ts` on the frontend.
