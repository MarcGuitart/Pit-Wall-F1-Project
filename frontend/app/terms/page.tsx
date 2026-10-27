import { Gap, LegalPage } from '@/components/legal/LegalPage'

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated={<Gap>date</Gap>}>
      <h2>Who provides the service</h2>
      <p>Pit Wall Engineer is provided by <Gap>holder: name or company</Gap>, <Gap>NIF</Gap>, <Gap>postal address</Gap>, contact <Gap>email</Gap>.</p>
      <h2>What the service is</h2>
      <p>An unofficial, independent analysis of Formula 1 timing data from OpenF1 and FastF1. It is not associated with the Formula 1 companies. It measures what happened in a session; nothing in it predicts a result.</p>
      <h2>PRO</h2>
      <p>The 2023 and 2024 seasons are free. PRO (the 2025 season onwards and live mode) is a monthly subscription of 2.99 EUR, <Gap>VAT: included or added, and at which rate</Gap>, paid through Stripe, or an access code issued by the owner.</p>
      <p>Access is kept in this browser as a token; there is no account. A subscription renews every month until it is cancelled from Settings (the Stripe customer portal); access then lasts until the end of the paid period.</p>
      <h2>Right of withdrawal</h2>
      <p><Gap>withdrawal: the 14 day right of withdrawal, and the express consent and acknowledgement, given at checkout, that access starts at once and that the right is then lost for digital content</Gap></p>
      <h2>Availability</h2>
      <p><Gap>availability: what is promised about uptime, data delays and changes to the service</Gap></p>
      <h2>Liability</h2>
      <p><Gap>liability</Gap></p>
      <h2>Applicable law</h2>
      <p><Gap>applicable law and courts</Gap></p>
    </LegalPage>
  )
}
