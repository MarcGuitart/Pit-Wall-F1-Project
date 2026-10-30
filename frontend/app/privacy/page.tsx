import { Gap, LegalPage } from '@/components/legal/LegalPage'

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated={<Gap>date</Gap>}>
      <h2>Controller</h2>
      <p><Gap>holder: name or company</Gap>, <Gap>NIF</Gap>, <Gap>postal address</Gap>, contact <Gap>email</Gap>.</p>
      <h2>What the site keeps</h2>
      <p>No account and no database of readers. The access token, and display preferences, stay in this browser&apos;s storage; clearing the browser removes them.</p>
      <h2>Payments</h2>
      <p>Subscriptions are paid through Stripe, which processes the payer&apos;s name, email and card under its own privacy policy. Pit Wall Engineer receives the subscription&apos;s status and identifiers, not the card.</p>
      <h2>Restoring access by email</h2>
      <p>When a reader asks to restore access, the email they type is looked up in Stripe and, if a subscription is active for it, a link is sent through Resend. The email is not stored by Pit Wall Engineer.</p>
      <h2>The PRO channel on Telegram</h2>
      <p>Joining the channel is optional. When a subscriber joins through their invite, their Telegram user id is recorded with their subscription in Stripe, so it can be removed from the channel when the subscription ends.</p>
      <h2>Server logs</h2>
      <p><Gap>logs: what the hosting providers (Netlify, Render) log, for how long, and the legal basis</Gap></p>
      <h2>Legal basis, retention and transfers</h2>
      <p><Gap>legal basis for each processing</Gap>. <Gap>retention periods</Gap>. <Gap>international transfers (Stripe, Resend, Telegram, Netlify, Render)</Gap>.</p>
      <h2>Your rights</h2>
      <p><Gap>rights of access, rectification, erasure, objection and portability, how to exercise them, and the supervisory authority</Gap></p>
    </LegalPage>
  )
}
