import { useState, useEffect } from 'react'
import {
  FileText,
  FileImage,
  Download,
  Lock,
  ShieldCheck,
  Eye,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  AlertCircle,
  FileCode,
} from 'lucide-react'

export default function DocumentViewer({
  metadata,
  previewBlobUrl,
  isPreviewLoading,
  previewError,
  onRetry = null,
  onDownload = null,
  isDownloading = false,
}) {
  const [zoomLevel, setZoomLevel] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const isPdf = metadata?.mime_type === 'application/pdf'
  const isImage = metadata?.mime_type?.startsWith('image/')
  const DocIcon = isPdf ? FileText : isImage ? FileImage : FileCode

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 25, 250))
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 25, 50))
  const handleResetZoom = () => {
    setZoomLevel(100)
    setRotation(0)
  }
  const handleRotate = () => setRotation((r) => (r + 90) % 360)
  const toggleFullscreen = () => setIsFullscreen((f) => !f)

  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'w-full'
      }`}
    >
      {/* Viewer Header / Toolbar */}
      <div className="border-b border-slate-800 bg-slate-950/80 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Document Info */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              isPdf
                ? 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30'
                : 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
            }`}
          >
            <DocIcon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
              {metadata?.document_name}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono truncate">
              <span>{metadata?.original_filename}</span>
              <span>&bull;</span>
              <span>{metadata?.file_type}</span>
            </div>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2">
          {/* Image Controls (Zoom, Rotate) */}
          {isImage && previewBlobUrl && (
            <div className="flex items-center gap-1 rounded-xl bg-slate-900 border border-slate-800 p-1">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 50}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition"
                title="Zoom Out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="px-2 py-1 text-[11px] font-mono text-slate-300 hover:bg-slate-800 rounded-lg transition"
                title="Reset Zoom"
              >
                {zoomLevel}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 250}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition"
                title="Zoom In"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleRotate}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Rotate 90 degrees"
              >
                <RotateCw className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          {/* Strict Permission-Enforced Download Button */}
          {metadata?.can_download ? (
            <button
              type="button"
              onClick={onDownload}
              disabled={isDownloading || !previewBlobUrl}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-teal-500/20 hover:bg-teal-400 disabled:opacity-50 transition cursor-pointer"
              title="Download decrypted document"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isDownloading ? 'Downloading...' : 'Download'}</span>
            </button>
          ) : (
            <div
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-900/60 bg-indigo-950/40 px-3 py-1.5 text-[11px] font-semibold text-indigo-300 select-none"
              title="Owner has restricted this document to secure in-browser viewing only. Downloads and direct file exports are disabled."
            >
              <Lock className="h-3.5 w-3.5 text-indigo-400" />
              <span>View Only &bull; Download Disabled</span>
            </div>
          )}
        </div>
      </div>

      {/* Security Watermark / Guard Notice */}
      <div className="bg-slate-950/90 border-b border-slate-800/80 px-4 py-2 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />
          <span>
            Decrypted strictly in-memory via AES-256-GCM &bull; Server storage path protected
          </span>
        </div>
        <div className="hidden sm:block text-slate-500 font-mono text-[10px]">
          Confidential Patient Record &bull; View Session Monitored
        </div>
      </div>

      {/* Main Document Content Canvas */}
      <div
        className={`relative flex-1 bg-slate-950 flex items-center justify-center p-3 sm:p-6 overflow-auto ${
          isFullscreen ? 'h-[calc(100vh-100px)]' : 'min-h-[550px] max-h-[850px]'
        }`}
        onContextMenu={(e) => {
          // Disable right-click save to enforce VIEW_ONLY restriction
          if (!metadata?.can_download) {
            e.preventDefault()
          }
        }}
      >
        {isPreviewLoading ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-teal-500 border-t-transparent" />
            <h4 className="text-sm font-bold text-white">Decrypting Document in Memory</h4>
            <p className="text-xs text-slate-400 max-w-xs">
              Verifying cryptographic key integrity and streaming plaintext buffer to viewer...
            </p>
          </div>
        ) : previewError ? (
          <div className="rounded-2xl border border-rose-800 bg-rose-950/40 p-8 text-center max-w-md shadow-xl">
            <AlertCircle className="h-10 w-10 text-rose-400 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-white">Decryption Error</h4>
            <p className="text-xs text-rose-300 mt-1 leading-relaxed">{previewError}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-4 rounded-xl bg-rose-800 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition"
              >
                Retry Decryption
              </button>
            )}
          </div>
        ) : previewBlobUrl ? (
          isPdf ? (
            <div className="w-full h-full min-h-[550px] flex flex-col items-center justify-center">
              <iframe
                src={`${previewBlobUrl}#toolbar=${metadata?.can_download ? '1' : '0'}&navpanes=0`}
                title={metadata?.document_name || 'Shared Document'}
                className="w-full h-[650px] rounded-xl border border-slate-800 bg-white shadow-2xl"
              />
            </div>
          ) : isImage ? (
            <div className="flex items-center justify-center p-4">
              <img
                src={previewBlobUrl}
                alt={metadata?.document_name || 'Shared Document Image'}
                style={{
                  transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                  transition: 'transform 0.2s ease-out',
                }}
                className="max-h-[600px] max-w-full rounded-xl object-contain shadow-2xl select-none pointer-events-auto"
                draggable={false}
              />
            </div>
          ) : (
            <div className="text-center p-8 max-w-sm">
              <FileCode className="h-12 w-12 text-slate-500 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-white">Preview Format Not Supported</h4>
              <p className="text-xs text-slate-400 mt-1">
                This document format ({metadata?.mime_type}) cannot be rendered directly in the inline viewer.
              </p>
              {metadata?.can_download ? (
                <button
                  type="button"
                  onClick={onDownload}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2 text-xs font-bold text-slate-950"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Decrypted Document</span>
                </button>
              ) : (
                <div className="mt-4 rounded-xl bg-slate-900 border border-slate-800 p-3 text-xs text-slate-400">
                  Direct file download is prohibited under the owner&apos;s View-Only policy.
                </div>
              )}
            </div>
          )
        ) : null}
      </div>

      {/* Footer Security Notice Banner */}
      <div className="border-t border-slate-800 bg-slate-950/80 px-4 py-3 flex items-center justify-between text-xs text-slate-400">
        <span className="text-[11px] text-teal-400/90 font-medium">
          &quot;The QR code provides temporary access to the selected document. It does not contain the document itself.&quot;
        </span>
        <span className="text-[10px] text-slate-500">
          Token: SHA-256 Validated
        </span>
      </div>
    </div>
  )
}
