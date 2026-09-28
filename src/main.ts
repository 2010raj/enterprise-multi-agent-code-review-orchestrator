import * as dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';

import { CodeReviewOrchestrator } from './orchestrator';
import { ReportGenerator } from './utils/report-generator';
import { ErrorCodes, ReviewError } from './utils/error-handler';

// Load environment variables
dotenv.config();

/**
 * Validate CLI arguments.
 */
function parseArguments(): {
  owner: string;
  repo: string;
  prNumber: number;
} {
  const [owner, repo, prStr] = process.argv.slice(2);

  if (!owner || !repo || !prStr) {
    throw new ReviewError(
      'Usage: npm run dev -- <owner> <repo> <pr-number>',
      ErrorCodes.VALIDATION_FAILED
    );
  }

  const prNumber = Number(prStr);

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new ReviewError(
      'PR number must be a positive integer.',
      ErrorCodes.VALIDATION_FAILED
    );
  }

  return { owner, repo, prNumber };
}

/**
 * Validate authentication and required model configuration.
 */
function validateEnvironment(): void {
  const hasAnthropicAuth = Boolean(process.env.ANTHROPIC_API_KEY);

  const hasAwsAuth =
    Boolean(process.env.AWS_ACCESS_KEY_ID) &&
    Boolean(process.env.AWS_SECRET_ACCESS_KEY);

  if (!process.env.GITHUB_TOKEN) {
    throw new ReviewError(
      'GITHUB_TOKEN is required so the GitHub MCP server can fetch pull request data.',
      ErrorCodes.MISSING_GITHUB_TOKEN
    );
  }

  if (!hasAnthropicAuth && !hasAwsAuth) {
    throw new ReviewError(
      'Authentication is not configured. Set ANTHROPIC_API_KEY, or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.',
      ErrorCodes.INVALID_CONFIG
    );
  }

  if (hasAwsAuth && !process.env.AWS_REGION) {
    throw new ReviewError(
      'AWS_REGION is required when using AWS Bedrock authentication.',
      ErrorCodes.INVALID_CONFIG
    );
  }

  if (!process.env.ANTHROPIC_MODEL) {
    throw new ReviewError(
      'ANTHROPIC_MODEL is required.',
      ErrorCodes.INVALID_CONFIG
    );
  }

  if (hasAnthropicAuth) {
    console.log('🔐 Using Anthropic API authentication');
  } else {
    console.log('🔐 Using AWS Bedrock authentication');
  }

  console.log(`🤖 Model: ${process.env.ANTHROPIC_MODEL}`);
}

/**
 * Main entry point for the Claude Multi-Agent Code Review System.
 *
 * Usage:
 *   npm run dev -- <owner> <repo> <pr-number>
 */
async function main(): Promise<void> {
  try {
    const { owner, repo, prNumber } = parseArguments();

    validateEnvironment();

    console.log(`🔍 Reviewing ${owner}/${repo} PR #${prNumber}...`);

    const orchestrator = new CodeReviewOrchestrator({
      model: process.env.ANTHROPIC_MODEL,
    });

    const startTime = Date.now();
    const report = await orchestrator.reviewPullRequest(
      owner,
      repo,
      prNumber
    );

    // Keep runtime metadata consistent with the actual review execution.
    report.metadata.analyzedAt = new Date().toISOString();
    report.metadata.duration = Date.now() - startTime;

    const reportGenerator = new ReportGenerator();

    const jsonReport = reportGenerator.generateJSONReport(report);
    const markdownReport = reportGenerator.generateMarkdownReport(report);
    const htmlReport = reportGenerator.generateHTMLReport(report);

    await mkdir('reports', { recursive: true });

    await Promise.all([
      writeFile('reports/report.json', jsonReport, 'utf8'),
      writeFile('reports/report.md', markdownReport, 'utf8'),
      writeFile('reports/report.html', htmlReport, 'utf8'),
    ]);

    console.log('✅ Review completed successfully.');
    console.log('📄 Reports written to reports/report.{json,md,html}');
  } catch (error) {
    if (error instanceof ReviewError) {
      console.error(`❌ [${error.code}] ${error.message}`);
    } else if (error instanceof Error) {
      console.error(`❌ Error: ${error.message}`);
    } else {
      console.error('❌ Unknown error:', error);
    }

    process.exitCode = 1;
  }
}

void main();
