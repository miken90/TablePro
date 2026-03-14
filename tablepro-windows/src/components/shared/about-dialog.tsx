import React from 'react';
import { X } from 'lucide-react';

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative w-[400px] rounded-lg border border-neutral-700 bg-neutral-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="flex flex-col items-center gap-4">
          <h2 className="text-xl font-semibold text-white">TablePro</h2>
          <p className="text-sm text-neutral-400">Version 0.1.0 (Windows)</p>

          <p className="text-center text-xs text-neutral-500">
            Database client for PostgreSQL, MySQL, and SQL Server.
          </p>

          <div className="flex gap-4 text-xs text-blue-400">
            <a href="https://tablepro.app" target="_blank" rel="noopener noreferrer" className="hover:underline">
              Website
            </a>
            <a href="https://docs.tablepro.app" target="_blank" rel="noopener noreferrer" className="hover:underline">
              Documentation
            </a>
            <a href="https://github.com/tablepro" target="_blank" rel="noopener noreferrer" className="hover:underline">
              GitHub
            </a>
          </div>

          <div className="w-full border-t border-neutral-800 pt-3 text-xs text-neutral-500">
            <p>Platform: {navigator.platform}</p>
            <p>User Agent: {navigator.userAgent.slice(0, 60)}...</p>
          </div>

          <p className="text-xs text-neutral-600">&copy; 2026 TablePro. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
