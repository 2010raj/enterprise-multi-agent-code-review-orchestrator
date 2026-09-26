import { query } from '@anthropic-ai/claude-agent-sdk';
import { mcpServersConfig } from './config/mcp.config';
import {
  codeQualityAnalyzer,
  testCoverageAnalyzer,
  refactoringSuggester,
} from './agents';
import { buildOrchestratorPrompt } from './prompts';
import {
  ReviewReport,
  ReviewReportJSONSchema,
  ReviewReportSchema,
} from './types/report-types';

/**
 * Orchestrator configuration options.
 */
export interface OrchestratorOptions {
  model?: string;
  maxTurns?: number;
}

/**
 * Main Code Review Orchestrator.
 * Coordinates specialized agents to analyze pull requests
 * and generate comprehensive structured reports.
 */
export class CodeReviewOrchestrator {
  private readonly model: string;
  private readonly maxTurns: number;

  constructor(options: OrchestratorOptions = {}) {
    this.model =
      options.model ||
      process.env.ANTHROPIC_MODEL ||
      'claude-sonnet-4-5-20250929';

    this.maxTurns = options.maxTurns ?? 20;
  }

  /**
   * Review a pull request using specialized subagent analysis.
   */
  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    const prompt = buildOrchestratorPrompt(owner, repo, prNumber);

    const response = query({
      prompt,
      options: {
        model: this.model,
        maxTurns: this.maxTurns,

        mcpServers: mcpServersConfig,

        allowedTools: [
          'Task',
          'mcp__github__pull_request_read',
          'mcp__github__get_file_contents',
          'Skill',
        ],

        agents: {
          'code-quality-analyzer': codeQualityAnalyzer,
          'test-coverage-analyzer': testCoverageAnalyzer,
          'refactoring-suggester': refactoringSuggester,
        },

        outputFormat: {
          type: 'json_schema',
          schema: ReviewReportJSONSchema,
        },
      },
    });

    let structuredOutput: unknown;

    for await (const message of response) {
      if (
        message.type === 'result' &&
        'structured_output' in message &&
        message.structured_output
      ) {
        structuredOutput = message.structured_output;
      }

      if (
        message.type === 'result' &&
        'subtype' in message &&
        typeof message.subtype === 'string' &&
        message.subtype.startsWith('error_')
      ) {
        throw new Error(
          `Orchestrator failed with result subtype: ${message.subtype}`
        );
      }
    }

    if (structuredOutput === undefined) {
      throw new Error(
        'Orchestrator completed without returning structured ReviewReport output.'
      );
    }

    const validation = ReviewReportSchema.safeParse(structuredOutput);

    if (!validation.success) {
      throw new Error(
        `Invalid ReviewReport returned by orchestrator: ${validation.error.message}`
      );
    }

    return validation.data;
  }
}
