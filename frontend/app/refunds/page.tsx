import { Gap, LegalPage } from '@/components/legal/LegalPage'

export default function RefundsPage() {
  return (
    <LegalPage title="Refunds" updated={<Gap>date</Gap>}>
      <h2>Cancelling</h2>
      <p>A subscription can be cancelled at any time from Settings, through the Stripe customer portal. It then stops renewing, and access lasts until the end of the period already paid.</p>
      <h2>Right of withdrawal</h2>
      <p><Gap>withdrawal: the 14 day right of withdrawal for digital content, and how it applies once access has started with the subscriber&apos;s express consent</Gap></p>
      <h2>Refunds</h2>
      <p><Gap>refund policy: when a payment is refunded, in full or in part, and how to ask</Gap></p>
      <p>A refunded subscription loses its access.</p>
      <h2>Contact</h2>
      <p><Gap>email</Gap></p>
    </LegalPage>
  )
}
