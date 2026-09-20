import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Database,
  TrendingUp,
  PackageCheck,
  Percent,
  FileText,
  Coins,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Search,
  MessageSquare,
  ArrowRight,
  Check,
  X,
  ExternalLink,
  Bot,
  Zap,
} from 'lucide-react';
import {
  AssistantMessage,
  AssistantConversation,
  ActionSuggestion,
  AssistantStatusInfo,
  SUGGESTED_PROMPTS,
  AssistantAPI,
} from '../../lib/assistant';

interface AssistantMasterViewProps {
  currentLocale: 'ar' | 'en';
  userRole?: string;
  userPermissions?: string[];
}

export const AssistantMasterView: React.FC<AssistantMasterViewProps> = ({
  currentLocale,
  userRole = 'ADMIN',
  userPermissions = ['*'],
}) => {
  const isAr = currentLocale === 'ar';

  // State
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [inputQuery, setInputQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusInfo, setStatusInfo] = useState<AssistantStatusInfo | null>(null);
  const [searchHistoryTerm, setSearchHistoryTerm] = useState<string>('');
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [actionProcessing, setActionProcessing] = useState<Record<string, boolean>>({});
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Load Status & Initial Conversations
  useEffect(() => {
    loadStatus();
    loadConversations();
  }, []);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeConversationId, isLoading]);

  const loadStatus = async () => {
    try {
      const status = await AssistantAPI.getStatus();
      setStatusInfo(status);
    } catch (e) {
      console.error('Failed to load assistant status', e);
    }
  };

  const loadConversations = async () => {
    try {
      const list = await AssistantAPI.getConversations();
      setConversations(list);
      if (list.length > 0 && !activeConversationId) {
        setActiveConversationId(list[0].id);
      }
    } catch (e) {
      console.error('Failed to load conversations', e);
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  const handleCreateNewChat = async () => {
    try {
      const newConv = await AssistantAPI.createConversation({
        titleAr: 'محادثة مالية جديدة',
        titleEn: 'New Financial Inquiry',
      });
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      setErrorBanner(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err: any) {
      setErrorBanner(err?.message || 'Failed to create conversation');
    }
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(isAr ? 'هل أنت متأكد من حذف هذه المحادثة بالكامل؟' : 'Delete this conversation completely?')) {
      return;
    }
    try {
      await AssistantAPI.deleteConversation(convId);
      const remaining = conversations.filter((c) => c.id !== convId);
      setConversations(remaining);
      if (activeConversationId === convId) {
        setActiveConversationId(remaining.length > 0 ? remaining[0].id : '');
      }
    } catch (err: any) {
      setErrorBanner(err?.message || 'Failed to delete conversation');
    }
  };

  const handleClearAllHistory = async () => {
    if (!window.confirm(isAr ? 'هل أنت متأكد من مسح جميع المحادثات وسجل الاستفسارات؟' : 'Clear all conversation history?')) {
      return;
    }
    try {
      await AssistantAPI.clearAllConversations();
      setConversations([]);
      setActiveConversationId('');
    } catch (err: any) {
      setErrorBanner(err?.message || 'Failed to clear conversations');
    }
  };

  const handleSendMessage = async (queryText?: string) => {
    const textToSend = (queryText || inputQuery).trim();
    if (!textToSend || isLoading) return;

    setInputQuery('');
    setIsLoading(true);
    setErrorBanner(null);

    let targetConvId = activeConversationId;
    if (!targetConvId) {
      try {
        const newConv = await AssistantAPI.createConversation({
          titleAr: textToSend.slice(0, 30),
          titleEn: textToSend.slice(0, 30),
        });
        targetConvId = newConv.id;
        setActiveConversationId(newConv.id);
        setConversations((prev) => [newConv, ...prev]);
      } catch (err: any) {
        setErrorBanner(err?.message || 'Failed to initialize conversation');
        setIsLoading(false);
        return;
      }
    }

    try {
      const res = await AssistantAPI.sendMessage(targetConvId, textToSend);
      setConversations((prev) =>
        prev.map((c) => (c.id === targetConvId ? res.conversation : c))
      );
    } catch (err: any) {
      setErrorBanner(err?.message || 'Failed to process inquiry');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveAction = async (actionId: string) => {
    setActionProcessing((prev) => ({ ...prev, [actionId]: true }));
    try {
      const updatedAction = await AssistantAPI.approveAction(actionId);
      // Update local action state inside current conversation
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          messages: c.messages.map((m) => ({
            ...m,
            actionSuggestions: m.actionSuggestions.map((a) => (a.id === actionId ? updatedAction : a)),
          })),
        }))
      );
    } catch (err: any) {
      alert(err?.message || 'Failed to execute action.');
    } finally {
      setActionProcessing((prev) => ({ ...prev, [actionId]: false }));
    }
  };

  const handleRejectAction = async (actionId: string) => {
    setActionProcessing((prev) => ({ ...prev, [actionId]: true }));
    try {
      const updatedAction = await AssistantAPI.rejectAction(actionId);
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          messages: c.messages.map((m) => ({
            ...m,
            actionSuggestions: m.actionSuggestions.map((a) => (a.id === actionId ? updatedAction : a)),
          })),
        }))
      );
    } catch (err: any) {
      alert(err?.message || 'Failed to reject action.');
    } finally {
      setActionProcessing((prev) => ({ ...prev, [actionId]: false }));
    }
  };

  const toggleSourceExpand = (msgId: string) => {
    setExpandedSources((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchHistoryTerm) return true;
    const title = isAr ? c.titleAr : c.titleEn;
    return title.toLowerCase().includes(searchHistoryTerm.toLowerCase());
  });

  return (
    <div className="flex h-[calc(100vh-4.5rem)] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* SIDEBAR: Conversation History */}
      <aside className="w-80 border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col flex-shrink-0">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-600/10 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm">{isAr ? 'المساعد المالي الذكي' : 'Financial AI Assistant'}</h2>
              <p className="text-xs text-slate-500">{isAr ? 'مستند لدفاتر الأستاذ' : 'Ledger Grounded'}</p>
            </div>
          </div>
          <button
            onClick={handleCreateNewChat}
            className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1 transition shadow-sm"
            title={isAr ? 'محادثة جديدة' : 'New Chat'}
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'جديد' : 'New'}</span>
          </button>
        </div>

        {/* History Search */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800">
          <div className="relative">
            <Search className="w-4 h-4 absolute start-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={isAr ? 'بحث في المحادثات السابقة...' : 'Search chat history...'}
              value={searchHistoryTerm}
              onChange={(e) => setSearchHistoryTerm(e.target.value)}
              className="w-full ps-9 pe-3 py-1.5 text-xs rounded-md bg-slate-100 dark:bg-slate-800 border-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredConversations.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              {isAr ? 'لا توجد محادثات سابقة' : 'No previous conversations'}
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              const title = isAr ? conv.titleAr : conv.titleEn;
              return (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  className={`group flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition text-xs ${
                    isActive
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200 font-semibold border border-indigo-200 dark:border-indigo-800'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <MessageSquare className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className="truncate">{title || (isAr ? 'استفسار مالي' : 'Financial Inquiry')}</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition rounded"
                    title={isAr ? 'حذف المحادثة' : 'Delete Chat'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer */}
        {conversations.length > 0 && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500">
            <span>{conversations.length} {isAr ? 'محادثات' : 'chats'}</span>
            <button
              onClick={handleClearAllHistory}
              className="text-red-500 hover:text-red-600 hover:underline flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isAr ? 'مسح السجل' : 'Clear All'}</span>
            </button>
          </div>
        )}
      </aside>

      {/* MAIN CHAT AREA */}
      <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
        {/* Top Status Bar */}
        <header className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {activeConversation
                  ? (isAr ? activeConversation.titleAr : activeConversation.titleEn)
                  : (isAr ? 'مساعد التقرير والقرارات المالية' : 'Financial Reporting & Decision Copilot')}
              </h1>
              <p className="text-[11px] text-slate-500">
                {isAr
                  ? 'استعلامات مباشرة من الأستاذ العام بدون تزييف بيانات'
                  : 'Zero-hallucination real-time ledger grounding'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {/* Grounding Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isAr ? 'أستاذ عام موثوق' : 'Verified Ledger'}</span>
            </div>

            {/* Provider Status */}
            {statusInfo?.isConfigured ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 font-medium">
                <Zap className="w-3.5 h-3.5" />
                <span>Gemini 2.5 Flash</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-medium">
                <Database className="w-3.5 h-3.5" />
                <span>{isAr ? 'محرك الحسابات الحتمي' : 'Deterministic Engine'}</span>
              </div>
            )}
          </div>
        </header>

        {/* Error Banner */}
        {errorBanner && (
          <div className="px-6 py-2.5 bg-red-50 dark:bg-red-950/50 border-b border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{errorBanner}</span>
            </div>
            <button onClick={() => setErrorBanner(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Chat Messages Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!activeConversation || activeConversation.messages.length === 0 ? (
            /* Welcome / Zero State with Suggested Prompts */
            <div className="max-w-3xl mx-auto py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold mb-2">
                {isAr ? 'كيف يمكنني مساعدتك مالياً اليوم؟' : 'How can I assist your financial operations today?'}
              </h3>
              <p className="text-sm text-slate-500 max-w-lg mx-auto mb-8">
                {isAr
                  ? 'اطرح أي استفسار حول المبيعات، أعمار الديون، النواقص في المخزون، أو الموقف الضريبي وسيقوم المساعد بحساب الأرقام مباشرة من سجلاتك.'
                  : 'Ask any inquiry regarding sales, overdue receivables, stock levels, or VAT position. Answers are directly computed from your real transactional ledger.'}
              </p>

              {/* Quick Prompt Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-start">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt.id}
                    onClick={() => handleSendMessage(isAr ? prompt.textAr : prompt.textEn)}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-700 transition text-start flex flex-col justify-between group shadow-sm"
                  >
                    <div className="flex items-center gap-2 mb-2 text-indigo-600 dark:text-indigo-400">
                      {prompt.category === 'SALES_SUMMARY' && <TrendingUp className="w-4 h-4" />}
                      {prompt.category === 'AR_OVERDUE' && <AlertCircle className="w-4 h-4" />}
                      {prompt.category === 'INVENTORY_STOCK' && <PackageCheck className="w-4 h-4" />}
                      {prompt.category === 'VAT_POSITION' && <Percent className="w-4 h-4" />}
                      {prompt.category === 'DRAFT_DOCUMENTS' && <FileText className="w-4 h-4" />}
                      {prompt.category === 'FINANCIAL_BALANCES' && <Coins className="w-4 h-4" />}
                      <span className="text-xs font-semibold">{prompt.category}</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 group-hover:text-indigo-900 dark:group-hover:text-indigo-200 font-medium">
                      {isAr ? prompt.textAr : prompt.textEn}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Active Messages */
            <div className="max-w-4xl mx-auto space-y-6">
              {activeConversation.messages.map((msg) => (
                <div key={msg.id} className="space-y-4">
                  {/* User Query Bubble */}
                  <div className="flex justify-end">
                    <div className="max-w-2xl bg-indigo-600 text-white rounded-2xl rounded-se-sm px-4 py-3 shadow-sm text-sm">
                      <p className="whitespace-pre-wrap">{msg.queryText}</p>
                      <span className="block text-[10px] text-indigo-200 mt-1 text-end">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* Assistant Answer Bubble & Rich Cards */}
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-4 h-4" />
                    </div>

                    <div className="flex-1 space-y-3">
                      {/* Formatted Answer Text */}
                      <div className="bg-slate-100 dark:bg-slate-800/80 rounded-2xl rounded-ss-sm p-4 text-sm text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700/60 shadow-sm leading-relaxed">
                        <div className="whitespace-pre-wrap font-normal">
                          {isAr ? msg.answerTextAr : msg.answerTextEn}
                        </div>

                        {/* Metric Highlights Grid */}
                        {msg.structuredData && msg.structuredData.summaryMetrics.length > 0 && (
                          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                            {msg.structuredData.summaryMetrics.map((metric, idx) => (
                              <div
                                key={idx}
                                className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800"
                              >
                                <span className="text-[11px] text-slate-500 block truncate">
                                  {isAr ? metric.labelAr : metric.labelEn}
                                </span>
                                <span className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 block">
                                  {metric.value} {metric.unit || (isAr ? 'ر.س' : 'SAR')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Data Preview Table */}
                        {msg.structuredData && msg.structuredData.tableRows && msg.structuredData.tableRows.length > 0 && (
                          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                            <table className="w-full text-xs text-start">
                              <thead className="bg-slate-200/60 dark:bg-slate-900 text-slate-700 dark:text-slate-300">
                                <tr>
                                  {msg.structuredData.tableHeaders?.map((h) => (
                                    <th key={h.key} className="px-3 py-2 text-start font-semibold">
                                      {isAr ? h.labelAr : h.labelEn}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                                {msg.structuredData.tableRows.map((row, rIdx) => (
                                  <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    {msg.structuredData?.tableHeaders?.map((h) => (
                                      <td key={h.key} className={`px-3 py-2 ${h.isNumeric ? 'font-mono' : ''}`}>
                                        {String(row[h.key] ?? '-')}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* DATA SOURCE CITATION BADGE (Collapsible) */}
                      {msg.dataSources.length > 0 && (
                        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs">
                          <button
                            onClick={() => toggleSourceExpand(msg.id)}
                            className="w-full flex items-center justify-between text-slate-600 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-slate-200"
                          >
                            <div className="flex items-center gap-1.5">
                              <Database className="w-3.5 h-3.5 text-indigo-500" />
                              <span>{isAr ? 'مصادر البيانات والتقارير المعتمدة' : 'Verified Data Sources & Checksums'}</span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px]">
                                {msg.dataSources.length}
                              </span>
                            </div>
                            {expandedSources[msg.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          {expandedSources[msg.id] && (
                            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                              {msg.dataSources.map((src, sIdx) => (
                                <div key={sIdx} className="flex flex-wrap items-center justify-between text-[11px] gap-2 p-1.5 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                                  <div>
                                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                                      {isAr ? src.reportNameAr : src.reportNameEn}
                                    </span>
                                    <span className="text-slate-400 ms-2 font-mono">({src.tableName})</span>
                                  </div>
                                  <div className="text-slate-500 flex items-center gap-3">
                                    <span>الفترة: {src.period}</span>
                                    <span>السجلات: {src.recordCount}</span>
                                    {src.exactDisplayAmount && (
                                      <span className="font-mono text-emerald-600 font-bold">{src.exactDisplayAmount}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ACTION SUGGESTIONS CARDS (Read-Only by Default, Executed only on explicit user click) */}
                      {msg.actionSuggestions && msg.actionSuggestions.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-amber-500" />
                            <span>{isAr ? 'إجراءات مقترحة تتطلب الاعتماد' : 'Proposed Actions (Approval Required)'}</span>
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {msg.actionSuggestions.map((action) => {
                              const isPending = action.status === 'PENDING';
                              const isExecuted = action.status === 'EXECUTED';
                              const isRejected = action.status === 'REJECTED';
                              const isBusy = actionProcessing[action.id];

                              return (
                                <div
                                  key={action.id}
                                  className={`p-3.5 rounded-xl border text-xs flex flex-col justify-between transition ${
                                    isExecuted
                                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                                      : isRejected
                                      ? 'bg-slate-100/50 dark:bg-slate-800/30 border-slate-300 dark:border-slate-700 opacity-60'
                                      : 'bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-800 shadow-sm'
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="font-bold text-slate-800 dark:text-slate-100">
                                        {isAr ? action.titleAr : action.titleEn}
                                      </span>
                                      {isExecuted && (
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 text-[10px] font-semibold flex items-center gap-1">
                                          <CheckCircle2 className="w-3 h-3" />
                                          <span>{isAr ? 'تم التنفيذ' : 'Executed'}</span>
                                        </span>
                                      )}
                                      {isRejected && (
                                        <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-semibold flex items-center gap-1">
                                          <XCircle className="w-3 h-3" />
                                          <span>{isAr ? 'مرفوض' : 'Rejected'}</span>
                                        </span>
                                      )}
                                      {isPending && (
                                        <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-semibold">
                                          {isAr ? 'بانتظار الموافقة' : 'Pending'}
                                        </span>
                                      )}
                                    </div>

                                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
                                      {isAr ? action.descriptionAr : action.descriptionEn}
                                    </p>

                                    {isExecuted && action.executionResult && (
                                      <div className="mb-2 p-2 bg-emerald-100/60 dark:bg-emerald-900/40 rounded text-[11px] text-emerald-900 dark:text-emerald-200">
                                        {action.executionResult.message}
                                        {action.executionResult.journalEntryNumber && (
                                          <div className="font-mono mt-0.5 font-bold">
                                            قيد محاسبي رقم: {action.executionResult.journalEntryNumber}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {isPending && (
                                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                      <button
                                        disabled={isBusy}
                                        onClick={() => handleApproveAction(action.id)}
                                        className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                                      >
                                        {isBusy ? (
                                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Check className="w-3.5 h-3.5" />
                                        )}
                                        <span>{isAr ? 'اعتماد وتنفيذ' : 'Approve & Post'}</span>
                                      </button>
                                      <button
                                        disabled={isBusy}
                                        onClick={() => handleRejectAction(action.id)}
                                        className="py-1.5 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-1 transition disabled:opacity-50"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                        <span>{isAr ? 'تجاهل' : 'Dismiss'}</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Loading Indicator */}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-indigo-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-ss-sm p-4 flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>
                      {isAr
                        ? 'جارٍ تشغيل الاستعلام وفحص دفاتر الأستاذ والمطابقة المالية...'
                        : 'Querying General Ledger tables & running financial verification...'}
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Query Input Bar */}
        <footer className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="max-w-4xl mx-auto flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder={
                  isAr
                    ? 'اكتب سؤالك المالي هنا (مثال: ما هي مبيعات هذا الشهر؟ من هم العملاء المتأخرين؟)'
                    : 'Ask your financial inquiry (e.g. What are this month sales? Who has overdue invoices?)'
                }
                disabled={isLoading}
                className="w-full px-4 py-3 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm flex items-center gap-2 transition disabled:opacity-40 shadow-sm"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">{isAr ? 'إرسال' : 'Send'}</span>
            </button>
          </form>
          <div className="max-w-4xl mx-auto mt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {isAr
                ? '💡 يتم استخراج الإجابات من القيود المحاسبية وقواعد البيانات الفعلية للمنشأة.'
                : '💡 Answers are computed directly from real-time transactional GL tables.'}
            </span>
            <span className="hidden sm:inline">Shortcut: <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded font-mono">Ctrl + K</kbd></span>
          </div>
        </footer>
      </main>
    </div>
  );
};
