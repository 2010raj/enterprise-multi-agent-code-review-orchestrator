import { describe, expect, it, vi } from 'vitest';

import {
  ErrorCodes,
  ReviewError,
  withRetry,
  withTimeout,
} from '../src/utils/error-handler';
import { ReportGenerator } from '../src/utils/report-generator';
import type { ReviewReport } from '../src/types/report-types';

describe('Error handling utilities', () => {
  it('retries a failing operation and returns its eventual result', async () => {
    let attempts = 0;

    const result = await withRetry(
      async () => {
        attempts += 1;

        if (attempts < 3) {
          throw new Error('temporary failure');
        }

        return 'success';
      },
      3,
      0
    );

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('throws RETRY_EXHAUSTED when all retry attempts fail', async () => {
    await expect(
      withRetry(
        async () => {
          throw new Error('persistent failure');
        },
        2,
        0
      )
    ).rejects.toMatchObject({
      code: ErrorCodes.RETRY_EXHAUSTED,
    });
  });

  it('returns a result completed before the timeout', async () => {
    await expect(
      withTimeout(async () => 'completed', 100)
    ).resolves.toBe('completed');
  });

  it('throws AGENT_TIMEOUT when the operation exceeds the timeout', async () => {
    await expect(
      withTimeout(
        () =>
          new Promise<string>((resolve) => {
            setTimeout(() => resolve('too late'), 50);
          }),
        5
      )
    ).rejects.toMatchObject({
      code: ErrorCodes.AGENT_TIMEOUT,
    });
  });
});

describe('ReportGenerator', () => {
  const report: ReviewReport = {
    pullRequest: {
      owner: 'test-owner',
      repo: 'test-repo',
      number: 1,
      title: 'Test pull request',
      author: 'test-user',
      url: 'https://github.com/test-owner/test-repo/pull/1',
      description: 'Test description',
      changedFiles: 1,
    },
    fileReviews: [
      {
        file: 'src/example.ts',
        codeQuality: {
          file: 'src/example.ts',
          issues: [
            {
              line: 10,
              severity: 'high',
              category: 'bug-risk',
              description: 'Potential bug',
              suggestion: 'Add validation',
            },
          ],
          overallScore: 80,
          summary: 'Good quality with one issue.',
        },
        testCoverage: {
          file: 'src/example.ts',
          hasTests: false,
          testFiles: [],
          untestedPaths: [
            {
              type: 'edge-case',
              location: 'input validation',
              priority: 'high',
              reasoning: 'Invalid input is not covered.',
              suggestedTest: 'Add an invalid input test.',
            },
          ],
          coverageEstimate: 60,
          summary: 'Additional tests are needed.',
        },
        refactorings: {
          file: 'src/example.ts',
          suggestions: [
            {
              type: 'extract-function',
              location: 'main logic',
              impact: 'medium',
              description: 'Extract repeated logic.',
              before: 'Inline logic',
              after: 'Reusable helper',
              benefits: 'Improves readability.',
            },
          ],
          summary: 'One refactoring opportunity.',
        },
      },
    ],
    summary: {
      overallScore: 75,
      totalFiles: 1,
      criticalIssues: 0,
      highPriorityTests: 1,
      refactoringOpportunities: 1,
    },
    recommendations: [
      {
        category: 'testing',
        priority: 'high',
        description: 'Add validation tests.',
        files: ['src/example.ts'],
      },
    ],
    metadata: {
      analyzedAt: '2026-01-01T00:00:00.000Z',
      duration: 1000,
      agentVersions: {
        'code-quality-analyzer': 'test',
        'test-coverage-analyzer': 'test',
        'refactoring-suggester': 'test',
      },
    },
  };

  it('generates JSON containing the review report', () => {
    const generator = new ReportGenerator();
    const json = generator.generateJSONReport(report);

    expect(JSON.parse(json)).toEqual(report);
  });

  it('generates Markdown containing review summary and file details', () => {
    const generator = new ReportGenerator();
    const markdown = generator.generateMarkdownReport(report);

    expect(markdown).toContain('# 🔍 Code Review Report');
    expect(markdown).toContain('Overall Score');
    expect(markdown).toContain('src/example.ts');
    expect(markdown).toContain('Potential bug');
  });

  it('generates HTML containing the review summary', () => {
    const generator = new ReportGenerator();
    const html = generator.generateHTMLReport(report);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Code Review Report');
    expect(html).toContain('src/example.ts');
    expect(html).toContain('Overall Score');
  });
});
