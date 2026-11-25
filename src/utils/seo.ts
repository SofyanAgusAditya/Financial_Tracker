/**
 * SEO & Head Metadata Dynamic Service for Financial Tracker
 * Supports both client-side tab navigation and server-side pre-rendering
 */

export interface TabSeoConfig {
  title: string;
  description: string;
  keywords: string;
  canonicalPath: string;
  breadcrumbName: string;
}

export const TAB_SEO_REGISTRY: Record<string, TabSeoConfig> = {
  dashboard: {
    title: 'Dashboard Overview — Financial Tracker',
    description: 'Monitor net cash flow, income, expenses, and budget health with Financial Tracker.',
    keywords: 'financial dashboard, net cash flow, income expenses, budget tracking, financial tracker',
    canonicalPath: '/?tab=dashboard',
    breadcrumbName: 'Dashboard',
  },
  transactions: {
    title: 'Financial Ledger & Transactions — Financial Tracker',
    description: 'Audit and record income and expense transactions with detailed notes, tags, and multi-currency search.',
    keywords: 'transaction ledger, expense tracking, income audit, financial history, multi-currency',
    canonicalPath: '/?tab=transactions',
    breadcrumbName: 'Ledger',
  },
  budgets: {
    title: 'Monthly Budgets & Envelopes — Financial Tracker',
    description: 'Set category spending limits with automated 80%, 90%, and 100% threshold warning alerts and envelope tracking.',
    keywords: 'budget planner, spending caps, budget alerts, envelope budgeting, finance goals',
    canonicalPath: '/?tab=budgets',
    breadcrumbName: 'Budgets',
  },
  reports: {
    title: 'Reports & Cash Flow Analytics — Financial Tracker',
    description: 'Generate cash flow statements, category spending breakdowns, printable audit summaries, and instant CSV exports.',
    keywords: 'financial reports, export csv, cash flow statement, spend analytics, print report',
    canonicalPath: '/?tab=reports',
    breadcrumbName: 'Reports',
  },
  recurring: {
    title: 'Scheduled & Recurring Payments — Financial Tracker',
    description: 'Automate routine payroll, monthly subscriptions, rent, and utility bills with scheduled background cron execution.',
    keywords: 'recurring transactions, subscription tracker, scheduled billing, routine expenses',
    canonicalPath: '/?tab=recurring',
    breadcrumbName: 'Recurring',
  },
};

import { updateHeadMetadata } from './headManager.ts';
export { updateHeadMetadata };

/**
 * Updates head metadata in the DOM dynamically
 */
export function updateDocumentMetadata(tabId: string, customMeta?: Partial<TabSeoConfig>): void {
  if (typeof document === 'undefined') return;

  const baseConfig = TAB_SEO_REGISTRY[tabId] || TAB_SEO_REGISTRY.dashboard;
  const config = { ...baseConfig, ...customMeta };

  // Call the dedicated headManager utility to programmatically update title, meta description, and social tags
  updateHeadMetadata(config.title, config.description);

  // Helper to set or create meta tag
  const setMeta = (nameOrProperty: string, value: string, isProperty = false) => {
    const attribute = isProperty ? 'property' : 'name';
    let el = document.querySelector(`meta[${attribute}="${nameOrProperty}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attribute, nameOrProperty);
      document.head.appendChild(el);
    }
    el.setAttribute('content', value);
  };

  // Helper to set or create link tag
  const setLink = (rel: string, href: string) => {
    let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', rel);
      document.head.appendChild(el);
    }
    el.setAttribute('href', href);
  };

  // 2. Standard Meta Tags
  setMeta('description', config.description);
  setMeta('keywords', config.keywords);

  // 3. OpenGraph Tags
  setMeta('og:title', config.title, true);
  setMeta('og:description', config.description, true);

  const origin = window.location.origin || '';
  const fullUrl = `${origin}${config.canonicalPath}`;
  setMeta('og:url', fullUrl, true);

  // 4. Twitter Cards
  setMeta('twitter:title', config.title);
  setMeta('twitter:description', config.description);

  // 5. Canonical Link
  setLink('canonical', fullUrl);

  // 6. Dynamic BreadcrumbList JSON-LD Schema
  let breadcrumbScript = document.getElementById('tab-breadcrumb-schema');
  if (!breadcrumbScript) {
    breadcrumbScript = document.createElement('script');
    breadcrumbScript.id = 'tab-breadcrumb-schema';
    breadcrumbScript.setAttribute('type', 'application/ld+json');
    document.head.appendChild(breadcrumbScript);
  }

  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Financial Tracker',
        item: origin || 'https://financialtracker.app',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: config.breadcrumbName,
        item: fullUrl,
      },
    ],
  };

  breadcrumbScript.textContent = JSON.stringify(breadcrumbData);
}

/**
 * Custom React Hook to keep document head metadata synchronized with the active tab
 */
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export function useTabSeo(activeTab: string): void {
  useEffect(() => {
    updateDocumentMetadata(activeTab);

    // Synchronize URL query parameter without triggering full page reload (non-native browsers only)
    if (
      !Capacitor.isNativePlatform() &&
      typeof window !== 'undefined' &&
      window.history &&
      window.history.replaceState
    ) {
      const url = new URL(window.location.href);
      if (url.searchParams.get('tab') !== activeTab) {
        url.searchParams.set('tab', activeTab);
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [activeTab]);
}
