/**
 * Public REST API & Integrations Router — Saudi ERP Platform
 * Implements endpoints for OpenAPI JSON, Global Search, API Keys, Webhooks & Outbox,
 * and standard REST aliases for Customers, Suppliers, Items, Invoices, Bills, Payments, Journals, and Trial Balance.
 */

import { Router, Request, Response } from 'express';
import { OPENAPI_SPEC } from './openapiSpec.js';
import {
  createApiKeyService,
  listApiKeysService,
  revokeApiKeyService,
  deleteApiKeyService,
} from './apiKeyService.js';
import {
  createWebhookEndpointService,
  listWebhookEndpointsService,
  getWebhookEndpointByIdService,
  updateWebhookEndpointService,
  deleteWebhookEndpointService,
  pingEndpointService,
  listDeliveriesService,
  getDeliveryByIdService,
  retryDeliveryService,
  getTenantOutbox,
  processPendingDeliveriesService,
} from './webhookService.js';
import { globalSearchService } from './searchService.js';
import { requireAuth } from '../../core/authMiddleware.js';
import { centralStore, ALL_SYSTEM_PERMISSIONS } from '../../core/tenantGuard.js';
import { fromHalalasToDisplay } from '../../../src/lib/accounting.js';
import { postSalesInvoiceService } from '../sales/salesService.js';
import { postPurchaseBillService } from '../purchasing/purchasingService.js';

export const integrationsRouter = Router();

// ==========================================
// 1. OPENAPI SPECIFICATION (No Auth required for spec)
// ==========================================
integrationsRouter.get('/openapi.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(OPENAPI_SPEC);
});

// ==========================================
// 2. UNIFIED GLOBAL SEARCH (Ctrl+K)
// ==========================================
integrationsRouter.get('/search', requireAuth, (req: Request, res: Response) => {
  try {
    const tenantContext = req.tenantContext!;
    const query = String(req.query.q || req.query.query || '');
    const category = req.query.category as any;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;

    const results = globalSearchService(tenantContext.tenantId, query, tenantContext, {
      category,
      limit,
    });

    res.json({
      success: true,
      data: results,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SEARCH_ERROR', message: err.message },
    });
  }
});

// ==========================================
// 3. API KEY MANAGEMENT ENDPOINTS
// ==========================================
integrationsRouter.get('/integrations/api-keys', requireAuth, (req: Request, res: Response) => {
  try {
    const keys = listApiKeysService(req.tenantContext!.tenantId);
    res.json({ success: true, data: keys });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'API_KEYS_ERROR', message: err.message } });
  }
});

integrationsRouter.post('/integrations/api-keys', requireAuth, (req: Request, res: Response) => {
  try {
    const result = createApiKeyService(req.tenantContext!, req.body);
    res.status(201).json({
      success: true,
      data: result,
      message: 'API Key generated successfully. Save the raw secret key now; it cannot be shown again.',
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'API_KEY_CREATE_ERROR', message: err.message } });
  }
});

integrationsRouter.post('/integrations/api-keys/:id/revoke', requireAuth, (req: Request, res: Response) => {
  try {
    const key = revokeApiKeyService(
      req.tenantContext!.tenantId,
      req.params.id,
      req.tenantContext!.userId,
      req.tenantContext!.userEmail
    );
    res.json({ success: true, data: key, message: 'API Key revoked' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'REVOKE_ERROR', message: err.message } });
  }
});

integrationsRouter.delete('/integrations/api-keys/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const deleted = deleteApiKeyService(req.tenantContext!.tenantId, req.params.id);
    res.json({ success: true, deleted });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'DELETE_KEY_ERROR', message: err.message } });
  }
});

// ==========================================
// 4. WEBHOOK ENDPOINTS & OUTBOX
// ==========================================
integrationsRouter.get('/integrations/webhooks/endpoints', requireAuth, (req: Request, res: Response) => {
  try {
    const endpoints = listWebhookEndpointsService(req.tenantContext!.tenantId);
    res.json({ success: true, data: endpoints });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'WEBHOOK_ERROR', message: err.message } });
  }
});

integrationsRouter.post('/integrations/webhooks/endpoints', requireAuth, (req: Request, res: Response) => {
  try {
    const endpoint = createWebhookEndpointService(req.tenantContext!.tenantId, req.body);
    res.status(201).json({ success: true, data: endpoint });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'CREATE_ENDPOINT_ERROR', message: err.message } });
  }
});

integrationsRouter.put('/integrations/webhooks/endpoints/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const endpoint = updateWebhookEndpointService(req.tenantContext!.tenantId, req.params.id, req.body);
    res.json({ success: true, data: endpoint });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'UPDATE_ENDPOINT_ERROR', message: err.message } });
  }
});

integrationsRouter.delete('/integrations/webhooks/endpoints/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const deleted = deleteWebhookEndpointService(req.tenantContext!.tenantId, req.params.id);
    res.json({ success: true, deleted });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'DELETE_ENDPOINT_ERROR', message: err.message } });
  }
});

