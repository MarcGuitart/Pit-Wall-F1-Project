'use client'

import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import { PAYMENTS_ENABLED } from '@/lib/paymentsFlag'

/**
 * The billing buttons for shared pages, loaded on demand and only with
 * payments on. With the flag off (a build-time constant) these are plain
 * nulls and the bundler drops the imports: no Stripe code on "/", /races,
 * /settings or any PRO wall.
 */
const Nothing = () => null

export const LazySubscribeButton: ComponentType<{ id?: string; large?: boolean }> = PAYMENTS_ENABLED
  ? dynamic(() => import('./SubscribeButton').then((m) => m.SubscribeButton))
  : Nothing

export const LazyManageSubscription: ComponentType<{ className?: string }> = PAYMENTS_ENABLED
  ? dynamic(() => import('./ManageSubscription').then((m) => m.ManageSubscription), { ssr: false })
  : Nothing
