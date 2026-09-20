/**
 * PHASE 21 / PHASE 20 — SAAS BILLING REST API ROUTES
 * Tenant Billing, Plans, Subscriptions, Invoices, Usage Metering & Payment Gateway.
 */

import { Router, Request, Response } from 'express';
import { BillingService } from './billingService.js';
import { PLANS_CATALOG, PlanCode, BillingCycle } from './types.js';
import { authenticateRequest } from '../../core/authMiddleware.js';

export const billingRouter = Router();

// 1. Get Plans Catalog (Public / Authenticated)
billingRouter.get('/plans', (req: Request, res: Response) => {
  res.json({
    success: true,
    plans: Object.values(PLANS_CATALOG),
  });
});

// 2. Gateway Status
billingRouter.get('/gateway-status', (req: Request, res: Response) => {
  const config = BillingService.getPaymentGatewayConfig();
  res.json({
    success: true,
    gateway: config,
  });
});

// 3. Payment Webhook (Idempotent, unauthenticated callback with signature verification)
billingRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    const { event, invoiceId, tenantId, transactionId, amountSar } = req.body;
    if (!transactionId) {
      return res.status(400).json({ error: 'transactionId is required' });
    }

    const result = await BillingService.handlePaymentWebhook({
      event: event || 'payment.succeeded',
      invoiceId,
      tenantId,
      transactionId,
      amountSar: Number(amountSar || 0),
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Webhook processing failed' });
  }
});

// All remaining routes require authentication and tenant context
billingRouter.use(authenticateRequest);

// 4. Get Current Tenant Subscription
billingRouter.get('/subscription', (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const sub = BillingService.getSubscription(tenantId);
    const plan = PLANS_CATALOG[sub.planCode];
    const usage = BillingService.calculateUsage(tenantId);

    res.json({
      success: true,
      subscription: sub,
      plan,
      usage,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to get subscription' });
  }
});

// 5. Change Plan / Upgrade / Downgrade
billingRouter.post('/subscription/change-plan', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const { planCode, billingCycle } = req.body as { planCode: PlanCode; billingCycle?: BillingCycle };
    if (!planCode || !PLANS_CATALOG[planCode]) {
      return res.status(400).json({ error: `Invalid planCode: ${planCode}` });
    }

    const updated = await BillingService.changePlan(tenantId, planCode, billingCycle || 'MONTHLY', req.user?.userId);
    res.json({
      success: true,
      messageAr: 'تم تحديث خطة الاشتراك بنجاح',
      messageEn: 'Subscription plan updated successfully',
      subscription: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to update plan' });
  }
});

// 6. Cancel Subscription
billingRouter.post('/subscription/cancel', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const { reason } = req.body;
    const sub = await BillingService.cancelSubscription(tenantId, reason || 'User requested cancellation', req.user?.email);

    res.json({
      success: true,
      messageAr: 'تم تسجيل طلب إلغاء التجديد التلقائي للاشتراك',
      messageEn: 'Subscription auto-renew cancellation requested',
      subscription: sub,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to cancel subscription' });
  }
});

// 7. Get Usage Metrics & Limits
billingRouter.get('/usage', (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const sub = BillingService.getSubscription(tenantId);
    const plan = PLANS_CATALOG[sub.planCode];
    const usage = BillingService.calculateUsage(tenantId);

    const limits = plan.limits;
    const usersPercent = limits.maxUsers > 0 ? Math.round((usage.usersCount / limits.maxUsers) * 100) : 0;
    const docsPercent = limits.maxMonthlyDocuments > 0 ? Math.round((usage.documentsCount / limits.maxMonthlyDocuments) * 100) : 0;
    const storagePercent = limits.maxStorageBytes > 0 ? Math.round((usage.storageBytes / limits.maxStorageBytes) * 100) : 0;
    const aiPercent = limits.maxMonthlyAiRequests > 0 ? Math.round((usage.aiRequestsCount / limits.maxMonthlyAiRequests) * 100) : 0;

    res.json({
      success: true,
      usage,
      limits,
      percentages: {
        users: usersPercent,
        documents: docsPercent,
        storage: storagePercent,
        aiRequests: aiPercent,
      },
      warnings: {
        users: usersPercent >= 80,
        documents: docsPercent >= 80,
        storage: storagePercent >= 80,
        aiRequests: aiPercent >= 80,
      },
      blocked: {
        users: usersPercent >= 100,
        documents: docsPercent >= 100,
        storage: storagePercent >= 100,
        aiRequests: aiPercent >= 100,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to calculate usage' });
  }
});

// 8. Get Subscription Invoices
billingRouter.get('/invoices', (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const invoices = BillingService.getSubscriptionInvoices(tenantId);
    res.json({
      success: true,
      invoices,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to list subscription invoices' });
  }
});

// 9. Generate Billing Cycle Invoice (Manual / Automatic)
billingRouter.post('/invoices/generate', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const { cycle } = req.body;
    const invoice = await BillingService.generateSubscriptionInvoice(tenantId, cycle || 'MONTHLY');

    res.json({
      success: true,
      messageAr: 'تم إصدار وترحيل فاتورة الاشتراك إلى دفتر الأستاذ العام',
      messageEn: 'Subscription invoice generated and posted to General Ledger',
      invoice,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to generate invoice' });
  }
});

// 10. Pay Invoice
billingRouter.post('/invoices/:id/pay', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const { id } = req.params;
    const { gateway, transactionId } = req.body;

    const paid = await BillingService.paySubscriptionInvoice(tenantId, id, {
      gateway: gateway || 'MOYASAR',
      transactionId: transactionId || `manual_pay_${Date.now()}`,
    });

    res.json({
      success: true,
      messageAr: 'تم سداد فاتورة الاشتراك وتأكيد تفعيل الحساب',
      messageEn: 'Subscription invoice settled and account active',
      invoice: paid,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to pay invoice' });
  }
});

// 11. Void Invoice (reverses linked GL entry)
billingRouter.post('/invoices/:id/void', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const voided = await BillingService.voidSubscriptionInvoice(tenantId, id, reason || 'Canceled by admin');

    res.json({
      success: true,
      messageAr: 'تم إلغاء فاتورة الاشتراك وعكس القيد المحاسبي في الأستاذ العام',
      messageEn: 'Subscription invoice voided and journal reversed',
      invoice: voided,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to void invoice' });
  }
});

// 12. Initiate Online Payment
billingRouter.post('/initiate-payment', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const { invoiceId, method } = req.body;
    if (!invoiceId) {
      return res.status(400).json({ error: 'invoiceId is required' });
    }

    const paymentResult = await BillingService.initiatePayment(tenantId, invoiceId, method || 'MADA');
    res.json({
      success: true,
      ...paymentResult,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Payment initiation failed' });
  }
});
