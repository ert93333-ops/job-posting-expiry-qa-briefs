# Job Posting Expiry QA Briefs

Static browser-local MVP for career-site JobPosting expiry QA.

## Public offer

Paste JobPosting JSON-LD, visible job notes, expiry/status notes, remote/location notes, apply URL notes, page type, and owner notes to get a copyable job posting expiry QA brief before launch or cleanup.

## Constraints

- no crawl
- no page fetch
- no Rich Results Test
- no Search Console
- no ATS API
- no backend or external database
- no legal, HR, hiring, compliance, eligibility, ranking, indexing, or applicant-flow advice

## Conversion path

The landing page includes pricing hypothesis, local purchase-intent capture, a public-safe GitHub issue handoff, and copyable request details.

## SEO asset

- [JobPosting structured data checklist](https://ert93333-ops.github.io/job-posting-expiry-qa-briefs/jobposting-structured-data-checklist.html)

## Public marketing asset

- [JobPosting structured data launch checklist Gist](https://gist.github.com/ert93333-ops/b01f1da5046ce994534a757c6d4989b2)

## Marketing test URLs

- Landing: `https://ert93333-ops.github.io/job-posting-expiry-qa-briefs/?utm_source=github&utm_medium=repo&utm_campaign=job_posting_expiry_qa_launch`
- Checklist: `https://ert93333-ops.github.io/job-posting-expiry-qa-briefs/jobposting-structured-data-checklist.html?utm_source=github&utm_medium=repo&utm_campaign=jobposting_structured_data_checklist`

## Smoke test

From the Hermes playbook root:

```bash
npm run workflow:job-posting-expiry-qa
```
