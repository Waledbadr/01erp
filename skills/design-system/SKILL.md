---
name: design-system
description: Design system guidelines, UI component catalog specifications, RTL logical CSS rules, mobile-first breakpoints, locale formatting, empty/loading/error states, and formal document styling.
---

# Design System & UI Specifications Skill (`skills/design-system/SKILL.md`)

## 1. Core Visual Philosophy
- **Identity**: Enterprise-grade Saudi Cloud ERP, Accounting, Inventory & ZATCA Platform.
- **Palette**: Deep Forest Emerald (`#064e3b` / `#047857`), Slate Navy (`#0f172a` / `#1e293b`), Muted Sand Gold (`#d97706` / `#b45309`), High-contrast text (`#09090b` on `#f8fafc`).
- **Zero AI Slop**: No rainbow gradients, no arbitrary purple-blue glowing glassmorphism, no fake hero statistics cards, no stacked identical 3-column feature grids.
- **Contrast**: Strict WCAG AA compliance ($\ge 4.5:1$ body text, $\ge 3:1$ interactive elements).

---

## 2. RTL First & Logical CSS Properties
Saudi enterprise users operate primarily in Arabic (`ar-SA`, RTL), with English (`en-US`, LTR) available via instant toggle.

### Strict Coding Rule:
Never use physical CSS properties (`left`, `right`, `pl-`, `pr-`, `ml-`, `mr-`, `border-l-`, `border-r-`).
Always use **Logical CSS Properties**:
- `start` instead of `left`: `ms-4`, `ps-4`, `text-start`, `inset-inline-start-0`, `border-s`
- `end` instead of `right`: `me-4`, `pe-4`, `text-end`, `inset-inline-end-0`, `border-e`

---

## 3. Responsive Breakpoints & Mobile Adaptation Strategy
- Mobile (`< 640px`): Touch targets $\ge 44\text{px}$. Bottom navigation bar displayed. Tables automatically switch to clean, stacked card layouts (`TableCards` mode) so users never encounter broken horizontal scrolling.
- Tablet (`640px - 1024px`): Responsive adaptive grids (2-column).
- Desktop (`> 1024px`): Full multi-column data tables with fixed headers, sticky action bars, collapsible hierarchical sidebar.

---

## 4. UI Component Catalog Specification

1. **Button**:
   - Variants: `primary` (emerald filled), `secondary` (slate subtle), `outline`, `danger` (ruby red), `ghost`.
   - States: Normal, Hover, Active, Disabled, Loading (with spinning indicator and aria-busy).
   - Touch sizing: Minimum $44\times 44\text{px}$ on mobile.
2. **Input & Select**:
   - High contrast borders (`border-slate-300` / `focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100`).
   - Start/End icon support, clear error helper text (`aria-invalid="true"`).
3. **DatePicker**:
   - Bilingual Gregorian calendar selection with Arabic month labels and formatting.
4. **Modal & Drawer**:
   - Centered modal for focused dialogs; side drawer for filters, detail inspection, and line-item creation.
   - Accessible: Backdrop blur, Escape key dismissal, trap focus, ARIA role="dialog".
5. **Toast Notifications**:
   - Queue system with auto-dismiss (4000ms). Types: `success`, `error`, `warning`, `info`.
6. **Table (with Cards-on-Mobile)**:
   - Desktop: Semantic `<table>` with sortable headers, striped rows, formatted numeric columns.
   - Mobile: Transforms rows into discrete, readable cards with key-value pairs and full touch actions.
7. **Tabs**:
   - Accessible horizontal tab list with active underline and ARIA role="tablist".
8. **Badge**:
   - Status indicators: `DRAFT` (slate), `POSTED` (emerald), `REVERSED` (red), `CLEARED` (blue), `PENDING` (amber).
9. **EmptyState & LoadingSkeleton**:
   - Descriptive empty states with actionable primary button.
   - Pulse skeletons matching table rows and cards for fluid perceived loading.
10. **ConfirmDialog**:
    - Two-step confirmation for destructive financial actions (e.g. reversing a journal, closing a period).
11. **PageHeader**:
    - Breadcrumbs, document title, subtitle, and primary/secondary action buttons.
12. **FilterBar**:
    - Search input, date range, branch filter, and clear all filters button.

---

## 5. Number, Date & Currency Formatting
- **Currency**: `SAR` (Arabic: `ر.س` / English: `SAR`).
- Format strictly with two decimal places: `1,250.00 ر.س` / `SAR 1,250.00`.
- Dates: ISO format in data, locale-sensitive display (e.g. `17 سبتمبر 2026` / `17 Sep 2026`).
