/**
 * OpenAPI 3.0.3 Specification Generator — Saudi ERP Platform
 * Interactive and Machine-Readable API Documentation conforming to REST standards.
 */

export const OPENAPI_SPEC: any = {
  openapi: '3.0.3',
  info: {
    title: 'Saudi Enterprise ERP — Public REST API v1',
    version: '1.0.0',
    description: 'Production-Grade Saudi ERP, Accounting, Inventory, and ZATCA Phase 2 E-Invoicing Cloud API.',
    contact: {
      name: 'API Support Team',
      email: 'api-support@erp.sa',
      url: 'https://erp.sa/docs/api',
    },
  },
  servers: [{ url: '/api/v1', description: 'API Gateway' }],
  security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
  tags: [
    { name: 'Parties', description: 'Customers and Suppliers' },
    { name: 'Inventory', description: 'Items & Stock' },
    { name: 'Sales', description: 'Tax Invoices' },
    { name: 'Purchasing', description: 'Bills & POs' },
    { name: 'Treasury', description: 'Vouchers' },
    { name: 'Accounting', description: 'GL & Journals' },
    { name: 'Global Search', description: 'Unified search' },
    { name: 'Integrations', description: 'API Keys & Webhooks' },
  ],
  paths: {
    '/customers': {
      get: { tags: ['Parties'], summary: 'List Customers', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Parties'], summary: 'Create Customer', responses: { 201: { description: 'Created' } } },
    },
    '/customers/{id}': {
      get: { tags: ['Parties'], summary: 'Get Customer', responses: { 200: { description: 'OK' } } },
    },
    '/suppliers': {
      get: { tags: ['Parties'], summary: 'List Suppliers', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Parties'], summary: 'Create Supplier', responses: { 201: { description: 'Created' } } },
    },
    '/suppliers/{id}': {
      get: { tags: ['Parties'], summary: 'Get Supplier', responses: { 200: { description: 'OK' } } },
    },
    '/items': {
      get: { tags: ['Inventory'], summary: 'List Items', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Inventory'], summary: 'Create Item', responses: { 201: { description: 'Created' } } },
    },
    '/items/{id}': {
      get: { tags: ['Inventory'], summary: 'Get Item', responses: { 200: { description: 'OK' } } },
    },
    '/invoices': {
      get: { tags: ['Sales'], summary: 'List Invoices', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Sales'], summary: 'Create Invoice', responses: { 201: { description: 'Created' } } },
    },
    '/invoices/{id}': {
      get: { tags: ['Sales'], summary: 'Get Invoice', responses: { 200: { description: 'OK' } } },
    },
    '/invoices/{id}/post': {
      post: { tags: ['Sales'], summary: 'Post Invoice to GL', responses: { 200: { description: 'OK' } } },
    },
    '/bills': {
      get: { tags: ['Purchasing'], summary: 'List Bills', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Purchasing'], summary: 'Create Bill', responses: { 201: { description: 'Created' } } },
    },
    '/bills/{id}': {
      get: { tags: ['Purchasing'], summary: 'Get Bill', responses: { 200: { description: 'OK' } } },
    },
    '/bills/{id}/post': {
      post: { tags: ['Purchasing'], summary: 'Post Bill to GL', responses: { 200: { description: 'OK' } } },
    },
    '/payments': {
      get: { tags: ['Treasury'], summary: 'List Payments', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Treasury'], summary: 'Create Payment', responses: { 201: { description: 'Created' } } },
    },
    '/payments/{id}': {
      get: { tags: ['Treasury'], summary: 'Get Payment', responses: { 200: { description: 'OK' } } },
    },
    '/journals': {
      get: { tags: ['Accounting'], summary: 'List Journals', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Accounting'], summary: 'Create Journal', responses: { 201: { description: 'Created' } } },
    },
    '/journals/{id}': {
      get: { tags: ['Accounting'], summary: 'Get Journal', responses: { 200: { description: 'OK' } } },
    },
    '/trial-balance': {
      get: { tags: ['Accounting'], summary: 'Trial Balance', responses: { 200: { description: 'OK' } } },
    },
    '/search': {
      get: { tags: ['Global Search'], summary: 'Global Search', responses: { 200: { description: 'OK' } } },
    },
    '/integrations/api-keys': {
      get: { tags: ['Integrations'], summary: 'List API Keys', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Integrations'], summary: 'Create API Key', responses: { 201: { description: 'Created' } } },
    },
    '/integrations/api-keys/{id}/revoke': {
      post: { tags: ['Integrations'], summary: 'Revoke API Key', responses: { 200: { description: 'OK' } } },
    },
    '/integrations/webhooks/endpoints': {
      get: { tags: ['Integrations'], summary: 'List Webhooks', responses: { 200: { description: 'OK' } } },
      post: { tags: ['Integrations'], summary: 'Create Webhook', responses: { 201: { description: 'Created' } } },
    },
    '/integrations/webhooks/endpoints/{id}/ping': {
      post: { tags: ['Integrations'], summary: 'Ping Webhook', responses: { 200: { description: 'OK' } } },
    },
    '/integrations/webhooks/deliveries': {
      get: { tags: ['Integrations'], summary: 'Webhook Deliveries', responses: { 200: { description: 'OK' } } },
    },
    '/integrations/webhooks/deliveries/{id}/retry': {
      post: { tags: ['Integrations'], summary: 'Retry Webhook Delivery', responses: { 200: { description: 'OK' } } },
    },
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      BearerAuth: { type: 'http', scheme: 'bearer' },
    },
    schemas: {
      Party: { type: 'object', properties: { id: { type: 'string' } } },
      Item: { type: 'object', properties: { id: { type: 'string' } } },
      SalesInvoice: { type: 'object', properties: { id: { type: 'string' } } },
      GlobalSearchResponse: { type: 'object', properties: { query: { type: 'string' } } },
      ApiErrorResponse: { type: 'object', properties: { success: { type: 'boolean' } } },
    },
    responses: {
      Unauthorized: { description: 'Unauthorized' },
      Forbidden: { description: 'Forbidden' },
      NotFound: { description: 'NotFound' },
      BadRequest: { description: 'BadRequest' },
      RateLimited: { description: 'RateLimited' },
    },
  },
};