integrationsRouter.post('/integrations/webhooks/endpoints/:id/ping', requireAuth, (req: Request, res: Response) => {
  try {
    const delivery = pingEndpointService(req.tenantContext!.tenantId, req.params.id);
    res.json({ success: true, data: delivery, message: 'Ping event delivered' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'PING_ERROR', message: err.message } });
  }
});

integrationsRouter.get('/integrations/webhooks/deliveries', requireAuth, (req: Request, res: Response) => {
  try {
    const deliveries = listDeliveriesService(req.tenantContext!.tenantId, {
      status: req.query.status as string,
      endpointId: req.query.endpointId as string,
      eventType: req.query.eventType as string,
    });
    res.json({ success: true, data: deliveries });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DELIVERIES_ERROR', message: err.message } });
  }
});

integrationsRouter.post('/integrations/webhooks/deliveries/:id/retry', requireAuth, (req: Request, res: Response) => {
  try {
    const forceSuccess = req.body.forceSuccess === true;
    const delivery = retryDeliveryService(req.tenantContext!.tenantId, req.params.id, forceSuccess);
    res.json({ success: true, data: delivery, message: 'Webhook retry executed' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'RETRY_ERROR', message: err.message } });
  }
});

integrationsRouter.get('/integrations/webhooks/outbox', requireAuth, (req: Request, res: Response) => {
  try {
    const outbox = getTenantOutbox(req.tenantContext!.tenantId);
    res.json({ success: true, data: outbox });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'OUTBOX_ERROR', message: err.message } });
  }
});

integrationsRouter.post('/integrations/webhooks/outbox/process', requireAuth, (req: Request, res: Response) => {
  try {
    const processed = processPendingDeliveriesService(req.tenantContext!.tenantId);
    res.json({ success: true, processedCount: processed });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'PROCESS_OUTBOX_ERROR', message: err.message } });
  }
});

// ==========================================
// 5. PUBLIC REST RESOURCE ENDPOINTS (/api/v1/...)
// ==========================================

