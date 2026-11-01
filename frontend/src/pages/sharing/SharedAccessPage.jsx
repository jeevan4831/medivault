import RecipientAccessPage from '../RecipientAccessPage.jsx'

/**
 * SharedAccessPage component representing the recipient temporary access workflow.
 * Wraps RecipientAccessPage providing unified access to token validation,
 * recipient identity verification, expiration/revocation states, and secure document viewing.
 */
export default function SharedAccessPage() {
  return <RecipientAccessPage />
}
