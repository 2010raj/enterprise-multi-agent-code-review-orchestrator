import { describe, expect, it, vi } from 'vitest';

const validReviewReport = {
  pullRequest: {
    owner: 'octocat',
    repo: 'Hello-World',
    number: 1,
  },
  fileReviews: [
    {
      file: 'README',
      codeQuality: {
        file: 'README',
        issues: [],
        overallScore: 90,
        summary: 'No significant code quality issues found.',
      },
      testCoverage: {
        file: 'README',
        hasTests: false,
        testFiles: [],
        untestedPaths: [],
        coverageEstimate: 100,
        summary: 'No executable code requires test coverage.',
      },
      refactorings: {
        file: 'README',
        suggestions: [],
        summary: 'No refactoring required.',
      },
    },
  ],
  summary: {
    totalFiles: 1,
    overallScore: 90,
    criticalIssues: 0,
    highPriorityTests: 0,
    refactoringOpportunities: 0,
  },
  recommendations: [],
  metadata: {
    analyzedAt: new Date().toISOString(),
    duration: 100,
    agentVersions: {
      'code-quality-analyzer': 'test',
      'test-coverage-analyzer': 'test',
      'refactoring-suggester': 'test',
    },
  },
};

describe('CodeReviewOrchestrator', () => {
  describe('Configuration', () => {
    it('should initialize with default options', async () => {
      vi.resetModules();

      const { CodeReviewOrchestrator } = await import('../src/orchestrator');

      const orchestrator = new CodeReviewOrchestrator();

      expect(orchestrator).toBeInstanceOf(CodeReviewOrchestrator);
    });

    it('should accept custom model and maxTurns configuration', async () => {
      vi.resetModules();

      const { CodeReviewOrchestrator } = await import('../src/orchestrator');

      const orchestrator = new CodeReviewOrchestrator({
        model: 'test-model',
        maxTurns: 5,
      });

      expect(orchestrator).toBeInstanceOf(CodeReviewOrchestrator);
    });
  });

  describe('reviewPullRequest', () => {
    it('should return a validated ReviewReport from structured output', async () => {
      vi.resetModules();

      vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
        query: vi.fn(() =>
          (async function* () {
            yield {
              type: 'result',
              subtype: 'success',
              structured_output: validReviewReport,
            };
          })()
        ),
      }));

      const { CodeReviewOrchestrator } = await import('../src/orchestrator');

      const orchestrator = new CodeReviewOrchestrator({
        model: 'test-model',
        maxTurns: 5,
      });

      const report = await orchestrator.reviewPullRequest(
        'octocat',
        'Hello-World',
        1
      );

      expect(report.pullRequest.owner).toBe('octocat');
      expect(report.pullRequest.repo).toBe('Hello-World');
      expect(report.pullRequest.number).toBe(1);
      expect(report.fileReviews).toHaveLength(1);
      expect(report.summary.overallScore).toBe(90);
    });

    it('should pass the configured model, maxTurns, agents, MCP servers, and Task tool to the SDK', async () => {
      vi.resetModules();

      const queryMock = vi.fn(() =>
        (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            structured_output: validReviewReport,
          };
        })()
      );

      vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
        query: queryMock,
      }));

      const { CodeReviewOrchestrator } = await import('../src/orchestrator');

      const orchestrator = new CodeReviewOrchestrator({
        model: 'test-model',
        maxTurns: 7,
      });

      await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);

      expect(queryMock).toHaveBeenCalledTimes(1);

      const call = queryMock.mock.calls[0][0];

      expect(call.options.model).toBe('test-model');
      expect(call.options.maxTurns).toBe(7);
      expect(call.options.allowedTools).toContain('Task');
      expect(call.options.agents).toHaveProperty('code-quality-analyzer');
      expect(call.options.agents).toHaveProperty('test-coverage-analyzer');
      expect(call.options.agents).toHaveProperty('refactoring-suggester');
      expect(call.options.mcpServers).toHaveProperty('github');
      expect(call.options.mcpServers).toHaveProperty('eslint');
    });

    it('should reject when the SDK returns no structured output', async () => {
      vi.resetModules();

      vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
        query: vi.fn(() =>
          (async function* () {
            yield {
              type: 'result',
              subtype: 'success',
            };
          })()
        ),
      }));

      const { CodeReviewOrchestrator } = await import('../src/orchestrator');

      const orchestrator = new CodeReviewOrchestrator({
        model: 'test-model',
      });

      await expect(
        orchestrator.reviewPullRequest('octocat', 'Hello-World', 1)
      ).rejects.toThrow(
        'Orchestrator completed without returning structured ReviewReport output.'
      );
    });

    it('should reject invalid structured output using Zod validation', async () => {
      vi.resetModules();

      vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
        query: vi.fn(() =>
          (async function* () {
            yield {
              type: 'result',
              subtype: 'success',
              structured_output: {
                invalid: true,
              },
            };
          })()
        ),
      }));

      const { CodeReviewOrchestrator } = await import('../src/orchestrator');

      const orchestrator = new CodeReviewOrchestrator({
        model: 'test-model',
      });

      await expect(
        orchestrator.reviewPullRequest('octocat', 'Hello-World', 1)
      ).rejects.toThrow('Invalid ReviewReport returned by orchestrator');
    });

    it('should reject when the SDK reports an error result', async () => {
      vi.resetModules();

      vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
        query: vi.fn(() =>
          (async function* () {
            yield {
              type: 'result',
              subtype: 'error_max_turns',
            };
          })()
        ),
      }));

      const { CodeReviewOrchestrator } = await import('../src/orchestrator');

      const orchestrator = new CodeReviewOrchestrator({
        model: 'test-model',
      });

      await expect(
        orchestrator.reviewPullRequest('octocat', 'Hello-World', 1)
      ).rejects.toThrow(
        'Orchestrator failed with result subtype: error_max_turns'
      );
    });
  });

  describe('Integration', () => {
    it.skip('should review a real small PR', async () => {
      // Requires valid Anthropic and GitHub credentials.
      // Run manually when real API integration testing is desired.
    });
  });
});
