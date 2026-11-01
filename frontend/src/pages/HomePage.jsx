import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  Lock,
  QrCode,
  Clock,
  History,
  FileText,
  CheckCircle2,
  ArrowRight,
  Server,
  Database,
  Shield,
  KeyRound,
  FileCheck,
} from 'lucide-react'
import StatusBadge from '../components/StatusBadge.jsx'
import useBackendStatus from '../hooks/useBackendStatus.js'
import { useAuth } from '../context/AuthContext.jsx'

const categories = [
  'Aadhaar & PAN Cards',
  'Passport & Driving Licence',
  'Medical & Diagnostic Reports',
  'Prescriptions & Health Records',
  'Educational Certificates',
  'Insurance Policies',
  'Vehicle & RC Documents',
  'Employment Records',
]

const securityPillars = [
  {
    icon: Lock,
    title: 'AES-256 Storage Encryption',
    text: 'Every uploaded file is verified and encrypted server-side before being written to private disk volumes.',
  },
  {
    icon: QrCode,
    title: 'Zero-Knowledge QR Access',
    text: 'Share a QR code that encodes only a one-time cryptographic token. It never contains document bytes.',
  },
  {
    icon: Clock,
    title: 'Time-Limited Consent',
    text: 'Set granular expiration timers (from 1 hour to 30 days). Access grants expire automatically on schedule.',
  },
  {
    icon: History,
    title: 'Access History & Audit',
    text: 'Every upload, view, download, and denial is immutably recorded in your tamper-resistant security ledger.',
  },
]

const steps = [
  {
    step: '01',
    title: 'Upload Document',
    text: 'Ingest personal documents into an isolated, AES-256 encrypted storage volume.',
  },
  {
    step: '02',
    title: 'Share Securely',
    text: 'Generate time-bound, permission-controlled QR codes or links for trusted recipients.',
  },
  {
    step: '03',
    title: 'Revoke Access',
    text: 'Instantly invalidate active permissions at any moment with a single click.',
  },
]

export default function HomePage() {
  const { api, db } = useBackendStatus()
  const { isAuthenticated } = useAuth()

  return (
    <div className="space-y-16 py-6 sm:py-10">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 px-5 py-12 sm:px-12 sm:py-24 text-center text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))]" />

        <div className="relative mx-auto max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3.5 py-1.5 text-xs font-semibold text-teal-300 backdrop-blur-xs">
            <ShieldCheck className="h-4 w-4 text-teal-400" />
            <span>Encrypted Personal &amp; Medical Document Vault</span>
          </div>

          <h1 className="text-3xl font-black tracking-tight sm:text-6xl text-white">
            Your Documents. <span className="text-teal-400">Your Consent.</span>
          </h1>

          <p className="mx-auto max-w-2xl text-xs sm:text-lg text-slate-300 leading-relaxed">
            MediVault is a confidential, zero-knowledge document repository. Securely store
            health records, identity credentials, and personal certificates with time-expiring,
            consent-based QR sharing.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 pt-2 sm:pt-4">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-teal-500/25 transition hover:bg-teal-400 active:scale-95"
              >
                <span>Go to Vault Dashboard</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-teal-500/25 transition hover:bg-teal-400 active:scale-95"
                >
                  <span>Get Started Free</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-6 py-3.5 text-sm font-semibold text-slate-200 backdrop-blur-xs transition hover:bg-slate-700 hover:text-white active:scale-95"
                >
                  <KeyRound className="h-4 w-4 text-slate-400" />
                  <span>Sign In to Vault</span>
                </Link>
              </>
            )}
          </div>

          {/* Guarantee Badges */}
          <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400 border-t border-slate-800/80">
            <span className="flex items-center gap-1.5 font-medium text-slate-300">
              <CheckCircle2 className="h-4 w-4 text-teal-400" />
              Envelope AES-256 Storage
            </span>
            <span className="flex items-center gap-1.5 font-medium text-slate-300">
              <CheckCircle2 className="h-4 w-4 text-teal-400" />
              Zero-Knowledge Tokenization
            </span>
            <span className="flex items-center gap-1.5 font-medium text-slate-300">
              <CheckCircle2 className="h-4 w-4 text-teal-400" />
              Immutable Access History
            </span>
          </div>
        </div>
      </section>

      {/* Security Architecture Pillars */}
      <section className="mx-auto max-w-6xl space-y-6">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight sm:text-3xl">
            Cryptographic Vault Architecture
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Engineered with strict zero-trust principles to safeguard confidential records.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {securityPillars.map((p) => {
            const Icon = p.icon
            return (
              <div
                key={p.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700 border border-teal-200/60 mb-4">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">{p.title}</h3>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{p.text}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* How it works: 3 Steps */}
      <section className="mx-auto max-w-6xl rounded-3xl border border-slate-200 bg-white p-8 sm:p-12 shadow-sm space-y-8">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            How MediVault Works
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            A simple three-step workflow designed for ordinary users with enterprise-grade security.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.title}
              className="relative rounded-2xl border border-slate-100 bg-slate-50/60 p-6 flex flex-col justify-between"
            >
              <div>
                <span className="text-xs font-mono font-bold text-teal-700 tracking-wider">
                  STEP {s.step}
                </span>
                <h3 className="mt-2 text-base font-bold text-slate-900">{s.title}</h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Supported Categories */}
      <section className="mx-auto max-w-6xl space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Supported Document Categories</h2>
        <div className="flex flex-wrap gap-2.5">
          {categories.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 transition"
            >
              <FileCheck className="h-3.5 w-3.5 text-teal-600" />
              <span>{c}</span>
            </span>
          ))}
        </div>
      </section>

      {/* System Status Section */}
      <section className="mx-auto max-w-6xl space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Cryptographic System Health</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatusBadge
            label="Backend Security API"
            status={api.status}
            detail={api.data ? `v${api.data.version} · ${api.data.environment}` : 'GET /api/health'}
          />
          <StatusBadge
            label="Relational Database (Storage Engine)"
            status={db.status}
            detail={db.data ? `${db.data.database} · MySQL ${db.data.server_version}` : 'GET /api/health/db'}
          />
        </div>
      </section>
    </div>
  )
}
