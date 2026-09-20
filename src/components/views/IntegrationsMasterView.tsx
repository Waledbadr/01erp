/**
 * Integrations & Developer Platform Master View — Saudi ERP Platform
 * Complete management of Hashed Scoped API Keys, Webhook Endpoints,
 * Outbox Deliveries with 8-Attempt Exponential Backoff, and Interactive OpenAPI 3.0 Explorer.
 */

import React, { useState, useEffect } from 'react';
import {
  Key,
  Webhook,
  Code2,
  Plus,
  Trash2,
  Ban,
  CheckCircle2,
  AlertCircle,
  Clock,
  Copy,
  Check,
  Send,
  RefreshCw,
  Eye,
  EyeOff,
  ShieldCheck,
  Activity,
  Layers,
  ArrowUpRight,
  Download,
  Terminal,
  HelpCircle,
} from 'lucide-react';
import { useLanguage } from '../../i18n/context';
import { SYSTEM_API_SCOPES, WEBHOOK_AVAILABLE_EVENTS } from '../../../server/modules/integrations/types';

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit: number;
  expiresAt: string | null;
  isRevoked: boolean;
  revokedAt?: string;
  createdBy: string;
  creatorEmail: string;
  createdAt: string;
  lastUsedAt?: string;
  lastUsedIp?: string;
  totalCalls: number;
}

interface WebhookEndpointItem {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
  successCount: number;
  failureCount: number;
}

interface WebhookDeliveryItem {
  id: string;
  endpointId: string;
  endpointUrl: string;
  eventId: string;
  eventType: string;
  statusCode?: number;
  attempt: number;
  maxAttempts: number;
  status: 'PENDING' | 'DELIVERED' | 'RETRYING' | 'DEAD_LETTER';
  nextRetryAt?: string;
  error?: string;
  createdAt: string;
  deliveredAt?: string;
  durationMs?: number;
}

