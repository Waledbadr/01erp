/**
 * AI Assistant Server Types & Interfaces — Saudi ERP
 */

import {
  QueryIntentCategory,
  ActionSuggestion,
  AssistantMessage,
  AssistantConversation,
  DataSourceCitation,
  StructuredQueryResultData,
} from '../../../src/lib/assistant.js';
import { TenantContext } from '../../core/tenantGuard.js';

export interface AssistantQueryContext {
  tenant: TenantContext;
  conversationId: string;
  query: string;
  userRole: string;
  userPermissions: string[];
  canViewCost: boolean;
  canPerformActions: boolean;
  providerPreference?: string;
}

export interface AssistantAiProvider {
  name: string;
  isConfigured(): boolean;
  generateGroundedAnswer(
    queryContext: AssistantQueryContext,
    groundedData: GroundedContextData
  ): Promise<{
    answerAr: string;
    answerEn: string;
    suggestedFollowUps?: string[];
  }>;
}

export interface GroundedContextData {
  category: QueryIntentCategory;
  citations: DataSourceCitation[];
  structuredData: StructuredQueryResultData;
  potentialActions: ActionSuggestion[];
  rawFiguresSummary: string;
}