// --- CUSTOMERS ---
integrationsRouter.get('/customers', requireAuth, (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const list = centralStore.customers.get(tenantId) || [];
    const search = String(req.query.search || '').toLowerCase();
    let customers = list;
    if (search) {
      customers = customers.filter(
        (c) =>
          c.nameAr.toLowerCase().includes(search) ||
          (c.nameEn && c.nameEn.toLowerCase().includes(search)) ||
          (c.vatNumber && c.vatNumber.includes(search))
      );
    }
    res.json({ success: true, data: customers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

integrationsRouter.get('/customers/:id', requireAuth, (req: Request, res: Response) => {
  const tenantId = req.tenantContext!.tenantId;
  const list = centralStore.customers.get(tenantId) || [];
  const customer = list.find((p) => p.id === req.params.id);
  if (!customer) {
    return res.status(404).json({ success: false, error: { message: 'Customer not found' } });
  }
  res.json({ success: true, data: customer });
});

integrationsRouter.post('/customers', requireAuth, (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const list = centralStore.customers.get(tenantId) || [];
    const newCustomer = {
      id: `cust_${Date.now()}`,
      tenantId,
      ...req.body,
      type: 'CUSTOMER',
      isActive: true,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    list.push(newCustomer);
    centralStore.customers.set(tenantId, list);
    res.status(201).json({ success: true, data: newCustomer });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// --- SUPPLIERS ---
integrationsRouter.get('/suppliers', requireAuth, (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const list = centralStore.suppliers.get(tenantId) || [];
    const search = String(req.query.search || '').toLowerCase();
    let suppliers = list;
    if (search) {
      suppliers = suppliers.filter(
        (s) =>
          s.nameAr.toLowerCase().includes(search) ||
          (s.nameEn && s.nameEn.toLowerCase().includes(search)) ||
          (s.vatNumber && s.vatNumber.includes(search))
      );
    }
    res.json({ success: true, data: suppliers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

integrationsRouter.get('/suppliers/:id', requireAuth, (req: Request, res: Response) => {
  const tenantId = req.tenantContext!.tenantId;
  const list = centralStore.suppliers.get(tenantId) || [];
  const supplier = list.find((p) => p.id === req.params.id);
  if (!supplier) {
    return res.status(404).json({ success: false, error: { message: 'Supplier not found' } });
  }
  res.json({ success: true, data: supplier });
});

integrationsRouter.post('/suppliers', requireAuth, (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const list = centralStore.suppliers.get(tenantId) || [];
    const newSupplier = {
      id: `supp_${Date.now()}`,
      tenantId,
      ...req.body,
      type: 'SUPPLIER',
      isActive: true,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    list.push(newSupplier);
    centralStore.suppliers.set(tenantId, list);
    res.status(201).json({ success: true, data: newSupplier });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// --- ITEMS & INVENTORY (With Rule C Cost Scrubbing) ---
integrationsRouter.get('/items', requireAuth, (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const list = centralStore.items.get(tenantId) || [];
    const canSeeCost =
      req.tenantContext!.role === 'OWNER' ||
      req.tenantContext!.role === 'SUPER_ADMIN' ||
      req.tenantContext!.permissions.includes('*') ||
      req.tenantContext!.permissions.includes('accounting:cost:view') ||
      req.tenantContext!.permissions.includes('accounting:financials:view');

    const scrubbed = list.map((item) => {
      const copy = JSON.parse(JSON.stringify(item));
      if (!canSeeCost) {
        delete copy.currentWac;
        delete copy.costPriceSar;
        if (copy.uomList) {
          copy.uomList = copy.uomList.map((u: any) => {
            delete u.costPriceSar;
            return u;
          });
        }
      }
      return copy;
    });

    res.json({ success: true, data: scrubbed });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

integrationsRouter.get('/items/:id', requireAuth, (req: Request, res: Response) => {
  const tenantId = req.tenantContext!.tenantId;
  const list = centralStore.items.get(tenantId) || [];
  const item = list.find((i) => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ success: false, error: { message: 'Item not found' } });
  }
  const canSeeCost =
    req.tenantContext!.role === 'OWNER' ||
    req.tenantContext!.role === 'SUPER_ADMIN' ||
    req.tenantContext!.permissions.includes('*') ||
    req.tenantContext!.permissions.includes('accounting:cost:view');

  const copy = JSON.parse(JSON.stringify(item));
  if (!canSeeCost) {
    delete copy.currentWac;
    delete copy.costPriceSar;
    if (copy.uomList) {
      copy.uomList = copy.uomList.map((u: any) => {
        delete u.costPriceSar;
        return u;
      });
    }
  }
  res.json({ success: true, data: copy });
});

// --- INVOICES ---
integrationsRouter.get('/invoices', requireAuth, (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const list = centralStore.salesInvoices.get(tenantId) || [];
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

integrationsRouter.get('/invoices/:id', requireAuth, (req: Request, res: Response) => {
  const tenantId = req.tenantContext!.tenantId;
  const list = centralStore.salesInvoices.get(tenantId) || [];
  const inv = list.find((i) => i.id === req.params.id);
  if (!inv) {
    return res.status(404).json({ success: false, error: { message: 'Invoice not found' } });
  }
  res.json({ success: true, data: inv });
});

integrationsRouter.post('/invoices/:id/post', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const context = req.tenantContext || {
      tenantId,
      userId: 'api-user',
      userEmail: 'api@tenant.sa',
      role: 'ADMIN',
      permissions: [...ALL_SYSTEM_PERMISSIONS],
    };
    const invoice = await postSalesInvoiceService(centralStore, context, req.params.id);
    res.json({ success: true, data: invoice, message: 'Invoice posted to GL' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// --- BILLS ---
integrationsRouter.get('/bills', requireAuth, (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const list = centralStore.purchaseBills.get(tenantId) || [];
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

integrationsRouter.get('/bills/:id', requireAuth, (req: Request, res: Response) => {
  const tenantId = req.tenantContext!.tenantId;
  const list = centralStore.purchaseBills.get(tenantId) || [];
  const bill = list.find((b) => b.id === req.params.id);
  if (!bill) {
    return res.status(404).json({ success: false, error: { message: 'Purchase bill not found' } });
  }
  res.json({ success: true, data: bill });
});

// --- PAYMENTS & RECEIPTS ---
integrationsRouter.get('/payments', requireAuth, (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const receipts = centralStore.customerReceipts.get(tenantId) || [];
    const disbursements = centralStore.supplierPayments.get(tenantId) || [];
    res.json({
      success: true,
      data: {
        receipts,
        disbursements,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// --- JOURNALS ---
integrationsRouter.get('/journals', requireAuth, (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const list = centralStore.journals.get(tenantId) || [];
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

integrationsRouter.get('/journals/:id', requireAuth, (req: Request, res: Response) => {
  const tenantId = req.tenantContext!.tenantId;
  const list = centralStore.journals.get(tenantId) || [];
  const jnl = list.find((j) => j.id === req.params.id);
  if (!jnl) {
    return res.status(404).json({ success: false, error: { message: 'Journal entry not found' } });
  }
  res.json({ success: true, data: jnl });
});

// --- TRIAL BALANCE ---
integrationsRouter.get('/trial-balance', requireAuth, (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantContext!.tenantId;
    const accounts = centralStore.accounts.get(tenantId) || [];
    const journals = centralStore.journals.get(tenantId) || [];

    const balances = accounts.map((acc) => {
      let debitHalalas = 0n;
      let creditHalalas = 0n;
      for (const j of journals) {
        if (j.status !== 'POSTED') continue;
        for (const line of j.lines) {
          if (line.accountId === acc.id) {
            debitHalalas += line.debitCents || 0n;
            creditHalalas += line.creditCents || 0n;
          }
        }
      }
      return {
        accountId: acc.id,
        accountCode: acc.code,
        accountNameAr: acc.nameAr,
        accountNameEn: acc.nameEn,
        type: acc.type,
        debitSar: fromHalalasToDisplay(debitHalalas),
        creditSar: fromHalalasToDisplay(creditHalalas),
        balanceSar: fromHalalasToDisplay(debitHalalas - creditHalalas),
      };
    });

    res.json({ success: true, data: balances });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});