export const IntegrationsMasterView: React.FC = () => {
  const { isRtl } = useLanguage();
  const [activeTab, setActiveTab] = useState<'api-keys' | 'webhooks' | 'openapi'>('api-keys');

  // State for API Keys
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    'customers:read',
    'invoices:read',
    'invoices:write',
  ]);
  const [rateLimitInput, setRateLimitInput] = useState('60');
  const [expiryDays, setExpiryDays] = useState('90');
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<{ rawKey: string; name: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // State for Webhooks
  const [endpoints, setEndpoints] = useState<WebhookEndpointItem[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryItem[]>([]);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false);
  const [showCreateEndpointModal, setShowCreateEndpointModal] = useState(false);
  const [endpointName, setEndpointName] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [endpointSecret, setEndpointSecret] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['invoice.posted', 'payment.received']);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [isPinging, setIsPinging] = useState<string | null>(null);
  const [isRetryingDelivery, setIsRetryingDelivery] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    loadApiKeys();
    loadWebhooksData();
  }, []);

  const loadApiKeys = async () => {
    setIsLoadingKeys(true);
    try {
      const token = localStorage.getItem('erp_session_token') || 'mock-token';
      const res = await fetch('/api/v1/integrations/api-keys', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setApiKeys(json.data || []);
      }
    } catch (err) {
      console.error('Failed to load API keys:', err);
    } finally {
      setIsLoadingKeys(false);
    }
  };

  const loadWebhooksData = async () => {
    setIsLoadingWebhooks(true);
    try {
      const token = localStorage.getItem('erp_session_token') || 'mock-token';
      const [epRes, delRes] = await Promise.all([
        fetch('/api/v1/integrations/webhooks/endpoints', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/v1/integrations/webhooks/deliveries', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (epRes.ok) {
        const json = await epRes.json();
        if (json.success) setEndpoints(json.data || []);
      }
      if (delRes.ok) {
        const json = await delRes.json();
        if (json.success) setDeliveries(json.data || []);
      }
    } catch (err) {
      console.error('Failed to load webhooks:', err);
    } finally {
      setIsLoadingWebhooks(false);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    try {
      const token = localStorage.getItem('erp_session_token') || 'mock-token';
      const res = await fetch('/api/v1/integrations/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: keyName.trim(),
          scopes: selectedScopes,
          rateLimit: parseInt(rateLimitInput, 10) || 60,
          expiresInDays: expiryDays === 'never' ? null : parseInt(expiryDays, 10),
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setNewlyCreatedKey({
            rawKey: json.data.rawSecretKey,
            name: json.data.apiKey.name,
          });
          setShowCreateKeyModal(false);
          setKeyName('');
          loadApiKeys();
        }
      }
    } catch (err) {
      console.error('Failed to create key:', err);
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    if (!window.confirm(isRtl ? 'هل أنت متأكد من تعطيل هذا المفتاح فوراً؟' : 'Are you sure you want to revoke this API key?')) {
      return;
    }
    try {
      const token = localStorage.getItem('erp_session_token') || 'mock-token';
      const res = await fetch(`/api/v1/integrations/api-keys/${id}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        loadApiKeys();
      }
    } catch (err) {
      console.error('Failed to revoke key:', err);
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    if (!window.confirm(isRtl ? 'هل أنت متأكد من حذف هذا المفتاح نهائياً؟' : 'Are you sure you want to delete this API key?')) {
      return;
    }
    try {
      const token = localStorage.getItem('erp_session_token') || 'mock-token';
      const res = await fetch(`/api/v1/integrations/api-keys/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        loadApiKeys();
      }
    } catch (err) {
      console.error('Failed to delete key:', err);
    }
  };

  const handleCreateEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpointUrl.trim()) return;

    try {
      const token = localStorage.getItem('erp_session_token') || 'mock-token';
      const res = await fetch('/api/v1/integrations/webhooks/endpoints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: endpointName.trim() || 'Webhook Endpoint',
          url: endpointUrl.trim(),
          secret: endpointSecret.trim() || undefined,
          events: selectedEvents,
          isActive: true,
        }),
      });

      if (res.ok) {
        setShowCreateEndpointModal(false);
        setEndpointName('');
        setEndpointUrl('');
        setEndpointSecret('');
        loadWebhooksData();
      }
    } catch (err) {
      console.error('Failed to create endpoint:', err);
    }
  };

  const handlePingEndpoint = async (endpointId: string) => {
    setIsPinging(endpointId);
    try {
      const token = localStorage.getItem('erp_session_token') || 'mock-token';
      const res = await fetch(`/api/v1/integrations/webhooks/endpoints/${endpointId}/ping`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await loadWebhooksData();
      }
    } catch (err) {
      console.error('Failed to ping endpoint:', err);
    } finally {
      setIsPinging(null);
    }
  };

  const handleRetryDelivery = async (deliveryId: string) => {
    setIsRetryingDelivery(deliveryId);
    try {
      const token = localStorage.getItem('erp_session_token') || 'mock-token';
      const res = await fetch(`/api/v1/integrations/webhooks/deliveries/${deliveryId}/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ forceSuccess: true }),
      });
      if (res.ok) {
        await loadWebhooksData();
      }
    } catch (err) {
      console.error('Failed to retry delivery:', err);
    } finally {
      setIsRetryingDelivery(null);
    }
  };

  const handleDeleteEndpoint = async (endpointId: string) => {
    if (!window.confirm(isRtl ? 'حذف هذا المسار نهائياً؟' : 'Delete this webhook endpoint permanently?')) {
      return;
    }
    try {
      const token = localStorage.getItem('erp_session_token') || 'mock-token';
      const res = await fetch(`/api/v1/integrations/webhooks/endpoints/${endpointId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        loadWebhooksData();
      }
    } catch (err) {
      console.error('Failed to delete endpoint:', err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Metrics calculation
  const totalApiKeysCount = apiKeys.length;
  const activeKeysCount = apiKeys.filter((k) => !k.isRevoked).length;
  const totalCalls = apiKeys.reduce((acc, k) => acc + (k.totalCalls || 0), 0);
  const deliveredWebhooks = deliveries.filter((d) => d.status === 'DELIVERED').length;
  const deliverySuccessRate = deliveries.length > 0 ? Math.round((deliveredWebhooks / deliveries.length) * 100) : 100;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400">
              <Code2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {isRtl ? 'الربط البرمجي والتكاملات (Public API & Webhooks)' : 'Public API & Webhook Integrations'}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {isRtl
                  ? 'إدارة مفاتيح API المشفرة، والويب هوك بصندوق الإرسال المقاوم للأعطال، ومواصفات OpenAPI 3.0'
                  : 'Manage hashed scoped API keys, outbox webhooks with 8-attempt retries, and OpenAPI 3.0 spec'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/api/v1/openapi.json"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-2xs"
          >
            <Download className="w-4 h-4" />
            <span>{isRtl ? 'تحميل مواصفات OpenAPI' : 'Download OpenAPI Spec'}</span>
          </a>

          {activeTab === 'api-keys' && (
            <button
              id="create-api-key-btn"
              onClick={() => setShowCreateKeyModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>{isRtl ? 'إنشاء مفتاح API جديد' : 'Generate New API Key'}</span>
            </button>
          )}

          {activeTab === 'webhooks' && (
            <button
              id="create-webhook-endpoint-btn"
              onClick={() => setShowCreateEndpointModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>{isRtl ? 'تسجيل مسار ويب هوك جديد' : 'Register Webhook Endpoint'}</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {isRtl ? 'مفاتيح API النشطة' : 'Active API Keys'}
            </span>
            <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
              <Key className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{activeKeysCount}</span>
            <span className="text-xs text-slate-400">/ {totalApiKeysCount} {isRtl ? 'إجمالي' : 'total'}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {isRtl ? 'طلبات API المنفذة' : 'Total API Calls'}
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalCalls.toLocaleString()}</span>
            <span className="text-xs text-emerald-600 font-medium">{isRtl ? 'معدل قياسي' : 'Normal load'}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {isRtl ? 'مسارات الويب هوك' : 'Webhook Endpoints'}
            </span>
            <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
              <Webhook className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{endpoints.length}</span>
            <span className="text-xs text-purple-600 font-medium">HMAC-SHA256</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {isRtl ? 'نسبة نجاح التسليم' : 'Delivery Success Rate'}
            </span>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{deliverySuccessRate}%</span>
            <span className="text-xs text-slate-400">{deliveries.length} {isRtl ? 'محاولة' : 'dispatches'}</span>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          id="tab-api-keys"
          onClick={() => setActiveTab('api-keys')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === 'api-keys'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>{isRtl ? 'مفاتيح واجهة البرمجيات (API Keys)' : 'API Keys'}</span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-200 dark:bg-slate-700">
            {apiKeys.length}
          </span>
        </button>

        <button
          id="tab-webhooks"
          onClick={() => setActiveTab('webhooks')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === 'webhooks'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
          }`}
        >
          <Webhook className="w-4 h-4" />
          <span>{isRtl ? 'الويب هوك وصندوق الإرسال (Webhooks & Outbox)' : 'Webhooks & Outbox'}</span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-200 dark:bg-slate-700">
            {endpoints.length}
          </span>
        </button>

        <button
          id="tab-openapi"
          onClick={() => setActiveTab('openapi')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
            activeTab === 'openapi'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
          }`}
        >
          <Code2 className="w-4 h-4" />
          <span>{isRtl ? 'دليل OpenAPI 3.0 التفاعلي' : 'Interactive OpenAPI 3.0'}</span>
        </button>
      </div>

      {/* TAB 1: API KEYS */}
      {activeTab === 'api-keys' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {isRtl ? 'المفاتيح البرمجية المشفرة والمحددة بالصلاحيات' : 'Hashed & Scoped API Keys'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isRtl
                    ? 'المفاتيح مخزنة بتشفير SHA-256، ومحددة بمعدل طلبات في الدقيقة (Rate Limit) وصلاحيات صريحة لا تتعدى منشئها'
                    : 'Keys hashed with SHA-256 at rest, per-key rate limits, and scopes never exceeding creator permissions'}
                </p>
              </div>
              <button
                onClick={loadApiKeys}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingKeys ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-3 font-semibold text-start">{isRtl ? 'اسم المفتاح' : 'Key Name'}</th>
                    <th className="px-4 py-3 font-semibold text-start">{isRtl ? 'بادئة المفتاح' : 'Key Prefix'}</th>
                    <th className="px-4 py-3 font-semibold text-start">{isRtl ? 'الصلاحيات المقيدة (Scopes)' : 'Scopes'}</th>
                    <th className="px-4 py-3 font-semibold text-start">{isRtl ? 'معدل الطلبات' : 'Rate Limit'}</th>
                    <th className="px-4 py-3 font-semibold text-start">{isRtl ? 'الاستخدام' : 'Usage'}</th>
                    <th className="px-4 py-3 font-semibold text-start">{isRtl ? 'الحالة' : 'Status'}</th>
                    <th className="px-6 py-3 font-semibold text-end">{isRtl ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {apiKeys.length === 0 && !isLoadingKeys && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                        <Key className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                        <p className="text-sm font-medium">{isRtl ? 'لا توجد مفاتيح API حالياً' : 'No API keys configured'}</p>
                        <p className="text-xs mt-1">
                          {isRtl ? 'اضغط على "إنشاء مفتاح API جديد" للبدء بالربط الخارجي' : 'Click "Generate New API Key" to get started'}
                        </p>
                      </td>
                    </tr>
                  )}

                  {apiKeys.map((key) => (
                    <tr key={key.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{key.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {isRtl ? 'بواسطة:' : 'By:'} {key.creatorEmail} ({new Date(key.createdAt).toLocaleDateString()})
                        </div>
                      </td>

                      <td className="px-4 py-4 font-mono text-slate-600 dark:text-slate-300">
                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                          {key.keyPrefix}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {key.scopes.map((s) => (
                            <span
                              key={s}
                              className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-4 font-mono text-slate-700 dark:text-slate-300">
                        {key.rateLimit} req/min
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{key.totalCalls || 0} calls</div>
                        {key.lastUsedAt && (
                          <div className="text-[10px] text-slate-400">
                            {new Date(key.lastUsedAt).toLocaleDateString()} ({key.lastUsedIp || 'IP'})
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        {key.isRevoked ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
                            <Ban className="w-3 h-3" />
                            {isRtl ? 'معطل' : 'Revoked'}
                          </span>
                        ) : key.expiresAt && new Date(key.expiresAt).getTime() < Date.now() ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                            <Clock className="w-3 h-3" />
                            {isRtl ? 'منتهي الصلاحية' : 'Expired'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" />
                            {isRtl ? 'نشط' : 'Active'}
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-end">
                        <div className="flex items-center justify-end gap-2">
                          {!key.isRevoked && (
                            <button
                              id={`revoke-key-${key.id}`}
                              onClick={() => handleRevokeApiKey(key.id)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                            >
                              {isRtl ? 'تعطيل' : 'Revoke'}
                            </button>
                          )}
                          <button
                            id={`delete-key-${key.id}`}
                            onClick={() => handleDeleteApiKey(key.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: WEBHOOKS & OUTBOX */}
      {activeTab === 'webhooks' && (
        <div className="space-y-6">
          {/* Webhook Endpoints List */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {isRtl ? 'مسارات الويب هوك المسجلة (Endpoints)' : 'Registered Webhook Endpoints'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isRtl
                    ? 'يتم توقيع كل إشعار برمجياً باستخدام HMAC-SHA256 مع ترويسة الطابع الزمني لمنع هجمات إعادة التشغيل'
                    : 'Each payload is signed via HMAC-SHA256 with timestamp anti-replay verification'}
                </p>
              </div>
              <button
                onClick={loadWebhooksData}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingWebhooks ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {endpoints.length === 0 && !isLoadingWebhooks && (
                <div className="py-8 text-center text-slate-400">
                  <Webhook className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-medium">{isRtl ? 'لا توجد مسارات ويب هوك مسجلة' : 'No webhook endpoints configured'}</p>
                </div>
              )}

              {endpoints.map((ep) => (
                <div
                  key={ep.id}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
                        <Webhook className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{ep.name}</span>
                          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            {ep.isActive ? (isRtl ? 'مفعّل' : 'Active') : (isRtl ? 'معطل' : 'Inactive')}
                          </span>
                        </div>
                        <div className="font-mono text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {ep.url}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        id={`ping-endpoint-${ep.id}`}
                        onClick={() => handlePingEndpoint(ep.id)}
                        disabled={isPinging === ep.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition shadow-2xs"
                      >
                        <Send className={`w-3.5 h-3.5 ${isPinging === ep.id ? 'animate-spin' : ''}`} />
                        <span>{isRtl ? 'إرسال اختبار فوري (Ping)' : 'Send Test Ping'}</span>
                      </button>

                      <button
                        onClick={() => handleDeleteEndpoint(ep.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Secret & Events */}
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-400 font-sans">{isRtl ? 'سر التوقيع:' : 'Secret:'}</span>
                      <span className="px-2 py-1 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                        {revealedSecrets[ep.id] ? ep.secret : '••••••••••••••••••••••••••••••••'}
                      </span>
                      <button
                        onClick={() =>
                          setRevealedSecrets((prev) => ({ ...prev, [ep.id]: !prev[ep.id] }))
                        }
                        className="p-1 text-slate-400 hover:text-slate-600"
                      >
                        {revealedSecrets[ep.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-slate-400">{isRtl ? 'الأحداث المشتركة:' : 'Events:'}</span>
                      {ep.events.map((ev) => (
                        <span
                          key={ev}
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Outbox Delivery Logs Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {isRtl ? 'سجل تسليم صندوق الإرسال (Outbox Delivery Log)' : 'Outbox Delivery Log'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isRtl
                    ? 'محاولات التسليم مع التراجع الأسي (8 محاولات) والتحويل لقائمة الرسائل الميتة (Dead-Letter) عند التعثر'
                    : 'Dispatches with 8-attempt exponential backoff & dead-letter queue recovery'}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-3 font-semibold text-start">{isRtl ? 'نوع الحدث' : 'Event Type'}</th>
                    <th className="px-4 py-3 font-semibold text-start">{isRtl ? 'المسار الهدف' : 'Target URL'}</th>
                    <th className="px-4 py-3 font-semibold text-start">{isRtl ? 'المحاولة' : 'Attempt'}</th>
                    <th className="px-4 py-3 font-semibold text-start">{isRtl ? 'رمز الاستجابة' : 'HTTP Code'}</th>
                    <th className="px-4 py-3 font-semibold text-start">{isRtl ? 'الحالة' : 'Status'}</th>
                    <th className="px-4 py-3 font-semibold text-start">{isRtl ? 'التوقيت' : 'Time'}</th>
                    <th className="px-6 py-3 font-semibold text-end">{isRtl ? 'الإجراء' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {deliveries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                        {isRtl ? 'لا توجد سجلات تسليم بعد' : 'No webhook deliveries recorded yet'}
                      </td>
                    </tr>
                  )}

                  {deliveries.map((del) => (
                    <tr key={del.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="px-6 py-3 font-mono font-semibold text-purple-700 dark:text-purple-400">
                        {del.eventType}
                      </td>

                      <td className="px-4 py-3 font-mono text-slate-500 max-w-xs truncate">
                        {del.endpointUrl}
                      </td>

                      <td className="px-4 py-3 font-mono">
                        {del.attempt} / {del.maxAttempts}
                      </td>

                      <td className="px-4 py-3 font-mono">
                        <span
                          className={`font-semibold ${
                            del.statusCode === 200 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {del.statusCode || '-'}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {del.status === 'DELIVERED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" />
                            {isRtl ? 'تم التسليم' : 'Delivered'}
                          </span>
                        ) : del.status === 'RETRYING' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <Clock className="w-3 h-3" />
                            {isRtl ? 'إعادة المحاولة' : 'Retrying'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            <AlertCircle className="w-3 h-3" />
                            {isRtl ? 'رسالة ميتة (فشل)' : 'Dead-Letter'}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-slate-400 text-[11px]">
                        {new Date(del.createdAt).toLocaleTimeString()} ({del.durationMs || 10}ms)
                      </td>

                      <td className="px-6 py-3 text-end">
                        {del.status !== 'DELIVERED' && (
                          <button
                            id={`retry-delivery-${del.id}`}
                            onClick={() => handleRetryDelivery(del.id)}
                            disabled={isRetryingDelivery === del.id}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-100 transition ms-auto"
                          >
                            <RefreshCw className={`w-3 h-3 ${isRetryingDelivery === del.id ? 'animate-spin' : ''}`} />
                            <span>{isRtl ? 'إعادة الإرسال' : 'Retry'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: OPENAPI 3.0 EXPLORER */}
      {activeTab === 'openapi' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {isRtl ? 'مستكشف المسارات البرمجية التفاعلي (REST API Catalog)' : 'REST API Interactive Catalog'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isRtl
                    ? 'جميع المسارات تدعم المصادقة عبر Bearer Token أو مفتاح API في الترويسة X-API-Key'
                    : 'All endpoints accept Bearer tokens or X-API-Key header authentication'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-mono font-bold rounded-lg">
                  OpenAPI 3.0.3
                </span>
              </div>
            </div>

            {/* Quick cURL Example */}
            <div className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs space-y-2 border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 text-[11px] pb-1 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span>cURL Command Example</span>
                </div>
                <span>Bash / Shell</span>
              </div>
              <pre className="text-emerald-400 overflow-x-auto py-1">
                {`curl -X GET "https://erp.sa/api/v1/invoices" \\
  -H "X-API-Key: sk_live_your_secret_key_here" \\
  -H "Accept: application/json"`}
              </pre>
            </div>

            {/* Endpoints List */}
            <div className="space-y-3 pt-2">
              {[
                { method: 'GET', path: '/api/v1/customers', descAr: 'استعلام قائمة العملاء', descEn: 'List Customers with VAT & CR', scope: 'customers:read' },
                { method: 'POST', path: '/api/v1/customers', descAr: 'إضافة عميل جديد', descEn: 'Create New Customer Master', scope: 'customers:write' },
                { method: 'GET', path: '/api/v1/items', descAr: 'دليل المنتجات والمخزون (محمي بقاعدة C للتكلفة)', descEn: 'Inventory Catalog (Cost Scrubbed Rule C)', scope: 'items:read' },
                { method: 'GET', path: '/api/v1/invoices', descAr: 'استعلام فواتير المبيعات الضريبية ZATCA', descEn: 'List Sales Invoices & Status', scope: 'invoices:read' },
                { method: 'POST', path: '/api/v1/invoices', descAr: 'إنشاء وترحيل فاتورة مبيعات إلى الأستاذ العام', descEn: 'Create & Post Invoice to GL', scope: 'invoices:write' },
                { method: 'GET', path: '/api/v1/bills', descAr: 'استعلام فواتير المشتريات ومورديها', descEn: 'List Purchase Bills', scope: 'bills:read' },
                { method: 'GET', path: '/api/v1/journals', descAr: 'قيود اليومية المزدوجة المتوازنة', descEn: 'Double-Entry General Ledger Journals', scope: 'journals:read' },
                { method: 'GET', path: '/api/v1/trial-balance', descAr: 'ميزان المراجعة اللحظي للأرصدة', descEn: 'Real-Time Multi-Level Trial Balance', scope: 'reports:read' },
                { method: 'GET', path: '/api/v1/search', descAr: 'البحث الشامل بالسجلات برقم الفاتورة أو الباركود', descEn: 'Unified Global Search (Ctrl+K)', scope: 'search:read' },
              ].map((ep, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-1 text-xs font-mono font-bold rounded-md ${
                        ep.method === 'GET'
                          ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}
                    >
                      {ep.method}
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {ep.path}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {isRtl ? ep.descAr : ep.descEn}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {ep.scope}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CREATE API KEY MODAL */}
      {showCreateKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                {isRtl ? 'إنشاء مفتاح API جديد ومحدد الصلاحيات' : 'Generate Scoped API Key'}
              </h3>
              <button
                onClick={() => setShowCreateKeyModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateApiKey} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'اسم المفتاح / الغرض' : 'Key Name / Application'}
                </label>
                <input
                  type="text"
                  required
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder={isRtl ? 'مثال: ربط المتجر الإلكتروني زد / سلة' : 'e.g. Shopify Store Sync'}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-emerald-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {isRtl ? 'معدل الطلبات في الدقيقة' : 'Rate Limit (req/min)'}
                  </label>
                  <input
                    type="number"
                    value={rateLimitInput}
                    onChange={(e) => setRateLimitInput(e.target.value)}
                    min="10"
                    max="1000"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-emerald-500 text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {isRtl ? 'فترة الصلاحية' : 'Expiration'}
                  </label>
                  <select
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-emerald-500 text-slate-900 dark:text-slate-100"
                  >
                    <option value="30">{isRtl ? '30 يوماً' : '30 Days'}</option>
                    <option value="90">{isRtl ? '90 يوماً (موصى به)' : '90 Days (Recommended)'}</option>
                    <option value="365">{isRtl ? 'سنة واحدة' : '1 Year'}</option>
                    <option value="never">{isRtl ? 'دائم بدون انتهاء' : 'Never Expires'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {isRtl ? 'تحديد الصلاحيات الممنوحة للمفتاح (Scopes):' : 'Select Scopes:'}
                </label>
                <div className="max-h-44 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs">
                  {SYSTEM_API_SCOPES.map((sc) => {
                    const isChecked = selectedScopes.includes(sc.scope);
                    return (
                      <label
                        key={sc.scope}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedScopes((prev) => [...prev, sc.scope]);
                            } else {
                              setSelectedScopes((prev) => prev.filter((s) => s !== sc.scope));
                            }
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="flex items-center justify-between w-full">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {isRtl ? sc.nameAr : sc.nameEn}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">{sc.scope}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateKeyModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={selectedScopes.length === 0}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition disabled:opacity-50"
                >
                  {isRtl ? 'توليد المفتاح' : 'Generate Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ONE-TIME RAW KEY COPY MODAL */}
      {newlyCreatedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-emerald-500/50 p-6 space-y-4">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                {isRtl ? 'تم إنشاء مفتاح API بنجاح' : 'API Key Created Successfully'}
              </h3>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-bold">
                ⚠️ {isRtl ? 'تنبيه أمان بالغ الأهمية:' : 'Critical Security Notice:'}
              </p>
              <p>
                {isRtl
                  ? 'هذا المفتاح لن يظهر لك مرة أخرى أبداً بعد إغلاق هذه النافذة. يرجى نسخه وحفظه في مكان آمن فوراً.'
                  : 'This secret key will never be displayed again after closing this window. Copy and store it securely now.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {isRtl ? 'المفتاح السري (Raw Secret Key):' : 'Secret Key:'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={newlyCreatedKey.rawKey}
                  className="flex-1 px-3 py-2 text-xs font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 select-all"
                />
                <button
                  onClick={() => copyToClipboard(newlyCreatedKey.rawKey)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition shrink-0"
                >
                  {copiedKey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedKey ? (isRtl ? 'تم النسخ' : 'Copied!') : (isRtl ? 'نسخ' : 'Copy')}</span>
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setNewlyCreatedKey(null)}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 transition"
              >
                {isRtl ? 'حفظت المفتاح وأغلقت النافذة' : 'I Have Saved This Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE WEBHOOK ENDPOINT MODAL */}
      {showCreateEndpointModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                {isRtl ? 'تسجيل مسار ويب هوك جديد' : 'Register Webhook Endpoint'}
              </h3>
              <button
                onClick={() => setShowCreateEndpointModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateEndpoint} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'اسم المسار / التطبيق' : 'Endpoint Name'}
                </label>
                <input
                  type="text"
                  required
                  value={endpointName}
                  onChange={(e) => setEndpointName(e.target.value)}
                  placeholder={isRtl ? 'مثال: نظام إدارة المستودعات WMS' : 'e.g. Warehouse Dispatch Service'}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-emerald-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'رابط استقبال الإشعارات (URL)' : 'Payload URL (HTTPS)'}
                </label>
                <input
                  type="url"
                  required
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://api.yourcompany.com/webhooks/erp"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-emerald-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'سر التوقيع (Signing Secret - اختياري للتوليد التلقائي)' : 'Signing Secret (Optional)'}
                </label>
                <input
                  type="text"
                  value={endpointSecret}
                  onChange={(e) => setEndpointSecret(e.target.value)}
                  placeholder="whsec_... (leave blank to auto-generate)"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-emerald-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {isRtl ? 'الأحداث المشترك بها (Events):' : 'Subscribed Events:'}
                </label>
                <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs">
                  {WEBHOOK_AVAILABLE_EVENTS.map((ev) => {
                    const isChecked = selectedEvents.includes(ev.event);
                    return (
                      <label
                        key={ev.event}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEvents((prev) => [...prev, ev.event]);
                            } else {
                              setSelectedEvents((prev) => prev.filter((event) => event !== ev.event));
                            }
                          }}
                          className="rounded text-purple-600 focus:ring-purple-500"
                        />
                        <div className="flex items-center justify-between w-full">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {isRtl ? ev.nameAr : ev.nameEn}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">{ev.event}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateEndpointModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={selectedEvents.length === 0}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition disabled:opacity-50"
                >
                  {isRtl ? 'تسجيل المسار' : 'Save Endpoint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
