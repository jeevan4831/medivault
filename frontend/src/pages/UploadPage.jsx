import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import documentService from '../services/documentService.js'
import {
  UploadCloud,
  FileText,
  FileImage,
  CheckCircle2,
  AlertCircle,
  X,
  ShieldCheck,
  Lock,
  ArrowRight,
  RefreshCw,
  Share2,
} from 'lucide-react'

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png']
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

export default function UploadPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [categories, setCategories] = useState([])
  const [formData, setFormData] = useState({
    document_name: '',
    category_id: '',
    description: '',
  })
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [generalError, setGeneralError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(null)

  // Fetch categories on mount
  useEffect(() => {
    async function loadCategories() {
      try {
        const list = await documentService.getCategories()
        setCategories(list)
        if (list.length > 0) {
          setFormData((prev) => ({ ...prev, category_id: String(list[0].id) }))
        }
      } catch (err) {
        console.error('Failed to load categories:', err)
      }
    }
    loadCategories()
  }, [])

  // File validator
  const validateFile = (file) => {
    if (!file) return false

    // Size check
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(
        `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 10 MB.`
      )
      return false
    }

    // Extension check
    const name = file.name.toLowerCase()
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))
    if (!hasValidExt) {
      setFileError('Unsupported file type. Please upload a PDF, JPG, JPEG, or PNG file.')
      return false
    }

    // MIME type check (if browser provides it)
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      setFileError(`Invalid file format (${file.type}). Allowed: PDF, JPG, JPEG, PNG.`)
      return false
    }

    setFileError('')
    return true
  }

  const handleFileSelect = (file) => {
    if (validateFile(file)) {
      setSelectedFile(file)
      // Auto-populate document name if empty
      if (!formData.document_name.trim()) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ')
        setFormData((prev) => ({ ...prev, document_name: cleanName }))
      }
    } else {
      setSelectedFile(null)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setGeneralError('')

    if (!formData.document_name.trim()) {
      setGeneralError('Please enter a document name.')
      return
    }

    if (!formData.category_id) {
      setGeneralError('Please select a category.')
      return
    }

    if (!selectedFile) {
      setGeneralError('Please select a document to upload.')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const data = new FormData()
      data.append('document_name', formData.document_name.trim())
      data.append('category_id', formData.category_id)
      data.append('file', selectedFile)
      if (formData.description.trim()) {
        data.append('description', formData.description.trim())
      }

      const uploadedDoc = await documentService.uploadDocument(data, (percent) => {
        setUploadProgress(percent)
      })

      setUploadSuccess(uploadedDoc)
      setSelectedFile(null)
      setFormData({
        document_name: '',
        category_id: categories.length > 0 ? String(categories[0].id) : '',
        description: '',
      })
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      console.error('Upload failed:', err)
      const message =
        err.response?.data?.detail ||
        err.message ||
        'Failed to upload document. Please try again.'
      setGeneralError(typeof message === 'string' ? message : JSON.stringify(message))
    } finally {
      setIsUploading(false)
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-700">
          <ShieldCheck className="h-4 w-4" />
          <span>Encrypted Ingestion Pipeline</span>
        </div>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900 tracking-tight sm:text-3xl">
          Upload Personal Document
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-500">
          All files are verified, envelope-encrypted with AES-256 before storage, and linked
          exclusively to your authenticated account.
        </p>
      </div>

      {/* Success Notification Banner */}
      {uploadSuccess && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-emerald-900">
                Document Uploaded and Encrypted Successfully
              </h3>
              <p className="mt-1 text-xs text-emerald-700">
                &quot;{uploadSuccess.document_name}&quot; ({uploadSuccess.original_filename} &middot;{' '}
                {formatFileSize(uploadSuccess.file_size)}) has been saved to your secure vault in the{' '}
                <span className="font-semibold">{uploadSuccess.category_name}</span> category.
              </p>
              <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3">
                <Link
                  to={`/documents/${uploadSuccess.id}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-700 transition shadow-2xs"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Share Securely</span>
                </Link>
                <Link
                  to="/documents"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 transition"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>My Documents</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setUploadSuccess(null)}
                  className="rounded-xl border border-emerald-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 transition"
                >
                  Upload Another Document
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Upload Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        {generalError && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div className="flex-1">{generalError}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Drag & Drop Zone */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
              Select Document File <span className="text-rose-500">*</span>
            </label>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center cursor-pointer transition ${
                isDragging
                  ? 'border-brand-500 bg-brand-50/60'
                  : selectedFile
                  ? 'border-emerald-300 bg-emerald-50/30'
                  : 'border-slate-300 bg-slate-50/50 hover:border-brand-400 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0])
                  }
                }}
                className="hidden"
              />

              {selectedFile ? (
                <div className="flex flex-col items-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    {selectedFile.type.includes('pdf') ? (
                      <FileText className="h-7 w-7" />
                    ) : (
                      <FileImage className="h-7 w-7" />
                    )}
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-900">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500">{formatFileSize(selectedFile.size)}</p>
                  <span className="mt-2 text-[11px] font-semibold text-brand-600 hover:underline">
                    Tap or click to replace file
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <UploadCloud className="h-7 w-7" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    <span className="text-brand-600 hover:underline">Tap or click to browse</span> or drop file here
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Supported: PDF, JPG, JPEG, PNG (up to 10 MB)
                  </p>
                </div>
              )}
            </div>

            {fileError && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{fileError}</span>
              </p>
            )}
          </div>

          {/* Document Name */}
          <div>
            <label
              htmlFor="document_name"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
            >
              Document Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="document_name"
              type="text"
              required
              value={formData.document_name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, document_name: e.target.value }))
              }
              placeholder="e.g. Aadhaar Card 2026, Blood Test Report, Degree Certificate"
              className="mt-1.5 block w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Category Dropdown */}
          <div>
            <label
              htmlFor="category_id"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
            >
              Document Category <span className="text-rose-500">*</span>
            </label>
            <select
              id="category_id"
              required
              value={formData.category_id}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, category_id: e.target.value }))
              }
              className="mt-1.5 block w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} &mdash; {cat.description || ''}
                </option>
              ))}
            </select>
          </div>

          {/* Optional Description */}
          <div>
            <label
              htmlFor="description"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
            >
              Description <span className="text-slate-400 text-[11px] font-normal">(Optional)</span>
            </label>
            <textarea
              id="description"
              rows={3}
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Add optional notes, issuing authority, expiry date or reference identifiers..."
              className="mt-1.5 block w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-4 border border-slate-100">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-brand-600" />
                  Encrypting and streaming...
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-brand-600 transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isUploading || !selectedFile}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/25 hover:bg-brand-700 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 transition"
            >
              {isUploading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Securing &amp; Storing File...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4" />
                  <span>Upload Document</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Security Principles Box */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-600 shadow-sm space-y-2">
        <h4 className="font-bold text-slate-900 flex items-center gap-2">
          <Lock className="h-4 w-4 text-brand-600" />
          Server-Side Storage Security Guarantee
        </h4>
        <ul className="list-disc pl-5 space-y-1 text-slate-500">
          <li>Your original filename is never used on the server storage volume.</li>
          <li>Files are encrypted with Fernet AES-256 before disk writes.</li>
          <li>Storage location is outside public web roots and requires ownership authentication.</li>
        </ul>
      </div>
    </div>
  )
}
