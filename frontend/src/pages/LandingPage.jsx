import {
  Lock, Share2, QrCode, Timer, Ban, History, Server, Database, Info,
} from 'lucide-react'
import FeatureCard from '../components/FeatureCard.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import useBackendStatus from '../hooks/useBackendStatus.js'

const features = [
  { icon: Lock, title: 'Secure Storage', text: 'Documents are encrypted before they are written to private server storage.' },
  { icon: Share2, title: 'Consent-Based Sharing', text: 'You choose which document to share, with whom, and what they may do.' },
  { icon: QrCode, title: 'Temporary QR Access', text: 'Share a QR code that points to temporary access, never to the file itself.' },
  { icon: Timer, title: 'Automatic Expiry', text: 'Every share has an expiry time that is checked on each access.' },
  { icon: Ban, title: 'Access Revocation', text: 'Revoke a share at any moment and the link stops working immediately.' },
  { icon: History, title: 'Access History', text: 'Every upload, view, share and denial is recorded in your history.' },
]

export default function LandingPage() {
  const { api, db } = useBackendStatus()

  return (
    <div>
      <section className="bg-gradient-to-b from-brand-50 to-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Your Documents. <span className="text-brand-600">Your Control.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Securely store, organize and selectively share your important personal
            documents with temporary, consent-based access.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <h2 className="text-2xl font-bold">Features</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-12">
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            MediVault provides storage, access control and consent-based sharing. It does
            not verify whether a document is genuine and is not connected to any government
            database. This is an academic prototype: use dummy documents only.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <h2 className="text-2xl font-bold">System status</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <StatusBadge
            icon={Server}
            label="Backend API"
            status={api.status}
            detail={api.data ? `v${api.data.version} · ${api.data.environment}` : 'GET /api/health'}
          />
          <StatusBadge
            icon={Database}
            label="Database"
            status={db.status}
            detail={db.data ? `${db.data.database} (${db.data.dialect})` : 'GET /api/health/db'}
          />
        </div>
      </section>
    </div>
  )
}
