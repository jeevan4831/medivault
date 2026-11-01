import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Lock,
  Mail,
  User,
  Phone,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Check,
  X,
} from 'lucide-react'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { isAuthenticated, register, login } = useAuth()

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  // Password rules validation criteria for live feedback
  const passwordCriteria = useMemo(() => {
    const p = formData.password
    return [
      { id: 'length', text: 'At least 8 characters', met: p.length >= 8 },
      { id: 'upper', text: 'At least one uppercase letter (A-Z)', met: /[A-Z]/.test(p) },
      { id: 'lower', text: 'At least one lowercase letter (a-z)', met: /[a-z]/.test(p) },
      { id: 'number', text: 'At least one number (0-9)', met: /\d/.test(p) },
      {
        id: 'special',
        text: 'At least one special character (!@#$...)',
        met: /[!@#$%^&*(),.?":{}|<>\-_=+[\]\\/`~]/.test(p),
      },
    ]
  }, [formData.password])

  const passwordsMatch = useMemo(() => {
    if (!formData.confirm_password) return null
    return formData.password === formData.confirm_password
  }, [formData.password, formData.confirm_password])

  const allCriteriaMet = passwordCriteria.every((c) => c.met)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage('')

    // Client-side validations
    if (!formData.full_name.trim() || formData.full_name.trim().length < 2) {
      setErrorMessage('Full name must be at least 2 characters.')
      return
    }

    if (!formData.email.trim()) {
      setErrorMessage('Please provide a valid email address.')
      return
    }

    if (!allCriteriaMet) {
      setErrorMessage('Please ensure your password satisfies all security requirements.')
      return
    }

    if (formData.password !== formData.confirm_password) {
      setErrorMessage('Passwords do not match.')
      return
    }

    setIsLoading(true)

    try {
      const payload = {
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || null,
        password: formData.password,
        confirm_password: formData.confirm_password,
      }

      // Call API to register
      await register(payload)

      // Automatically log the user in and redirect to /dashboard
      try {
        await login(formData.email.trim(), formData.password)
        navigate('/dashboard', { replace: true })
      } catch {
        // Fallback: redirect to login if auto-login encounters an edge case
        navigate('/login', {
          state: {
            message: 'Account created successfully! Please sign in.',
            registeredEmail: formData.email.trim(),
          },
        })
      }
    } catch (err) {
      let detail =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        (err.code === 'ERR_NETWORK' || !err.response
          ? 'Backend server is unreachable. Please make sure the FastAPI backend is running at http://localhost:8000.'
          : 'Registration failed. Please check the entered information.')

      if (Array.isArray(detail)) {
        // FastAPI Pydantic validation errors list
        detail = detail.map((d) => d.msg).join(', ')
      }

      setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-140px)] items-center justify-center px-4 py-8 sm:py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 shadow-inner ring-1 ring-brand-200">
            <ShieldCheck className="h-8 w-8 text-brand-600" />
          </div>
          <h2 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Create your MediVault
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-600">
            Secure, consent-driven management for all your vital documents
          </p>
        </div>

        {/* Card Form */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl shadow-slate-100">
          {errorMessage && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <label
                htmlFor="full_name"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
              >
                Full Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative mt-1.5 rounded-lg">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <User className="h-5 w-5" />
                </div>
                <input
                  id="full_name"
                  type="text"
                  name="full_name"
                  required
                  value={formData.full_name}
                  onChange={handleChange}
                  placeholder="e.g. Dr. Jane Doe"
                  className="block w-full rounded-xl border border-slate-300 py-2.5 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
              >
                Email Address <span className="text-rose-500">*</span>
              </label>
              <div className="relative mt-1.5 rounded-lg">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  id="email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@domain.com"
                  className="block w-full rounded-xl border border-slate-300 py-2.5 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
            </div>

            {/* Phone Number */}
            <div>
              <label
                htmlFor="phone"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
              >
                Phone Number <span className="text-slate-400 text-[11px] font-normal">(Optional)</span>
              </label>
              <div className="relative mt-1.5 rounded-lg">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <Phone className="h-5 w-5" />
                </div>
                <input
                  id="phone"
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+91 98765 43210"
                  className="block w-full rounded-xl border border-slate-300 py-2.5 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
              >
                Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative mt-1.5 rounded-lg">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Create a strong password"
                  className="block w-full rounded-xl border border-slate-300 py-2.5 pl-11 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              {/* Live Password Strength Requirements Checklist */}
              {formData.password && (
                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs border border-slate-100 space-y-1.5">
                  <span className="font-semibold text-slate-700 block">Password Strength:</span>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {passwordCriteria.map((c) => (
                      <div
                        key={c.id}
                        className={`flex items-center gap-1.5 transition-colors ${
                          c.met ? 'text-emerald-700 font-medium' : 'text-slate-400'
                        }`}
                      >
                        {c.met ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        ) : (
                          <X className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                        )}
                        <span>{c.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="confirm_password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
              >
                Confirm Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative mt-1.5 rounded-lg">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  id="confirm_password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirm_password"
                  required
                  value={formData.confirm_password}
                  onChange={handleChange}
                  placeholder="Re-enter your password"
                  className={`block w-full rounded-xl border py-2.5 pl-11 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                    passwordsMatch === false
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-400/20'
                      : passwordsMatch === true
                      ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-400/20'
                      : 'border-slate-300 focus:border-brand-600 focus:ring-brand-500/20'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {passwordsMatch === false && (
                <p className="mt-1 text-xs text-rose-600">Passwords do not match yet.</p>
              )}
              {passwordsMatch === true && (
                <p className="mt-1 text-xs text-emerald-600">Passwords match perfectly.</p>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition duration-150 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Creating your vault...</span>
                  </>
                ) : (
                  <>
                    <span>Register &amp; Open Vault</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Login Link */}
          <div className="mt-6 border-t border-slate-100 pt-6 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold text-brand-600 hover:text-brand-700 hover:underline"
            >
              Sign in instead
            </Link>
          </div>
        </div>

        <div className="text-center text-xs text-slate-500">
          <p>Your password is cryptographically hashed before it ever hits storage.</p>
        </div>
      </div>
    </div>
  )
}
